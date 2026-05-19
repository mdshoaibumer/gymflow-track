"""Minimal conftest for unit tests that don't require a database."""

import pytest


@pytest.fixture(autouse=True)
def _skip_db_setup():
    """Override the session-scoped DB setup from the parent conftest."""
    pass
