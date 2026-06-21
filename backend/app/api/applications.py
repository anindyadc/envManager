from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.application import Application
from app.models.environment import Environment
from app.models.secret import Secret
from app.models.ssh_credential import SSHCredential
from app.schemas.application import ApplicationCreate, ApplicationUpdate, ApplicationResponse, SSHServerSummary
from app.core.dependencies import get_current_user, require_editor
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter(
    prefix="/projects/{project_id}/environments/{env_id}/applications",
    tags=["applications"],
)


async def _get_env_or_404(env_id: str, project_id: str, db: AsyncSession) -> Environment:
    result = await db.execute(
        select(Environment).where(Environment.id == env_id, Environment.project_id == project_id)
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


async def get_app_or_404(app_id: str, env_id: str, db: AsyncSession) -> Application:
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.environment_id == env_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


async def enrich_app(app: Application, db: AsyncSession) -> ApplicationResponse:
    await db.flush()
    await db.refresh(app)
    count = await db.execute(
        select(func.count(Secret.id)).where(Secret.application_id == app.id)
    )
    data = ApplicationResponse.model_validate(app)
    data.secret_count = count.scalar() or 0

    if app.ssh_credential_id:
        cred = await db.execute(
            select(SSHCredential).where(SSHCredential.id == app.ssh_credential_id)
        )
        c = cred.scalar_one_or_none()
        if c:
            data.ssh_server = SSHServerSummary.model_validate(c)

    return data


@router.get("", response_model=list[ApplicationResponse])
async def list_applications(
    project_id: str,
    env_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_env_or_404(env_id, project_id, db)
    result = await db.execute(
        select(Application).where(Application.environment_id == env_id).order_by(Application.created_at)
    )
    apps = result.scalars().all()
    return [await enrich_app(a, db) for a in apps]


@router.post("", response_model=ApplicationResponse, status_code=201)
async def create_application(
    project_id: str,
    env_id: str,
    payload: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_env_or_404(env_id, project_id, db)
    app = Application(name=payload.name, environment_id=env_id)
    db.add(app)
    await db.flush()
    await log_action(db, current_user.id, "CREATE", "application", app.id, f"{env_id}/{app.name}")
    return await enrich_app(app, db)


@router.get("/{app_id}", response_model=ApplicationResponse)
async def get_application(
    project_id: str,
    env_id: str,
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_env_or_404(env_id, project_id, db)
    app = await get_app_or_404(app_id, env_id, db)
    return await enrich_app(app, db)


@router.patch("/{app_id}", response_model=ApplicationResponse)
async def update_application(
    project_id: str,
    env_id: str,
    app_id: str,
    payload: ApplicationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_env_or_404(env_id, project_id, db)
    app = await get_app_or_404(app_id, env_id, db)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(app, field, val)
    await log_action(db, current_user.id, "UPDATE", "application", app.id, app.name)
    return await enrich_app(app, db)


@router.delete("/{app_id}", status_code=204)
async def delete_application(
    project_id: str,
    env_id: str,
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_env_or_404(env_id, project_id, db)
    app = await get_app_or_404(app_id, env_id, db)
    await log_action(db, current_user.id, "DELETE", "application", app.id, app.name)
    await db.delete(app)
