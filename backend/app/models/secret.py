import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Secret(Base):
    __tablename__ = "secrets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=True)  # mask in UI if True
    environment_id: Mapped[str] = mapped_column(String, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    version: Mapped[int] = mapped_column(Integer, default=1)

    environment: Mapped["Environment"] = relationship("Environment", back_populates="secrets")  # noqa
    versions: Mapped[list["SecretVersion"]] = relationship(
        "SecretVersion", back_populates="secret", cascade="all, delete-orphan", order_by="SecretVersion.version.desc()"
    )


class SecretVersion(Base):
    __tablename__ = "secret_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    secret_id: Mapped[str] = mapped_column(String, ForeignKey("secrets.id", ondelete="CASCADE"), nullable=False)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    secret: Mapped["Secret"] = relationship("Secret", back_populates="versions")
