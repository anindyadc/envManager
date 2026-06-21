import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Enum, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EnvironmentType(str, enum.Enum):
    development = "development"
    staging = "staging"
    production = "production"
    testing = "testing"
    custom = "custom"


class Environment(Base):
    __tablename__ = "environments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    env_type: Mapped[EnvironmentType] = mapped_column(Enum(EnvironmentType), default=EnvironmentType.development)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    # optional link to a saved SSH server + path for this environment
    ssh_credential_id: Mapped[str | None] = mapped_column(String, ForeignKey("ssh_credentials.id", ondelete="SET NULL"), nullable=True)
    remote_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="environments")  # noqa
    secrets: Mapped[list["Secret"]] = relationship(  # noqa
        "Secret", back_populates="environment", cascade="all, delete-orphan"
    )
