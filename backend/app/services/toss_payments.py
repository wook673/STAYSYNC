"""
TossPayments 구독 결제 서비스
- 빌링키 발급
- 자동결제 실행
- 웹훅 처리
"""
import base64
import logging
import httpx
from datetime import datetime, timedelta
from app.core.config import settings

logger = logging.getLogger(__name__)

TOSS_API_BASE = "https://api.tosspayments.com/v1"

# 방 수별 월 요금 (VAT 포함, 원)
PRICING_TABLE = {
    1: 7900,
    9: 5500,   # 2~9개
    20: 4900,  # 10~20개
}

# 경쟁사(Hostier) 대비 10~15% 저렴
def get_monthly_price(room_count: int) -> int:
    if room_count <= 1:
        return PRICING_TABLE[1]
    elif room_count <= 9:
        return PRICING_TABLE[9] * room_count
    elif room_count <= 20:
        return PRICING_TABLE[20] * room_count
    else:
        return PRICING_TABLE[20] * room_count  # 21개 이상: 협의 → 기본 요금 임시 적용


def _get_auth_header() -> str:
    """TossPayments Basic Auth 헤더"""
    credentials = base64.b64encode(f"{settings.TOSS_SECRET_KEY}:".encode()).decode()
    return f"Basic {credentials}"


async def issue_billing_key(
    auth_key: str,
    customer_key: str,
) -> dict:
    """
    자동결제 빌링키 발급
    프론트엔드에서 카드 등록 후 authKey를 받아 여기서 빌링키로 교환
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{TOSS_API_BASE}/billing/authorizations/issue",
            headers={
                "Authorization": _get_auth_header(),
                "Content-Type": "application/json",
            },
            json={
                "authKey": auth_key,
                "customerKey": customer_key,
            },
        )

    if response.status_code != 200:
        logger.error(f"Billing key issue failed: {response.text}")
        raise Exception(f"빌링키 발급 실패: {response.json().get('message', '알 수 없는 오류')}")

    return response.json()


async def charge_subscription(
    billing_key: str,
    customer_key: str,
    customer_name: str,
    room_count: int,
    order_id: str,
) -> dict:
    """
    구독 자동결제 실행
    """
    amount = get_monthly_price(room_count)
    order_name = f"StaySync {room_count}개 방 월 구독"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{TOSS_API_BASE}/billing/{billing_key}",
            headers={
                "Authorization": _get_auth_header(),
                "Content-Type": "application/json",
            },
            json={
                "customerKey": customer_key,
                "amount": amount,
                "orderId": order_id,
                "orderName": order_name,
                "customerName": customer_name,
                "taxFreeAmount": 0,
            },
        )

    data = response.json()

    if response.status_code != 200:
        logger.error(f"Charge failed: {data}")
        raise Exception(f"결제 실패: {data.get('message', '알 수 없는 오류')}")

    logger.info(f"Charge success: {order_id} amount={amount}")
    return data


async def cancel_payment(payment_key: str, reason: str = "사용자 구독 취소") -> dict:
    """결제 취소"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{TOSS_API_BASE}/payments/{payment_key}/cancel",
            headers={
                "Authorization": _get_auth_header(),
                "Content-Type": "application/json",
            },
            json={"cancelReason": reason},
        )
    return response.json()


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """웹훅 서명 검증"""
    import hmac
    import hashlib
    expected = hmac.new(
        settings.TOSS_WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
