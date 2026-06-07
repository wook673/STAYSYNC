from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_KEY: Optional[str] = None

    TOSS_SECRET_KEY: str = "test_sk_"
    TOSS_CLIENT_KEY: str = "test_ck_"
    TOSS_WEBHOOK_SECRET: str = ""

    KAKAO_API_KEY: str = ""
    KAKAO_SENDER_KEY: str = ""
    KAKAO_TEMPLATE_DOUBLE_BOOKING: str = "TMPL_001"
    KAKAO_TEMPLATE_SYNC_DONE: str = "TMPL_002"

    APP_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"
    ICAL_POLL_INTERVAL_MINUTES: int = 15

    class Config:
        env_file = ".env"


settings = Settings()
