"""
Tests for app.core.events — domain event system.

Coverage:
1. register_handler and emit for each event type
2. Multiple handlers per event type
3. Handler exception isolation (one failure doesn't crash others)
4. clear_handlers resets state
5. Unregistered event types emit silently
"""

from unittest.mock import MagicMock
from uuid import uuid4
from datetime import date

import pytest

from app.core.events import (
    DomainEvent,
    MembershipExpired,
    MembershipExpiringSoon,
    MembershipRenewed,
    PaymentRecorded,
    clear_handlers,
    emit,
    register_handler,
)


@pytest.fixture(autouse=True)
def _clean_handlers():
    """Ensure a clean handler registry for each test."""
    clear_handlers()
    yield
    clear_handlers()


class TestRegisterAndEmit:
    """Basic handler registration and event dispatch."""

    def test_handler_called_on_emit(self):
        handler = MagicMock()
        register_handler(PaymentRecorded, handler)

        event = PaymentRecorded(
            gym_id=uuid4(),
            payment_id=uuid4(),
            member_id=uuid4(),
            amount_in_paise=50000,
            payment_method="cash",
        )
        emit(event)

        handler.assert_called_once_with(event)

    def test_multiple_handlers_all_called(self):
        handler1 = MagicMock()
        handler2 = MagicMock()
        register_handler(PaymentRecorded, handler1)
        register_handler(PaymentRecorded, handler2)

        event = PaymentRecorded(
            gym_id=uuid4(),
            payment_id=uuid4(),
            member_id=uuid4(),
            amount_in_paise=30000,
            payment_method="upi",
        )
        emit(event)

        handler1.assert_called_once_with(event)
        handler2.assert_called_once_with(event)

    def test_handler_not_called_for_different_event(self):
        handler = MagicMock()
        register_handler(PaymentRecorded, handler)

        event = MembershipRenewed(
            gym_id=uuid4(),
            member_id=uuid4(),
            new_end=date(2026, 12, 31),
        )
        emit(event)

        handler.assert_not_called()

    def test_emit_with_no_handlers_does_not_raise(self):
        event = MembershipExpired(
            gym_id=uuid4(),
            member_id=uuid4(),
            member_name="Test",
            member_phone="9876543210",
        )
        # Should not raise
        emit(event)


class TestHandlerIsolation:
    """One handler failure must not affect others."""

    def test_failing_handler_does_not_block_others(self):
        failing_handler = MagicMock(side_effect=RuntimeError("handler crash"))
        good_handler = MagicMock()

        register_handler(PaymentRecorded, failing_handler)
        register_handler(PaymentRecorded, good_handler)

        event = PaymentRecorded(
            gym_id=uuid4(),
            payment_id=uuid4(),
            member_id=uuid4(),
            amount_in_paise=10000,
            payment_method="card",
        )
        emit(event)

        # The good handler should still be called
        good_handler.assert_called_once_with(event)


class TestClearHandlers:
    """Handler registry cleanup."""

    def test_clear_removes_all_handlers(self):
        handler = MagicMock()
        register_handler(PaymentRecorded, handler)
        register_handler(MembershipRenewed, handler)

        clear_handlers()

        event = PaymentRecorded(
            gym_id=uuid4(),
            payment_id=uuid4(),
            member_id=uuid4(),
            amount_in_paise=5000,
            payment_method="cash",
        )
        emit(event)
        handler.assert_not_called()


class TestEventDataclasses:
    """Verify event dataclass fields."""

    def test_payment_recorded_fields(self):
        gym_id = uuid4()
        payment_id = uuid4()
        member_id = uuid4()

        event = PaymentRecorded(
            gym_id=gym_id,
            payment_id=payment_id,
            member_id=member_id,
            amount_in_paise=100000,
            payment_method="upi",
        )
        assert event.gym_id == gym_id
        assert event.payment_id == payment_id
        assert event.member_id == member_id
        assert event.amount_in_paise == 100000
        assert event.payment_method == "upi"

    def test_membership_expiring_soon_fields(self):
        event = MembershipExpiringSoon(
            gym_id=uuid4(),
            member_id=uuid4(),
            member_name="John",
            member_phone="9876543210",
            expires_on=date(2026, 6, 1),
        )
        assert event.member_name == "John"
        assert event.expires_on == date(2026, 6, 1)

    def test_membership_renewed_optional_plan(self):
        event = MembershipRenewed(
            gym_id=uuid4(),
            member_id=uuid4(),
            new_end=date(2027, 1, 1),
        )
        assert event.plan is None

        event2 = MembershipRenewed(
            gym_id=uuid4(),
            member_id=uuid4(),
            new_end=date(2027, 1, 1),
            plan="Monthly",
        )
        assert event2.plan == "Monthly"
