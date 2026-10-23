"""Booking rules, kept apart from the HTTP layer so they can be unit tested."""
import hashlib
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from horizon_common.auth import Principal
from horizon_common.errors import ApiError, conflict, forbidden, not_found

from . import clients
from .models import BookingItemRow, BookingRow, IdempotencyKeyRow, OutboxRow, PaymentRow
from .schemas import CreateBookingRequest

logger = logging.getLogger("booking.service")
PENDING_TTL = timedelta(minutes=30)
REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I to avoid misreading over the phone


def new_reference() -> str:
    return "HZ-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def request_hash(body: CreateBookingRequest) -> str:
    canonical = json.dumps(body.model_dump(mode="json", by_alias=True), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def booking_event(b: BookingRow) -> dict:
    return {
        "bookingId": str(b.id), "reference": b.reference, "status": b.status, "customerId": str(b.customer_id),
        "customerSub": b.customer_sub, "leadTraveller": b.lead_traveller, "totalCents": b.total_cents, "currency": b.currency,
        "items": [
            {"type": i.type, "title": i.title, "supplierRef": i.supplier_ref, "priceCents": i.price_cents,
             "startAt": i.start_at.isoformat() if i.start_at else None, "endAt": i.end_at.isoformat() if i.end_at else None,
             "details": i.details}
            for i in b.items
        ],
    }


def get_owned(session: Session, booking_id: uuid.UUID, principal: Principal, lock: bool = False) -> BookingRow:
    stmt = select(BookingRow).where(BookingRow.id == booking_id)
    if lock:
        stmt = stmt.with_for_update()
    booking = session.scalar(stmt)
    if booking is None:
        raise not_found("Booking")
    if not principal.is_staff and booking.customer_sub != principal.sub:
        raise forbidden()
    return booking


def create_booking(session: Session, principal: Principal, body: CreateBookingRequest, idem_key: str) -> tuple[BookingRow, bool]:
    """Returns (booking, created). Replaying the same Idempotency-Key returns the original booking."""
    digest = request_hash(body)
    existing = session.get(IdempotencyKeyRow, idem_key)
    if existing:
        if existing.customer_sub != principal.sub or existing.request_hash != digest:
            raise conflict("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.")
        return session.get(BookingRow, existing.booking_id), False

    refs = [i.supplier_ref for i in body.items]
    if len(set(refs)) != len(refs):
        raise ApiError(422, "DUPLICATE_ITEM", "The same offer appears twice in this trip.")

    # Prices come from the search service's held offers, never from the browser.
    offers = [clients.held_offer(item.supplier_ref) for item in body.items]
    for item, offer in zip(body.items, offers):
        if offer["type"] != item.type:
            raise ApiError(422, "ITEM_TYPE_MISMATCH", f"Offer {item.supplier_ref} is not a {item.type}.")
    currencies = {o["currency"] for o in offers}
    if len(currencies) != 1:
        raise ApiError(422, "MIXED_CURRENCY", "All items in one booking must use the same currency.")

    customer = clients.ensure_customer(principal, body.lead_traveller.phone)
    booking = BookingRow(
        reference=new_reference(), customer_id=uuid.UUID(customer["id"]), customer_sub=principal.sub,
        status="PENDING_PAYMENT", total_cents=sum(o["priceCents"] for o in offers), currency=currencies.pop(),
        lead_traveller=body.lead_traveller.model_dump(mode="json", by_alias=True),
    )
    booking.items = [
        BookingItemRow(type=o["type"], supplier_ref=o["supplierRef"], title=o["title"], start_at=o["startAt"], end_at=o["endAt"],
                       price_cents=o["priceCents"], details=o["details"])
        for o in offers
    ]
    session.add(booking)
    try:
        session.flush()
        session.add(IdempotencyKeyRow(key=idem_key, customer_sub=principal.sub, request_hash=digest, booking_id=booking.id))
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        text = str(exc.orig)
        if "booking_items_supplier_ref_active_uq" in text:
            raise conflict("OFFER_ALREADY_BOOKED", "Someone has just booked one of these offers. Search again to pick another.")
        if "idempotency_keys_pkey" in text:  # a parallel retry won the race: return its booking
            winner = session.get(IdempotencyKeyRow, idem_key)
            return session.get(BookingRow, winner.booking_id), False
        if "bookings_reference_key" in text:
            raise ApiError(503, "RETRY", "Please try again.")
        raise
    session.refresh(booking)
    logger.info("Booking created", extra={"extra_fields": {"bookingId": str(booking.id), "reference": booking.reference}})
    return booking, True


def start_checkout(session: Session, booking: BookingRow, provider: str, session_id: str) -> None:
    session.add(PaymentRow(booking_id=booking.id, provider=provider, session_id=session_id, status="PENDING",
                           amount_cents=booking.total_cents, currency=booking.currency))
    session.commit()


def _release(booking: BookingRow) -> None:
    for item in booking.items:
        item.active = False


def complete_payment(session: Session, session_id: str, succeeded: bool) -> BookingRow:
    """Called by the Stripe webhook (or the mock page). Safe to call twice."""
    payment = session.scalar(select(PaymentRow).where(PaymentRow.session_id == session_id).with_for_update())
    if payment is None:
        raise not_found("Payment session")
    booking = session.scalar(select(BookingRow).where(BookingRow.id == payment.booking_id).with_for_update())
    if payment.status in ("PAID", "FAILED"):
        return booking  # duplicate webhook delivery
    now = datetime.now(timezone.utc)
    if succeeded and booking.status == "PENDING_PAYMENT":
        payment.status = "PAID"
        booking.status = "CONFIRMED"
        booking.confirmed_at = now
        session.flush()
        session.add(OutboxRow(event_type="booking.confirmed", payload=booking_event(booking)))
    elif succeeded:
        # Paid after the booking expired or was cancelled: record it and flag for refund.
        payment.status = "REFUND_PENDING"
    else:
        payment.status = "FAILED"
        if booking.status == "PENDING_PAYMENT":
            booking.status = "FAILED"
            _release(booking)
            session.add(OutboxRow(event_type="booking.failed", payload=booking_event(booking)))
    session.commit()
    session.refresh(booking)
    return booking


def cancel_booking(session: Session, booking: BookingRow) -> BookingRow:
    if booking.status in ("CANCELLED", "FAILED"):
        raise conflict("NOT_CANCELLABLE", f"This booking is already {booking.status.lower()}.")
    booking.status = "CANCELLED"
    booking.cancelled_at = datetime.now(timezone.utc)
    _release(booking)
    for payment in booking.payments:
        if payment.status == "PAID":
            payment.status = "REFUND_PENDING"
    session.flush()
    session.add(OutboxRow(event_type="booking.cancelled", payload=booking_event(booking)))
    session.commit()
    session.refresh(booking)
    return booking


def expire_stale_pending(session: Session) -> int:
    """Pending bookings older than 30 minutes release their offers."""
    cutoff = datetime.now(timezone.utc) - PENDING_TTL
    stale = session.scalars(
        select(BookingRow).where(BookingRow.status == "PENDING_PAYMENT", BookingRow.created_at < cutoff).with_for_update(skip_locked=True)
    ).all()
    for booking in stale:
        booking.status = "FAILED"
        _release(booking)
        session.execute(update(PaymentRow).where(PaymentRow.booking_id == booking.id, PaymentRow.status == "PENDING").values(status="FAILED"))
    session.commit()
    return len(stale)
