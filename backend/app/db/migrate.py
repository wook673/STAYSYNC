"""
경량 자동 마이그레이션 (SQLite 전용)
- create_all 은 기존 테이블에 컬럼을 추가(ALTER)하지 않으므로,
  모델에 새로 추가한 컬럼을 기존 DB에 idempotent 하게 채워 넣는다.
- 운영(PostgreSQL) 전환 시에는 Alembic을 사용하고 이 모듈은 건너뛴다.
"""
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

# 테이블 → [(컬럼명, SQL 타입 정의)] — 없으면 ALTER TABLE ADD COLUMN
_ADDITIONS = {
    "users": [
        ("solapi_api_key", "VARCHAR(255)"),
        ("solapi_api_secret", "VARCHAR(255)"),
        ("solapi_sender", "VARCHAR(20)"),
        ("cleaning_notify_enabled", "BOOLEAN DEFAULT 0"),
        ("cleaning_msg_template", "TEXT"),
    ],
    "rooms": [
        ("cleaner_name", "VARCHAR(100)"),
        ("cleaner_phone", "VARCHAR(20)"),
    ],
    "bookings": [
        ("cleaning_notified_at", "DATETIME"),
    ],
}


async def auto_migrate_sqlite(conn):
    """누락된 컬럼을 ALTER TABLE 로 추가 (SQLite)."""
    for table, cols in _ADDITIONS.items():
        # 기존 컬럼 목록 조회
        res = await conn.execute(text(f"PRAGMA table_info({table})"))
        existing = {row[1] for row in res.fetchall()}
        for name, ddl in cols:
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                logger.info("auto-migrate: %s.%s 추가", table, name)
