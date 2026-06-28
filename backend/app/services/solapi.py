"""
솔라피(Solapi/CoolSMS) 발송 서비스 — 청소 알림용

- 인증: HMAC-SHA256 (apiKey + 사용자 secret)
- SMS/LMS 자동 분기(길이 기준), 카카오 알림톡은 kakao_options 전달 시 사용
- 사용자별 키(User.solapi_*)로 발송 → 멀티테넌트

⚠️ 실제 발송에는 사용자가 솔라피 콘솔에서 발급한 API Key/Secret과
   사전 등록된 발신번호(solapi_sender)가 필요하다. 미설정 시 dry-run(로그만).
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send"


def _auth_header(api_key: str, api_secret: str) -> str:
    """솔라피 HMAC-SHA256 Authorization 헤더 생성."""
    date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    salt = secrets.token_hex(16)
    signature = hmac.new(
        api_secret.encode(), (date + salt).encode(), hashlib.sha256
    ).hexdigest()
    return (
        f"HMAC-SHA256 apiKey={api_key}, date={date}, "
        f"salt={salt}, signature={signature}"
    )


def _normalize(phone: str | None) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())


async def send_message(
    *,
    api_key: str | None,
    api_secret: str | None,
    sender: str | None,
    to: str,
    text: str,
    kakao_options: dict | None = None,
) -> dict:
    """
    솔라피로 1건 발송. 키/발신번호 미설정 시 dry-run.
    반환: {"ok": bool, "dry_run": bool, "detail": str}
    """
    to_n, from_n = _normalize(to), _normalize(sender)

    if not (api_key and api_secret and from_n and to_n):
        logger.warning("Solapi dry-run (미설정) → to=%s\n%s", to_n or to, text)
        return {"ok": True, "dry_run": True, "detail": "키/발신번호 미설정 — 발송 생략(로그만)"}

    message: dict = {"to": to_n, "from": from_n, "text": text}
    if kakao_options:
        message["kakaoOptions"] = kakao_options

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                SOLAPI_SEND_URL,
                headers={
                    "Authorization": _auth_header(api_key, api_secret),
                    "Content-Type": "application/json",
                },
                json={"message": message},
            )
        if res.status_code >= 400:
            logger.error("Solapi 발송 실패 %s: %s", res.status_code, res.text[:300])
            return {"ok": False, "dry_run": False, "detail": f"{res.status_code}: {res.text[:200]}"}
        return {"ok": True, "dry_run": False, "detail": "발송 완료"}
    except Exception as e:  # noqa: BLE001
        logger.error("Solapi 발송 예외: %s", e)
        return {"ok": False, "dry_run": False, "detail": str(e)}


DEFAULT_CLEANING_TEMPLATE = (
    "[StaySync] 청소 일정 안내\n"
    "매물: {room}\n"
    "입실: {checkin}\n"
    "청소 예정일(퇴실): {checkout}\n"
    "게스트 퇴실 후 청소 부탁드립니다."
)


def render_cleaning_message(template: str | None, *, room: str, checkin: str, checkout: str,
                            guest: str = "") -> str:
    """청소 알림 메시지 템플릿 변수 치환."""
    tpl = template or DEFAULT_CLEANING_TEMPLATE
    try:
        return tpl.format(room=room, checkin=checkin, checkout=checkout, guest=guest)
    except (KeyError, IndexError):
        # 사용자 템플릿에 잘못된 변수가 있으면 기본 템플릿으로 폴백
        return DEFAULT_CLEANING_TEMPLATE.format(room=room, checkin=checkin, checkout=checkout)
