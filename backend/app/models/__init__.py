"""SQLAlchemy models registry."""
from app.models.base import BaseModel
from app.models.gym import Gym
from app.models.user import User, UserRole
from app.models.member import Member, MembershipStatus
from app.models.subscription import (
    SubscriptionPlan, 
    GymSubscription, 
    Invoice, 
    BillingStatus, 
    InvoiceStatus, 
    PlanTier
)
from app.models.payment import Payment, PaymentStatus
from app.models.audit_log import AuditLog, AuditAction
from app.models.gym_audit_log import GymAuditLog, GymAuditAction
from app.models.platform_settings import PlatformSettings
from app.models.attendance import Attendance
from app.models.notification import Notification
from app.models.asset import Asset, MaintenanceRecord
from app.models.member_invoice import MemberInvoice
from app.models.whatsapp_config import WhatsAppConfig

__all__ = [
    "BaseModel",
    "Gym",
    "User",
    "UserRole",
    "Member",
    "MembershipStatus",
    "SubscriptionPlan",
    "GymSubscription",
    "Invoice",
    "BillingStatus",
    "InvoiceStatus",
    "PlanTier",
    "Payment",
    "PaymentStatus",
    "AuditLog",
    "AuditAction",
    "GymAuditLog",
    "GymAuditAction",
    "PlatformSettings",
    "Attendance",
    "Notification",
    "Asset",
    "MaintenanceRecord",
    "MemberInvoice",
    "WhatsAppConfig",
]
