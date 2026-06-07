import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from app.db.database import get_db
from app.models.models import User, PlanType
from app.core.auth import verify_password, hash_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    # 중복 이메일 체크
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")

    user = User(
        id=uuid.uuid4(),
        email=body.email,
        hashed_password=hash_password(body.password),
        name=body.name,
        phone=body.phone,
        plan=PlanType.trial,
        trial_ends_at=datetime.utcnow() + timedelta(days=14),
    )
    db.add(user)
    await db.flush()

    token = create_access_token(user.id)
    return {
        "access_token": token,
        "user": _user_dict(user),
    }


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    token = create_access_token(user.id)
    return {
        "access_token": token,
        "user": _user_dict(user),
    }


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return _user_dict(current_user)


def _user_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "phone": user.phone,
        "plan": user.plan.value,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
    }
