"""
Email service — sends invoice notifications via SMTP.
If SMTP_HOST is not configured, it logs the email to console instead.
"""
import logging
import smtplib
from email.message import EmailMessage
import os

logger = logging.getLogger(__name__)

async def send_invoice_email(
    to_email: str,
    invoice_number: str,
    balance_amount: float,
    due_date: str,
    pdf_path: str,
    company_name: str,
    currency: str = "INR",
) -> bool:
    """
    Send an invoice notification with attached PDF via email.
    Returns True on success, False otherwise.
    """
    from app.config import settings

    if not to_email:
        logger.error("[Email] Cannot send invoice: missing recipient email.")
        return False

    host = settings.SMTP_HOST
    port = settings.SMTP_PORT
    user = settings.SMTP_USER
    password = settings.SMTP_PASSWORD
    from_email = settings.SMTP_FROM_EMAIL or "noreply@transportportal.com"

    symbol = "₹" if currency == "INR" else currency
    balance_str = f"{symbol}{balance_amount:,.2f}"

    subject = f"Invoice {invoice_number} from {company_name}"
    
    body = f"""
    <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #1e3a8a;">Invoice from {company_name}</h2>
        <p>Hello,</p>
        <p>Please find attached your invoice <strong>{invoice_number}</strong>.</p>
        <ul style="list-style: none; padding-left: 0;">
            <li><strong>Balance Due:</strong> {balance_str}</li>
            <li><strong>Due Date:</strong> {due_date}</li>
        </ul>
        <p>For any queries, please reply to this email or contact us directly.</p>
        <br/>
        <p>Thank you,<br/><strong>{company_name}</strong></p>
    </div>
    """

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{company_name} <{from_email}>"
    msg["To"] = to_email
    
    msg.set_content("Please enable HTML to view this email.")
    msg.add_alternative(body, subtype="html")

    # Attach the PDF
    if pdf_path and os.path.exists(pdf_path):
        try:
            with open(pdf_path, "rb") as f:
                pdf_data = f.read()
            msg.add_attachment(
                pdf_data,
                maintype="application",
                subtype="pdf",
                filename=f"{invoice_number}.pdf",
            )
        except Exception as e:
            logger.error(f"[Email] Failed to attach PDF {pdf_path}: {e}")

    # If no SMTP configured, just log it
    if not host or not user or not password:
        logger.warning(
            "[Email] SMTP credentials not configured. Skipping actual email send. "
            f"Would have sent email to {to_email} with subject: {subject}"
        )
        return True # Pretend success for local testing

    # Send the email
    try:
        # Use STARTTLS if port is 587, otherwise standard SSL for 465
        if port == 465:
            server = smtplib.SMTP_SSL(host, port)
        else:
            server = smtplib.SMTP(host, port)
            server.starttls()
            
        server.login(user, password)
        server.send_message(msg)
        server.quit()
        
        logger.info(f"[Email] Invoice {invoice_number} sent to {to_email} successfully.")
        return True
    except Exception as exc:
        logger.error(f"[Email] Failed to send email to {to_email}: {exc}")
        return False
