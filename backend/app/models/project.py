import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Enum, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CloudProvider(str, enum.Enum):
    aws = "aws"
    azure = "azure"
    gcp = "gcp"
    on_premise = "on_premise"
    multi_cloud = "multi_cloud"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cloud_provider: Mapped[CloudProvider] = mapped_column(Enum(CloudProvider), default=CloudProvider.aws)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    server_host: Mapped[str | None] = mapped_column(String, nullable=True)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    owner: Mapped["User"] = relationship("User", back_populates="projects")  # noqa
    environments: Mapped[list["Environment"]] = relationship(  # noqa
        "Environment", back_populates="project", cascade="all, delete-orphan"
    )
    members: Mapped[list["ProjectMember"]] = relationship(  # noqa
        "ProjectMember", back_populates="project", cascade="all, delete-orphan",
        foreign_keys="ProjectMember.project_id"
    )
