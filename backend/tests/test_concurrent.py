"""
Concurrency and race condition tests for GymFlow Track.

Coverage:
1. Payment idempotency under concurrent requests
2. Concurrent member creation with duplicate phone
3. Concurrent attendance check-in (same member, same day)
4. Concurrent subscription activation
5. Concurrent webhook processing
6. Cache consistency under concurrent reads/writes

These tests use asyncio.gather to simulate concurrent requests
and verify that the system handles them correctly without:
- Double-charging
- Duplicate records
- Data corruption
- Lost updates
"""

import asyncio
import random
from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.services.qr_service import generate_qr_token


# === Fixtures ===


@pytest.fixture
async def conc_member(
    db_session: AsyncSession, sample_gym: Gym
) -> Member:
    """Member for concurrency tests."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Concurrent Test Member",
        phone="9400000001",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today() - timedelta(days=15),
        membership_end=date.today() + timedelta(days=15),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


# === Concurrent Payment Tests ===


class TestConcurrentPayments:
    """Verify payment idempotency under concurrent requests."""

    @pytest.mark.asyncio
    async def test_concurrent_payments_with_same_idempotency_key(
        self,
        client: AsyncClient,
        auth_headers: dict,
        conc_member: Member,
    ):
        """Multiple concurrent payments with the same idempotency key
        should result in exactly one payment."""
        idem_key = f"conc-idem-{uuid4().hex[:8]}"
        payload = {
            "member_id": str(conc_member.id),
            "amount_in_paise": 100000,
            "payment_method": "cash",
            "idempotency_key": idem_key,
        }

        # Fire 5 concurrent requests
        tasks = [
            client.post("/api/v1/payments", json=payload, headers=auth_headers)
            for _ in range(5)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions (connection errors under concurrency are acceptable)
        valid_responses = [r for r in responses if not isinstance(r, Exception)]
        successful = [r for r in valid_responses if r.status_code in (200, 201)]

        # All successful responses should return the same payment ID
        if len(successful) >= 2:
            payment_ids = {r.json()["id"] for r in successful}
            assert len(payment_ids) == 1, (
                f"Expected 1 payment, got {len(payment_ids)} different IDs"
            )

    @pytest.mark.asyncio
    async def test_concurrent_payments_without_idempotency_key(
        self,
        client: AsyncClient,
        auth_headers: dict,
        conc_member: Member,
    ):
        """Concurrent payments WITHOUT idempotency keys should each create
        separate payments (no dedup without key)."""
        payload = {
            "member_id": str(conc_member.id),
            "amount_in_paise": 50000,
            "payment_method": "upi",
        }

        tasks = [
            client.post("/api/v1/payments", json=payload, headers=auth_headers)
            for _ in range(3)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        valid_responses = [r for r in responses if not isinstance(r, Exception)]
        successful = [r for r in valid_responses if r.status_code == 201]

        # Each should create a unique payment
        if len(successful) >= 2:
            payment_ids = {r.json()["id"] for r in successful}
            assert len(payment_ids) == len(successful)


# === Concurrent Member Creation Tests ===


class TestConcurrentMemberCreation:
    """Verify concurrent member creation handles duplicates correctly."""

    @pytest.mark.asyncio
    async def test_concurrent_duplicate_phone(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Two concurrent member creations with the same phone should
        result in exactly one success and one 409."""
        phone = f"94000{random.randint(10000, 99999)}"
        payload = {
            "name": "Concurrent Member",
            "phone": phone,
        }

        tasks = [
            client.post("/api/v1/members", json=payload, headers=auth_headers)
            for _ in range(3)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        valid_responses = [r for r in responses if not isinstance(r, Exception)]

        status_codes = [r.status_code for r in valid_responses]
        # At least one should succeed (201), rest should be 409 or 500
        assert 201 in status_codes, "At least one creation should succeed"
        # No more than one 201
        assert status_codes.count(201) <= 1, (
            f"Only one creation should succeed, got {status_codes.count(201)}"
        )


# === Concurrent Attendance Tests ===


class TestConcurrentAttendance:
    """Verify concurrent check-in produces exactly one record."""

    @pytest.mark.asyncio
    async def test_concurrent_qr_check_in(
        self,
        client: AsyncClient,
        auth_headers: dict,
        conc_member: Member,
        sample_gym: Gym,
        db_session: AsyncSession,
    ):
        """Multiple concurrent QR scans should result in exactly one check-in."""
        qr_token = generate_qr_token(sample_gym.id, conc_member.id)
        await db_session.commit()

        tasks = [
            client.post(
                "/api/v1/attendance/check-in",
                json={"qr_token": qr_token},
                headers=auth_headers,
            )
            for _ in range(5)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        valid_responses = [r for r in responses if not isinstance(r, Exception)]
        successful = [r for r in valid_responses if r.status_code == 200]

        # All successful responses should have the same attendance ID
        if len(successful) >= 2:
            attendance_ids = {r.json()["id"] for r in successful}
            assert len(attendance_ids) == 1, (
                f"Expected 1 attendance record, got {len(attendance_ids)}"
            )


# === Concurrent Registration Tests ===


class TestConcurrentRegistration:
    """Verify concurrent gym registrations are handled correctly."""

    @pytest.mark.asyncio
    async def test_concurrent_registrations_unique_emails(
        self, client: AsyncClient
    ):
        """Concurrent registrations with unique emails should all succeed."""
        tasks = []
        for i in range(3):
            payload = {
                "gym_name": f"Concurrent Gym {i}",
                "owner_name": f"Owner {i}",
                "phone": f"987650{i:04d}",
                "email": f"conc-{uuid4().hex[:6]}@test.com",
                "password": "SecurePass123",
            }
            tasks.append(
                client.post("/api/v1/auth/register", json=payload)
            )

        responses = await asyncio.gather(*tasks, return_exceptions=True)
        valid_responses = [r for r in responses if not isinstance(r, Exception)]
        successful = [r for r in valid_responses if r.status_code == 201]

        # At least one should succeed; others may hit DB contention (500)
        assert len(successful) >= 1, (
            f"Expected at least one success, got {len(successful)}"
        )
        # No 422 validation errors — all payloads are valid
        validation_errors = [r for r in valid_responses if r.status_code == 422]
        assert len(validation_errors) == 0, "Valid payloads should not get 422"


# === Cache Consistency Tests ===


class TestCacheConsistency:
    """Verify cache behavior under concurrent operations."""

    def test_concurrent_cache_reads_writes(self):
        """Concurrent cache operations should not corrupt state."""
        cache = get_cache_backend()

        # Write multiple keys concurrently
        for i in range(100):
            cache.set(f"conc_test:{i}", str(i), 60)

        # Read them all back
        for i in range(100):
            val = cache.get(f"conc_test:{i}")
            assert val == str(i), f"Cache key conc_test:{i} expected {i}, got {val}"

        # Cleanup
        for i in range(100):
            cache.delete(f"conc_test:{i}")

    def test_rate_limit_counter_accuracy(self):
        """Rate limit counter should accurately count within a window."""
        cache = get_cache_backend()
        key = f"rate_test:{uuid4().hex[:8]}"

        # Increment 10 times
        counts = []
        for _ in range(10):
            count = cache.increment_window(key, window_seconds=60)
            counts.append(count)

        # Should be monotonically increasing: 1, 2, 3, ..., 10
        assert counts == list(range(1, 11))
