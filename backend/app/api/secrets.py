import asyncio
import io
import re
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.secret import Secret, SecretVersion
from app.models.environment import Environment
from app.schemas.secret import (
    SecretCreate, SecretUpdate, SecretResponse, SecretVersionResponse, BulkSecretImport
)
from app.core.dependencies import get_current_user, require_editor
from app.core.encryption import get_encryption_service
from app.models.user import User, UserRole
from app.services.audit_service import log_action

router = APIRouter(prefix="/projects/{project_id}/environments/{env_id}/secrets", tags=["secrets"])

# Keys containing these words are auto-marked sensitive on import
_SENSITIVE_PATTERNS = {
    'PASSWORD', 'PASSWD', 'PWD', 'SECRET', 'KEY', 'TOKEN',
    'CREDENTIAL', 'PRIVATE', 'AUTH', 'CERT', 'SSL', 'SIGNATURE',
    'ACCESS', 'API_KEY', 'APIKEY',
}


def _auto_sensitive(key: str) -> bool:
    """Return True if the key name suggests it holds a sensitive value."""
    key_upper = key.upper()
    return any(pattern in key_upper for pattern in _SENSITIVE_PATTERNS)


def _mask(value: str) -> str:
    if len(value) <= 4:
        return "****"
    return value[:2] + "****" + value[-2:]


def _serialize_secret(secret: Secret, user: User, reveal: bool = False) -> SecretResponse:
    enc = get_encryption_service()
    try:
        plaintext = enc.decrypt(secret.encrypted_value)
    except Exception:
        plaintext = "[decryption error]"

    # Sensitive values are always masked unless the caller explicitly requests reveal
    show_value = plaintext if (reveal or not secret.is_sensitive) else _mask(plaintext)
    return SecretResponse(
        id=secret.id,
        key=secret.key,
        value=show_value,
        is_sensitive=secret.is_sensitive,
        environment_id=secret.environment_id,
        created_by=secret.created_by,
        created_at=secret.created_at,
        updated_at=secret.updated_at,
        version=secret.version,
    )


async def _get_env_or_404(env_id: str, project_id: str, db: AsyncSession) -> Environment:
    result = await db.execute(
        select(Environment).where(Environment.id == env_id, Environment.project_id == project_id)
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


async def _get_secret_or_404(secret_id: str, env_id: str, db: AsyncSession) -> Secret:
    result = await db.execute(
        select(Secret).where(Secret.id == secret_id, Secret.environment_id == env_id)
    )
    secret = result.scalar_one_or_none()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    return secret


@router.post("", response_model=SecretResponse, status_code=201)
async def create_secret(
    project_id: str,
    env_id: str,
    payload: SecretCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_env_or_404(env_id, project_id, db)

    existing = await db.execute(
        select(Secret).where(Secret.environment_id == env_id, Secret.key == payload.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Key '{payload.key}' already exists in this environment")

    enc = get_encryption_service()
    secret = Secret(
        key=payload.key,
        encrypted_value=enc.encrypt(payload.value),
        is_sensitive=payload.is_sensitive,
        environment_id=env_id,
        created_by=current_user.id,
    )
    db.add(secret)
    await db.flush()
    await log_action(db, current_user.id, "CREATE", "secret", secret.id, secret.key,
                     detail=f"env={env_id}")
    return _serialize_secret(secret, current_user)


@router.get("", response_model=list[SecretResponse])
async def list_secrets(
    project_id: str,
    env_id: str,
    reveal: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_env_or_404(env_id, project_id, db)
    result = await db.execute(
        select(Secret).where(Secret.environment_id == env_id).order_by(Secret.key)
    )
    secrets = result.scalars().all()
    if reveal:
        await log_action(db, current_user.id, "READ", "secret", None, None,
                         detail=f"reveal=true env={env_id}")
    return [_serialize_secret(s, current_user, reveal=reveal) for s in secrets]


@router.get("/{secret_id}", response_model=SecretResponse)
async def get_secret(
    project_id: str,
    env_id: str,
    secret_id: str,
    reveal: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_env_or_404(env_id, project_id, db)
    secret = await _get_secret_or_404(secret_id, env_id, db)
    return _serialize_secret(secret, current_user, reveal=reveal)


@router.patch("/{secret_id}", response_model=SecretResponse)
async def update_secret(
    project_id: str,
    env_id: str,
    secret_id: str,
    payload: SecretUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_env_or_404(env_id, project_id, db)
    secret = await _get_secret_or_404(secret_id, env_id, db)
    enc = get_encryption_service()

    if payload.value is not None:
        # Archive current version before updating
        version_entry = SecretVersion(
            secret_id=secret.id,
            encrypted_value=secret.encrypted_value,
            version=secret.version,
            changed_by=current_user.id,
        )
        db.add(version_entry)
        secret.encrypted_value = enc.encrypt(payload.value)
        secret.version += 1

    if payload.is_sensitive is not None:
        secret.is_sensitive = payload.is_sensitive

    await log_action(db, current_user.id, "UPDATE", "secret", secret.id, secret.key)
    return _serialize_secret(secret, current_user)


@router.delete("/{secret_id}", status_code=204)
async def delete_secret(
    project_id: str,
    env_id: str,
    secret_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_env_or_404(env_id, project_id, db)
    secret = await _get_secret_or_404(secret_id, env_id, db)
    await log_action(db, current_user.id, "DELETE", "secret", secret.id, secret.key)
    await db.delete(secret)


@router.get("/{secret_id}/versions", response_model=list[SecretVersionResponse])
async def get_secret_versions(
    project_id: str,
    env_id: str,
    secret_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_env_or_404(env_id, project_id, db)
    secret = await _get_secret_or_404(secret_id, env_id, db)
    result = await db.execute(
        select(SecretVersion)
        .where(SecretVersion.secret_id == secret.id)
        .order_by(SecretVersion.version.desc())
    )
    return result.scalars().all()


@router.get("/export/dotenv", response_class=Response)
async def export_dotenv(
    project_id: str,
    env_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all secrets for this environment as a .env file (plain text, handle with care)."""
    env = await _get_env_or_404(env_id, project_id, db)
    result = await db.execute(
        select(Secret).where(Secret.environment_id == env_id).order_by(Secret.key)
    )
    secrets = result.scalars().all()
    enc = get_encryption_service()

    lines = [f"# Generated by Multi-Cloud ENV Manager", f"# Environment: {env.name}", ""]
    for s in secrets:
        try:
            value = enc.decrypt(s.encrypted_value)
        except Exception:
            value = ""
        # Quote values that contain spaces or special chars
        if any(c in value for c in [' ', '"', "'", '\n', '#']):
            value = f'"{value}"'
        lines.append(f"{s.key}={value}")

    content = "\n".join(lines) + "\n"
    await log_action(db, current_user.id, "EXPORT", "environment", env_id, env.name,
                     detail="dotenv export")
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename=".env.{env.name}"'}
    )


@router.post("/import/dotenv", response_model=dict)
async def import_dotenv(
    project_id: str,
    env_id: str,
    payload: BulkSecretImport,
    overwrite: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    """Import secrets from .env file content. Skips comments and blank lines."""
    await _get_env_or_404(env_id, project_id, db)
    enc = get_encryption_service()

    created = updated = skipped = 0
    for line in payload.env_content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().upper()
        value = value.strip().strip('"').strip("'")

        if not re.match(r'^[A-Z_][A-Z0-9_]*$', key):
            skipped += 1
            continue

        sensitive = _auto_sensitive(key)

        existing_result = await db.execute(
            select(Secret).where(Secret.environment_id == env_id, Secret.key == key)
        )
        existing = existing_result.scalar_one_or_none()

        if existing:
            if overwrite:
                version_entry = SecretVersion(
                    secret_id=existing.id,
                    encrypted_value=existing.encrypted_value,
                    version=existing.version,
                    changed_by=current_user.id,
                )
                db.add(version_entry)
                existing.encrypted_value = enc.encrypt(value)
                existing.is_sensitive = sensitive
                existing.version += 1
                updated += 1
            else:
                skipped += 1
        else:
            secret = Secret(
                key=key,
                encrypted_value=enc.encrypt(value),
                is_sensitive=sensitive,
                environment_id=env_id,
                created_by=current_user.id,
            )
            db.add(secret)
            created += 1

    await log_action(db, current_user.id, "IMPORT", "environment", env_id,
                     detail=f"created={created} updated={updated} skipped={skipped}")
    return {"created": created, "updated": updated, "skipped": skipped}


class SSHFetchRequest(BaseModel):
    # Either credential_id (saved server) OR inline connection fields must be provided
    credential_id: str | None = None
    host: str | None = None
    port: int = 22
    username: str | None = None
    auth_type: str = "key"        # "key" or "password"
    private_key: str | None = None
    password: str | None = None
    path: str


def _ssh_read_file(
    host: str, port: int, username: str, path: str,
    *, private_key_text: str | None = None, password: str | None = None,
) -> str:
    """Blocking SSH/SFTP read — runs inside asyncio.to_thread."""
    try:
        import paramiko
    except ImportError:
        raise RuntimeError("paramiko is not installed")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        if private_key_text:
            pkey = paramiko.PKey.from_private_key(io.StringIO(private_key_text.strip()))
            client.connect(host, port=port, username=username, pkey=pkey, timeout=10,
                           allow_agent=False, look_for_keys=False)
        else:
            client.connect(host, port=port, username=username, password=password, timeout=10,
                           allow_agent=False, look_for_keys=False)
        sftp = client.open_sftp()
        try:
            with sftp.open(path) as fh:
                return fh.read().decode("utf-8")
        finally:
            sftp.close()
    finally:
        client.close()


@router.post("/fetch/ssh", response_model=dict)
async def fetch_from_ssh(
    project_id: str,
    env_id: str,
    payload: SSHFetchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    """Fetch raw .env file content from a remote server over SSH. Credentials are never stored."""
    await _get_env_or_404(env_id, project_id, db)

    if ".." in payload.path:
        raise HTTPException(status_code=400, detail="Path must not contain '..'")

    private_key: str | None = None
    password: str | None = None

    if payload.credential_id:
        from app.models.ssh_credential import SSHCredential
        cred_result = await db.execute(
            select(SSHCredential).where(
                SSHCredential.id == payload.credential_id,
                SSHCredential.user_id == current_user.id,
            )
        )
        cred = cred_result.scalar_one_or_none()
        if not cred:
            raise HTTPException(status_code=404, detail="SSH credential not found")
        enc2 = get_encryption_service()
        host, port, username = cred.host, cred.port, cred.username
        if cred.auth_type == "password":
            password = enc2.decrypt(cred.encrypted_password)
        else:
            private_key = enc2.decrypt(cred.encrypted_private_key)
    else:
        if not payload.host or not payload.username:
            raise HTTPException(
                status_code=400,
                detail="Provide either credential_id or host + username",
            )
        host, port, username = payload.host, payload.port, payload.username
        if payload.auth_type == "password":
            if not payload.password:
                raise HTTPException(status_code=400, detail="password is required for password auth")
            password = payload.password
        else:
            if not payload.private_key:
                raise HTTPException(status_code=400, detail="private_key is required for key auth")
            private_key = payload.private_key

    try:
        content = await asyncio.wait_for(
            asyncio.to_thread(
                _ssh_read_file, host, port, username, payload.path,
                private_key_text=private_key, password=password,
            ),
            timeout=20,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="SSH connection timed out")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SSH error: {exc}")

    await log_action(db, current_user.id, "READ", "environment", env_id,
                     detail=f"ssh-fetch host={host} path={payload.path}")
    return {"content": content}


@router.post("/reevaluate-sensitive", response_model=dict)
async def reevaluate_sensitive(
    project_id: str,
    env_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    """Re-evaluate the sensitive flag for all secrets based on key name patterns."""
    await _get_env_or_404(env_id, project_id, db)
    result = await db.execute(select(Secret).where(Secret.environment_id == env_id))
    secrets = result.scalars().all()

    changed = unchanged = 0
    for secret in secrets:
        should_be = _auto_sensitive(secret.key)
        if secret.is_sensitive != should_be:
            secret.is_sensitive = should_be
            changed += 1
        else:
            unchanged += 1

    await log_action(db, current_user.id, "UPDATE", "environment", env_id,
                     detail=f"reevaluate-sensitive changed={changed} unchanged={unchanged}")
    return {"changed": changed, "unchanged": unchanged}
