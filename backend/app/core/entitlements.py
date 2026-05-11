"""
Centralized plan entitlements — single source of truth for plan-based feature gating.

Instead of hardcoding `if plan == "PRO"`, all plan capabilities are defined here.
The subscription_plans DB table stores the actual limits, but this module provides
the entitlement lookup logic and default feature definitions.

Usage:
    from app.core.entitlements import get_plan_features, PLAN_FEATURES
    features = get_plan_features("pro")
    if features["qr_attendance"]:
        ...
"""

from typing import Any

# Default feature definitions per plan tier.
# These are fallback values — the DB subscription_plans table is the real source.
# This dict is used for documentation and as a reference when seeding plans.
PLAN_FEATURES: dict[str, dict[str, Any]] = {
    "starter": {
        "max_members": 100,
        "max_staff_users": 2,
        "sms_notifications": False,
        "advanced_reports": False,
        "qr_attendance": False,
        "advanced_analytics": False,
        "export_reports": False,
        "multi_branch": False,
        "automated_whatsapp": False,
    },
    "pro": {
        "max_members": 500,
        "max_staff_users": 5,
        "sms_notifications": True,
        "advanced_reports": True,
        "qr_attendance": True,
        "advanced_analytics": True,
        "export_reports": True,
        "multi_branch": False,
        "automated_whatsapp": False,
    },
    "elite": {
        "max_members": 99999,  # effectively unlimited
        "max_staff_users": 99999,
        "sms_notifications": True,
        "advanced_reports": True,
        "qr_attendance": True,
        "advanced_analytics": True,
        "export_reports": True,
        "multi_branch": True,
        "automated_whatsapp": True,
    },
}


def get_plan_features(tier: str) -> dict[str, Any]:
    """Get feature map for a plan tier. Falls back to starter if unknown."""
    return PLAN_FEATURES.get(tier, PLAN_FEATURES["starter"])


def is_feature_enabled(tier: str, feature_name: str) -> bool:
    """Check if a specific feature is enabled for a plan tier."""
    features = get_plan_features(tier)
    return bool(features.get(feature_name, False))
