from pydantic import BaseModel, field_validator
from datetime import datetime


class SecretCreate(BaseModel):
    key: str
    value: str
    is_sensitive: bool = True

    @field_validator("key")
    @classmethod
    def valid_key(cls, v: str) -> str:
        import re
        v = v.strip().upper()
        if not re.match(r'^[A-Z_][A-Z0-9_]*$', v):
            raise ValueError("Key must be UPPER_SNAKE_CASE (letters, digits, underscore)")
        return v


class SecretUpdate(BaseModel):
    value: str | None = None
    is_sensitive: bool | None = None


class SecretResponse(BaseModel):
    id: str
    key: str
    value: str | None  # None when masked
    is_sensitive: bool
    environment_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    version: int

    model_config = {"from_attributes": True}


class SecretVersionResponse(BaseModel):
    id: str
    secret_id: str
    version: int
    changed_by: str
    changed_at: datetime

    model_config = {"from_attributes": True}


class BulkSecretImport(BaseModel):
    env_content: str  # Raw .env file content

    class Config:
        json_schema_extra = {
            "example": {"env_content": "DB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=secret123"}
        }
