"""
Email service using Resend for transactional emails.

Free tier: 3,000 emails/month, 100/day.
Docs: https://resend.com/docs
"""

import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_reset_email_html(reset_url: str, user_name: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
        <div style="max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: #18181b; padding: 24px 32px;">
                <h1 style="color: white; margin: 0; font-size: 20px;">{settings.APP_NAME}</h1>
            </div>
            <div style="padding: 32px;">
                <p style="color: #27272a; font-size: 16px; margin: 0 0 16px;">Hi {user_name},</p>
                <p style="color: #52525b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                    We received a request to reset your password. Click the button below to create a new password.
                    This link will expire in <strong>1 hour</strong>.
                </p>
                <a href="{reset_url}" style="display: inline-block; background: #18181b; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;">
                    Reset Password
                </a>
                <p style="color: #71717a; font-size: 12px; line-height: 1.5; margin: 24px 0 0;">
                    If you didn't request this, you can safely ignore this email. Your password won't change.
                </p>
                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
                <p style="color: #a1a1aa; font-size: 11px; margin: 0;">
                    If the button doesn't work, copy and paste this URL into your browser:<br>
                    <a href="{reset_url}" style="color: #71717a; word-break: break-all;">{reset_url}</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    """


async def send_password_reset_email(to_email: str, user_name: str, reset_token: str) -> bool:
    """
    Send a password reset email via Resend.

    Returns True if sent successfully, False otherwise.
    Falls back to logging the token in development if RESEND_API_KEY is not set.
    """
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    if not settings.RESEND_API_KEY:
        logger.warning(
            "RESEND_API_KEY not configured. Reset URL (DEV ONLY): %s", reset_url
        )
        return False

    resend.api_key = settings.RESEND_API_KEY

    try:
        await resend.Emails.send_async({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": f"Reset your {settings.APP_NAME} password",
            "html": _get_reset_email_html(reset_url, user_name),
        })
        logger.info("Password reset email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send password reset email to %s: %s", to_email, str(e))
        return False
