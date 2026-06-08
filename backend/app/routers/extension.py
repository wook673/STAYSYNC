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
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.auth import get_current_user
from app.models.models import User, Room, PlatformConnection, PlatformType

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/extension", tags=["extension"])

# 확장 지원 플랫폼 ↔ 내부 PlatformType 매핑
EXT_PLATFORM_MAP = {
    "33m2": PlatformType.m33,
    "enkostay": PlatformType.ncostay,
    "liveanywhere": PlatformType.liveanywhere,
    "zaritalk": PlatformType.zaritalk,
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
