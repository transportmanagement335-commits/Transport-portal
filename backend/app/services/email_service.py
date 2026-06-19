"""
Email service — sends invoice emails using aiosmtplib (async SMTP).
SMTP config is loaded from environment variables via app.config.settings.
"""
import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)


def _build_html(
    invoice_number: str,
    recipient_name: str,
    total_amount: float,
    due_date: str,
    currency: str,
    pdf_download_url: Optional[str],
    issuer_name: str,
) -> str:
    symbol = "₹" if currency == "INR" else currency
    pdf_button = ""
    if pdf_download_url:
        pdf_button = f"""
        <a href="{pdf_download_url}" style="
            display: inline-block;
            margin-top: 20px;
            padding: 12px 28px;
            background: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 15px;
        ">📄 Download Invoice PDF</a>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px;
                  box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e40af, #2563eb); padding: 32px 40px; color: white;">
          <div style="font-size: 13px; opacity: 0.85; margin-bottom: 6px;">INVOICE</div>
          <div style="font-size: 26px; font-weight: 700;">{invoice_number}</div>
          <div style="font-size: 13px; opacity: 0.75; margin-top: 4px;">from {issuer_name}</div>
        </div>

        <!-- Body -->
        <div style="padding: 32px 40px;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 12px;">
            Dear <strong>{recipient_name}</strong>,
          </p>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
            Please find your invoice details below. Kindly arrange for payment before the due date.
          </p>

          <!-- Invoice Summary Card -->
          <div style="background: #eff6ff; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="color: #6b7280; font-size: 13px; padding: 6px 0;">Invoice Number</td>
                <td style="color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">{invoice_number}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-size: 13px; padding: 6px 0;">Amount Due</td>
                <td style="color: #2563eb; font-size: 20px; font-weight: 700; text-align: right;">{symbol}{total_amount:,.2f}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-size: 13px; padding: 6px 0;">Due Date</td>
                <td style="color: #dc2626; font-size: 13px; font-weight: 600; text-align: right;">{due_date}</td>
              </tr>
            </table>
          </div>

          {pdf_button}

          <p style="color: #6b7280; font-size: 13px; margin-top: 28px; line-height: 1.6;">
            If you have any questions about this invoice, please don't hesitate to contact us.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f1f5f9; padding: 20px 40px; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
            This is an automated invoice email from {issuer_name} via Transport Portal.
            Please do not reply to this email.
          </p>
        </div>

      </div>
    </body>
    </html>
    """


async def send_invoice_email(
    to_email: str,
    invoice_number: str,
    recipient_name: str,
    total_amount: float,
    due_date: str,
    currency: str,
    issuer_name: str,
    pdf_download_url: Optional[str] = None,
) -> bool:
    """
    Send an HTML invoice email via async SMTP (aiosmtplib).
    Returns True on success, False on failure (non-fatal — log and continue).
    """
    try:
        import aiosmtplib

        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_password = os.getenv("SMTP_PASSWORD", "")
        from_name = os.getenv("SMTP_FROM_NAME", "Transport Portal")

        if not smtp_user or not smtp_password:
            logger.warning("SMTP credentials not configured — skipping email send.")
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Invoice {invoice_number} from {issuer_name}"
        msg["From"] = f"{from_name} <{smtp_user}>"
        msg["To"] = to_email

        html_content = _build_html(
            invoice_number=invoice_number,
            recipient_name=recipient_name,
            total_amount=total_amount,
            due_date=due_date,
            currency=currency,
            pdf_download_url=pdf_download_url,
            issuer_name=issuer_name,
        )

        msg.attach(MIMEText(html_content, "html"))

        await aiosmtplib.send(
            msg,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True,
        )
        logger.info(f"Invoice email sent to {to_email} for {invoice_number}")
        return True

    except Exception as e:
        logger.error(f"Failed to send invoice email: {e}")
        return False
