import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import get_settings

settings = get_settings()


def _is_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_from)


async def _send(to: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        use_tls=settings.smtp_tls,
        start_tls=settings.smtp_starttls,
    )


async def send_verification_email(to_email: str, full_name: str, token: str) -> None:
    if not _is_configured():
        return
    link = f"{settings.app_url}/verify-email?token={token}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#4f46e5">Verify your email</h2>
      <p>Hi {full_name},</p>
      <p>Thanks for signing up for <strong>ENV Manager</strong>. Click the button below
         to verify your email address. The link expires in 24 hours.</p>
      <p style="margin:24px 0">
        <a href="{link}"
           style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;
                  text-decoration:none;font-weight:bold">
          Verify Email
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">Or copy this link:<br>{link}</p>
    </div>
    """
    await _send(to_email, "Verify your ENV Manager email", html)


async def send_password_reset_email(to_email: str, full_name: str, token: str) -> None:
    if not _is_configured():
        return
    link = f"{settings.app_url}/reset-password?token={token}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#4f46e5">Reset your password</h2>
      <p>Hi {full_name},</p>
      <p>We received a request to reset your <strong>ENV Manager</strong> password.
         Click the button below — the link expires in <strong>1 hour</strong>.</p>
      <p style="margin:24px 0">
        <a href="{link}"
           style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;
                  text-decoration:none;font-weight:bold">
          Reset Password
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">Or copy this link:<br>{link}</p>
      <p style="color:#6b7280;font-size:13px">
        If you did not request a password reset, you can ignore this email.
      </p>
    </div>
    """
    await _send(to_email, "Reset your ENV Manager password", html)
