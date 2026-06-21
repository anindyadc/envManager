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
        from app.models import user, project, environment, application, secret, audit, project_member, share_link, ssh_credential, auth_token  # noqa
        await conn.run_sync(Base.metadata.create_all)
        await _migrate(conn)


async def _migrate(conn):
    """Add columns/tables that didn't exist in earlier schema versions."""
    is_pg = "postgresql" in str(settings.database_url)
    if not is_pg:
        return

    ddl = [
        # legacy ssh columns on environments (kept nullable so old rows are valid)
        "ALTER TABLE ssh_credentials ADD COLUMN IF NOT EXISTS auth_type VARCHAR NOT NULL DEFAULT 'key'",
        "ALTER TABLE ssh_credentials ADD COLUMN IF NOT EXISTS encrypted_password TEXT",
        "ALTER TABLE ssh_credentials ALTER COLUMN encrypted_private_key DROP NOT NULL",
        "ALTER TABLE environments ADD COLUMN IF NOT EXISTS ssh_credential_id VARCHAR",
        "ALTER TABLE environments ADD COLUMN IF NOT EXISTS remote_path VARCHAR",
        # email auth
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE",
        # applications table
        """
        CREATE TABLE IF NOT EXISTS applications (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            environment_id VARCHAR NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
            ssh_credential_id VARCHAR REFERENCES ssh_credentials(id) ON DELETE SET NULL,
            remote_path VARCHAR,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """,
        # application_id on secrets (nullable during migration)
        "ALTER TABLE secrets ADD COLUMN IF NOT EXISTS application_id VARCHAR REFERENCES applications(id) ON DELETE CASCADE",
        # application_id on share_links; make environment_id nullable for legacy rows
        "ALTER TABLE share_links ADD COLUMN IF NOT EXISTS application_id VARCHAR REFERENCES applications(id) ON DELETE CASCADE",
        "ALTER TABLE share_links ALTER COLUMN environment_id DROP NOT NULL",
        # create default application per environment (carries over the old ssh link)
        """
        INSERT INTO applications (id, name, environment_id, ssh_credential_id, remote_path, created_at, updated_at)
        SELECT
            gen_random_uuid()::varchar,
            e.name,
            e.id,
            e.ssh_credential_id,
            e.remote_path,
            NOW(),
            NOW()
        FROM environments e
        WHERE NOT EXISTS (
            SELECT 1 FROM applications a WHERE a.environment_id = e.id
        )
        """,
        # migrate secrets → their environment's default application
        """
        UPDATE secrets
        SET application_id = (
            SELECT a.id FROM applications a WHERE a.environment_id = secrets.environment_id LIMIT 1
        )
        WHERE application_id IS NULL AND environment_id IS NOT NULL
        """,
        # migrate share_links → their environment's default application
        """
        UPDATE share_links
        SET application_id = (
            SELECT a.id FROM applications a WHERE a.environment_id = share_links.environment_id LIMIT 1
        )
        WHERE application_id IS NULL AND environment_id IS NOT NULL
        """,
    ]

    for sql in ddl:
        try:
            await conn.exec_driver_sql(sql.strip())
        except Exception:
            pass
