import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.project import Project
from app.models.environment import Environment
from app.models.project_member import ProjectMember
from app.models.user import User, UserRole
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.core.dependencies import get_current_user, require_editor
from app.services.audit_service import log_action

router = APIRouter(prefix="/projects", tags=["projects"])


def _slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


async def _get_project_or_404(project_id: str, db: AsyncSession, user: User) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not await _has_access(project_id, user, db):
        raise HTTPException(status_code=403, detail="You are not a member of this project")
    return project


async def _has_access(project_id: str, user: User, db: AsyncSession) -> bool:
    """Global admins always have access; others must be a project member."""
    if user.role == UserRole.admin:
        return True
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _get_member_role(project_id: str, user: User, db: AsyncSession) -> UserRole | None:
    if user.role == UserRole.admin:
        return UserRole.admin
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    return member.role if member else None


async def _enrich(project: Project, db: AsyncSession) -> ProjectResponse:
    count_result = await db.execute(
        select(func.count(Environment.id)).where(Environment.project_id == project.id)
    )
    member_count = await db.execute(
        select(func.count(ProjectMember.id)).where(ProjectMember.project_id == project.id)
    )
    data = ProjectResponse.model_validate(project)
    data.environment_count = count_result.scalar() or 0
    data.member_count = member_count.scalar() or 0
    return data


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    base_slug = _slugify(payload.name)
    slug = base_slug
    i = 1
    while True:
        existing = await db.execute(select(Project).where(Project.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}-{i}"
        i += 1

    project = Project(**payload.model_dump(), slug=slug, owner_id=current_user.id)
    db.add(project)
    await db.flush()

    # Owner is automatically added as admin member
    db.add(ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role=UserRole.admin,
        added_by=current_user.id,
    ))

    await log_action(db, current_user.id, "CREATE", "project", project.id, project.name)
    return await _enrich(project, db)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.admin:
        result = await db.execute(select(Project).order_by(Project.created_at.desc()))
        projects = result.scalars().all()
    else:
        result = await db.execute(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == current_user.id)
            .order_by(Project.created_at.desc())
        )
        projects = result.scalars().all()
    return [await _enrich(p, db) for p in projects]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404(project_id, db, current_user)
    return await _enrich(project, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    project = await _get_project_or_404(project_id, db, current_user)
    role = await _get_member_role(project_id, current_user, db)
    if role not in (UserRole.admin, UserRole.editor):
        raise HTTPException(status_code=403, detail="Requires editor or admin role on this project")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(project, field, val)
    await log_action(db, current_user.id, "UPDATE", "project", project.id, project.name)
    return await _enrich(project, db)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    project = await _get_project_or_404(project_id, db, current_user)
    role = await _get_member_role(project_id, current_user, db)
    if role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Only project admins can delete a project")
    await log_action(db, current_user.id, "DELETE", "project", project.id, project.name)
    await db.delete(project)
