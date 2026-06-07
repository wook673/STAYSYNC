"""
iCal 파싱 엔진
- 플랫폼별 iCal URL에서 예약 데이터 추출
- 중복(dedup) 처리
- DB 저장
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional
import httpx
from icalendar import Calendar, Event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import uuid

from app.models.models import Booking, PlatformConnection, BookingStatus, PlatformType, Conflict

logger = logging.getLogger(__name__)

# 플랫폼별 iCal User-Agent (일부 플랫폼이 봇 차단함)
PLATFORM_HEADERS = {
    "airbnb": {"User-Agent": "Airbnb/Calendar"},
    "agoda": {"User-Agent": "Mozilla/5.0"},
    "bookingcom": {"User-Agent": "Mozilla/5.0"},
    "zaritalk": {"User-Agent": "Mozilla/5.0"},
    "wehome": {"User-Agent": "Mozilla/5.0"},
    "default": {"User-Agent": "Mozilla/5.0 (compatible; StaySync/1.0)"},
}


async def fetch_ical_content(url: str, platform: str = "default") -> Optional[str]:
    """iCal URL에서 내용을 가져옴"""
    headers = PLATFORM_HEADERS.get(platform, PLATFORM_HEADERS["default"])
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.text
    except httpx.HTTPError as e:
        logger.error(f"iCal fetch failed for {platform}: {e}")
        return None


def parse_ical(content: str) -> list[dict]:
    """iCal 텍스트를 파싱하여 예약 목록 반환"""
    try:
        cal = Calendar.from_ical(content)
    except Exception as e:
        logger.error(f"iCal parse error: {e}")
        return []

    bookings = []
    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        try:
            uid = str(component.get("UID", ""))
            summary = str(component.get("SUMMARY", "예약"))
            status_raw = str(component.get("STATUS", "CONFIRMED")).upper()
            description = str(component.get("DESCRIPTION", ""))

            # 날짜 파싱 (DATE or DATETIME)
            dtstart = component.get("DTSTART")
            dtend = component.get("DTEND")

            if not dtstart or not dtend:
                continue

            start = dtstart.dt
            end = dtend.dt

            # datetime → date 변환
            if isinstance(start, datetime):
                start = start.date()
            if isinstance(end, datetime):
                end = end.date()

            # Airbnb는 end가 체크아웃 당일 → 실제 마지막 숙박일은 end - 1
            # iCal 표준: DTEND는 exclusive (체크아웃 날)
            # DB에는 체크인~체크아웃 전날로 저장

            status = BookingStatus.confirmed
            if status_raw in ("CANCELLED", "CANCELED"):
                status = BookingStatus.cancelled
            elif "BLOCKED" in summary.upper() or "NOT AVAILABLE" in summary.upper():
                status = BookingStatus.blocked

            bookings.append({
                "ical_uid": uid,
                "summary": summary,
                "start_date": start,
                "end_date": end,  # exclusive (체크아웃 날)
                "status": status,
                "raw_ical": str(component.to_ical()),
                "description": description,
            })
        except Exception as e:
            logger.warning(f"Failed to parse event: {e}")
            continue

    return bookings


async def sync_connection(
    db: AsyncSession,
    connection: PlatformConnection,
) -> dict:
    """
    단일 플랫폼 연결 동기화
    Returns: {"added": int, "updated": int, "removed": int, "errors": list}
    """
    if not connection.ical_url:
        return {"added": 0, "updated": 0, "removed": 0, "errors": ["No iCal URL"]}

    content = await fetch_ical_content(connection.ical_url, connection.platform.value)
    if not content:
        # 오류 기록
        connection.sync_error = "iCal URL fetch failed"
        await db.flush()
        return {"added": 0, "updated": 0, "removed": 0, "errors": ["Fetch failed"]}

    parsed = parse_ical(content)
    added = updated = removed = 0
    errors = []

    # 기존 예약 UID 목록
    existing_stmt = select(Booking).where(
        and_(
            Booking.connection_id == connection.id,
            Booking.status != BookingStatus.cancelled,
        )
    )
    result = await db.execute(existing_stmt)
    existing_bookings = {b.ical_uid: b for b in result.scalars().all()}

    fetched_uids = set()

    for event in parsed:
        uid = event["ical_uid"]
        fetched_uids.add(uid)

        if uid in existing_bookings:
            # 업데이트
            b = existing_bookings[uid]
            if (b.start_date != event["start_date"] or
                    b.end_date != event["end_date"] or
                    b.status != event["status"]):
                b.start_date = event["start_date"]
                b.end_date = event["end_date"]
                b.summary = event["summary"]
                b.status = event["status"]
                b.raw_ical = event["raw_ical"]
                b.updated_at = datetime.utcnow()
                updated += 1
        else:
            # 신규 추가
            new_booking = Booking(
                id=uuid.uuid4(),
                room_id=connection.room_id,
                connection_id=connection.id,
                ical_uid=uid,
                platform=connection.platform,
                summary=event["summary"],
                start_date=event["start_date"],
                end_date=event["end_date"],
                status=event["status"],
                raw_ical=event["raw_ical"],
            )
            db.add(new_booking)
            added += 1

    # iCal에서 사라진 예약 → cancelled 처리
    for uid, booking in existing_bookings.items():
        if uid not in fetched_uids:
            booking.status = BookingStatus.cancelled
            removed += 1

    # 동기화 시간 업데이트
    connection.last_synced_at = datetime.utcnow()
    connection.sync_error = None
    await db.flush()

    return {"added": added, "updated": updated, "removed": removed, "errors": errors}


async def detect_conflicts(db: AsyncSession, room_id: uuid.UUID) -> list[dict]:
    """
    특정 방의 이중예약 충돌 감지
    Returns: 새로 감지된 충돌 목록
    """
    # 확정된 예약만 체크
    stmt = select(Booking).where(
        and_(
            Booking.room_id == room_id,
            Booking.status == BookingStatus.confirmed,
        )
    ).order_by(Booking.start_date)
    result = await db.execute(stmt)
    bookings = result.scalars().all()

    new_conflicts = []

    for i, b1 in enumerate(bookings):
        for b2 in bookings[i + 1:]:
            if b2.start_date >= b1.end_date:
                break  # 이후는 겹칠 일 없음 (정렬됨)

            # 날짜 겹침: b1.start < b2.end AND b2.start < b1.end
            if b1.start_date < b2.end_date and b2.start_date < b1.end_date:
                # 이미 기록된 충돌인지 확인
                exists_stmt = select(Conflict).where(
                    and_(
                        Conflict.room_id == room_id,
                        Conflict.booking_id_1 == b1.id,
                        Conflict.booking_id_2 == b2.id,
                        Conflict.resolved_at.is_(None),
                    )
                )
                exists_result = await db.execute(exists_stmt)
                if exists_result.scalar_one_or_none():
                    continue

                conflict = Conflict(
                    id=uuid.uuid4(),
                    room_id=room_id,
                    booking_id_1=b1.id,
                    booking_id_2=b2.id,
                )
                db.add(conflict)
                new_conflicts.append({
                    "booking_1": {
                        "id": str(b1.id),
                        "platform": b1.platform.value,
                        "summary": b1.summary,
                        "start": str(b1.start_date),
                        "end": str(b1.end_date),
                    },
                    "booking_2": {
                        "id": str(b2.id),
                        "platform": b2.platform.value,
                        "summary": b2.summary,
                        "start": str(b2.start_date),
                        "end": str(b2.end_date),
                    },
                })

    if new_conflicts:
        await db.flush()

    return new_conflicts
