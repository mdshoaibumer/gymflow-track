"""
WhatsApp configuration endpoints.

Allows gym owners to:
1. Configure their AiSensy API key
2. Enable/disable automated WhatsApp sending
3. Test the connection with a test message
4. Check automation status

Only OWNER role can manage WhatsApp configuration.
If not configured, the system uses log-only mode (manual notifications).
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, require_owner
from app.core.exceptions import NotFoundError, ValidationError
from app.models.subscription import GymSubscription, SubscriptionPlan
from app.models.whatsapp_config import WhatsAppConfig
from app.schemas.whatsapp_config import (
    WhatsAppConfigRequest,
    WhatsAppConfigResponse,
    WhatsAppConfigStatus,
    WhatsAppTestResponse,
)
from app.services.whatsapp_provider import AiSensyProvider, WhatsAppMessage

logger = logging.getLogger("gymflow.whatsapp_config")

router = APIRouter()


def _mask_api_key(api_key: str) -> str:
    """Mask API key for display — show only last 4 characters."""
    if len(api_key) <= 4:
        return "****"
    return "*" * (len(api_key) - 4) + api_key[-4:]


def _to_response(config: WhatsAppConfig) -> WhatsAppConfigResponse:
    """Convert model to response with masked API key."""
    return WhatsAppConfigResponse(
        id=config.id,
        gym_id=config.gym_id,
        api_key_masked=_mask_api_key(config.api_key),
        is_enabled=config.is_enabled,
        campaign_prefix=config.campaign_prefix,
        provider_url=config.provider_url,
    )


async def _get_plan_allows_automation(db: AsyncSession, gym_id: UUID) -> bool:
    """Check if the gym's current subscription plan allows automated WhatsApp."""
    result = await db.execute(
        select(SubscriptionPlan.automated_whatsapp_enabled)
        .join(GymSubscription, GymSubscription.plan_id == SubscriptionPlan.id)
        .where(GymSubscription.gym_id == gym_id)
    )
    value = result.scalar_one_or_none()
    return bool(value)


@router.get("", response_model=WhatsAppConfigResponse)
async def get_whatsapp_config(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get the current WhatsApp configuration. OWNER only."""
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.gym_id == current_user.gym_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError(
            "WhatsApp not configured. Add your AiSensy API key to enable automated messages."
        )
    return _to_response(config)


@router.get("/status", response_model=WhatsAppConfigStatus)
async def get_whatsapp_status(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Get WhatsApp automation status.
    Shows whether automation is fully active or what's missing.
    OWNER only.
    """
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.gym_id == current_user.gym_id)
    )
    config = result.scalar_one_or_none()

    is_configured = config is not None
    is_enabled = config.is_enabled if config else False
    plan_allows = await _get_plan_allows_automation(db, current_user.gym_id)

    return WhatsAppConfigStatus(
        is_configured=is_configured,
        is_enabled=is_enabled,
        plan_allows_automation=plan_allows,
        is_active=is_configured and is_enabled and plan_allows,
    )


@router.post("", response_model=WhatsAppConfigResponse)
async def configure_whatsapp(
    data: WhatsAppConfigRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Create or update WhatsApp configuration. OWNER only.

    Steps for gym owner:
    1. Create free AiSensy account at https://aisensy.com
    2. Get API key from AiSensy Dashboard → Settings → API Keys
    3. Create WhatsApp message templates in AiSensy for each notification type
    4. Configure the API key here

    If `automated_whatsapp_enabled` is not on the gym's plan,
    messages will still be logged but not sent until the plan is upgraded.
    """
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.gym_id == current_user.gym_id)
    )
    config = result.scalar_one_or_none()

    if config:
        # Update existing
        config.api_key = data.api_key
        config.is_enabled = data.is_enabled
        config.campaign_prefix = data.campaign_prefix
        logger.info(f"WhatsApp config updated for gym {current_user.gym_id}")
    else:
        # Create new
        config = WhatsAppConfig(
            gym_id=current_user.gym_id,
            api_key=data.api_key,
            is_enabled=data.is_enabled,
            campaign_prefix=data.campaign_prefix,
        )
        db.add(config)
        logger.info(f"WhatsApp config created for gym {current_user.gym_id}")

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Race condition: another request created the config concurrently
        # Retry as update
        result = await db.execute(
            select(WhatsAppConfig).where(WhatsAppConfig.gym_id == current_user.gym_id)
        )
        config = result.scalar_one()
        config.api_key = data.api_key
        config.is_enabled = data.is_enabled
        config.campaign_prefix = data.campaign_prefix
        await db.commit()
        logger.info(f"WhatsApp config updated (race recovery) for gym {current_user.gym_id}")

    await db.refresh(config)
    return _to_response(config)


@router.delete("")
async def remove_whatsapp_config(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove WhatsApp configuration. OWNER only.
    System will revert to log-only mode (manual notifications).
    """
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.gym_id == current_user.gym_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("WhatsApp not configured")

    await db.delete(config)
    await db.commit()
    logger.info(f"WhatsApp config removed for gym {current_user.gym_id}")
    return {"message": "WhatsApp configuration removed. System will use manual mode."}


@router.post("/test", response_model=WhatsAppTestResponse)
async def test_whatsapp_connection(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a test message to verify AiSensy integration works. OWNER only.

    Sends a test template message to the gym owner's registered phone.
    This validates:
    - API key is correct
    - AiSensy account is active
    - Network connectivity to AiSensy API
    """
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.gym_id == current_user.gym_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("WhatsApp not configured. Add your API key first.")

    if not config.is_enabled:
        raise ValidationError("WhatsApp automation is disabled. Enable it first.")

    # Get gym owner's phone for test message
    from app.models.gym import Gym
    gym_result = await db.execute(select(Gym.phone).where(Gym.id == current_user.gym_id))
    gym_phone = gym_result.scalar_one_or_none()
    if not gym_phone:
        raise ValidationError("No gym phone number found for test message.")

    # Ensure phone has country code
    phone = gym_phone
    if not phone.startswith("+") and not phone.startswith("91"):
        phone = f"91{phone}"

    # Send test message via AiSensy
    provider = AiSensyProvider(api_key=config.api_key, base_url=config.provider_url)
    test_message = WhatsAppMessage(
        phone=phone,
        template_name="test_connection" if not config.campaign_prefix else f"{config.campaign_prefix}_test",
        variables=["GymFlow Track"],
        language="en",
    )

    send_result = await provider.send_template_message(test_message)

    if send_result.success:
        logger.info(f"WhatsApp test successful for gym {current_user.gym_id}")
        return WhatsAppTestResponse(
            success=True,
            message=f"Test message sent successfully to {gym_phone}",
            provider_message_id=send_result.provider_message_id,
        )
    else:
        logger.warning(
            f"WhatsApp test failed for gym {current_user.gym_id}: {send_result.error_message}"
        )
        return WhatsAppTestResponse(
            success=False,
            message=f"Failed: {send_result.error_message}",
            provider_message_id=None,
        )


@router.patch("/toggle", response_model=WhatsAppConfigResponse)
async def toggle_whatsapp(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle WhatsApp automation on/off. OWNER only.
    Quick switch without needing to delete the config.
    """
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.gym_id == current_user.gym_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("WhatsApp not configured. Add your API key first.")

    config.is_enabled = not config.is_enabled
    await db.commit()
    await db.refresh(config)

    status = "enabled" if config.is_enabled else "disabled"
    logger.info(f"WhatsApp automation {status} for gym {current_user.gym_id}")
    return _to_response(config)
