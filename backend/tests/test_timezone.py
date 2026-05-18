"""
Tests for app.core.timezone — IST business time utilities.

Coverage:
1. now_ist returns IST-aware datetime
2. today_ist returns date in IST
3. Timezone offset is UTC+5:30
"""

from datetime import timezone, timedelta, date, datetime

import pytest

from app.core.timezone import IST, now_ist, today_ist


class TestISTTimezone:
    """Verify IST timezone constant."""

    def test_ist_offset_is_5_30(self):
        assert IST == timezone(timedelta(hours=5, minutes=30))

    def test_ist_utcoffset(self):
        dt = datetime(2026, 1, 1, tzinfo=IST)
        assert dt.utcoffset() == timedelta(hours=5, minutes=30)


class TestNowIST:
    """now_ist() returns timezone-aware datetime."""

    def test_returns_datetime_with_tzinfo(self):
        result = now_ist()
        assert isinstance(result, datetime)
        assert result.tzinfo is not None

    def test_returns_ist_timezone(self):
        result = now_ist()
        assert result.utcoffset() == timedelta(hours=5, minutes=30)

    def test_returns_reasonable_time(self):
        """Sanity check — the returned time should be close to actual time."""
        result = now_ist()
        utc_now = datetime.now(timezone.utc)
        diff = abs((result - utc_now).total_seconds())
        # Should differ by less than 2 seconds (execution time)
        assert diff < 2


class TestTodayIST:
    """today_ist() returns IST business date."""

    def test_returns_date_object(self):
        result = today_ist()
        assert isinstance(result, date)

    def test_returns_ist_date(self):
        """The date should match now_ist().date()."""
        result = today_ist()
        assert result == now_ist().date()
