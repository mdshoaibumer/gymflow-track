"""
Tests for app.core.entitlements — plan feature gating.

Coverage:
1. get_plan_features for all tiers (starter, pro, elite)
2. is_feature_enabled checks
3. Unknown tier falls back to starter
4. Feature flag boundary values
"""

import pytest

from app.core.entitlements import PLAN_FEATURES, get_plan_features, is_feature_enabled


class TestGetPlanFeatures:
    """Feature map retrieval per tier."""

    def test_starter_features(self):
        features = get_plan_features("starter")
        assert features["max_members"] == 100
        assert features["max_staff_users"] == 2
        assert features["sms_notifications"] is True
        assert features["advanced_reports"] is False
        assert features["qr_attendance"] is False
        assert features["automated_whatsapp"] is False

    def test_pro_features(self):
        features = get_plan_features("pro")
        assert features["max_members"] == 500
        assert features["max_staff_users"] == 5
        assert features["advanced_reports"] is True
        assert features["qr_attendance"] is True
        assert features["advanced_analytics"] is True
        assert features["multi_branch"] is False
        assert features["automated_whatsapp"] is False

    def test_elite_features(self):
        features = get_plan_features("elite")
        assert features["max_members"] == 99999
        assert features["max_staff_users"] == 99999
        assert features["multi_branch"] is True
        assert features["automated_whatsapp"] is True

    def test_unknown_tier_falls_back_to_starter(self):
        features = get_plan_features("nonexistent_tier")
        assert features == PLAN_FEATURES["starter"]

    def test_empty_string_tier_falls_back_to_starter(self):
        features = get_plan_features("")
        assert features == PLAN_FEATURES["starter"]


class TestIsFeatureEnabled:
    """Boolean feature checks."""

    def test_enabled_feature_returns_true(self):
        assert is_feature_enabled("elite", "automated_whatsapp") is True
        assert is_feature_enabled("pro", "qr_attendance") is True

    def test_disabled_feature_returns_false(self):
        assert is_feature_enabled("starter", "advanced_reports") is False
        assert is_feature_enabled("pro", "multi_branch") is False

    def test_nonexistent_feature_returns_false(self):
        assert is_feature_enabled("elite", "nonexistent_feature") is False

    def test_unknown_tier_feature_check(self):
        # Unknown tier → starter features
        assert is_feature_enabled("unknown", "sms_notifications") is True
        assert is_feature_enabled("unknown", "advanced_reports") is False
