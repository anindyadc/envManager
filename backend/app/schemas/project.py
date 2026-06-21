from pydantic import BaseModel, field_validator
from datetime import datetime
from app.models.project import CloudProvider
import re


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    cloud_provider: CloudProvider = CloudProvider.aws
    region: str | None = None
    server_host: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    cloud_provider: CloudProvider | None = None
    region: str | None = None
    server_host: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    cloud_provider: CloudProvider
    region: str | None
    server_host: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
    environment_count: int = 0
    member_count: int = 0

    model_config = {"from_attributes": True}
