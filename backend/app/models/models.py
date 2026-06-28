import uuid
from datetime import datetime, date
from sqlalchemy import (
    String, ForeignKey, DateTime, Date, Boolean, Integer,
    Text, Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.types import GUID
from app.db.database import Base
import enum


class PlatformType(str, enum.Enum):
    airbnb = "airbnb"
    agoda = "agoda"
    bookingcom = "bookingcom"
    zaritalk = "zaritalk"
    wehome = "wehome"
    ncostay = "ncostay"
    liveanywhere = "liveanywhere"
    m33 = "33m2"
    zigbang = "zigbang"
    manual = "manual"


class BookingStatus(str, enum.Enum):
    confirmed = "confirmed"
    blocked = "blocked"
    cancelled = "cancelled"
    tentative = "tentative"


class PlanType(str, enum.Enum):
    trial = "trial"
    basic = "basic"
    pro = "pro"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    plan: Mapped[PlanType] = mapped_column(SAEnum(PlanType), default=PlanType.trial)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    toss_customer_key: Mapped[str | None] = mapped_column(String(255))
    toss_billing_key: Mapped[str | None] = mapped_column(String(500))
    # ── 청소 알림(솔라피) 설정 ──
    solapi_api_key: Mapped[str | None] = mapped_column(String(255))
    solapi_api_secret: Mapped[str | None] = mapped_column(String(255))
    solapi_sender: Mapped[str | None] = mapped_column(String(20))      # 발신번호(사전등록)
    cleaning_notify_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    cleaning_msg_template: Mapped[str | None] = mapped_column(Text)    # 메시지 템플릿(변수 치환)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    rooms: Mapped[list["Room"]] = relationship("Room", back_populates="user", cascade="all, delete-orphan")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(7), default="#3B82F6")  # hex color
    # ── 매물별 청소 담당자 ──
    cleaner_name: Mapped[str | None] = mapped_column(String(100))
    cleaner_phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="rooms")
    connections: Mapped[list["PlatformConnection"]] = relationship(
        "PlatformConnection", back_populates="room", cascade="all, delete-orphan"
    )
    bookings: Mapped[list["Booking"]] = relationship(
        "Booking", back_populates="room", cascade="all, delete-orphan"
    )


class PlatformConnection(Base):
    __tablename__ = "platform_connections"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("rooms.id"), nullable=False)
    platform: Mapped[PlatformType] = mapped_column(SAEnum(PlatformType), nullable=False)
    ical_url: Mapped[str | None] = mapped_column(Text)
    nickname: Mapped[str | None] = mapped_column(String(100))  # 플랫폼 내 숙소명
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_error: Mapped[str | None] = mapped_column(Text)
    # ── 확장 기반 연결 (33m2·엔코·리브애니웨어·자리톡: 공식 API 부재) ──
    # 사용자 본인 세션 토큰을 확장이 캡처해 전달. 암호화 저장 권장(아래 TODO).
    connection_type: Mapped[str] = mapped_column(String(20), default="ical")  # ical | extension | manual
    session_token: Mapped[str | None] = mapped_column(Text)  # 캡처된 세션 토큰(JSON, 암호화 대상)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_maintain: Mapped[bool] = mapped_column(Boolean, default=False)
    account_label: Mapped[str | None] = mapped_column(String(200))  # 연결된 플랫폼 계정 표시명
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("room_id", "platform", name="uq_room_platform"),)

    room: Mapped["Room"] = relationship("Room", back_populates="connections")
    bookings: Mapped[list["Booking"]] = relationship(
        "Booking", back_populates="connection", cascade="all, delete-orphan"
    )


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("rooms.id"), nullable=False)
    connection_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("platform_connections.id"))
    ical_uid: Mapped[str | None] = mapped_column(String(500))  # iCal UID for dedup
    platform: Mapped[PlatformType] = mapped_column(SAEnum(PlatformType), default=PlatformType.manual)
    summary: Mapped[str | None] = mapped_column(String(500))   # 예약자명 or 예약번호
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    guest_name: Mapped[str | None] = mapped_column(String(200))
    guest_count: Mapped[int | None] = mapped_column(Integer)
    amount: Mapped[int | None] = mapped_column(Integer)  # 수익(원) — 정산 반영
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[BookingStatus] = mapped_column(SAEnum(BookingStatus), default=BookingStatus.confirmed)
    cleaning_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # 청소 알림 발송 시각(중복 방지)
    raw_ical: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("connection_id", "ical_uid", name="uq_connection_ical_uid"),)

    room: Mapped["Room"] = relationship("Room", back_populates="bookings")
    connection: Mapped["PlatformConnection | None"] = relationship("PlatformConnection", back_populates="bookings")


class Conflict(Base):
    __tablename__ = "conflicts"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("rooms.id"), nullable=False)
    booking_id_1: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("bookings.id"))
    booking_id_2: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("bookings.id"))
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notified: Mapped[bool] = mapped_column(Boolean, default=False)
