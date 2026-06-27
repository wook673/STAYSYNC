import uuid
from datetime import date
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional

from app.db.database import get_db
from app.models.models import Booking, Room, PlatformConnection, BookingStatus, PlatformType, Conflict, User
from app.core.auth import get_current_user
from app.services.ical_engine import sync_connection, detect_conflicts

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

PLATFORM_COLORS = {
    "airbnb": "#FF5A5F",
    "agoda": "#EB1C24",
    "bookingcom": "#003580",
    "zaritalk": "#5B8DEF",
    "wehome": "#1EC782",
    "ncostay": "#FF8C00",
    "liveanywhere": "#9B59B6",
    "33m2": "#F39C12",
    "manual": "#95A5A6",
}


@router.get("/events")
async def get_calendar_events(
    start: date = Query(...),
    end: date = Query(...),
    room_ids: list[str] = Query(default=[]),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    FullCalendar용 이벤트 목록 반환
    """
    # 유저의 방 ID 확인
    rooms_result = await db.execute(
        select(Room).where(Room.user_id == current_user.id, Room.is_active == True)
    )
    user_rooms = {str(r.id): r for r in rooms_result.scalars().all()}

    # 필터링할 room_ids
    target_room_ids = [
        uuid.UUID(rid) for rid in room_ids if rid in user_rooms
    ] if room_ids else [uuid.UUID(rid) for rid in user_rooms]

    if not target_room_ids:
        return []

    stmt = select(Booking).where(
        and_(
            Booking.room_id.in_(target_room_ids),
            Booking.start_date < end,
            Booking.end_date > start,
            Booking.status != BookingStatus.cancelled,
        )
    ).options(selectinload(Booking.connection))

    result = await db.execute(stmt)
    bookings = result.scalars().all()

    events = []
    for b in bookings:
        room = user_rooms.get(str(b.room_id))
        color = room.color if room else "#3B82F6"
        if b.platform != PlatformType.manual:
            color = PLATFORM_COLORS.get(b.platform.value, color)

        events.append({
            "id": str(b.id),
            "title": _event_title(b),
            "start": b.start_date.isoformat(),
            "end": b.end_date.isoformat(),
            "backgroundColor": color,
            "borderColor": color,
            "extendedProps": {
                "room_id": str(b.room_id),
                "room_name": room.name if room else "",
                "platform": b.platform.value,
                "summary": b.summary,
                "status": b.status.value,
                "guest_name": b.guest_name,
                "guest_count": b.guest_count,
                "amount": b.amount,
                "notes": b.notes,
            },
        })

    return events


@router.get("/conflicts")
async def get_conflicts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """미해결 이중예약 충돌 목록"""
    rooms_result = await db.execute(
        select(Room).where(Room.user_id == current_user.id)
    )
    room_ids = [r.id for r in rooms_result.scalars().all()]

    if not room_ids:
        return []

    stmt = select(Conflict).where(
        and_(
            Conflict.room_id.in_(room_ids),
            Conflict.resolved_at.is_(None),
        )
    ).order_by(Conflict.detected_at.desc())

    result = await db.execute(stmt)
    return [
        {
            "id": str(c.id),
            "room_id": str(c.room_id),
            "booking_id_1": str(c.booking_id_1),
            "booking_id_2": str(c.booking_id_2),
            "detected_at": c.detected_at.isoformat(),
        }
        for c in result.scalars().all()
    ]


@router.post("/sync/{connection_id}")
async def manual_sync(
    connection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """수동 동기화 트리거"""
    # 권한 확인
    result = await db.execute(
        select(PlatformConnection)
        .join(Room, Room.id == PlatformConnection.room_id)
        .where(
            PlatformConnection.id == connection_id,
            Room.user_id == current_user.id,
        )
        .options(selectinload(PlatformConnection.room))
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="연결을 찾을 수 없습니다.")

    sync_result = await sync_connection(db, conn)
    conflicts = await detect_conflicts(db, conn.room_id)
    await db.commit()

    return {
        **sync_result,
        "conflicts": len(conflicts),
    }


class ManualBookingCreate(BaseModel):
    room_id: str
    start_date: date
    end_date: date
    guest_name: Optional[str] = None
    guest_count: Optional[int] = None
    notes: Optional[str] = None
    summary: Optional[str] = None
    amount: Optional[int] = None        # 수익(원)
    status: Optional[str] = "confirmed"  # confirmed(예약) | blocked(수동차단)


@router.post("/bookings")
async def create_manual_booking(
    body: ManualBookingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """수동 예약 등록 (야놀자/여기어때처럼 iCal 없는 플랫폼 대응)"""
    room_result = await db.execute(
        select(Room).where(
            Room.id == uuid.UUID(body.room_id),
            Room.user_id == current_user.id,
        )
    )
    room = room_result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="방을 찾을 수 없습니다.")

    is_block = (body.status or "confirmed") == "blocked"
    booking = Booking(
        id=uuid.uuid4(),
        room_id=room.id,
        platform=PlatformType.manual,
        summary=body.summary or body.guest_name or ("수동 차단" if is_block else "수동 예약"),
        start_date=body.start_date,
        end_date=body.end_date,
        guest_name=body.guest_name,
        guest_count=body.guest_count,
        amount=None if is_block else body.amount,
        notes=body.notes,
        status=BookingStatus.blocked if is_block else BookingStatus.confirmed,
    )
    db.add(booking)
    await db.flush()

    conflicts = await detect_conflicts(db, room.id)
    return {
        "booking": {"id": str(booking.id)},
        "conflicts": len(conflicts),
    }


@router.get("/settlement")
async def get_settlement(
    start: date = Query(...),
    end: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """기간 내 확정 예약의 수익 정산 집계 (방별 + 합계)"""
    rooms_result = await db.execute(
        select(Room).where(Room.user_id == current_user.id, Room.is_active == True)
    )
    rooms = {str(r.id): r for r in rooms_result.scalars().all()}
    if not rooms:
        return {"total": 0, "count": 0, "by_room": []}

    stmt = select(Booking).where(
        and_(
            Booking.room_id.in_([uuid.UUID(rid) for rid in rooms]),
            Booking.status == BookingStatus.confirmed,
            Booking.start_date < end,
            Booking.end_date > start,
        )
    )
    bookings = (await db.execute(stmt)).scalars().all()

    by_room: dict[str, dict] = {}
    total = 0
    for b in bookings:
        amt = b.amount or 0
        total += amt
        rid = str(b.room_id)
        if rid not in by_room:
            r = rooms.get(rid)
            by_room[rid] = {"room_id": rid, "room_name": r.name if r else "",
                            "color": r.color if r else "#888", "amount": 0, "count": 0}
        by_room[rid]["amount"] += amt
        by_room[rid]["count"] += 1

    return {
        "total": total,
        "count": len(bookings),
        "by_room": sorted(by_room.values(), key=lambda x: -x["amount"]),
    }


@router.delete("/bookings/{booking_id}")
async def delete_booking(
    booking_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Booking)
        .join(Room, Room.id == Booking.room_id)
        .where(Booking.id == booking_id, Room.user_id == current_user.id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
    booking.status = BookingStatus.cancelled
    return {"ok": True}


def _event_title(b: Booking) -> str:
    platform_labels = {
        "airbnb": "에어비앤비",
        "agoda": "아고다",
        "bookingcom": "부킹",
        "zaritalk": "자리톡",
        "wehome": "위홈",
        "ncostay": "엔코",
        "liveanywhere": "리브",
        "33m2": "삼삼엠투",
        "manual": "직접",
    }
    label = platform_labels.get(b.platform.value, b.platform.value)
    if b.status == BookingStatus.blocked:
        return f"[{label}] 차단"
    name = b.guest_name or b.summary or "예약"
    return f"[{label}] {name}"
