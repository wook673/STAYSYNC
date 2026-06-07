"""
카카오 알림톡 발송 서비스
- 이중예약 감지 즉시 알림
- 동기화 완료 알림
"""
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

KAKAO_API_URL = "https://kapi.kakao.com/v1/api/talk/friends/message/default/send"
ALIMTALK_API_URL = "https://api-alimtalk.kakao.com/alimtalk/v2.2/senders/{sender_key}/messages"

# 알림톡 서비스(솔라피, 쿨SMS 등) 사용 시 URL 변경
# 여기서는 솔라피(Solapi) 기준으로 작성
SOLAPI_API_KEY = ""
SOLAPI_API_SECRET = ""
SOLAPI_SENDER = ""

PLATFORM_NAMES = {
    "airbnb": "에어비앤비",
    "agoda": "아고다",
    "bookingcom": "부킹닷컴",
    "zaritalk": "자리톡",
    "wehome": "위홈",
    "ncostay": "엔코스테이",
    "liveanywhere": "리브애니웨어",
    "33m2": "삼삼엠투",
    "manual": "직접입력",
}


async def send_double_booking_alert(
    phone: str,
    room_name: str,
    booking_1: dict,
    booking_2: dict,
) -> bool:
    """
    이중예약 감지 알림톡 발송
    실제 발송은 솔라피/CoolSMS API 연동 필요
    """
    p1 = PLATFORM_NAMES.get(booking_1["platform"], booking_1["platform"])
    p2 = PLATFORM_NAMES.get(booking_2["platform"], booking_2["platform"])

    message = (
        f"[StaySync] 이중예약 감지 ⚠️\n\n"
        f"방: {room_name}\n\n"
        f"예약1) {p1}\n"
        f"  {booking_1['start']} ~ {booking_1['end']}\n"
        f"  {booking_1.get('summary', '')}\n\n"
        f"예약2) {p2}\n"
        f"  {booking_2['start']} ~ {booking_2['end']}\n"
        f"  {booking_2.get('summary', '')}\n\n"
        f"즉시 확인하여 조치하세요."
    )

    logger.warning(f"DOUBLE BOOKING ALERT → {phone}: {message}")

    # TODO: 실제 알림톡 API 연동
    # 솔라피 예시:
    # async with httpx.AsyncClient() as client:
    #     response = await client.post(
    #         "https://api.solapi.com/messages/v4/send",
    #         headers={"Authorization": f"HMAC-SHA256 {_get_solapi_auth()}"},
    #         json={
    #             "message": {
    #                 "to": phone,
    #                 "from": SOLAPI_SENDER,
    #                 "kakaoOptions": {
    #                     "pfId": settings.KAKAO_SENDER_KEY,
    #                     "templateId": settings.KAKAO_TEMPLATE_DOUBLE_BOOKING,
    #                     "variables": {
    #                         "#{room_name}": room_name,
    #                         "#{platform1}": p1,
    #                         "#{dates1}": f"{booking_1['start']} ~ {booking_1['end']}",
    #                         "#{platform2}": p2,
    #                         "#{dates2}": f"{booking_2['start']} ~ {booking_2['end']}",
    #                     }
    #                 }
    #             }
    #         }
    #     )

    return True


async def send_sync_complete_notification(
    phone: str,
    room_name: str,
    platform: str,
    added: int,
) -> bool:
    """동기화 완료 후 신규 예약이 있을 때 알림 (선택적)"""
    if added == 0:
        return True

    p = PLATFORM_NAMES.get(platform, platform)
    message = (
        f"[StaySync] 새 예약 {added}건\n"
        f"방: {room_name}\n"
        f"플랫폼: {p}\n"
        f"앱에서 확인하세요."
    )

    logger.info(f"SYNC NOTIFICATION → {phone}: {message}")
    return True
