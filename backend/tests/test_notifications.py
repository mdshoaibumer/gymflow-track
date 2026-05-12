"""
Tests for WhatsApp Notification / Reminder Engine.

Coverage:
1. Scheduling idempotency — no duplicate notifications
2. Tenant isolation — Gym A cannot see Gym B notifications
3. Failure handling — failed jobs retried safely
4. Expiry detection — correct members picked up
5. API endpoints — list, stats, cancel, retry, scan
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.notification import (
    Notification,
    NotificationChannel,
    NotificationStatus,
    NotificationType,
)
from app.repositories.notification_repository import NotificationRepository
from app.services.reminder_service import ReminderEngine


# === Fixtures ===


@pytest.fixture
async def expiring_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    """Member whose membership expires in 7 days."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Expiring Soon",
        phone="9111111111",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=datetime.now(timezone.utc) - timedelta(days=23),
        membership_end=datetime.now(timezone.utc) + timedelta(days=7),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def expired_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    """Member whose membership has expired."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Already Expired",
        phone="9222222222",
        membership_status=MembershipStatus.EXPIRED,
        membership_start=datetime.now(timezone.utc) - timedelta(days=60),
        membership_end=datetime.now(timezone.utc) - timedelta(days=1),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def sample_notification(
    db_session: AsyncSession, sample_gym: Gym, expiring_member: Member
) -> Notification:
    """A pre-created pending notification."""
    notif = Notification(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=expiring_member.id,
        notification_type=NotificationType.EXPIRY_7_DAYS,
        channel=NotificationChannel.WHATSAPP,
        status=NotificationStatus.PENDING,
        scheduled_for=datetime.now(timezone.utc) + timedelta(hours=1),
        retry_count=0,
    )
    db_session.add(notif)
    await db_session.flush()
    return notif


# === Scheduling Idempotency Tests ===


@pytest.mark.asyncio
async def test_schedule_expiry_reminders_creates_notifications(
    db_session: AsyncSession, sample_gym: Gym, expiring_member: Member
):
    """ReminderEngine should create reminders for expiring members."""
    engine = ReminderEngine(db_session)
    created = await engine.schedule_expiry_reminders(sample_gym.id)

    assert created >= 1

    repo = NotificationRepository(db_session)
    notifications = await repo.list_by_gym(sample_gym.id)
    assert len(notifications) >= 1

    types = [n.notification_type for n in notifications]
    assert NotificationType.EXPIRY_7_DAYS in types


@pytest.mark.asyncio
async def test_schedule_is_idempotent(
    db_session: AsyncSession, sample_gym: Gym, expiring_member: Member
):
    """Running schedule_expiry_reminders twice should NOT create duplicates."""
    engine = ReminderEngine(db_session)
    first_run = await engine.schedule_expiry_reminders(sample_gym.id)
    second_run = await engine.schedule_expiry_reminders(sample_gym.id)

    assert first_run >= 1
    assert second_run == 0  # No new notifications — dedup works

    repo = NotificationRepository(db_session)
    total = await repo.count_by_gym(sample_gym.id)
    assert total == first_run


@pytest.mark.asyncio
async def test_expired_members_get_expiry_notification(
    db_session: AsyncSession, sample_gym: Gym, expired_member: Member
):
    """Expired members should get a MEMBERSHIP_EXPIRED notification."""
    engine = ReminderEngine(db_session)
    _ = await engine.schedule_expiry_reminders(sample_gym.id)

    repo = NotificationRepository(db_session)
    notifications = await repo.list_by_gym(sample_gym.id)
    expired_notifs = [
        n for n in notifications
        if n.notification_type == NotificationType.MEMBERSHIP_EXPIRED
    ]
    assert len(expired_notifs) >= 1
    assert expired_notifs[0].member_id == expired_member.id


# === Tenant Isolation Tests ===


@pytest.mark.asyncio
async def test_notifications_isolated_by_gym(
    db_session: AsyncSession, sample_gym: Gym, other_gym: Gym, expiring_member: Member
):
    """Notifications from one gym should not be visible to another gym."""
    engine = ReminderEngine(db_session)
    await engine.schedule_expiry_reminders(sample_gym.id)

    repo = NotificationRepository(db_session)
    # Sample gym should have notifications
    sample_count = await repo.count_by_gym(sample_gym.id)
    assert sample_count >= 1

    # Other gym should have zero
    other_count = await repo.count_by_gym(other_gym.id)
    assert other_count == 0


@pytest.mark.asyncio
async def test_api_list_returns_only_own_gym(
    client: AsyncClient,
    auth_headers: dict,
    other_auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    expiring_member: Member,
    other_gym,
    other_user,
):
    """API endpoint should only return notifications for the requesting gym."""
    engine = ReminderEngine(db_session)
    await engine.schedule_expiry_reminders(sample_gym.id)
    await db_session.commit()

    # Sample gym owner sees notifications
    resp = await client.get("/api/v1/notifications", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1

    # Other gym owner sees nothing
    resp2 = await client.get("/api/v1/notifications", headers=other_auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 0


# === Failure Handling Tests ===


@pytest.mark.asyncio
async def test_mark_failed_and_retry(
    db_session: AsyncSession, sample_notification: Notification, sample_gym: Gym
):
    """Failed notifications can be reset for retry."""
    repo = NotificationRepository(db_session)

    # Mark as failed
    await repo.mark_failed(sample_notification, "Provider timeout")
    assert sample_notification.status == NotificationStatus.FAILED
    assert sample_notification.retry_count == 1

    # Retry (reset to pending)
    engine = ReminderEngine(db_session)
    retried = await engine.retry_failed(sample_gym.id)
    assert retried == 1
    assert sample_notification.status == NotificationStatus.PENDING


@pytest.mark.asyncio
async def test_max_retries_respected(
    db_session: AsyncSession, sample_notification: Notification, sample_gym: Gym
):
    """Notifications at max retry count should NOT be retried."""
    _ = NotificationRepository(db_session)

    # Simulate max retries reached
    sample_notification.retry_count = 3
    sample_notification.status = NotificationStatus.FAILED
    await db_session.flush()

    engine = ReminderEngine(db_session)
    retried = await engine.retry_failed(sample_gym.id)
    assert retried == 0  # Not retried — max exceeded


# === API Tests ===


@pytest.mark.asyncio
async def test_stats_endpoint(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    sample_notification: Notification,
):
    """Stats endpoint returns correct counts."""
    await db_session.commit()

    resp = await client.get("/api/v1/notifications/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["pending_count"] >= 1
    assert "sent_today" in data
    assert "failed_count" in data


@pytest.mark.asyncio
async def test_cancel_notification(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_notification: Notification,
):
    """Owner can cancel a pending notification."""
    await db_session.commit()
    notif_id = str(sample_notification.id)

    resp = await client.post(
        f"/api/v1/notifications/{notif_id}/cancel", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_non_pending_fails(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_notification: Notification,
):
    """Cannot cancel a notification that is already sent."""
    sample_notification.status = NotificationStatus.SENT
    sample_notification.sent_at = datetime.now(timezone.utc)
    await db_session.flush()
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/notifications/{str(sample_notification.id)}/cancel",
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_scan_endpoint_requires_admin(
    client: AsyncClient,
    staff_headers: dict,
    staff_user,
):
    """Staff cannot trigger a manual scan — admin required."""
    resp = await client.post("/api/v1/notifications/scan", headers=staff_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_scan_endpoint_owner_can_trigger(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    expiring_member: Member,
):
    """Owner can trigger a manual scan."""
    await db_session.commit()

    resp = await client.post("/api/v1/notifications/scan", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "reminders_scheduled" in data
    assert data["reminders_scheduled"] >= 1


@pytest.mark.asyncio
async def test_list_with_status_filter(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_notification: Notification,
):
    """Filtering by status works correctly."""
    await db_session.commit()

    # Filter for pending — should find our notification
    resp = await client.get(
        "/api/v1/notifications?status=pending", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    # Filter for sent — should be empty
    resp2 = await client.get(
        "/api/v1/notifications?status=sent", headers=auth_headers
    )
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 0
