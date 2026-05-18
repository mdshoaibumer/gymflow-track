"""
Tests for app.core.exceptions — domain exception hierarchy.

Coverage:
1. Each exception type can be instantiated with detail message
2. Exception inheritance hierarchy
3. Default detail messages
"""

import pytest

from app.core.exceptions import (
    AccountDisabledError,
    AlreadyExistsError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    GymFlowException,
    NotFoundError,
    ValidationError,
)


class TestGymFlowException:
    """Base exception behavior."""

    def test_default_detail(self):
        exc = GymFlowException()
        assert exc.detail == "An error occurred"

    def test_custom_detail(self):
        exc = GymFlowException("Custom error message")
        assert exc.detail == "Custom error message"

    def test_str_representation(self):
        exc = GymFlowException("Test error")
        assert str(exc) == "Test error"


class TestExceptionHierarchy:
    """All domain exceptions inherit from GymFlowException."""

    @pytest.mark.parametrize("exc_class", [
        NotFoundError,
        AlreadyExistsError,
        AuthenticationError,
        AuthorizationError,
        AccountDisabledError,
        ValidationError,
        ConflictError,
    ])
    def test_inherits_from_base(self, exc_class):
        exc = exc_class("test")
        assert isinstance(exc, GymFlowException)
        assert isinstance(exc, Exception)

    @pytest.mark.parametrize("exc_class", [
        NotFoundError,
        AlreadyExistsError,
        AuthenticationError,
        AuthorizationError,
        AccountDisabledError,
        ValidationError,
        ConflictError,
    ])
    def test_detail_attribute(self, exc_class):
        exc = exc_class("Specific error detail")
        assert exc.detail == "Specific error detail"


class TestSpecificExceptions:
    """Each exception type carries its detail."""

    def test_not_found(self):
        exc = NotFoundError("Member not found")
        assert exc.detail == "Member not found"

    def test_already_exists(self):
        exc = AlreadyExistsError("Email already registered")
        assert exc.detail == "Email already registered"

    def test_authentication_error(self):
        exc = AuthenticationError("Invalid token")
        assert exc.detail == "Invalid token"

    def test_authorization_error(self):
        exc = AuthorizationError("Insufficient permissions")
        assert exc.detail == "Insufficient permissions"

    def test_account_disabled(self):
        exc = AccountDisabledError("Account has been deactivated")
        assert exc.detail == "Account has been deactivated"

    def test_validation_error(self):
        exc = ValidationError("Membership already expired")
        assert exc.detail == "Membership already expired"

    def test_conflict_error(self):
        exc = ConflictError("Version mismatch")
        assert exc.detail == "Version mismatch"
