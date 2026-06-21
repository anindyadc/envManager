from pydantic_settings import BaseSettings
from functools import lru_cache
import secrets


class Settings(BaseSettings):
    app_name: str = "Multi-Cloud ENV Manager"
    app_version: str = "1.0.0"

    # Security
    secret_key: str = secrets.token_urlsafe(32)
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8 hours

    # Encryption key for secrets (32-byte URL-safe base64)
    # In production: set ENCRYPTION_KEY env var from KMS/Key Vault
    encryption_key: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./envmanager.db"

    # CORS
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Email / SMTP  (leave smtp_host blank to disable email features)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_from_name: str = "ENV Manager"
    smtp_tls: bool = False       # True for port 465 (implicit TLS)
    smtp_starttls: bool = True   # True for port 587 (STARTTLS)

    # Public URL of the app — used to build links in emails
    app_url: str = "http://localhost:8080"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
