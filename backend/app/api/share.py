from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.encryption import get_encryption_service
from app.database import get_db
from app.models.application import Application
from app.models.environment import Environment
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.secret import Secret
from app.models.share_link import ShareLink
from app.models.user import User, UserRole
from app.services.audit_service import log_action

router = APIRouter(tags=["share"])


def _mask(value: str) -> str:
    if len(value) <= 4:
        return "****"
    return value[:2] + "****" + value[-2:]


async def _require_app_member(
    project_id: str,
    env_id: str,
    app_id: str,
    current_user: User,
    db,
) -> Application:
    env_result = await db.execute(select(Environment).where(
        Environment.id == env_id, Environment.project_id == project_id
    ))
    if not env_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Environment not found")

    app_result = await db.execute(select(Application).where(
        Application.id == app_id, Application.environment_id == env_id
    ))
    app = app_result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if current_user.role == UserRole.admin:
        return app

    member = await db.execute(select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id,
    ))
    if not member.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")
    return app


class ShareLinkCreate(BaseModel):
    hours: int = 24
    note: str | None = None


class ShareLinkResponse(BaseModel):
    id: str
    token: str
    application_id: str
    project_id: str
    expires_at: datetime
    note: str | None
    view_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PublicSecretItem(BaseModel):
    key: str
    value: str | None
    is_sensitive: bool


class PublicShareView(BaseModel):
    app_name: str
    environment_name: str
    project_name: str
    env_type: str
    expires_at: datetime
    secrets: list[PublicSecretItem]
    note: str | None


@router.post(
    "/projects/{project_id}/environments/{env_id}/applications/{app_id}/share-links",
    response_model=ShareLinkResponse,
    status_code=201,
)
async def create_share_link(
    project_id: str,
    env_id: str,
    app_id: str,
    payload: ShareLinkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_app_member(project_id, env_id, app_id, current_user, db)

    hours = max(1, min(payload.hours, 24 * 30))
    expires_at = datetime.utcnow() + timedelta(hours=hours)

    link = ShareLink(
        application_id=app_id,
        project_id=project_id,
        created_by=current_user.id,
        expires_at=expires_at,
        note=payload.note,
    )
    db.add(link)
    await db.flush()
    await log_action(
        db, current_user.id, "CREATE", "share_link", app_id,
        f"token={link.token[:8]}…", detail=f"expires={expires_at.isoformat()}"
    )
    return link


@router.get(
    "/projects/{project_id}/environments/{env_id}/applications/{app_id}/share-links",
    response_model=list[ShareLinkResponse],
)
async def list_share_links(
    project_id: str,
    env_id: str,
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_app_member(project_id, env_id, app_id, current_user, db)

    result = await db.execute(
        select(ShareLink).where(
            ShareLink.application_id == app_id,
            ShareLink.project_id == project_id,
        ).order_by(ShareLink.created_at.desc())
    )
    return result.scalars().all()


@router.delete(
    "/projects/{project_id}/environments/{env_id}/applications/{app_id}/share-links/{link_id}",
    status_code=204,
)
async def revoke_share_link(
    project_id: str,
    env_id: str,
    app_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_app_member(project_id, env_id, app_id, current_user, db)

    result = await db.execute(
        select(ShareLink).where(ShareLink.id == link_id, ShareLink.application_id == app_id)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    await log_action(db, current_user.id, "DELETE", "share_link", app_id, f"token={link.token[:8]}…")
    await db.delete(link)


@router.get("/share/{token}", response_model=PublicShareView)
async def view_shared_application(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ShareLink).where(ShareLink.token == token))
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=404, detail="Link not found or has been revoked")

    if link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This share link has expired")

    link.view_count += 1

    app_result = await db.execute(select(Application).where(Application.id == link.application_id))
    app = app_result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application no longer exists")

    env_result = await db.execute(select(Environment).where(Environment.id == app.environment_id))
    env = env_result.scalar_one_or_none()

    proj_result = await db.execute(select(Project).where(Project.id == link.project_id))
    project = proj_result.scalar_one_or_none()

    secrets_result = await db.execute(
        select(Secret).where(Secret.application_id == link.application_id).order_by(Secret.key)
    )
    secrets = secrets_result.scalars().all()

    enc = get_encryption_service()
    items: list[PublicSecretItem] = []
    for s in secrets:
        try:
            plaintext = enc.decrypt(s.encrypted_value)
        except Exception:
            plaintext = "[decryption error]"
        display = _mask(plaintext) if s.is_sensitive else plaintext
        items.append(PublicSecretItem(key=s.key, value=display, is_sensitive=s.is_sensitive))

    return PublicShareView(
        app_name=app.name,
        environment_name=env.name if env else "Unknown",
        project_name=project.name if project else "Unknown",
        env_type=env.env_type.value if env and hasattr(env.env_type, "value") else "unknown",
        expires_at=link.expires_at,
        secrets=items,
        note=link.note,
    )
