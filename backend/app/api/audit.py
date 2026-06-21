from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.audit import AuditLog
from app.core.dependencies import get_current_user, require_admin
from app.models.user import User

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    action: str
    resource_type: str
    resource_id: str | None
    resource_name: str | None
    detail: str | None
    ip_address: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AuditLogResponse])
async def get_audit_logs(
    resource_type: str | None = Query(None),
    action: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).offset(offset)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    if action:
        query = query.where(AuditLog.action == action)

    result = await db.execute(query)
    return result.scalars().all()
