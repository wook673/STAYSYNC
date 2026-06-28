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
    room_id: Optional[str] = None  # 연결할 방 지정 (없으면 첫 번째 방)


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

    # 연결할 방: room_id 지정 시 그 방, 아니면 첫 번째 방
    if payload.room_id:
        room_stmt = select(Room).where(
            and_(Room.id == uuid.UUID(payload.room_id), Room.user_id == user.id)
        )
    else:
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
    room_label: Optional[str] = None  # 플랫폼 내 매물(방) 이름 (표시용)
    room_addr: Optional[str] = None   # 매물 주소 → 그룹 키(이름 표기가 달라도 주소로 동일 매물 인식)
    start_date: str            # "YYYY-MM-DD" (체크인)
    end_date: str              # "YYYY-MM-DD" (체크아웃, exclusive)
    status: str = "confirmed"  # confirmed | blocked | cancelled


_ROOM_COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#F39C12", "#EF4444",
                "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#6366F1"]


class SyncPayload(BaseModel):
    platform: str
    bookings: list[ScrapedBooking]
    account_label: Optional[str] = None


def _parse_date(s: str) -> date:
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def _norm_addr(addr: Optional[str]) -> str:
    """주소 정규화 그룹 키 — 공백 제거 + 소문자 (사소한 표기차 흡수)."""
    return "".join((addr or "").split()).lower()


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

    # 매물 그룹화: 주소 기준(이름 표기가 달라도 같은 주소면 하나의 매물).
    #   key = 정규화된 주소(없으면 이름). value = {addr, name, items}
    groups: dict[str, dict] = {}
    for b in payload.bookings:
        name = (b.room_label or payload.account_label or "33m2 미지정").strip() or "33m2 미지정"
        addr = (b.room_addr or "").strip()
        key = _norm_addr(addr) if addr else f"name:{name}"
        g = groups.setdefault(key, {"addr": addr, "name": name, "items": []})
        g["items"].append(b)
        if addr and not g["addr"]:
            g["addr"] = addr

    # 사용자 기존 방 (주소·이름 양쪽으로 매핑 → 주소 우선)
    rooms_res = await db.execute(
        select(Room).where(Room.user_id == user.id, Room.is_active == True)  # noqa: E712
    )
    all_rooms = rooms_res.scalars().all()
    rooms_by_addr = {_norm_addr(r.address): r for r in all_rooms if r.address}
    rooms_by_name = {r.name: r for r in all_rooms}

    added = updated = removed = 0
    affected_room_ids: set = set()
    status_map = {
        "confirmed": BookingStatus.confirmed,
        "blocked": BookingStatus.blocked,
        "cancelled": BookingStatus.cancelled,
    }

    for key, g in groups.items():
        items, name, addr = g["items"], g["name"], g["addr"]
        # 1) 방 find-or-create: 주소 일치 우선 → 이름 일치 → 신규
        room = None
        if addr:
            room = rooms_by_addr.get(_norm_addr(addr))
        if not room:
            room = rooms_by_name.get(name)
        if not room:
            room = Room(
                id=uuid.uuid4(), user_id=user.id, name=name, address=addr or None,
                color=_ROOM_COLORS[len(rooms_by_name) % len(_ROOM_COLORS)],
            )
            db.add(room)
            await db.flush()
        # 주소를 비워둔 기존 방이면 채워서 다음부터 주소로 묶이게 함
        if addr and not room.address:
            room.address = addr
        rooms_by_name[room.name] = room
        if room.address:
            rooms_by_addr[_norm_addr(room.address)] = room
        affected_room_ids.add(room.id)

        # 2) 그 방의 확장 연결 find-or-create
        conn = (await db.execute(
            select(PlatformConnection).where(and_(
                PlatformConnection.room_id == room.id,
                PlatformConnection.platform == platform_type,
            ))
        )).scalar_one_or_none()
        if not conn:
            conn = PlatformConnection(
                id=uuid.uuid4(), room_id=room.id, platform=platform_type,
                connection_type="extension", is_active=True,
            )
            db.add(conn)
            await db.flush()
        conn.account_label = name
        conn.last_synced_at = datetime.utcnow()
        conn.sync_error = None

        # 3) 그 연결의 기존 예약을 (취소 포함) 전부 로드 → 재등장 시 insert 대신 update(되살리기)
        #    (UNIQUE(connection_id, ical_uid)는 상태와 무관하므로, 취소된 행도 키를 점유함)
        existing = {b.ical_uid: b for b in (await db.execute(select(Booking).where(
            Booking.connection_id == conn.id,
        ))).scalars().all()}
        seen: set[str] = set()
        for b in items:
            uid = f"{payload.platform}:{b.external_id}"
            if uid in seen:
                continue  # 같은 그룹 내 중복 예약 ID → 스킵 (UNIQUE 위반 방지)
            seen.add(uid)
            try:
                sd, ed = _parse_date(b.start_date), _parse_date(b.end_date)
            except ValueError:
                continue
            status = status_map.get(b.status, BookingStatus.confirmed)
            if uid in existing:
                row = existing[uid]  # 기존(취소 포함) → 갱신·되살리기
                if row.start_date != sd or row.end_date != ed or row.status != status:
                    row.start_date, row.end_date, row.status = sd, ed, status
                    row.summary = b.summary or row.summary
                    row.updated_at = datetime.utcnow()
                    updated += 1
            else:
                db.add(Booking(
                    id=uuid.uuid4(), room_id=room.id, connection_id=conn.id,
                    ical_uid=uid, platform=platform_type,
                    summary=b.summary or "예약",
                    start_date=sd, end_date=ed, status=status,
                ))
                added += 1
        # 화면에서 사라진 예약 → 취소 (이미 취소된 건 제외)
        for uid, row in existing.items():
            if uid not in seen and row.status != BookingStatus.cancelled:
                row.status = BookingStatus.cancelled
                removed += 1

    await db.flush()

    # 영향받은 방별 이중예약 감지
    conflicts = 0
    for rid in affected_room_ids:
        conflicts += len(await detect_conflicts(db, rid))

    await db.commit()

    return {
        "ok": True,
        "platform": payload.platform,
        "rooms": len(groups),
        "added": added,
        "updated": updated,
        "removed": removed,
        "conflicts": conflicts,
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
