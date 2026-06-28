"""
APScheduler 기반 iCal 폴링 스케줄러
- 모든 활성 연결을 주기적으로 동기화
- 충돌 감지 후 카카오 알림톡 발송
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.db.database import AsyncSessionLocal
from app.models.models import PlatformConnection, Room, User
from app.services.ical_engine import sync_connection, detect_conflicts
from app.services.kakao_alimtalk import send_double_booking_alert
from app.services.cleaning_notify import run_cleaning_notifications
from app.core.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def sync_all_connections():
    """전체 활성 연결 동기화 (스케줄러에서 호출)"""
    logger.info("Starting scheduled iCal sync...")

    async with AsyncSessionLocal() as db:
        # 활성 연결 전체 조회 (방, 유저 정보 포함)
        stmt = (
            select(PlatformConnection)
            .where(PlatformConnection.is_active == True)
            .options(
                selectinload(PlatformConnection.room).selectinload(Room.user)
            )
        )
        result = await db.execute(stmt)
        connections = result.scalars().all()

        logger.info(f"Syncing {len(connections)} connections...")

        synced_rooms = set()

        for conn in connections:
            try:
                sync_result = await sync_connection(db, conn)
                logger.info(
                    f"Synced {conn.platform.value} room={conn.room_id}: "
                    f"+{sync_result['added']} ~{sync_result['updated']} -{sync_result['removed']}"
                )

                # 해당 방의 충돌 감지 (방당 1번만)
                if conn.room_id not in synced_rooms:
                    synced_rooms.add(conn.room_id)
                    conflicts = await detect_conflicts(db, conn.room_id)

                    if conflicts:
                        user = conn.room.user
                        room = conn.room
                        logger.warning(f"Conflicts detected in room {room.name}: {len(conflicts)}")

                        # 알림톡 발송
                        if user.phone:
                            for conflict in conflicts:
                                await send_double_booking_alert(
                                    phone=user.phone,
                                    room_name=room.name,
                                    booking_1=conflict["booking_1"],
                                    booking_2=conflict["booking_2"],
                                )

            except Exception as e:
                logger.error(f"Error syncing connection {conn.id}: {e}")
                conn.sync_error = str(e)

        await db.commit()

    logger.info("Scheduled sync complete.")


async def run_daily_cleaning_notifications():
    """매일 1회: 오늘 입실 예약 → 담당 청소인원에게 알림."""
    async with AsyncSessionLocal() as db:
        try:
            await run_cleaning_notifications(db)
        except Exception as e:  # noqa: BLE001
            logger.error("청소 알림 작업 오류: %s", e)


def start_scheduler():
    """앱 시작 시 스케줄러 등록"""
    scheduler.add_job(
        sync_all_connections,
        trigger=IntervalTrigger(minutes=settings.ICAL_POLL_INTERVAL_MINUTES),
        id="ical_sync",
        name="iCal Polling Sync",
        replace_existing=True,
        misfire_grace_time=60,
    )
    # 청소 알림: 매일 오전 8시(KST 가정) 오늘 입실 예약 대상 발송
    scheduler.add_job(
        run_daily_cleaning_notifications,
        trigger=CronTrigger(hour=8, minute=0),
        id="cleaning_notify",
        name="Daily Cleaning Notifications",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    logger.info(f"Scheduler started: syncing every {settings.ICAL_POLL_INTERVAL_MINUTES} minutes")


def stop_scheduler():
    scheduler.shutdown(wait=False)
