import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    environment_id: Mapped[str] = mapped_column(String, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    ssh_credential_id: Mapped[str | None] = mapped_column(String, ForeignKey("ssh_credentials.id", ondelete="SET NULL"), nullable=True)
    remote_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    environment: Mapped["Environment"] = relationship("Environment", back_populates="applications")  # noqa
    secrets: Mapped[list["Secret"]] = relationship(  # noqa
        "Secret", back_populates="application", cascade="all, delete-orphan"
    )
    share_links: Mapped[list["ShareLink"]] = relationship(  # noqa
        "ShareLink", back_populates="application", cascade="all, delete-orphan"
    )
