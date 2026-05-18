"""
Per-gym WhatsApp configuration.

Each gym owner can configure their own AiSensy account credentials.
If not configured, the system falls back to log-only mode (manual notifications).

Security:
- API key is stored encrypted-at-rest (rely on DB-level encryption or platform secrets)
- Only OWNER role can read/update WhatsApp config
- API key is never returned in full (masked in responses)
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class WhatsAppConfig(BaseModel):
    __tablename__ = "whatsapp_configs"

    # One config per gym (enforced by unique constraint)
    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # AiSensy API key from the gym owner's AiSensy dashboard
    api_key: Mapped[str] = mapped_column(Text, nullable=False)

    # Whether the owner has explicitly enabled automated sending
    # (separate from subscription feature gate — owner can disable even if plan allows)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Optional: custom campaign name prefix for this gym
    # Allows gym owners to organize campaigns in their AiSensy dashboard
    campaign_prefix: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Provider base URL (default AiSensy, but allows override for testing)
    provider_url: Mapped[str] = mapped_column(
        String(500),
        default="https://backend.aisensy.com",
        server_default="https://backend.aisensy.com",
        nullable=False,
    )

    # Relationship
    gym = relationship("Gym", lazy="raise")
