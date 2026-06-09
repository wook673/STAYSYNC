"""
확장 기반 플랫폼 동기화 엔진 (33m2·엔코·리브애니웨어·자리톡)

원리:
- 확장이 캡처해 저장한 "사용자 본인 세션 토큰"으로 플랫폼 내부 웹 API를 호출.
- 공식 API가 아니므로 엔드포인트/스키마는 각 플랫폼별로 직접 파악해야 한다.

⚠️ 내부 API 스펙 확보 방법 (사용자 본인 세션으로 직접 수행):
   1) 본인 계정으로 플랫폼(web.33m2.co.kr 등) 로그인
   2) 브라우저 DevTools → Network 탭에서 "예약 목록/캘린더" 화면 로드
   3) XHR/fetch 요청 중 예약 데이터를 반환하는 엔드포인트와 인증 헤더 방식 확인
   4) 아래 PLATFORM_ENDPOINTS 에 채워넣기

토큰 만료(401) 시 → connection.sync_error 에 "401" 기록 → 프론트/확장이
"재연결 필요"로 표시 (auto_maintain=False 플랫폼은 사용자가 확장에서 재연결).
"""
import json
import logging
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import PlatformConnection, PlatformType

logger = logging.getLogger(__name__)

# 플랫폼별 내부 API 엔드포인트 (사용자 세션 트래픽 분석으로 확정 필요)
PLATFORM_ENDPOINTS = {
    PlatformType.m33: {
        "base": "https://web.33m2.co.kr",
        # TODO: 실제 예약 조회 엔드포인트로 교체 (네트워크 탭에서 확인)
        "reservations": "/api/host/reservations",  # 추정 — 확인 필요
        "auth_header": "Authorization",  # "Bearer {token}" or 쿠키 자동전송
        "auth_format": "Bearer {token}",
    },
    PlatformType.ncostay: {
        "base": "https://host.enko.kr",
        "reservations": "/api/reservations",  # 추정
        "auth_header": "Authorization",
        "auth_format": "Bearer {token}",
    },
    PlatformType.liveanywhere: {
        "base": "https://m.liveanywhere.me",
        "reservations": "/api/host/bookings",  # 추정
        "auth_header": "Authorization",
        "auth_format": "Bearer {token}",
    },
    PlatformType.zaritalk: {
        "base": "https://zaritalk.com",
        "reservations": "/api/my/reservations",  # 추정
        "auth_header": "Authorization",
        "auth_format": "Bearer {token}",
    },
    PlatformType.zigbang: {
        "base": "https://www.zigbang.com",
        "reservations": "/api/host/reservations",  # 추정
        "auth_header": "Authorization",
        "auth_format": "Bearer {token}",
    },
}


def _extract_token(connection: PlatformConnection) -> Optional[str]:
    if not connection.session_token:
        return None
    try:
        blob = json.loads(connection.session_token)
        return blob.get("primary")
    except (json.JSONDecodeError, AttributeError):
        return connection.session_token  # 평문 폴백


async def fetch_reservations_via_token(connection: PlatformConnection) -> dict:
    """
    저장된 세션 토큰으로 플랫폼 내부 API를 호출해 예약 원본을 가져온다.
    Returns: {"ok": bool, "raw": <list|dict>, "error": str|None, "needs_reauth": bool}
    """
    cfg = PLATFORM_ENDPOINTS.get(connection.platform)
    if not cfg:
        return {"ok": False, "raw": None, "error": "엔드포인트 미설정", "needs_reauth": False}

    token = _extract_token(connection)
    if not token:
        return {"ok": False, "raw": None, "error": "토큰 없음", "needs_reauth": True}

    url = cfg["base"] + cfg["reservations"]
    headers = {cfg["auth_header"]: cfg["auth_format"].format(token=token)}

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 401:
                connection.sync_error = "401 인증 만료 — 재연결 필요"
                return {"ok": False, "raw": None, "error": "401", "needs_reauth": True}
            resp.raise_for_status()
            return {"ok": True, "raw": resp.json(), "error": None, "needs_reauth": False}
    except httpx.HTTPError as e:
        connection.sync_error = f"동기화 오류: {e}"
        return {"ok": False, "raw": None, "error": str(e), "needs_reauth": False}


def normalize_reservations(platform: PlatformType, raw) -> list[dict]:
    """
    플랫폼 원본 응답 → 공통 예약 스키마로 정규화.
    {ical_uid, summary, start_date, end_date, status}
    ⚠️ 각 플랫폼 응답 구조에 맞게 매핑 필요 (TODO — 실제 응답 확인 후 작성).
    """
    # 플레이스홀더 — 실제 응답 스키마 확인 후 플랫폼별 파서 구현
    bookings: list[dict] = []
    if not raw:
        return bookings
    # 예시 구조 가정: raw = [{ "id":..., "guestName":..., "checkin":"2026-06-10", "checkout":"2026-06-12", "status":"confirmed" }, ...]
    items = raw if isinstance(raw, list) else raw.get("reservations") or raw.get("data") or []
    for it in items:
        try:
            bookings.append({
                "ical_uid": f"{platform.value}:{it.get('id')}",
                "summary": it.get("guestName") or it.get("guest_name") or "예약",
                "start_date": it.get("checkin") or it.get("startDate"),
                "end_date": it.get("checkout") or it.get("endDate"),
                "status": it.get("status", "confirmed"),
            })
        except Exception as e:  # noqa
            logger.warning("정규화 실패 (%s): %s", platform.value, e)
    return bookings
