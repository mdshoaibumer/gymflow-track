"""
WhatsApp provider abstraction layer.

Design:
- WhatsAppProvider is an ABC defining the contract
- Each BSP (AiSensy, Interakt, Meta) implements the interface
- A "LogOnly" provider is used in development (no real messages sent)
- Provider selection is config-driven (settings.WHATSAPP_PROVIDER)

Why abstraction:
- BSPs have different APIs but identical capabilities (send template message)
- Switching from AiSensy → Interakt requires only a new adapter
- Testing uses LogOnlyProvider — no external calls
- Business logic never touches HTTP/vendor details

Template approach:
- WhatsApp Business API uses pre-approved message templates
- Templates have variables ({{1}}, {{2}}, etc.)
- We map our notification types to template names
- Provider receives (phone, template_name, variables) — simple contract
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

logger = logging.getLogger("gymflow.whatsapp")


@dataclass
class WhatsAppMessage:
    """Standardized message payload sent to any provider."""
    phone: str              # E.164 format with country code (e.g., "919876543210")
    template_name: str      # Pre-approved WhatsApp template name
    variables: list[str]    # Ordered template variables ({{1}}, {{2}}, etc.)
    language: str = "en"    # Template language code


@dataclass
class SendResult:
    """Result of a send attempt."""
    success: bool
    provider_message_id: str | None = None  # Provider's message tracking ID
    error_message: str | None = None


class WhatsAppProvider(ABC):
    """
    Abstract interface for WhatsApp Business Service Providers.

    Any BSP integration must implement send_template_message().
    The rest of the system only depends on this interface.
    """

    @abstractmethod
    async def send_template_message(self, message: WhatsAppMessage) -> SendResult:
        """
        Send a template-based WhatsApp message.

        Args:
            message: Standardized message with phone, template, and variables.

        Returns:
            SendResult with success status and optional provider message ID.
        """
        ...

    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name for logging/debugging."""
        ...


class LogOnlyProvider(WhatsAppProvider):
    """
    Development/testing provider — logs messages without sending.
    Used when WHATSAPP_PROVIDER=log_only or in test environments.
    """

    async def send_template_message(self, message: WhatsAppMessage) -> SendResult:
        logger.info(
            f"[LOG_ONLY] WhatsApp → {message.phone} | "
            f"template={message.template_name} | "
            f"vars={message.variables}"
        )
        return SendResult(success=True, provider_message_id="log_only_mock")

    def provider_name(self) -> str:
        return "log_only"


class AiSensyProvider(WhatsAppProvider):
    """
    AiSensy WhatsApp BSP adapter.
    Docs: https://docs.aisensy.com/

    IMPORTANT: Not fully implemented — requires API key and campaign setup.
    This is the structural adapter; actual HTTP calls will be added
    when the gym owner configures their AiSensy account.
    """

    def __init__(self, api_key: str, base_url: str = "https://backend.aisensy.com"):
        self.api_key = api_key
        self.base_url = base_url

    async def send_template_message(self, message: WhatsAppMessage) -> SendResult:
        """
        Send via AiSensy Campaign API.
        Structure prepared for:
        POST /campaign/t1/api/v2
        """
        import httpx

        payload = {
            "apiKey": self.api_key,
            "campaignName": message.template_name,
            "destination": message.phone,
            "userName": message.variables[0] if message.variables else "",
            "templateParams": message.variables,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.base_url}/campaign/t1/api/v2",
                    json=payload,
                )
                if response.status_code == 200:
                    data = response.json()
                    return SendResult(
                        success=True,
                        provider_message_id=data.get("data", {}).get("id"),
                    )
                else:
                    return SendResult(
                        success=False,
                        error_message=f"AiSensy HTTP {response.status_code}: {response.text}",
                    )
        except Exception as e:
            return SendResult(success=False, error_message=str(e))

    def provider_name(self) -> str:
        return "aisensy"


# --- Template Mapping ---

# Maps notification types to WhatsApp template names.
# These templates must be pre-approved in the BSP dashboard.
TEMPLATE_MAP: dict[str, str] = {
    "expiry_7_days": "membership_expiry_7day",
    "expiry_3_days": "membership_expiry_3day",
    "membership_expired": "membership_expired_notice",
    "payment_overdue": "payment_overdue_reminder",
    "welcome": "welcome_new_member",
    "renewal_confirmation": "renewal_confirmed",
}


def build_message_from_notification(
    notification_type: str,
    phone: str,
    payload: dict,
) -> WhatsAppMessage:
    """
    Convert a notification record into a WhatsAppMessage.
    Maps notification_type → template_name and builds variable list.
    """
    template_name = TEMPLATE_MAP.get(notification_type, "generic_notification")

    # Build variables based on notification type
    variables = []
    member_name = payload.get("member_name", "Member")

    if notification_type in ("expiry_7_days", "expiry_3_days"):
        variables = [member_name, payload.get("membership_end", ""), payload.get("membership_plan", "")]
    elif notification_type == "membership_expired":
        variables = [member_name, payload.get("membership_plan", "")]
    elif notification_type == "payment_overdue":
        variables = [member_name]
    elif notification_type == "welcome":
        variables = [member_name, payload.get("membership_plan", "")]
    elif notification_type == "renewal_confirmation":
        variables = [member_name, payload.get("membership_end", ""), payload.get("membership_plan", "")]
    else:
        variables = [member_name]

    # Ensure phone has country code (India default)
    if not phone.startswith("+") and not phone.startswith("91"):
        phone = f"91{phone}"

    return WhatsAppMessage(
        phone=phone,
        template_name=template_name,
        variables=variables,
    )
