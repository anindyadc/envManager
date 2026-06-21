from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User, UserRole
from app.core.dependencies import get_current_user
from app.services.audit_service import log_action

router = APIRouter(prefix="/projects/{project_id}/members", tags=["members"])


class MemberAdd(BaseModel):
    email: str
    role: UserRole = UserRole.viewer


class MemberUpdate(BaseModel):
    role: UserRole


class MemberResponse(BaseModel):
    id: str
    user_id: str
    email: str
    full_name: str
    role: UserRole
    added_at: datetime

    model_config = {"from_attributes": True}


async def _require_project_admin(project_id: str, current_user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == UserRole.admin:
        return project

    member_result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
            ProjectMember.role == UserRole.admin,
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Only project admins can manage members")
    return project


@router.get("", response_model=list[MemberResponse])
async def list_members(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Any project member can view the member list
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
    )
    members = result.scalars().all()

    out = []
    for m in members:
        user_result = await db.execute(select(User).where(User.id == m.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            out.append(MemberResponse(
                id=m.id,
                user_id=m.user_id,
                email=user.email,
                full_name=user.full_name,
                role=m.role,
                added_at=m.added_at,
            ))
    return out


@router.post("", response_model=MemberResponse, status_code=201)
async def add_member(
    project_id: str,
    payload: MemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _require_project_admin(project_id, current_user, db)

    user_result = await db.execute(select(User).where(User.email == payload.email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found with email '{payload.email}'. They must register first.")

    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{payload.email} is already a member of this project")

    member = ProjectMember(
        project_id=project_id,
        user_id=user.id,
        role=payload.role,
        added_by=current_user.id,
    )
    db.add(member)
    await db.flush()
    await log_action(db, current_user.id, "CREATE", "project_member", project_id,
                     f"{user.email} → {project.name}", detail=f"role={payload.role}")

    return MemberResponse(
        id=member.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=member.role,
        added_at=member.added_at,
    )


@router.patch("/{member_id}", response_model=MemberResponse)
async def update_member_role(
    project_id: str,
    member_id: str,
    payload: MemberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project_admin(project_id, current_user, db)

    result = await db.execute(
        select(ProjectMember).where(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.role = payload.role
    user_result = await db.execute(select(User).where(User.id == member.user_id))
    user = user_result.scalar_one_or_none()
    await log_action(db, current_user.id, "UPDATE", "project_member", project_id,
                     user.email if user else member.user_id, detail=f"role={payload.role}")

    return MemberResponse(
        id=member.id, user_id=member.user_id,
        email=user.email, full_name=user.full_name,
        role=member.role, added_at=member.added_at,
    )


@router.delete("/{member_id}", status_code=204)
async def remove_member(
    project_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project_admin(project_id, current_user, db)

    result = await db.execute(
        select(ProjectMember).where(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself from the project")

    user_result = await db.execute(select(User).where(User.id == member.user_id))
    user = user_result.scalar_one_or_none()
    await log_action(db, current_user.id, "DELETE", "project_member", project_id,
                     user.email if user else member.user_id)
    await db.delete(member)
