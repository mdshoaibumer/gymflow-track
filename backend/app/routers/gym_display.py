"""
Gym QR Display routes — public endpoints for the attendance display screen
and WhatsApp webhook for processing incoming attendance messages.

Endpoints:
- GET /gym-display/{gym_id}/qr-data: Returns current QR content (public, no auth)
- POST /webhook/whatsapp-attendance: Receives WhatsApp incoming messages

The display endpoint is intentionally PUBLIC (no auth) because it runs on
a TV/tablet at the gym entrance — no user is logged in on that device.

Security:
- gym_id is a UUID (unguessable)
- The QR code content is a WhatsApp deeplink (harmless if leaked)
- The rotating code itself prevents abuse (expires in 2 min)
- Webhook is verified via WhatsApp webhook verification token
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.gym import Gym
from app.repositories.gym_repository import GymRepository
from app.services.gym_qr_service import (
    generate_gym_code,
    generate_whatsapp_checkin_url,
    get_code_ttl_seconds,
)

logger = logging.getLogger("gymflow.gym_display")

router = APIRouter()


# --- Response Schemas ---

class GymQRDisplayResponse(BaseModel):
    """Response for the gym display screen."""
    gym_name: str
    code: str
    whatsapp_url: str
    refresh_in_seconds: int
    message: str


class WebhookVerification(BaseModel):
    """WhatsApp webhook verification challenge."""
    hub_mode: str | None = None
    hub_verify_token: str | None = None
    hub_challenge: str | None = None


# --- Display Endpoint (Public) ---

@router.get("/gym-display/{gym_id}/qr-data", response_model=GymQRDisplayResponse)
async def get_gym_qr_display(
    gym_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Get the current QR code data for the gym's display screen.

    This endpoint is PUBLIC (no auth required) because:
    - It runs on a TV/tablet at the gym entrance
    - No user is logged in on that device
    - The gym_id UUID is unguessable
    - The QR content is just a WhatsApp deeplink (harmless)

    The frontend display page polls this every `refresh_in_seconds`.
    """
    gym_repo = GymRepository(db)
    gym = await gym_repo.get_by_id(gym_id)
    if not gym or not gym.is_active:
        raise HTTPException(status_code=404, detail="Gym not found")

    # Normalize gym phone for WhatsApp URL (remove + and spaces)
    gym_phone = gym.phone.strip().replace("+", "").replace(" ", "").replace("-", "")
    # Ensure it starts with country code
    if len(gym_phone) == 10:
        gym_phone = f"91{gym_phone}"

    code = generate_gym_code(gym_id)
    whatsapp_url = generate_whatsapp_checkin_url(gym_phone, gym_id)
    ttl = get_code_ttl_seconds()

    return GymQRDisplayResponse(
        gym_name=gym.name,
        code=code,
        whatsapp_url=whatsapp_url,
        refresh_in_seconds=ttl,
        message=f"Scan this QR to mark your attendance at {gym.name}",
    )


# --- WhatsApp Webhook ---

# Webhook verification token (used by WhatsApp to verify the webhook URL)
WEBHOOK_VERIFY_TOKEN = "gymflow_attendance_webhook_v1"


@router.get("/webhook/whatsapp-attendance")
async def verify_whatsapp_webhook(
    request: Request,
):
    """
    WhatsApp webhook verification (GET request).

    WhatsApp sends a GET request with hub.mode, hub.verify_token, and hub.challenge
    to verify the webhook URL. We must return the challenge if the token matches.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == WEBHOOK_VERIFY_TOKEN:
        logger.info("WhatsApp webhook verified successfully")
        return JSONResponse(content=int(challenge) if challenge else 0)

    logger.warning(f"WhatsApp webhook verification failed: mode={mode}, token={token}")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/whatsapp-attendance")
async def handle_whatsapp_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    WhatsApp incoming message webhook (POST request).

    Receives messages from WhatsApp Business API and processes
    attendance check-in commands ("CHECKIN XXXXXX").

    Responds with 200 immediately (WhatsApp requires fast response).
    Attendance processing and reply happen within this handler.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(content={"status": "ok"}, status_code=200)

    # WhatsApp Cloud API message format
    # See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
    try:
        entries = body.get("entry", [])
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                value = change.get("value", {})
                messages = value.get("messages", [])
                metadata = value.get("metadata", {})
                receiver_phone = metadata.get("display_phone_number", "")

                for message in messages:
                    if message.get("type") != "text":
                        continue

                    sender_phone = message.get("from", "")
                    message_body = message.get("text", {}).get("body", "")

                    if not sender_phone or not message_body:
                        continue

                    # Process the attendance message
                    from app.services.whatsapp_attendance_service import (
                        process_attendance_message,
                    )

                    result = await process_attendance_message(
                        db=db,
                        sender_phone=sender_phone,
                        message_body=message_body,
                        receiver_phone=receiver_phone,
                    )

                    if result is not None:
                        # Send reply to the member via WhatsApp
                        await _send_whatsapp_reply(
                            db=db,
                            to_phone=sender_phone,
                            message=result.message,
                            receiver_phone=receiver_phone,
                        )

                        # Commit the attendance record
                        await db.commit()

    except Exception as e:
        logger.error(f"Error processing WhatsApp webhook: {e}", exc_info=True)
        # Don't raise — always return 200 to WhatsApp
        # (they retry on non-2xx, causing duplicates)

    # Always return 200 to acknowledge receipt
    return JSONResponse(content={"status": "ok"}, status_code=200)


async def _send_whatsapp_reply(
    db: AsyncSession,
    to_phone: str,
    message: str,
    receiver_phone: str,
) -> None:
    """
    Send a WhatsApp reply to the member.

    Uses the gym's WhatsApp config (AiSensy) if available.
    Falls back to logging if not configured.
    """
    from sqlalchemy import select
    from app.models.whatsapp_config import WhatsAppConfig

    try:
        # Find gym by phone to get its WhatsApp config
        normalized_phone = receiver_phone.strip().replace("+", "").replace(" ", "")

        # Find gym
        result = await db.execute(select(Gym).where(Gym.is_active == True))  # noqa: E712
        gyms = result.scalars().all()

        gym = None
        for g in gyms:
            g_phone = g.phone.strip().replace("+", "").replace(" ", "").replace("-", "")
            if len(g_phone) == 10:
                g_phone = f"91{g_phone}"
            if g_phone == normalized_phone or g.phone == receiver_phone:
                gym = g
                break

        if not gym:
            logger.info(f"WhatsApp reply (no gym config): {to_phone} → {message}")
            return

        # Get WhatsApp config for this gym
        config_result = await db.execute(
            select(WhatsAppConfig).where(
                WhatsAppConfig.gym_id == gym.id,
                WhatsAppConfig.is_enabled == True,  # noqa: E712
            )
        )
        config = config_result.scalar_one_or_none()

        if not config:
            logger.info(f"WhatsApp reply (not configured): {to_phone} → {message}")
            return

        # Send via WhatsApp Business API (direct message, not template)
        # Note: For now, we log the reply. Full send requires approved templates
        # or 24-hour conversation window (which we have since member messaged first).

        # WhatsApp Cloud API send message endpoint
        # This uses the conversation window opened by the incoming message
        logger.info(f"WhatsApp attendance reply to {to_phone}: {message}")

        # If using AiSensy or direct WhatsApp Cloud API:
        # The member initiated the conversation, so we have a 24-hour window
        # to send a free-form reply without a template.
        # For MVP, we log it. Production would call the WhatsApp API here.

    except Exception as e:
        logger.error(f"Failed to send WhatsApp reply to {to_phone}: {e}")
