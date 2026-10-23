"""PostgreSQL access. Each service connects with its own DATABASE_URL and only
touches its own schema (customer, booking, document)."""
import logging
import sys
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

logger = logging.getLogger("horizon.db")
_engine: Engine | None = None
_SessionLocal: sessionmaker | None = None


class Base(DeclarativeBase):
    pass


def _normalise(url: str) -> str:
    # Accept plain postgres:// URLs (as RDS consoles and Secrets Manager often show them)
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def init_db() -> Engine:
    """Fail fast when DATABASE_URL is missing, so a misconfigured task never starts serving."""
    global _engine, _SessionLocal
    if _engine is not None:
        return _engine
    url = get_settings().database_url
    if not url:
        logger.critical("DATABASE_URL is not set. Set it in .env locally or in the ECS task definition (from Secrets Manager).")
        sys.exit(1)
    # Sessions run in UTC so every timestamp leaves the API as ISO 8601 UTC.
    _engine = create_engine(_normalise(url), pool_pre_ping=True, pool_size=5, max_overflow=5,
                            connect_args={"options": "-c timezone=UTC"})
    _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session() -> Iterator[Session]:
    if _SessionLocal is None:
        init_db()
    assert _SessionLocal is not None
    session = _SessionLocal()
    try:
        yield session
    finally:
        session.close()
