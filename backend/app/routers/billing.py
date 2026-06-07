import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.database import get_db
from app.models.models import User, Room, PlanType
from app.core.auth import get_current_user
from app.services.toss_payments import (
    issue_billing_key, charge_subscription,
    verify_webhook_signature, get_monthly_price, PRICING_TABLE
)

router = APIRouter(prefix="/api/billing", tags=["billing"])


class BillingKeyRequest(BaseModel):
    auth_key: str
    customer_key: str


class CheckoutRequest(BaseModel):
    auth_key: str


@router.get("/pricing")
async def get_pricing():
    """요금 테이블 반환"""
    return {
        "plans": [
            {"rooms": "1개", "price_per_room": 7900, "total": 7900},
            {"rooms": "2~9개", "price_per_room": 5500, "total": "5,500원 × 방 수"},
            {"rooms": "10~20개", "price_per_room": 4900, "total": "4,900원 × 방 수"},
            {"rooms": "21개+", "price_per_room": None, "total": "별도 협의"},
        ],
        "trial_days": 14,
        "note": "VAT 포함 금액",
    }


@router.post("/subscribe")
async def subscribe(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """구독 시작 - 빌링키 발급 후 첫 결제"""
    customer_key = current_user.toss_customer_key or f"staysync_{current_user.id}"

    # 빌링키 발급
    billing_data = await issue_billing_key(body.auth_key, customer_key)
    billing_key = billing_data["billingKey"]

    # 방 수 계산
    room_count_result = await db.execute(
        select(func.count(Room.id)).where(
            Room.user_id == current_user.id,
            Room.is_active == True,
        )
    )
    room_count = room_count_result.scalar_one() or 1

    # 첫 결제
    order_id = f"order_{uuid.uuid4().hex[:16]}"
    await charge_subscription(
        billing_key=billing_key,
        customer_key=customer_key,
        customer_name=current_user.name,
        room_count=room_count,
        order_id=order_id,
    )

    # DB 업데이트
    current_user.toss_customer_key = customer_key
    current_user.toss_billing_key = billing_key
    current_user.plan = PlanType.basic
    current_user.trial_ends_at = None
    await db.flush()

    return {
        "ok": True,
        "plan": "basic",
        "amount": get_monthly_price(room_count),
        "room_count": room_count,
    }


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """구독 취소"""
    current_user.toss_billing_key = None
    current_user.plan = PlanType.trial
    await db.flush()
    return {"ok": True, "message": "구독이 취소되었습니다. 현재 기간 종료 시까지 이용 가능합니다."}


@router.post("/webhook/toss")
async def toss_webhook(
    request: Request,
    toss_signature: str = Header(None, alias="Toss-Signature"),
):
    """TossPayments 웹훅 처리"""
    body = await request.body()

    if toss_signature and not verify_webhook_signature(body, toss_signature):
        raise HTTPException(status_code=400, detail="Invalid signature")

    event = json.loads(body)
    event_type = event.get("eventType")

    if event_type == "PAYMENT_STATUS_CHANGED":
        # 결제 상태 변경 처리
        pass
    elif event_type == "BILLING_STATUS_CHANGED":
        # 빌링 상태 변경 처리
        pass

    return {"ok": True}
