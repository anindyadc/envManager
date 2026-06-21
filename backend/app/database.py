from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        from app.models import user, project, environment, secret, audit, project_member, share_link, ssh_credential  # noqa
        await conn.run_sync(Base.metadata.create_all)
        await _migrate(conn)


async def _migrate(conn):
    """Add columns that didn't exist in earlier schema versions."""
    is_pg = "postgresql" in str(settings.database_url)
    if is_pg:
        migrations = [
            "ALTER TABLE ssh_credentials ADD COLUMN IF NOT EXISTS auth_type VARCHAR NOT NULL DEFAULT 'key'",
            "ALTER TABLE ssh_credentials ADD COLUMN IF NOT EXISTS encrypted_password TEXT",
            "ALTER TABLE ssh_credentials ALTER COLUMN encrypted_private_key DROP NOT NULL",
            "ALTER TABLE environments ADD COLUMN IF NOT EXISTS ssh_credential_id VARCHAR",
            "ALTER TABLE environments ADD COLUMN IF NOT EXISTS remote_path VARCHAR",
        ]
    else:
        # SQLite doesn't support ALTER COLUMN or IF NOT EXISTS — skip silently;
        # create_all already handles fresh SQLite DBs correctly.
        return
    for sql in migrations:
        try:
            await conn.exec_driver_sql(sql)
        except Exception:
            pass
