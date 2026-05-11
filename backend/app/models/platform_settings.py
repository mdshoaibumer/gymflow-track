"""
Platform-wide settings for the SaaS platform.

Stores global configuration that SUPER_ADMIN can manage:
- Trial duration defaults
- Maintenance mode
- Announcements
- Global limits
- Feature toggles

Design: Single-row table (id=1 always). Updated, never deleted.
"""

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class PlatformSettings(BaseModel):
    __tablename__ = "platform_settings"

    # Trial & billing defaults
    default_trial_days: Mapped[int] = mapped_column(
        Integer, default=14, nullable=False
    )
    grace_period_days: Mapped[int] = mapped_column(
        Integer, default=7, nullable=False
    )
    max_payment_retries: Mapped[int] = mapped_column(
        Integer, default=3, nullable=False
    )

    # Maintenance mode
    maintenance_mode: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    maintenance_message: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    # Platform announcements (shown as banner to all gym owners)
    announcement_active: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    announcement_message: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    announcement_type: Mapped[str] = mapped_column(
        String(20), default="info", nullable=False
    )  # info, warning, success

    # Global limits
    max_gyms: Mapped[int] = mapped_column(
        Integer, default=10000, nullable=False
    )

    # Feature toggles (platform-wide kill switches)
    feature_flags: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )
