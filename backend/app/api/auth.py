from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
import asyncio

from app.database import get_db
from app.models.user import User
from app.models.auth_token import AuthToken
from app.schemas.auth import (
    UserRegister, UserLogin, TokenResponse, UserResponse, UserUpdate,
    ForgotPasswordRequest, ResetPasswordRequest,
)
from app.core.security import hash_password, verify_password, create_access_token
from app.core.dependencies import get_current_user, require_admin
from app.services.audit_service import log_action
from app.services import email_service
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _email_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    count_result = await db.execute(select(User))
    is_first = len(count_result.scalars().all()) == 0

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role="admin" if is_first else payload.role,
        email_verified=not _email_configured(),
    )
    db.add(user)
    await db.flush()
    await log_action(db, user.id, "REGISTER", "user", user.id, user.email)

    if _email_configured():
        token_row = AuthToken(
            user_id=user.id,
            token_type="email_verify",
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=24),
        )
        db.add(token_row)
        await db.flush()
        asyncio.create_task(
            email_service.send_verification_email(user.email, user.full_name, token_row.token)
        )

    return user


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email, User.is_active == True))  # noqa
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)
    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    ip = request.client.host if request.client else None
    await log_action(db, user.id, "LOGIN", "user", user.id, user.email, ip_address=ip)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(user, field, val)

    await log_action(db, current_user.id, "UPDATE", "user", user.id, user.email)
    return user


# ── Email verification ───────────────────────────────────────────────────────

@router.get("/verify-email/{token}")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuthToken).where(AuthToken.token == token, AuthToken.token_type == "email_verify")
    )
    auth_token = result.scalar_one_or_none()
    if not auth_token:
        raise HTTPException(status_code=404, detail="Invalid verification link")
    if auth_token.used_at:
        raise HTTPException(status_code=400, detail="This link has already been used")
    if auth_token.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="Verification link has expired")

    user_result = await db.execute(select(User).where(User.id == auth_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.email_verified = True
    auth_token.used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return {"message": "Email verified successfully"}


@router.post("/verify-email/resend")
async def resend_verification(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.email_verified:
        raise HTTPException(status_code=400, detail="Email is already verified")
    if not _email_configured():
        raise HTTPException(status_code=503, detail="Email service not configured")

    token_row = AuthToken(
        user_id=current_user.id,
        token_type="email_verify",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=24),
    )
    db.add(token_row)
    await db.flush()
    asyncio.create_task(
        email_service.send_verification_email(
            current_user.email, current_user.full_name, token_row.token
        )
    )
    return {"message": "Verification email sent"}


# ── Password reset ───────────────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    if not _email_configured():
        raise HTTPException(status_code=503, detail="Email service not configured")

    result = await db.execute(select(User).where(User.email == payload.email, User.is_active == True))  # noqa
    user = result.scalar_one_or_none()
    # Always return the same response to prevent email enumeration
    if user:
        token_row = AuthToken(
            user_id=user.id,
            token_type="password_reset",
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
        )
        db.add(token_row)
        await db.flush()
        asyncio.create_task(
            email_service.send_password_reset_email(user.email, user.full_name, token_row.token)
        )

    return {"message": "If that email is registered, a reset link has been sent"}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuthToken).where(
            AuthToken.token == payload.token,
            AuthToken.token_type == "password_reset",
        )
    )
    auth_token = result.scalar_one_or_none()
    if not auth_token:
        raise HTTPException(status_code=404, detail="Invalid or expired reset link")
    if auth_token.used_at:
        raise HTTPException(status_code=400, detail="This reset link has already been used")
    if auth_token.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="Reset link has expired")

    user_result = await db.execute(select(User).where(User.id == auth_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    auth_token.used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await log_action(db, user.id, "UPDATE", "user", user.id, "password_reset")
    return {"message": "Password reset successfully"}
