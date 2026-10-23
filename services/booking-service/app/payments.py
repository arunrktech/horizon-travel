"""Payment providers.

payment_mode=mock    imitates Stripe's hosted checkout with a test page in the
                     frontend (/pay/mock). No card data exists anywhere.
payment_mode=stripe  creates a Stripe Checkout Session. Card details are typed
                     on Stripe's page, never in this application, which keeps
                     the agency out of PCI DSS scope for card storage.
"""
import uuid
from datetime import datetime, timedelta, timezone

from horizon_common.config import get_settings
from horizon_common.errors import ApiError

from .models import BookingRow


def create_checkout(booking: BookingRow) -> tuple[str, str, str]:
    """Returns (provider, session_id, checkout_url)."""
    s = get_settings()
    if s.payment_mode == "mock":
        session_id = f"mock_{uuid.uuid4().hex}"
        url = f"{s.frontend_url}/pay/mock?bookingId={booking.id}&sessionId={session_id}"
        return "mock", session_id, url

    import stripe

    if not s.stripe_secret_key:
        raise ApiError(500, "PAYMENTS_NOT_CONFIGURED", "Payments are not configured on the server.")
    stripe.api_key = s.stripe_secret_key
    session = stripe.checkout.Session.create(
        mode="payment",
        client_reference_id=str(booking.id),
        customer_email=booking.lead_traveller.get("email"),
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": booking.currency.lower(),
                    "unit_amount": item.price_cents,
                    "product_data": {"name": item.title[:120]},
                },
            }
            for item in booking.items
        ],
        metadata={"bookingId": str(booking.id), "reference": booking.reference},
        success_url=f"{s.frontend_url}/trips/{booking.id}?payment=success",
        cancel_url=f"{s.frontend_url}/checkout?bookingId={booking.id}&payment=cancelled",
        expires_at=int((datetime.now(timezone.utc) + timedelta(minutes=30)).timestamp()),
    )
    return "stripe", session.id, session.url


def parse_webhook(payload: bytes, signature: str | None) -> tuple[str, str]:
    """Verify Stripe's signature and return (event_type, checkout_session_id)."""
    s = get_settings()
    import stripe

    if not s.stripe_webhook_secret:
        raise ApiError(500, "PAYMENTS_NOT_CONFIGURED", "Stripe webhook secret is not configured.")
    try:
        event = stripe.Webhook.construct_event(payload, signature or "", s.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise ApiError(400, "INVALID_SIGNATURE", "Webhook signature check failed.")
    obj = event["data"]["object"]
    return event["type"], obj.get("id", "")
