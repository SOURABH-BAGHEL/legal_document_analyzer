"""Database engine, session factory and declarative base.

SQLite is used for the local MVP. Only portable SQLAlchemy types (String, Integer,
DateTime, JSON) are used so the schema can move to PostgreSQL/MySQL by changing
DATABASE_URL.
"""

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()
_is_sqlite = settings.database_url.startswith("sqlite")

if _is_sqlite and ":memory:" not in settings.database_url:
    db_path = settings.database_url.split("///", 1)[-1]
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine: Engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record) -> None:  # pragma: no cover - driver hook
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they register with Base.metadata before create_all.
    from app.models import ai_settings, analysis, document  # noqa: F401

    Base.metadata.create_all(bind=engine)
