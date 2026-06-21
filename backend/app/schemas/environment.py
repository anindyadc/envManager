from pydantic import BaseModel
from datetime import datetime
from app.models.environment import EnvironmentType


class EnvironmentCreate(BaseModel):
    name: str
    env_type: EnvironmentType = EnvironmentType.development


class EnvironmentUpdate(BaseModel):
    name: str | None = None
    env_type: EnvironmentType | None = None
    ssh_credential_id: str | None = None
    remote_path: str | None = None


class EnvironmentResponse(BaseModel):
    id: str
    name: str
    env_type: EnvironmentType
    project_id: str
    ssh_credential_id: str | None = None
    remote_path: str | None = None
    created_at: datetime
    updated_at: datetime
    secret_count: int = 0

    model_config = {"from_attributes": True}
