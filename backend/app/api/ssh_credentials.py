from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from app.core.dependencies import get_current_user
from app.core.encryption import get_encryption_service
from app.database import get_db
from app.models.ssh_credential import SSHCredential
from app.models.user import User, UserRole
from app.services.audit_service import log_action

router = APIRouter(prefix="/ssh-credentials", tags=["ssh-credentials"])


# ── schemas ───────────────────────────────────────────────────────────────────

class SSHCredentialCreate(BaseModel):
    label: str
    host: str
    port: int = 22
    username: str
    auth_type: Literal["key", "password"] = "key"
    private_key: str | None = None
    password: str | None = None


class SSHCredentialUpdate(BaseModel):
    label: str | None = None
    host: str | None = None
    port: int | None = None
    username: str | None = None
    auth_type: Literal["key", "password"] | None = None
    private_key: str | None = None
    password: str | None = None


class SSHCredentialResponse(BaseModel):
    id: str
    label: str
    host: str
    port: int
    username: str
    auth_type: str
    has_credential: bool

    model_config = {"from_attributes": True}


# ── helpers ───────────────────────────────────────────────────────────────────

def _to_response(cred: SSHCredential) -> SSHCredentialResponse:
    has_credential = bool(
        cred.encrypted_private_key if cred.auth_type == "key" else cred.encrypted_password
    )
    return SSHCredentialResponse(
        id=cred.id,
        label=cred.label,
        host=cred.host,
        port=cred.port,
        username=cred.username,
        auth_type=cred.auth_type,
        has_credential=has_credential,
    )


def _validate_create(payload: SSHCredentialCreate) -> None:
    if payload.auth_type == "key" and not (payload.private_key or "").strip():
        raise HTTPException(status_code=400, detail="private_key is required for key auth")
    if payload.auth_type == "password" and not (payload.password or "").strip():
        raise HTTPException(status_code=400, detail="password is required for password auth")


async def _get_own_credential(cred_id: str, user: User, db: AsyncSession) -> SSHCredential:
    result = await db.execute(select(SSHCredential).where(SSHCredential.id == cred_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="SSH credential not found")
    if cred.user_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Access denied")
    return cred


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SSHCredentialResponse])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SSHCredential).where(SSHCredential.user_id == current_user.id)
        .order_by(SSHCredential.label)
    )
    return [_to_response(c) for c in result.scalars().all()]


@router.post("", response_model=SSHCredentialResponse, status_code=201)
async def create_credential(
    payload: SSHCredentialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_create(payload)
    enc = get_encryption_service()
    cred = SSHCredential(
        user_id=current_user.id,
        label=payload.label,
        host=payload.host,
        port=payload.port,
        username=payload.username,
        auth_type=payload.auth_type,
        encrypted_private_key=enc.encrypt(payload.private_key.strip()) if payload.private_key else None,
        encrypted_password=enc.encrypt(payload.password) if payload.password else None,
    )
    db.add(cred)
    await db.flush()
    await log_action(db, current_user.id, "CREATE", "ssh_credential", cred.id, cred.label,
                     detail=f"host={cred.host} auth={cred.auth_type}")
    return _to_response(cred)


@router.patch("/{cred_id}", response_model=SSHCredentialResponse)
async def update_credential(
    cred_id: str,
    payload: SSHCredentialUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cred = await _get_own_credential(cred_id, current_user, db)
    enc = get_encryption_service()

    if payload.label is not None:
        cred.label = payload.label
    if payload.host is not None:
        cred.host = payload.host
    if payload.port is not None:
        cred.port = payload.port
    if payload.username is not None:
        cred.username = payload.username
    if payload.auth_type is not None:
        cred.auth_type = payload.auth_type
    if payload.private_key is not None and payload.private_key.strip():
        cred.encrypted_private_key = enc.encrypt(payload.private_key.strip())
        cred.encrypted_password = None
    if payload.password is not None and payload.password:
        cred.encrypted_password = enc.encrypt(payload.password)
        cred.encrypted_private_key = None

    await log_action(db, current_user.id, "UPDATE", "ssh_credential", cred.id, cred.label)
    return _to_response(cred)


@router.delete("/{cred_id}", status_code=204)
async def delete_credential(
    cred_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cred = await _get_own_credential(cred_id, current_user, db)
    await log_action(db, current_user.id, "DELETE", "ssh_credential", cred.id, cred.label)
    await db.delete(cred)
