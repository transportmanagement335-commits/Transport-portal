"""
WhatsApp service — sends invoice notifications via WhatsApp Business API (Meta Graph API).

Flow:
  1. Send a text message summarising the invoice
  2. Send a document message containing the PDF download link

If WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID are not configured, all calls
log a warning and return False without raising an exception.
"""
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Phone number normalisation
# ──────────────────────────────────────────────────────────────────────────────

def _clean_phone(phone: str) -> str:
    """
    Strip non-digit characters and ensure a country code is present.
    Indian numbers without a leading '91' get one prepended automatically.
    Examples:
        "+91 98765 43210" → "919876543210"
        "9876543210"      → "919876543210"
        "919876543210"    → "919876543210"
    """
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        # Bare 10-digit Indian number — prepend country code
        digits = "91" + digits
    return digits


# ──────────────────────────────────────────────────────────────────────────────
# Core send helpers
# ──────────────────────────────────────────────────────────────────────────────

async def _post_whatsapp(payload: dict, token: str, phone_number_id: str) -> bool:
    """POST a single message payload to the Meta Graph API. Returns True on success."""
    try:
        import aiohttp
    except ImportError:
        logger.error("aiohttp is not installed. Run: pip install aiohttp")
        return False

    url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                body = await resp.json()
                if resp.status in (200, 201):
                    logger.info(f"[WhatsApp] Message sent successfully: {body.get('messages', [{}])[0].get('id', '?')}")
                    return True
                else:
                    logger.error(f"[WhatsApp] API error {resp.status}: {body}")
                    return False
    except Exception as exc:
        logger.error(f"[WhatsApp] Request failed: {exc}")
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

async def send_invoice_whatsapp(
    to_phone: str,
    invoice_number: str,
    total_amount: float,
    due_date: str,
    pdf_url: Optional[str],
    company_name: str,
    currency: str = "INR",
) -> bool:
    """
    Send an invoice notification via WhatsApp Business API.

    Args:
        to_phone:       Customer's phone number (any format — will be normalised).
        invoice_number: e.g. "INV-2026-0001"
        total_amount:   Total bill amount as float.
        due_date:       Human-readable date string, e.g. "15 Jul 2026".
        pdf_url:        Full public URL to the PDF, or None if not yet generated.
        company_name:   Issuing company name shown in the message.
        currency:       "INR" or other currency code.

    Returns True if ALL messages sent successfully, False otherwise.
    """
    from app.config import settings

    token          = settings.WHATSAPP_API_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID

    if not token or not phone_number_id:
        logger.warning(
            "[WhatsApp] WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured — "
            "skipping WhatsApp send. Set them in your .env file."
        )
        return False

    to_number = _clean_phone(to_phone)
    if not to_number:
        logger.error(f"[WhatsApp] Cannot parse phone number: {to_phone!r}")
        return False

    symbol = "₹" if currency == "INR" else currency
    total_str = f"{symbol}{total_amount:,.2f}"

    # ── Step 1: Text message ──────────────────────────────────────────────────
    text_body = (
        f"📋 *Invoice from {company_name}*\n\n"
        f"Invoice No: *{invoice_number}*\n"
        f"Amount Due: *{total_str}*\n"
        f"Due Date:   *{due_date}*\n\n"
        f"Please find your invoice PDF attached. "
        f"For any queries, reply to this message."
    )

    text_payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"preview_url": False, "body": text_body},
    }

    text_ok = await _post_whatsapp(text_payload, token, phone_number_id)

    # ── Step 2: Document message (PDF link) ───────────────────────────────────
    doc_ok = True
    if pdf_url:
        doc_payload = {
            "messaging_product": "whatsapp",
            "to": to_number,
            "type": "document",
            "document": {
                "link": pdf_url,
                "caption": f"Invoice {invoice_number} — {total_str} due {due_date}",
                "filename": f"{invoice_number}.pdf",
            },
        }
        doc_ok = await _post_whatsapp(doc_payload, token, phone_number_id)

    return text_ok and doc_ok
