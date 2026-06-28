"""
청소 알림(솔라피) 설정 및 발송 라우터
- GET/PATCH /api/notifications/settings : 솔라피 키·발신번호·템플릿·활성화
- POST /api/notifications/test          : 테스트 발송(본인 번호 등)
- POST /api/notifications/cleaning/run  : 오늘 입실 예약 즉시 일괄 발송(수동 트리거)
- POST /api/notifications/cleaning/{booking_id} : 특정 예약 청소 알림 수동 발송
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.core.auth import get_current_user
from app.models.models import User, Room, Booking
from app.services.solapi import (
    DEFAULT_CLEANING_TEMPLATE,
    render_cleaning_message,
    send_message,
)
from app.services.cleaning_notify import run_cleaning_notifications, send_cleaning_for_booking

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotifSettings(BaseModel):
    solapi_api_key: Optional[str] = None
    solapi_api_secret: Optional[str] = None
    solapi_sender: Optional[str] = None
    cleaning_notify_enabled: Optional[bool] = None
    cleaning_msg_template: Optional[str] = None


def _settings_dict(user: User) -> dict:
    # 보안: secret 은 설정 여부만 노출(값 자체는 마스킹)
    return {
        "solapi_api_key": user.solapi_api_key or "",
        "solapi_api_secret_set": bool(user.solapi_api_secret),
        "solapi_sender": user.solapi_sender or "",
        "cleaning_notify_enabled": bool(user.cleaning_notify_enabled),
        "cleaning_msg_template": user.cleaning_msg_template or DEFAULT_CLEANING_TEMPLATE,
        "default_template": DEFAULT_CLEANING_TEMPLATE,
    }


@router.get("/settings")
async def get_settings(user: User = Depends(get_current_user)):
    return _settings_dict(user)


@router.patch("/settings")
async def update_settings(
    body: NotifSettings,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.solapi_api_key is not None:
        user.solapi_api_key = body.solapi_api_key.strip() or None
    # secret 은 빈 문자열이면 변경 안 함(마스킹 유지), 값이 오면 갱신
    if body.solapi_api_secret:
        user.solapi_api_secret = body.solapi_api_secret.strip()
    if body.solapi_sender is not None:
        user.solapi_sender = body.solapi_sender.strip() or None
    if body.cleaning_notify_enabled is not None:
        user.cleaning_notify_enabled = body.cleaning_notify_enabled
    if body.cleaning_msg_template is not None:
        user.cleaning_msg_template = body.cleaning_msg_template.strip() or None
    await db.flush()
    return _settings_dict(user)


class TestSend(BaseModel):
    to: str


@router.post("/test")
async def test_send(
    body: TestSend,
    user: User = Depends(get_current_user),
):
    text = render_cleaning_message(
        user.cleaning_msg_template,
        room="(테스트) 강남 스튜디오",
        checkin="2026-07-01",
        checkout="2026-07-05",
        guest="홍길동",
    )
    result = await send_message(
        api_key=user.solapi_api_key,
        api_secret=user.solapi_api_secret,
        sender=user.solapi_sender,
        to=body.to,
        text=text,
    )
    return {"preview": text, **result}


@router.post("/cleaning/run")
async def run_now(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """오늘 입실 예약 대상 청소 알림 즉시 일괄 발송(수동)."""
    return await run_cleaning_notifications(db)


@router.post("/cleaning/{booking_id}")
async def send_one(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """특정 예약 청소 알림 수동 발송(이미 보냈어도 재발송)."""
    booking = (await db.execute(
        select(Booking).where(Booking.id == booking_id)
        .options(selectinload(Booking.room).selectinload(Room.user))
    )).scalar_one_or_none()
    if not booking or not booking.room or booking.room.user_id != user.id:
        raise HTTPException(404, "예약을 찾을 수 없습니다.")
    res = await send_cleaning_for_booking(db, booking, booking.room, user, force=True)
    if res.get("skipped") and not res.get("ok"):
        raise HTTPException(400, res.get("detail", "발송 불가"))
    await db.flush()
    return res
