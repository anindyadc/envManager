from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.environment import Environment
from app.models.project import Project
from app.models.secret import Secret
from app.schemas.environment import EnvironmentCreate, EnvironmentUpdate, EnvironmentResponse
from app.core.dependencies import get_current_user, require_editor
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter(prefix="/projects/{project_id}/environments", tags=["environments"])


async def _get_env_or_404(env_id: str, project_id: str, db: AsyncSession) -> Environment:
    result = await db.execute(
        select(Environment).where(Environment.id == env_id, Environment.project_id == project_id)
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


async def _enrich(env: Environment, db: AsyncSession) -> EnvironmentResponse:
    count_result = await db.execute(
        select(func.count(Secret.id)).where(Secret.environment_id == env.id)
    )
    secret_count = count_result.scalar() or 0
    data = EnvironmentResponse.model_validate(env)
    data.secret_count = secret_count
    return data


@router.post("", response_model=EnvironmentResponse, status_code=201)
async def create_environment(
    project_id: str,
    payload: EnvironmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    env = Environment(**payload.model_dump(), project_id=project_id)
    db.add(env)
    await db.flush()
    await log_action(db, current_user.id, "CREATE", "environment", env.id, f"{project_id}/{env.name}")
    return await _enrich(env, db)


@router.get("", response_model=list[EnvironmentResponse])
async def list_environments(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Environment).where(Environment.project_id == project_id).order_by(Environment.env_type)
    )
    envs = result.scalars().all()
    return [await _enrich(e, db) for e in envs]


@router.get("/{env_id}", response_model=EnvironmentResponse)
async def get_environment(
    project_id: str,
    env_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    env = await _get_env_or_404(env_id, project_id, db)
    return await _enrich(env, db)


@router.patch("/{env_id}", response_model=EnvironmentResponse)
async def update_environment(
    project_id: str,
    env_id: str,
    payload: EnvironmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    env = await _get_env_or_404(env_id, project_id, db)
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(env, field, val)
    await log_action(db, current_user.id, "UPDATE", "environment", env.id, env.name)
    return await _enrich(env, db)


@router.delete("/{env_id}", status_code=204)
async def delete_environment(
    project_id: str,
    env_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    env = await _get_env_or_404(env_id, project_id, db)
    await log_action(db, current_user.id, "DELETE", "environment", env.id, env.name)
    await db.delete(env)
