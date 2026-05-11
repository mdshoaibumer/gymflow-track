"""
Domain exceptions for GymFlow.

These exceptions represent business-rule violations and are INDEPENDENT of any
transport layer (HTTP, WebSocket, CLI).  Routers/handlers catch these and
translate them into the appropriate response format.

Why this pattern matters for SaaS:
- Services can be reused in background workers (WhatsApp, cron jobs)
- Exception semantics are clear (NotFound vs Conflict vs Unauthorized)
- Testing services doesn't require importing FastAPI
- Multiple interfaces can share the same business logic
"""


class GymFlowException(Exception):
    """Base exception for all domain errors."""

    def __init__(self, detail: str = "An error occurred"):
        self.detail = detail
        super().__init__(self.detail)


class NotFoundError(GymFlowException):
    """Resource does not exist or is not accessible to the current tenant."""

    pass


class AlreadyExistsError(GymFlowException):
    """Attempted to create a resource that violates a uniqueness constraint."""

    pass


class AuthenticationError(GymFlowException):
    """Invalid credentials or token."""

    pass


class AuthorizationError(GymFlowException):
    """User lacks permission for the requested action."""

    pass


class AccountDisabledError(GymFlowException):
    """User account has been deactivated."""

    pass


class ValidationError(GymFlowException):
    """Business rule validation failure (e.g., expired membership, invalid input)."""

    pass


class ConflictError(GymFlowException):
    """Optimistic locking conflict — raised when a concurrent update is detected.

    The client sends a `version` field with each update request. If the
    version on disk no longer matches, another user/tab modified the
    resource first. The client should refresh and retry.
    """

    pass
