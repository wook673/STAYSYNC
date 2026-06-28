"""
청소 알림 로직
- 트리거: 게스트 '입실일'에 해당 매물 청소 담당자에게 '퇴실일(=청소 예정일)'을 알림
- 사용자별 솔라피 키로 발송, Booking.cleaning_notified_at 으로 중복 발송 방지
"""
import logging
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.models import Booking, BookingStatus, Room, User
from app.services.solapi import render_cleaning_message, send_message

logger = logging.getLogger(__name__)


async def send_cleaning_for_booking(db, booking: Booking, room: Room, user: User,
                                    *, force: bool = False) -> dict:
    """예약 1건에 대해 청소 담당자에게 알림 발송. 발송 시 cleaning_notified_at 갱신."""
    if not room.cleaner_phone:
        return {"ok": False, "detail": "청소 담당자 연락처가 없습니다.", "skipped": True}
    if booking.cleaning_notified_at and not force:
        return {"ok": True, "detail": "이미 발송됨", "skipped": True}

    text = render_cleaning_message(
        user.cleaning_msg_template,
        room=room.name,
        checkin=booking.start_date.isoformat(),
        checkout=booking.end_date.isoformat(),
        guest=booking.guest_name or booking.summary or "",
    )
    result = await send_message(
        api_key=user.solapi_api_key,
        api_secret=user.solapi_api_secret,
        sender=user.solapi_sender,
        to=room.cleaner_phone,
        text=text,
    )
    if result["ok"]:
        booking.cleaning_notified_at = datetime.utcnow()
    return {**result, "skipped": False, "to": room.cleaner_phone}


async def run_cleaning_notifications(db, today: date | None = None) -> dict:
    """오늘 입실하는 모든 확정 예약 → 담당 청소인원에게 발송 (스케줄러용)."""
    today = today or date.today()
    stmt = (
        select(Booking)
        .where(
            Booking.start_date == today,
            Booking.status == BookingStatus.confirmed,
            Booking.cleaning_notified_at.is_(None),
        )
        .options(selectinload(Booking.room).selectinload(Room.user))
    )
    bookings = (await db.execute(stmt)).scalars().all()

    sent = skipped = failed = 0
    for b in bookings:
        room = b.room
        user = room.user if room else None
        if not room or not user or not user.cleaning_notify_enabled:
            continue
        res = await send_cleaning_for_booking(db, b, room, user)
        if res.get("skipped"):
            skipped += 1
        elif res["ok"]:
            sent += 1
        else:
            failed += 1
    await db.commit()
    logger.info("청소 알림: 발송 %d, 스킵 %d, 실패 %d (대상 %d)", sent, skipped, failed, len(bookings))
    return {"sent": sent, "skipped": skipped, "failed": failed, "candidates": len(bookings)}
