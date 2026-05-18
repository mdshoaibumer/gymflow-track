"""
Tests for app.schemas.validators — shared validation helpers.

Coverage:
1. Password strength validation (min/max length, complexity)
2. Valid passwords pass through
3. Too short passwords rejected
4. Too long passwords rejected
5. Missing uppercase, lowercase, digit cases
"""

import pytest
from unittest.mock import patch  # noqa: F401

from app.schemas.validators import validate_password_strength


class TestPasswordStrengthValidation:
    """Password policy enforcement."""

    def test_valid_password_passes(self):
        result = validate_password_strength("StrongPass1")
        assert result == "StrongPass1"

    def test_valid_complex_password(self):
        result = validate_password_strength("MyP@ssw0rd!SecureEnough")
        assert result == "MyP@ssw0rd!SecureEnough"

    def test_minimum_valid_password(self):
        """Exactly at minimum length with all requirements."""
        result = validate_password_strength("Abcdef1x")
        assert result == "Abcdef1x"

    def test_too_short_password_rejected(self):
        with pytest.raises(ValueError, match="at least"):
            validate_password_strength("Ab1")

    def test_too_long_password_rejected(self):
        long_password = "A" * 100 + "a1" + "x" * 30
        with pytest.raises(ValueError, match="at most"):
            validate_password_strength(long_password)

    def test_missing_uppercase_rejected(self):
        with pytest.raises(ValueError, match="uppercase"):
            validate_password_strength("alllowercase1")

    def test_missing_lowercase_rejected(self):
        with pytest.raises(ValueError, match="lowercase"):
            validate_password_strength("ALLUPPERCASE1")

    def test_missing_digit_rejected(self):
        with pytest.raises(ValueError, match="digit"):
            validate_password_strength("NoDigitsHere")

    def test_only_digits_rejected(self):
        with pytest.raises(ValueError, match="uppercase"):
            validate_password_strength("123456789")

    def test_spaces_allowed_in_password(self):
        """Spaces are valid — NIST recommends allowing passphrases."""
        result = validate_password_strength("My Pass 1word")
        assert result == "My Pass 1word"

    def test_special_characters_allowed(self):
        result = validate_password_strength("Test!@#$%1")
        assert result == "Test!@#$%1"

    def test_unicode_characters_allowed(self):
        """Unicode passwords should be accepted if they meet rules."""
        result = validate_password_strength("Tëst1ñgPàss")
        assert result == "Tëst1ñgPàss"
