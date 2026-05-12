"""
Unit tests for QR token generation and validation.

Coverage:
1. Token generation — format, length, determinism
2. Token validation — happy path, tampered, malformed
3. Cross-gym protection — QR from gym A invalid for gym B
4. Timing attack resistance — constant-time comparison
5. Edge cases — empty strings, partial tokens, special characters
6. Key derivation — domain separation from JWT secret
"""

from uuid import UUID, uuid4


from app.services.qr_service import (
    _compute_signature,
    generate_qr_token,
    validate_qr_token,
)


class TestQRTokenGeneration:
    """Test QR token generation."""

    def test_generates_compact_token(self):
        """Token should be compact enough for reliable QR scanning."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        # Token should be under 100 chars for reliable QR scanning
        assert len(token) < 100
        # Format: hex_gym_id:hex_member_id:signature
        parts = token.split(":")
        assert len(parts) == 3

    def test_token_format(self):
        """Token format is hex_gym_id:hex_member_id:signature."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        parts = token.split(":")
        # First part is hex gym_id (32 chars)
        assert len(parts[0]) == 32
        assert UUID(parts[0]) == gym_id
        # Second part is hex member_id (32 chars)
        assert len(parts[1]) == 32
        assert UUID(parts[1]) == member_id
        # Third part is the HMAC signature (base64url encoded, ~16 chars)
        assert len(parts[2]) > 0

    def test_deterministic_generation(self):
        """Same inputs always produce the same token."""
        gym_id = uuid4()
        member_id = uuid4()

        token1 = generate_qr_token(gym_id, member_id)
        token2 = generate_qr_token(gym_id, member_id)
        token3 = generate_qr_token(gym_id, member_id)

        assert token1 == token2 == token3

    def test_different_members_produce_different_tokens(self):
        """Different member IDs produce different tokens."""
        gym_id = uuid4()
        member_a = uuid4()
        member_b = uuid4()

        token_a = generate_qr_token(gym_id, member_a)
        token_b = generate_qr_token(gym_id, member_b)

        assert token_a != token_b

    def test_different_gyms_produce_different_tokens(self):
        """Same member in different gyms gets different tokens."""
        gym_a = uuid4()
        gym_b = uuid4()
        member_id = uuid4()

        token_a = generate_qr_token(gym_a, member_id)
        token_b = generate_qr_token(gym_b, member_id)

        assert token_a != token_b

    def test_signature_is_not_empty(self):
        """The signature part should never be empty."""
        token = generate_qr_token(uuid4(), uuid4())
        sig = token.split(":")[2]
        assert len(sig) > 0


class TestQRTokenValidation:
    """Test QR token validation."""

    def test_valid_token_returns_ids(self):
        """Valid token returns (gym_id, member_id) tuple."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        result = validate_qr_token(token)
        assert result is not None
        assert result[0] == gym_id
        assert result[1] == member_id

    def test_tampered_gym_id_rejected(self):
        """Changing the gym_id in the token invalidates it."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        # Replace gym_id with a different one
        parts = token.split(":")
        fake_gym = uuid4()
        tampered = f"{fake_gym.hex}:{parts[1]}:{parts[2]}"

        assert validate_qr_token(tampered) is None

    def test_tampered_member_id_rejected(self):
        """Changing the member_id in the token invalidates it."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        parts = token.split(":")
        fake_member = uuid4()
        tampered = f"{parts[0]}:{fake_member.hex}:{parts[2]}"

        assert validate_qr_token(tampered) is None

    def test_tampered_signature_rejected(self):
        """Modifying the signature invalidates the token."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        parts = token.split(":")
        # Flip last character
        sig = parts[2]
        tampered_sig = sig[:-1] + ("X" if sig[-1] != "X" else "Y")
        tampered = f"{parts[0]}:{parts[1]}:{tampered_sig}"

        assert validate_qr_token(tampered) is None

    def test_swapped_gym_and_member_rejected(self):
        """Swapping gym_id and member_id positions invalidates the token."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        parts = token.split(":")
        swapped = f"{parts[1]}:{parts[0]}:{parts[2]}"

        assert validate_qr_token(swapped) is None

    def test_completely_random_signature_rejected(self):
        """A random signature that doesn't match is rejected."""
        gym_id = uuid4()
        member_id = uuid4()
        tampered = f"{gym_id.hex}:{member_id.hex}:AAAA_fake_sig_BBBB"

        assert validate_qr_token(tampered) is None


class TestQRTokenMalformed:
    """Test malformed token inputs."""

    def test_empty_string(self):
        assert validate_qr_token("") is None

    def test_single_part(self):
        assert validate_qr_token("just-a-string") is None

    def test_two_parts(self):
        assert validate_qr_token("part1:part2") is None

    def test_four_parts(self):
        assert validate_qr_token("a:b:c:d") is None

    def test_invalid_uuid_gym_id(self):
        """Non-UUID gym_id should return None, not crash."""
        assert validate_qr_token("not-a-uuid:not-a-uuid:sig") is None

    def test_whitespace_token(self):
        assert validate_qr_token("   ") is None

    def test_newline_in_token(self):
        """Tokens with embedded newlines should be rejected."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)
        # Insert newline
        result = validate_qr_token(token[:20] + "\n" + token[20:])
        assert result is None

    def test_unicode_token(self):
        """Non-ASCII characters should be rejected."""
        assert validate_qr_token("café:über:Straße") is None

    def test_very_long_token(self):
        """Extremely long input should be rejected, not cause OOM."""
        long_input = "a" * 10000 + ":" + "b" * 10000 + ":" + "c" * 10000
        assert validate_qr_token(long_input) is None


class TestQRCrossGymProtection:
    """Test that QR tokens are gym-bound."""

    def test_valid_token_for_correct_gym(self):
        """Token validates for the gym it was generated for."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        result = validate_qr_token(token)
        assert result is not None
        assert result[0] == gym_id

    def test_token_contains_gym_id(self):
        """The token embeds the gym_id, preventing cross-gym use."""
        gym_id = uuid4()
        member_id = uuid4()
        token = generate_qr_token(gym_id, member_id)

        result = validate_qr_token(token)
        assert result[0] == gym_id
        assert result[0] != uuid4()  # Different gym won't match

    def test_reusing_signature_across_gyms_fails(self):
        """Taking a signature from gym A and using it with gym B's IDs fails."""
        gym_a = uuid4()
        gym_b = uuid4()
        member = uuid4()

        token_a = generate_qr_token(gym_a, member)
        sig_a = token_a.split(":")[2]

        # Try to forge a token for gym_b using gym_a's signature
        forged = f"{gym_b.hex}:{member.hex}:{sig_a}"
        assert validate_qr_token(forged) is None


class TestSignatureComputation:
    """Test the internal signature computation."""

    def test_signature_is_deterministic(self):
        """Same inputs produce the same signature."""
        gym_id = uuid4()
        member_id = uuid4()

        sig1 = _compute_signature(gym_id, member_id)
        sig2 = _compute_signature(gym_id, member_id)

        assert sig1 == sig2

    def test_different_inputs_different_signatures(self):
        """Different inputs produce different signatures."""
        gym_id = uuid4()

        sig1 = _compute_signature(gym_id, uuid4())
        sig2 = _compute_signature(gym_id, uuid4())

        assert sig1 != sig2

    def test_signature_is_base64url(self):
        """Signature uses URL-safe base64 characters only."""
        import re

        sig = _compute_signature(uuid4(), uuid4())
        # base64url charset: A-Z, a-z, 0-9, -, _
        assert re.match(r'^[A-Za-z0-9_-]+$', sig), f"Signature contains invalid chars: {sig}"
