from pydantic import BaseModel
from datetime import datetime


class SSHServerSummary(BaseModel):
    id: str
    label: str
    host: str
    port: int
    username: str

    model_config = {"from_attributes": True}


class ApplicationCreate(BaseModel):
    name: str


class ApplicationUpdate(BaseModel):
    name: str | None = None
    ssh_credential_id: str | None = None
    remote_path: str | None = None


class ApplicationResponse(BaseModel):
    id: str
    name: str
    environment_id: str
    ssh_credential_id: str | None = None
    remote_path: str | None = None
    ssh_server: SSHServerSummary | None = None
    secret_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
