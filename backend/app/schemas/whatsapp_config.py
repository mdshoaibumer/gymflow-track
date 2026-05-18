"""Schemas for WhatsApp configuration endpoints."""

import re
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.sanitize import strip_html_tags

# Only allow alphanumeric, underscore, hyphen for campaign prefix
_CAMPAIGN_PREFIX_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")


class WhatsAppConfigRequest(BaseModel):
    """Request to create or update WhatsApp (AiSensy) configuration."""
    api_key: str = Field(..., min_length=10, max_length=500, description="AiSensy API key from dashboard")
    is_enabled: bool = Field(True, description="Enable/disable automated sending")
    campaign_prefix: str | None = Field(None, max_length=100, description="Optional campaign name prefix")

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) < 10:
            raise ValueError("API key must be at least 10 characters")
        return v

    @field_validator("campaign_prefix")
    @classmethod
    def validate_campaign_prefix(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = strip_html_tags(v.strip())
        if not v:
            return None
        if not _CAMPAIGN_PREFIX_RE.match(v):
            raise ValueError("Campaign prefix can only contain letters, numbers, underscore, and hyphen")
        return v


class WhatsAppConfigResponse(BaseModel):
    """Response with WhatsApp configuration (API key masked)."""
    id: UUID
    gym_id: UUID
    api_key_masked: str  # Only show last 4 chars
    is_enabled: bool
    campaign_prefix: str | None
    provider_url: str

    model_config = {"from_attributes": True}


class WhatsAppConfigStatus(BaseModel):
    """Quick status check for frontend to show WhatsApp automation state."""
    is_configured: bool  # API key exists in DB
    is_enabled: bool  # Owner has enabled it
    plan_allows_automation: bool  # Subscription plan includes automated WhatsApp
    is_active: bool  # All 3 conditions met → messages will be sent via AiSensy


class WhatsAppTestResponse(BaseModel):
    """Response from sending a test message."""
    success: bool
    message: str
    provider_message_id: str | None = None
