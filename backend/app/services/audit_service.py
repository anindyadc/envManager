from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog


async def log_action(
    db: AsyncSession,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    resource_name: str | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(entry)
    # commit handled by get_db context manager
