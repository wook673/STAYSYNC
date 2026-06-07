import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional

from app.db.database import get_db
from app.models.models import Room, PlatformConnection, PlatformType, User
from app.core.auth import get_current_user

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

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


class RoomCreate(BaseModel):
    name: str
    address: Optional[str] = None
    description: Optional[str] = None
    color: str = "#3B82F6"


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class ConnectionCreate(BaseModel):
    platform: str
    ical_url: str
    nickname: Optional[str] = None


@router.get("")
async def list_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Room)
        .where(Room.user_id == current_user.id, Room.is_active == True)
        .options(selectinload(Room.connections))
        .order_by(Room.created_at)
    )
    rooms = result.scalars().all()
    return [_room_dict(r) for r in rooms]


@router.post("")
async def create_room(
    body: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = Room(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=body.name,
        address=body.address,
        description=body.description,
        color=body.color,
    )
    db.add(room)
    await db.flush()
    return _room_dict(room)


@router.patch("/{room_id}")
async def update_room(
    room_id: uuid.UUID,
    body: RoomUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room(db, room_id, current_user.id)
    if body.name is not None:
        room.name = body.name
    if body.address is not None:
        room.address = body.address
    if body.description is not None:
        room.description = body.description
    if body.color is not None:
        room.color = body.color
    await db.flush()
    return _room_dict(room)


@router.delete("/{room_id}")
async def delete_room(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room(db, room_id, current_user.id)
    room.is_active = False
    return {"ok": True}


# --- Platform Connections ---

@router.post("/{room_id}/connections")
async def add_connection(
    room_id: uuid.UUID,
    body: ConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room(db, room_id, current_user.id)

    try:
        platform = PlatformType(body.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 플랫폼: {body.platform}")

    # 기존 연결 확인
    existing = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.room_id == room_id,
            PlatformConnection.platform == platform,
        )
    )
    conn = existing.scalar_one_or_none()

    if conn:
        conn.ical_url = body.ical_url
        conn.nickname = body.nickname
        conn.is_active = True
    else:
        conn = PlatformConnection(
            id=uuid.uuid4(),
            room_id=room_id,
            platform=platform,
            ical_url=body.ical_url,
            nickname=body.nickname,
        )
        db.add(conn)

    await db.flush()
    return _connection_dict(conn)


@router.delete("/{room_id}/connections/{connection_id}")
async def remove_connection(
    room_id: uuid.UUID,
    connection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_room(db, room_id, current_user.id)
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.id == connection_id,
            PlatformConnection.room_id == room_id,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="연결을 찾을 수 없습니다.")
    conn.is_active = False
    return {"ok": True}


async def _get_room(db, room_id, user_id) -> Room:
    result = await db.execute(
        select(Room).where(Room.id == room_id, Room.user_id == user_id, Room.is_active == True)
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="방을 찾을 수 없습니다.")
    return room


def _room_dict(room: Room) -> dict:
    return {
        "id": str(room.id),
        "name": room.name,
        "address": room.address,
        "description": room.description,
        "color": room.color,
        "connections": [_connection_dict(c) for c in room.connections if c.is_active],
        "created_at": room.created_at.isoformat(),
    }


def _connection_dict(conn: PlatformConnection) -> dict:
    return {
        "id": str(conn.id),
        "platform": conn.platform.value,
        "nickname": conn.nickname,
        "has_ical": bool(conn.ical_url),
        "last_synced_at": conn.last_synced_at.isoformat() if conn.last_synced_at else None,
        "sync_error": conn.sync_error,
        "color": PLATFORM_COLORS.get(conn.platform.value, "#95A5A6"),
    }
