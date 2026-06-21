import asyncio
import io
import re
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.secret import Secret, SecretVersion
from app.models.application import Application
from app.schemas.secret import (
    SecretCreate, SecretUpdate, SecretResponse, SecretVersionResponse, BulkSecretImport
)
from app.core.dependencies import get_current_user, require_editor
from app.core.encryption import get_encryption_service
from app.models.user import User, UserRole
from app.services.audit_service import log_action

router = APIRouter(
    prefix="/projects/{project_id}/environments/{env_id}/applications/{app_id}/secrets",
    tags=["secrets"],
)

_SENSITIVE_PATTERNS = {
    'PASSWORD', 'PASSWD', 'PWD', 'SECRET', 'KEY', 'TOKEN',
    'CREDENTIAL', 'PRIVATE', 'AUTH', 'CERT', 'SSL', 'SIGNATURE',
    'ACCESS', 'API_KEY', 'APIKEY',
}


def _auto_sensitive(key: str) -> bool:
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
    show_value = plaintext if (reveal or not secret.is_sensitive) else _mask(plaintext)
    return SecretResponse(
        id=secret.id,
        key=secret.key,
        value=show_value,
        is_sensitive=secret.is_sensitive,
        application_id=secret.application_id,
        created_by=secret.created_by,
        created_at=secret.created_at,
        updated_at=secret.updated_at,
        version=secret.version,
    )


async def _get_app_or_404(app_id: str, env_id: str, db: AsyncSession) -> Application:
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.environment_id == env_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


async def _get_secret_or_404(secret_id: str, app_id: str, db: AsyncSession) -> Secret:
    result = await db.execute(
        select(Secret).where(Secret.id == secret_id, Secret.application_id == app_id)
    )
    secret = result.scalar_one_or_none()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    return secret


@router.post("", response_model=SecretResponse, status_code=201)
async def create_secret(
    project_id: str,
    env_id: str,
    app_id: str,
    payload: SecretCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_app_or_404(app_id, env_id, db)

    existing = await db.execute(
        select(Secret).where(Secret.application_id == app_id, Secret.key == payload.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Key '{payload.key}' already exists")

    enc = get_encryption_service()
    secret = Secret(
        key=payload.key,
        encrypted_value=enc.encrypt(payload.value),
        is_sensitive=payload.is_sensitive,
        application_id=app_id,
        created_by=current_user.id,
    )
    db.add(secret)
    await db.flush()
    await log_action(db, current_user.id, "CREATE", "secret", secret.id, secret.key,
                     detail=f"app={app_id}")
    return _serialize_secret(secret, current_user)


@router.get("", response_model=list[SecretResponse])
async def list_secrets(
    project_id: str,
    env_id: str,
    app_id: str,
    reveal: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_app_or_404(app_id, env_id, db)
    result = await db.execute(
        select(Secret).where(Secret.application_id == app_id).order_by(Secret.key)
    )
    secrets = result.scalars().all()
    if reveal:
        await log_action(db, current_user.id, "READ", "secret", None, None,
                         detail=f"reveal=true app={app_id}")
    return [_serialize_secret(s, current_user, reveal=reveal) for s in secrets]


@router.get("/{secret_id}", response_model=SecretResponse)
async def get_secret(
    project_id: str,
    env_id: str,
    app_id: str,
    secret_id: str,
    reveal: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_app_or_404(app_id, env_id, db)
    secret = await _get_secret_or_404(secret_id, app_id, db)
    return _serialize_secret(secret, current_user, reveal=reveal)


@router.patch("/{secret_id}", response_model=SecretResponse)
async def update_secret(
    project_id: str,
    env_id: str,
    app_id: str,
    secret_id: str,
    payload: SecretUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_app_or_404(app_id, env_id, db)
    secret = await _get_secret_or_404(secret_id, app_id, db)
    enc = get_encryption_service()

    if payload.value is not None:
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
    app_id: str,
    secret_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_app_or_404(app_id, env_id, db)
    secret = await _get_secret_or_404(secret_id, app_id, db)
    await log_action(db, current_user.id, "DELETE", "secret", secret.id, secret.key)
    await db.delete(secret)


@router.get("/{secret_id}/versions", response_model=list[SecretVersionResponse])
async def get_secret_versions(
    project_id: str,
    env_id: str,
    app_id: str,
    secret_id: str,
    reveal: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_app_or_404(app_id, env_id, db)
    secret = await _get_secret_or_404(secret_id, app_id, db)
    result = await db.execute(
        select(SecretVersion)
        .where(SecretVersion.secret_id == secret.id)
        .order_by(SecretVersion.version.desc())
    )
    versions = result.scalars().all()
    enc = get_encryption_service()
    out = []
    for v in versions:
        try:
            plaintext = enc.decrypt(v.encrypted_value)
        except Exception:
            plaintext = None
        out.append(SecretVersionResponse(
            id=v.id,
            secret_id=v.secret_id,
            version=v.version,
            value=plaintext if (reveal or not secret.is_sensitive) else None,
            changed_by=v.changed_by,
            changed_at=v.changed_at,
        ))
    return out


@router.post("/{secret_id}/versions/{version_id}/restore", response_model=SecretResponse)
async def restore_secret_version(
    project_id: str,
    env_id: str,
    app_id: str,
    secret_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_app_or_404(app_id, env_id, db)
    secret = await _get_secret_or_404(secret_id, app_id, db)

    ver_result = await db.execute(
        select(SecretVersion).where(
            SecretVersion.id == version_id, SecretVersion.secret_id == secret_id
        )
    )
    ver = ver_result.scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    # Archive the current value before overwriting (makes the restore itself reversible)
    db.add(SecretVersion(
        secret_id=secret.id,
        encrypted_value=secret.encrypted_value,
        version=secret.version,
        changed_by=current_user.id,
    ))
    secret.encrypted_value = ver.encrypted_value
    secret.version += 1

    await log_action(db, current_user.id, "RESTORE", "secret", secret.id,
                     f"{secret.key} restored to v{ver.version}")
    await db.flush()
    await db.refresh(secret)
    return _serialize_secret(secret, current_user)


@router.get("/export/dotenv", response_class=Response)
async def export_dotenv(
    project_id: str,
    env_id: str,
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app = await _get_app_or_404(app_id, env_id, db)
    result = await db.execute(
        select(Secret).where(Secret.application_id == app_id).order_by(Secret.key)
    )
    secrets = result.scalars().all()
    enc = get_encryption_service()

    lines = [f"# Generated by Multi-Cloud ENV Manager", f"# Application: {app.name}", ""]
    for s in secrets:
        try:
            value = enc.decrypt(s.encrypted_value)
        except Exception:
            value = ""
        if any(c in value for c in [' ', '"', "'", '\n', '#']):
            value = f'"{value}"'
        lines.append(f"{s.key}={value}")

    content = "\n".join(lines) + "\n"
    await log_action(db, current_user.id, "EXPORT", "application", app_id, app.name,
                     detail="dotenv export")
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename=".env.{app.name}"'}
    )


@router.post("/import/dotenv", response_model=dict)
async def import_dotenv(
    project_id: str,
    env_id: str,
    app_id: str,
    payload: BulkSecretImport,
    overwrite: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_app_or_404(app_id, env_id, db)
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
            select(Secret).where(Secret.application_id == app_id, Secret.key == key)
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
                application_id=app_id,
                created_by=current_user.id,
            )
            db.add(secret)
            created += 1

    await log_action(db, current_user.id, "IMPORT", "application", app_id,
                     detail=f"created={created} updated={updated} skipped={skipped}")
    return {"created": created, "updated": updated, "skipped": skipped}


class SSHFetchRequest(BaseModel):
    credential_id: str | None = None
    host: str | None = None
    port: int = 22
    username: str | None = None
    auth_type: str = "key"
    private_key: str | None = None
    password: str | None = None
    path: str


def _ssh_read_file(
    host: str, port: int, username: str, path: str,
    *, private_key_text: str | None = None, password: str | None = None,
) -> str:
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
    app_id: str,
    payload: SSHFetchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    app = await _get_app_or_404(app_id, env_id, db)

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

    # Persist server+path link on the application for saved-credential mode
    if payload.credential_id:
        app.ssh_credential_id = payload.credential_id
        app.remote_path = payload.path

    await log_action(db, current_user.id, "READ", "application", app_id,
                     detail=f"ssh-fetch host={host} path={payload.path}")
    return {"content": content}


@router.post("/reevaluate-sensitive", response_model=dict)
async def reevaluate_sensitive(
    project_id: str,
    env_id: str,
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    await _get_app_or_404(app_id, env_id, db)
    result = await db.execute(select(Secret).where(Secret.application_id == app_id))
    secrets = result.scalars().all()

    changed = unchanged = 0
    for secret in secrets:
        should_be = _auto_sensitive(secret.key)
        if secret.is_sensitive != should_be:
            secret.is_sensitive = should_be
            changed += 1
        else:
            unchanged += 1

    await log_action(db, current_user.id, "UPDATE", "application", app_id,
                     detail=f"reevaluate-sensitive changed={changed} unchanged={unchanged}")
    return {"changed": changed, "unchanged": unchanged}
