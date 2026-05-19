"""
Minimal conftest for unit tests that don't require a database.

The parent conftest (tests/conftest.py) gracefully skips DB setup when
PostgreSQL is unavailable, so these tests will run regardless.
"""
