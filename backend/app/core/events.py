"""
Event system for GymFlow business automation.

Architecture:
- Services emit domain events after business operations complete
- Handlers are registered at startup and process events
- Currently synchronous (in-process) — future: async queue (Redis/SQS)

This is NOT a full event bus — it's a minimal hook system that:
1. Decouples business logic from notification delivery
2. Makes it trivial to add WhatsApp/SMS/email handlers later
3. Keeps services testable (events can be mocked/captured)

Future handlers (NOT implemented yet):
- WhatsApp reminder on membership_expiring_soon
- SMS notification on payment_recorded
- Email receipt on payment_completed
- Alert on membership_expired

IMPORTANT: No external integrations are implemented here.
Only the event dispatch structure is prepared.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Any
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


# --- Domain Events ---


@dataclass
class DomainEvent:
    """Base class for all domain events."""
    gym_id: UUID


@dataclass
class PaymentRecorded(DomainEvent):
    """Emitted when a payment is successfully recorded."""
    payment_id: UUID
    member_id: UUID
    amount_in_paise: int
    payment_method: str


@dataclass
class MembershipRenewed(DomainEvent):
    """Emitted when a membership is renewed (payment + date extension)."""
    member_id: UUID
    new_end: date
    plan: str | None = None


@dataclass
class MembershipExpiringSoon(DomainEvent):
    """Emitted for members whose membership expires within N days."""
    member_id: UUID
    member_name: str
    member_phone: str
    expires_on: date


@dataclass
class MembershipExpired(DomainEvent):
    """Emitted when a membership transitions to expired."""
    member_id: UUID
    member_name: str
    member_phone: str


# --- Event Dispatcher ---

# Type alias for event handlers
EventHandler = Callable[[DomainEvent], Any]

# Registry: event_type → list of handlers
_handlers: dict[type, list[EventHandler]] = {}


def register_handler(event_type: type, handler: EventHandler) -> None:
    """Register a handler for a specific event type."""
    if event_type not in _handlers:
        _handlers[event_type] = []
    _handlers[event_type].append(handler)


def emit(event: DomainEvent) -> None:
    """
    Dispatch an event to all registered handlers.

    Currently synchronous. When we add async handlers (WhatsApp API calls),
    this will be changed to:
      - await asyncio.gather(*[h(event) for h in handlers])
    Or pushed to a task queue.
    """
    handlers = _handlers.get(type(event), [])
    for handler in handlers:
        try:
            handler(event)
        except Exception:
            logger.exception(
                "Event handler %s failed for %s",
                getattr(handler, "__name__", handler),
                type(event).__name__,
            )


def clear_handlers() -> None:
    """Clear all registered handlers. Used in tests."""
    _handlers.clear()
