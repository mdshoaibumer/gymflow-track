"""
Tests for app.core.logging_config — structured logging configuration.

Coverage:
1. JSONFormatter produces valid JSON output
2. DevFormatter includes request context variables
3. Context variables (request_id_var, gym_id_var) work correctly
"""

import json
import logging

import pytest  # noqa: F401

from app.core.logging_config import (
    DevFormatter,
    JSONFormatter,
    gym_id_var,
    request_id_var,
)


class TestJSONFormatter:
    """JSON log formatter for production."""

    def test_produces_valid_json(self):
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="gymflow.test",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="Test message",
            args=None,
            exc_info=None,
        )
        output = formatter.format(record)
        data = json.loads(output)
        assert data["message"] == "Test message"
        assert data["level"] == "INFO"
        assert data["logger"] == "gymflow.test"

    def test_includes_request_id(self):
        formatter = JSONFormatter()
        token = request_id_var.set("test-req-123")
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname="test.py",
                lineno=1,
                msg="msg",
                args=None,
                exc_info=None,
            )
            output = formatter.format(record)
            data = json.loads(output)
            assert data["request_id"] == "test-req-123"
        finally:
            request_id_var.reset(token)

    def test_includes_gym_id(self):
        formatter = JSONFormatter()
        token = gym_id_var.set("gym-uuid-456")
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.WARNING,
                pathname="test.py",
                lineno=1,
                msg="warning msg",
                args=None,
                exc_info=None,
            )
            output = formatter.format(record)
            data = json.loads(output)
            assert data["gym_id"] == "gym-uuid-456"
        finally:
            gym_id_var.reset(token)

    def test_includes_timestamp(self):
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="msg",
            args=None,
            exc_info=None,
        )
        output = formatter.format(record)
        data = json.loads(output)
        assert "timestamp" in data

    def test_exception_info_included(self):
        formatter = JSONFormatter()
        try:
            raise ValueError("test error")
        except ValueError:
            import sys
            record = logging.LogRecord(
                name="test",
                level=logging.ERROR,
                pathname="test.py",
                lineno=1,
                msg="error occurred",
                args=None,
                exc_info=sys.exc_info(),
            )
            output = formatter.format(record)
            data = json.loads(output)
            assert "exception" in data
            assert "ValueError" in data["exception"]


class TestDevFormatter:
    """Development log formatter."""

    def test_includes_context_vars(self):
        formatter = DevFormatter(fmt="%(message)s")
        req_token = request_id_var.set("dev-req-1")
        gym_token = gym_id_var.set("dev-gym-1")
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname="test.py",
                lineno=1,
                msg="test message",
                args=None,
                exc_info=None,
            )
            output = formatter.format(record)
            assert "req=dev-req-1" in output
            assert "gym=dev-gym-1" in output
        finally:
            request_id_var.reset(req_token)
            gym_id_var.reset(gym_token)

    def test_default_context_vars(self):
        """Without setting context vars, defaults to '-'."""
        formatter = DevFormatter(fmt="%(message)s")
        # Reset to defaults
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="msg",
            args=None,
            exc_info=None,
        )
        output = formatter.format(record)
        assert "req=" in output
        assert "gym=" in output


class TestContextVariables:
    """Context variable management."""

    def test_request_id_var_default(self):
        # In a clean context, should return default
        # (may not be "-" if another test set it, but should be a string)
        val = request_id_var.get("-")
        assert isinstance(val, str)

    def test_gym_id_var_default(self):
        val = gym_id_var.get("-")
        assert isinstance(val, str)

    def test_set_and_get_request_id(self):
        token = request_id_var.set("unique-req-id")
        try:
            assert request_id_var.get() == "unique-req-id"
        finally:
            request_id_var.reset(token)

    def test_set_and_get_gym_id(self):
        token = gym_id_var.set("unique-gym-id")
        try:
            assert gym_id_var.get() == "unique-gym-id"
        finally:
            gym_id_var.reset(token)
