"""
Messaging Service — sends WhatsApp messages via n8n webhook.

The backend POSTs to your n8n webhook with:
    { "to": "whatsapp:+91XXXXXXXXXX", "message": "..." }

n8n then routes this through a WhatsApp node (Twilio / WhatsApp Business API).

All public functions are fire-and-forget (log errors, never raise).
Trip creation will NEVER fail because of a messaging error.
"""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Core WhatsApp sender — POSTs to Meta Graph API
# ──────────────────────────────────────────────────────────────────────────────

def _send_whatsapp(to_phone: str, body: str) -> bool:
    """
    Send a WhatsApp message via Meta Graph API (WhatsApp Business API).
    """
    try:
        import requests
        import re
        from app.config import settings

        # Clean phone number (add 91 if 10 digits)
        digits = re.sub(r"\D", "", to_phone)
        if len(digits) == 10:
            digits = "91" + digits
        wa_to = digits

        # Print to terminal for local debugging
        print("\n" + "="*55)
        print(f"💬 WHATSAPP → {wa_to}")
        print("-" * 55)
        print(body)
        print("="*55 + "\n")

        token = getattr(settings, "WHATSAPP_API_TOKEN", None)
        phone_number_id = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)

        if not token or not phone_number_id:
            logger.warning("WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set. Message printed to terminal only.")
            return True

        url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "to": wa_to,
            "type": "text",
            "text": {"preview_url": False, "body": body},
        }

        response = requests.post(url, json=payload, headers=headers, timeout=10)

        if response.status_code in (200, 201):
            logger.info(f"WhatsApp sent to {wa_to} via Meta API | Status: {response.status_code}")
            return True
        else:
            logger.error(f"Meta Graph API failed for {wa_to}: {response.status_code} - {response.text}")
            return False

    except Exception as e:
        logger.error(f"Failed to send WhatsApp to {to_phone}: {e}")
        return False



# ──────────────────────────────────────────────────────────────────────────────
# Public message functions
# ──────────────────────────────────────────────────────────────────────────────

def send_driver_trip_message(driver: dict, trip: dict, vehicle: dict) -> bool:
    """
    Send a trip assignment WhatsApp to the driver.
    Triggered immediately when a trip is created.

    driver:  dict with keys — name, phone
    trip:    dict with keys — client_name, pickup_location, drop_location, reporting_time, notes
    vehicle: dict with keys — number, type
    """
    reporting_dt = trip.get("reporting_time")
    reporting_str = (
        reporting_dt.strftime("%d %b %Y, %I:%M %p")
        if isinstance(reporting_dt, datetime)
        else str(reporting_dt)
    )

    body = (
        f"🚗 *New Trip Assigned*\n"
        f"Vehicle: {vehicle.get('number', 'N/A')} ({vehicle.get('type', 'N/A')})\n"
        f"Client: {trip.get('client_name', 'N/A')}\n"
        f"Pickup: {trip.get('pickup_location', 'N/A')}\n"
        f"Drop: {trip.get('drop_location', 'N/A')}\n"
        f"Reporting Time: {reporting_str}\n"
    )
    if trip.get("notes"):
        body += f"Notes: {trip['notes']}\n"
    body += "Please be ready 15 min early. ✅"

    return _send_whatsapp(driver["phone"], body)


def send_client_booking_message(trip: dict, vehicle: dict, payment_link: str) -> bool:
    """
    Send a booking confirmation WhatsApp to the client.
    Triggered immediately when a trip is created.

    trip:    dict with keys — client_name, client_phone, driver_name, driver_phone,
                              pickup_location, drop_location, reporting_time, balance_amount
    vehicle: dict with keys — number, type
    """
    reporting_dt = trip.get("reporting_time")
    reporting_str = (
        reporting_dt.strftime("%d %b %Y, %I:%M %p")
        if isinstance(reporting_dt, datetime)
        else str(reporting_dt)
    )

    balance     = trip.get("balance_amount", 0) or 0
    balance_str = f"Rs.{balance:,.0f}" if balance > 0 else "No balance due"

    body = (
        f"✅ *Booking Confirmed!*\n"
        f"Driver: {trip.get('driver_name', 'N/A')} | Ph: {trip.get('driver_phone', 'N/A')}\n"
        f"Vehicle: {vehicle.get('number', 'N/A')} ({vehicle.get('type', 'N/A')})\n"
        f"Pickup: {trip.get('pickup_location', 'N/A')}\n"
        f"Reporting Time: {reporting_str}\n"
        f"Balance Due: {balance_str}\n"
    )
    if balance > 0 and payment_link:
        body += f"Pay here: {payment_link}"

    return _send_whatsapp(trip["client_phone"], body)


def send_driver_reminder(driver_phone: str, driver_name: str, trip: dict, hours_before: int) -> bool:
    """
    Send a duty reminder WhatsApp to the driver.
    Called by APScheduler at 2hr and 1hr before reporting_time.

    driver_phone:  str — driver's phone number
    driver_name:   str — driver's name (for personalisation)
    trip:          dict with keys — client_name, vehicle_number, pickup_location,
                                    drop_location, reporting_time
    hours_before:  int — 2 or 1 (used in message text)
    """
    reporting_dt = trip.get("reporting_time")
    reporting_str = (
        reporting_dt.strftime("%I:%M %p")
        if isinstance(reporting_dt, datetime)
        else str(reporting_dt)
    )

    body = (
        f"⏰ *Duty Reminder — {hours_before} Hour{'s' if hours_before > 1 else ''} to go!*\n"
        f"Hi {driver_name}, your trip starts soon.\n"
        f"Client: {trip.get('client_name', 'N/A')}\n"
        f"Vehicle: {trip.get('vehicle_number', 'N/A')}\n"
        f"Pickup: {trip.get('pickup_location', 'N/A')}\n"
        f"Reporting at: {reporting_str}\n"
        f"Please be ready on time! 🙏"
    )

    return _send_whatsapp(driver_phone, body)


def send_otp_message(phone: str, otp_code: str) -> bool:
    """
    Send an OTP via WhatsApp.
    """
    body = (
        f"🔒 *Transport Portal Login*\n\n"
        f"Your One-Time Password (OTP) is: *{otp_code}*\n\n"
        f"This OTP is valid for 5 minutes. Do not share this code with anyone."
    )
    return _send_whatsapp(phone, body)
