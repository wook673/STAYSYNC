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
from datetime import datetime, date
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


# ════════════════════════════════════════════════════════════════════
# 쓰기(차단) — 교차 플랫폼 날짜 차단
#
# Hostier 분석 결과 확정된 아키텍처:
#  · 확장은 "토큰 중개"만 한다 (읽기/차단 코드 없음).
#  · 예약 읽기 + 날짜 차단은 모두 백엔드가 토큰으로 플랫폼 내부 API를 호출해 수행.
#
# ⚠️ 차단(쓰기) 엔드포인트는 각 플랫폼 비공개이며, 사용자가 해당 플랫폼에서
#    직접 "날짜 차단"을 실행할 때의 네트워크를 캡처해 확정해야 한다.
#    (docs/33m2-내부api-캡처가이드.md 참고)
# ════════════════════════════════════════════════════════════════════

# 플랫폼별 "날짜 차단" 엔드포인트 (캡처로 확정 필요 — 현재 추정 골격)
BLOCK_ENDPOINTS = {
    PlatformType.m33: {"method": "POST", "path": "/api/host/calendar/block"},      # TODO 확정
    PlatformType.ncostay: {"method": "POST", "path": "/api/calendar/block"},        # TODO
    PlatformType.liveanywhere: {"method": "POST", "path": "/api/host/block"},        # TODO
    PlatformType.zaritalk: {"method": "POST", "path": "/api/my/calendar/block"},     # TODO
    PlatformType.zigbang: {"method": "POST", "path": "/api/host/calendar/block"},    # TODO
}


async def block_dates_via_token(connection, start_date: date, end_date: date) -> dict:
    """
    저장된 세션 토큰으로 해당 플랫폼에 날짜 차단(쓰기)을 요청.
    ⚠️ 약관상 자동 쓰기는 리스크가 큼 — 공식 제휴/법무 검토 후 활성화 권장.
    현재는 엔드포인트 미확정으로 '시뮬레이션' 응답만 반환(실호출 비활성).
    """
    base_cfg = PLATFORM_ENDPOINTS.get(connection.platform)
    blk = BLOCK_ENDPOINTS.get(connection.platform)
    if not base_cfg or not blk:
        return {"ok": False, "error": "차단 엔드포인트 미설정"}

    token = _extract_token(connection)
    if not token:
        return {"ok": False, "error": "토큰 없음", "needs_reauth": True}

    # 🚧 안전장치: 실제 쓰기는 엔드포인트 확정 + 법무 검토 전까지 비활성화.
    ENABLE_REAL_WRITE = False
    if not ENABLE_REAL_WRITE:
        logger.info("[DRY-RUN] %s 차단 요청 %s~%s (실호출 비활성)",
                    connection.platform.value, start_date, end_date)
        return {"ok": True, "dry_run": True,
                "platform": connection.platform.value,
                "start": str(start_date), "end": str(end_date)}

    url = base_cfg["base"] + blk["path"]
    headers = {base_cfg["auth_header"]: base_cfg["auth_format"].format(token=token)}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(blk["method"], url, headers=headers,
                json={"start_date": str(start_date), "end_date": str(end_date),
                      "reason": "staySync 교차차단"})
            if resp.status_code == 401:
                return {"ok": False, "error": "401", "needs_reauth": True}
            resp.raise_for_status()
            return {"ok": True, "platform": connection.platform.value}
    except httpx.HTTPError as e:
        return {"ok": False, "error": str(e)}


async def propagate_block(db: AsyncSession, room_id, source_connection_id,
                          start_date: date, end_date: date) -> list[dict]:
    """
    교차 차단 오케스트레이션:
    한 플랫폼에 예약이 들어오면, 같은 방의 '다른' 플랫폼 연결에 동일 날짜를 차단.

    Hostier의 "한 곳 예약 시 다른 곳 자동 차단" 기능에 해당.
    """
    from app.models.models import PlatformConnection  # 지연 임포트(순환 방지)
    from sqlalchemy import select, and_

    stmt = select(PlatformConnection).where(
        and_(
            PlatformConnection.room_id == room_id,
            PlatformConnection.id != source_connection_id,
            PlatformConnection.is_active == True,  # noqa: E712
        )
    )
    targets = (await db.execute(stmt)).scalars().all()
    results = []
    for conn in targets:
        if conn.connection_type == "extension":
            r = await block_dates_via_token(conn, start_date, end_date)
        else:
            # iCal 플랫폼: 직접 쓰기 불가 → 각 플랫폼이 우리 iCal을 가져가게 하는
            # 방식(상호 iCal 구독)으로 차단 전파. 별도 설정 필요.
            r = {"ok": False, "skipped": "ical_no_write",
                 "platform": conn.platform.value}
        results.append({"connection_id": str(conn.id),
                        "platform": conn.platform.value, **r})
    return results
