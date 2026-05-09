"""
Business timezone utilities.

Indian gyms operate on IST (UTC+05:30). Using date.today() on a UTC server
at 11 PM IST returns tomorrow's date. This module provides timezone-aware
date helpers to avoid subtle off-by-one bugs in membership, attendance, and
notification logic.
"""

from datetime import date, datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Current datetime in IST."""
    return datetime.now(IST)


def today_ist() -> date:
    """Current business date in IST."""
    return now_ist().date()
