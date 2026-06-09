"""
확장 프로그램 연동 라우터
- staySync Chrome 확장이 캡처한 "사용자 본인 세션 토큰"을 수신
- 공식 API가 없는 플랫폼(33m2·엔코스테이·리브애니웨어·자리톡)을 위한 경로

보안 원칙:
- 비밀번호는 절대 받지 않는다. 이미 발급된 세션 토큰만 받는다.
- 토큰은 사용자 본인 계정(PlatformConnection)에만 귀속된다.
- TODO(보안): session_token 은 평문 저장하지 말고 KMS/Fernet 등으로 암호화 저장.
"""
import json
import logging
import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.auth import get_current_user
from app.models.models import User, Room, PlatformConnection, PlatformType, Booking, BookingStatus
from app.services.ical_engine import detect_conflicts
from app.services.extension_sync import propagate_block

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/extension", tags=["extension"])

# 확장 지원 플랫폼 ↔ 내부 PlatformType 매핑
EXT_PLATFORM_MAP = {
    "33m2": PlatformType.m33,
    "enkostay": PlatformType.ncostay,
    "liveanywhere": PlatformType.liveanywhere,
    "zaritalk": PlatformType.zaritalk,
    "zigbang": PlatformType.zigbang,
}

# 플랫폼별 토큰 선별 우선순위 (백엔드가 후보 중 실제 토큰을 고를 때 사용)
TOKEN_PRIORITY = ["accessToken", "access_token", "Authorization", "authToken", "token"]


class ConnectPayload(BaseModel):
    platform: str
    origin: str
    auto_maintain: bool = False
    token_strategy: str  # cookie | localStorage
    credentials: dict  # 토큰 후보 전체 (키 → 값)
    preferred_keys: list[str] = []
    captured_at: Optional[str] = None


def _select_token(credentials: dict, preferred: list[str]) -> Optional[str]:
    """후보 자격증명에서 가장 유력한 세션 토큰을 선별."""
    keys = list(preferred) + TOKEN_PRIORITY
    # 1) 정확 일치 우선
    for k in keys:
        if k in credentials and credentials[k]:
            return credentials[k]
    # 2) 부분 일치 (대소문자 무시, token/auth/jwt 포함)
    for name, val in credentials.items():
        if val and any(s in name.lower() for s in ("token", "auth", "jwt", "session")):
            return val
    return None


@router.post("/connect")
async def connect_platform(
    payload: ConnectPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    platform_type = EXT_PLATFORM_MAP.get(payload.platform)
    if not platform_type:
        raise HTTPException(400, f"지원하지 않는 확장 플랫폼: {payload.platform}")

    token = _select_token(payload.credentials, payload.preferred_keys)
    if not token:
        raise HTTPException(
            422,
            "세션 토큰을 찾지 못했습니다. 플랫폼에 로그인되어 있는지 확인 후 다시 연결해주세요.",
        )

    # 사용자의 첫 번째 방에 연결을 귀속 (방 미지정 시 임시).
    # 실제로는 사용자가 어떤 방에 연결할지 선택하는 UI가 이상적.
    room_stmt = select(Room).where(Room.user_id == user.id).order_by(Room.created_at).limit(1)
    room = (await db.execute(room_stmt)).scalar_one_or_none()
    if not room:
        raise HTTPException(400, "먼저 숙소(방)를 1개 이상 등록해주세요.")

    # 기존 연결 있으면 토큰 갱신, 없으면 생성
    conn_stmt = select(PlatformConnection).where(
        and_(
            PlatformConnection.room_id == room.id,
            PlatformConnection.platform == platform_type,
        )
    )
    conn = (await db.execute(conn_stmt)).scalar_one_or_none()

    token_blob = json.dumps(
        {"primary": token, "all": payload.credentials, "strategy": payload.token_strategy},
        ensure_ascii=False,
    )
    # TODO(보안): token_blob 암호화 후 저장

    if conn:
        conn.session_token = token_blob
        conn.connection_type = "extension"
        conn.auto_maintain = payload.auto_maintain
        conn.sync_error = None
        conn.is_active = True
    else:
        conn = PlatformConnection(
            id=uuid.uuid4(),
            room_id=room.id,
            platform=platform_type,
            connection_type="extension",
            session_token=token_blob,
            auto_maintain=payload.auto_maintain,
            is_active=True,
        )
        db.add(conn)

    await db.flush()
    await db.commit()

    logger.info(
        "확장 연결 저장: user=%s platform=%s room=%s auto=%s",
        user.id, payload.platform, room.id, payload.auto_maintain,
    )

    return {
        "ok": True,
        "platform": payload.platform,
        "connection_id": str(conn.id),
        "room_id": str(room.id),
        "auto_maintain": payload.auto_maintain,
        "message": "연결 완료. 백그라운드 동기화가 곧 시작됩니다.",
    }


class ScrapedBooking(BaseModel):
    external_id: str           # 플랫폼 예약 고유 ID (DOM에서 추출)
    summary: Optional[str] = None  # 게스트명/예약번호
    start_date: str            # "YYYY-MM-DD" (체크인)
    end_date: str              # "YYYY-MM-DD" (체크아웃, exclusive)
    status: str = "confirmed"  # confirmed | blocked | cancelled


class SyncPayload(BaseModel):
    platform: str
    bookings: list[ScrapedBooking]
    account_label: Optional[str] = None


def _parse_date(s: str) -> date:
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


@router.post("/sync")
async def ingest_scraped_bookings(
    payload: SyncPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    확장 콘텐츠 스크립트가 플랫폼 화면(DOM)에서 직접 추출한 예약을 수신·저장.

    33m2처럼 공식/내부 API가 없는 플랫폼의 핵심 경로:
    엔드포인트를 호출하는 게 아니라, 사용자 본인이 로그인한 화면에 이미
    렌더된 예약을 확장이 읽어 보내준다. (same-origin·인증된 상태)

    ical_uid = "{platform}:{external_id}" 기준으로 dedup/upsert.
    """
    platform_type = EXT_PLATFORM_MAP.get(payload.platform)
    if not platform_type:
        raise HTTPException(400, f"지원하지 않는 확장 플랫폼: {payload.platform}")

    # 확장 연결 찾기 (먼저 /connect 로 연결돼 있어야 함)
    conn_stmt = (
        select(PlatformConnection)
        .join(Room, Room.id == PlatformConnection.room_id)
        .where(
            and_(
                Room.user_id == user.id,
                PlatformConnection.platform == platform_type,
                PlatformConnection.connection_type == "extension",
            )
        )
    )
    conn = (await db.execute(conn_stmt)).scalar_one_or_none()
    if not conn:
        raise HTTPException(
            400, "먼저 확장에서 해당 플랫폼을 연결(/connect)해주세요."
        )

    if payload.account_label:
        conn.account_label = payload.account_label

    # 기존 예약 (이 연결 소속, 취소 제외)
    existing_stmt = select(Booking).where(
        and_(
            Booking.connection_id == conn.id,
            Booking.status != BookingStatus.cancelled,
        )
    )
    existing = {b.ical_uid: b for b in (await db.execute(existing_stmt)).scalars().all()}

    added = updated = removed = 0
    seen: set[str] = set()
    new_ranges: list[tuple] = []  # 신규 확정 예약 (교차차단 전파용)

    for b in payload.bookings:
        uid = f"{payload.platform}:{b.external_id}"
        seen.add(uid)
        try:
            sd, ed = _parse_date(b.start_date), _parse_date(b.end_date)
        except ValueError:
            continue
        status = {
            "confirmed": BookingStatus.confirmed,
            "blocked": BookingStatus.blocked,
            "cancelled": BookingStatus.cancelled,
        }.get(b.status, BookingStatus.confirmed)

        if uid in existing:
            row = existing[uid]
            if row.start_date != sd or row.end_date != ed or row.status != status:
                row.start_date, row.end_date, row.status = sd, ed, status
                row.summary = b.summary or row.summary
                row.updated_at = datetime.utcnow()
                updated += 1
        else:
            db.add(Booking(
                id=uuid.uuid4(),
                room_id=conn.room_id,
                connection_id=conn.id,
                ical_uid=uid,
                platform=platform_type,
                summary=b.summary or "예약",
                start_date=sd,
                end_date=ed,
                status=status,
            ))
            added += 1
            if status == BookingStatus.confirmed:
                new_ranges.append((sd, ed))

    # 화면에서 사라진 예약 → 취소 처리
    for uid, row in existing.items():
        if uid not in seen:
            row.status = BookingStatus.cancelled
            removed += 1

    conn.last_synced_at = datetime.utcnow()
    conn.sync_error = None
    await db.flush()

    # 이중예약 감지
    conflicts = await detect_conflicts(db, conn.room_id)

    # 교차 차단 전파: 신규 확정 예약을 같은 방의 다른 플랫폼에 차단 요청
    # (현재 차단 쓰기는 DRY-RUN — 엔드포인트 확정·법무 검토 후 활성화)
    block_results = []
    for (sd, ed) in new_ranges:
        block_results.extend(
            await propagate_block(db, conn.room_id, conn.id, sd, ed)
        )

    await db.commit()

    return {
        "ok": True,
        "platform": payload.platform,
        "blocks_propagated": len(block_results),
        "added": added,
        "updated": updated,
        "removed": removed,
        "conflicts": len(conflicts),
    }


@router.get("/connections")
async def list_extension_connections(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """현재 사용자의 확장 기반 연결 목록 + 만료/재연결 필요 여부."""
    stmt = (
        select(PlatformConnection)
        .join(Room, Room.id == PlatformConnection.room_id)
        .where(
            and_(
                Room.user_id == user.id,
                PlatformConnection.connection_type == "extension",
            )
        )
    )
    conns = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(c.id),
            "platform": c.platform.value,
            "auto_maintain": c.auto_maintain,
            "account_label": c.account_label,
            "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
            "needs_reauth": bool(c.sync_error and "401" in (c.sync_error or "")),
            "sync_error": c.sync_error,
        }
        for c in conns
    ]
