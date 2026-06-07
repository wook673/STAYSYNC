from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.routers import auth, rooms, calendar, billing
from app.services.scheduler import start_scheduler, stop_scheduler
from app.db.database import engine
from app.models.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시: DB 테이블 생성 + 스케줄러 시작
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "StaySync"}
