from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.routers import auth, rooms, calendar, billing, extension, notifications
from app.services.scheduler import start_scheduler, stop_scheduler
from app.db.database import engine
from app.models.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시: DB 테이블 생성 + 누락 컬럼 자동 마이그레이션 + 스케줄러 시작
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if engine.url.get_backend_name().startswith("sqlite"):
            from app.db.migrate import auto_migrate_sqlite
            await auto_migrate_sqlite(conn)

    start_scheduler()
    yield
    # 종료 시
    stop_scheduler()


app = FastAPI(
    title="StaySync API",
    description="한국 단기임대 플랫폼 통합 관리 서비스",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://staysync.kr"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(calendar.router)
app.include_router(billing.router)
app.include_router(extension.router)
app.include_router(notifications.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "StaySync"}
