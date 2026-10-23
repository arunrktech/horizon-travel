"""Booking service: creates bookings, takes payment, cancels. Owns the "booking" schema."""
import logging
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone

from fastapi import Depends, Header, Query, Request, Response
from sqlalchemy import and_, func, or_, select, true
from sqlalchemy.orm import Session

from horizon_common import events
from horizon_common.app import create_app
from horizon_common.auth import Principal, current_principal, require_staff
from horizon_common.config import get_settings
from horizon_common.db import get_session, init_db
from horizon_common.errors import ApiError, conflict, not_found
from horizon_common.models import Page

from . import payments, service
from .models import BookingItemRow, BookingRow, OutboxRow
from .schemas import Booking, BookingStats, CheckoutResponse, CreateBookingRequest, Departure, MockPaymentRequest

logger = logging.getLogger("booking.main")
_stop = threading.Event()


def _background_loop() -> None:
    """Outbox relay (every 2 s) and pending booking expiry (every 60 s)."""
    from horizon_common import db

    last_sweep = 0.0
    while not _stop.wait(2):
        session = next(db.get_session())
        try:
            rows = session.scalars(
                select(OutboxRow).where(OutboxRow.published_at.is_(None)).order_by(OutboxRow.created_at)
                .limit(20).with_for_update(skip_locked=True)
            ).all()
            for row in rows:
                try:
                    events.publish(row.event_type, row.payload)
                    row.published_at = datetime.now(timezone.utc)
                except Exception:
                    row.attempts += 1
                    logger.exception("Outbox publish failed; will retry")
            session.commit()
            now = datetime.now().timestamp()
            if now - last_sweep > 60:
                last_sweep = now
                expired = service.expire_stale_pending(session)
                if expired:
                    logger.info("Expired pending bookings", extra={"extra_fields": {"count": expired}})
        except Exception:
            session.rollback()
            logger.exception("Background loop error")
        finally:
            session.close()


@asynccontextmanager
async def lifespan(_app):
    init_db()
    worker = threading.Thread(target=_background_loop, name="outbox-relay", daemon=True)
    worker.start()
    yield
    _stop.set()


app = create_app("booking-service", "Bookings, payments and cancellations. Path prefix /api/bookings.", lifespan=lifespan)


def to_api(b: BookingRow) -> Booking:
    payment = b.payments[-1] if b.payments else None
    return Booking.model_validate({
        "id": b.id, "reference": b.reference, "status": b.status, "customer_id": b.customer_id,
        "lead_traveller": b.lead_traveller, "items": b.items, "total_cents": b.total_cents, "currency": b.currency,
        "payment": {"provider": payment.provider, "status": payment.status, "amount_cents": payment.amount_cents,
                    "updated_at": payment.updated_at} if payment else None,
        "created_at": b.created_at, "updated_at": b.updated_at, "confirmed_at": b.confirmed_at, "cancelled_at": b.cancelled_at,
    })


@app.post("/api/bookings", response_model=Booking, status_code=201, tags=["bookings"])
def create_booking(
    body: CreateBookingRequest,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: Principal = Depends(current_principal),
    session: Session = Depends(get_session),
):
    if not idempotency_key:
        raise ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header (a new UUID per checkout attempt).")
    try:
        uuid.UUID(idempotency_key)
    except ValueError:
        raise ApiError(400, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be a UUID.")
    booking, created = service.create_booking(session, principal, body, idempotency_key)
    if not created:
        response.status_code = 200
    return to_api(booking)


@app.get("/api/bookings/stats", response_model=BookingStats, tags=["bookings"], dependencies=[Depends(require_staff)])
def stats(session: Session = Depends(get_session)):
    now = datetime.now(timezone.utc)
    today = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    month = today.replace(day=1)
    soon = now + timedelta(days=14)
    departures = session.execute(
        select(BookingRow.id, BookingRow.reference, BookingRow.lead_traveller, BookingItemRow.title, BookingItemRow.start_at)
        .join(BookingItemRow, BookingItemRow.booking_id == BookingRow.id)
        .where(BookingRow.status == "CONFIRMED", BookingItemRow.start_at.between(now, soon))
        .order_by(BookingItemRow.start_at)
    ).all()
    count = lambda *conds: session.scalar(select(func.count()).select_from(BookingRow).where(*conds)) or 0  # noqa: E731
    return BookingStats(
        bookings_today=count(BookingRow.created_at >= today, BookingRow.status.in_(["CONFIRMED", "PENDING_PAYMENT"])),
        revenue_month_cents=session.scalar(
            select(func.coalesce(func.sum(BookingRow.total_cents), 0)).where(BookingRow.status == "CONFIRMED", BookingRow.confirmed_at >= month)
        ),
        currency="USD",
        upcoming_departures=len({d.id for d in departures}),
        next_departures=[
            Departure(booking_id=d.id, reference=d.reference, title=d.title, start_at=d.start_at,
                      traveller_name=f"{d.lead_traveller.get('firstName', '')} {d.lead_traveller.get('lastName', '')}".strip())
            for d in departures[:6]
        ],
        failed_payments_last_30_days=count(BookingRow.status == "FAILED", BookingRow.created_at >= now - timedelta(days=30)),
        pending_payment=count(BookingRow.status == "PENDING_PAYMENT"),
    )


@app.get("/api/bookings", response_model=Page[Booking], tags=["bookings"],
         summary="Staff see every booking; customers see only their own")
def list_bookings(
    customer_id: uuid.UUID | None = Query(default=None, alias="customerId"),
    status: str | None = Query(default=None),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    query: str | None = Query(default=None, description="Reference or traveller name"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    principal: Principal = Depends(current_principal),
    session: Session = Depends(get_session),
):
    conds = []
    if not principal.is_staff:
        conds.append(BookingRow.customer_sub == principal.sub)
    elif customer_id:
        conds.append(BookingRow.customer_id == customer_id)
    if status:
        conds.append(BookingRow.status == status.upper())
    if from_:
        conds.append(BookingRow.created_at >= datetime.combine(from_, time.min, tzinfo=timezone.utc))
    if to:
        conds.append(BookingRow.created_at < datetime.combine(to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    if query:
        like = f"%{query.strip().lower()}%"
        conds.append(or_(
            func.lower(BookingRow.reference).like(like),
            func.lower(BookingRow.lead_traveller["firstName"].astext + " " + BookingRow.lead_traveller["lastName"].astext).like(like),
            func.lower(BookingRow.lead_traveller["email"].astext).like(like),
        ))
    where = and_(*conds) if conds else true()
    total = session.scalar(select(func.count()).select_from(BookingRow).where(where)) or 0
    rows = session.scalars(select(BookingRow).where(where).order_by(BookingRow.created_at.desc())
                           .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [to_api(r) for r in rows], "page": page, "pageSize": page_size, "total": total}


@app.get("/api/bookings/{booking_id}", response_model=Booking, tags=["bookings"])
def get_booking(booking_id: uuid.UUID, principal: Principal = Depends(current_principal), session: Session = Depends(get_session)):
    return to_api(service.get_owned(session, booking_id, principal))


@app.post("/api/bookings/{booking_id}/checkout", response_model=CheckoutResponse, tags=["bookings"])
def checkout(booking_id: uuid.UUID, principal: Principal = Depends(current_principal), session: Session = Depends(get_session)):
    booking = service.get_owned(session, booking_id, principal, lock=True)
    if booking.status != "PENDING_PAYMENT":
        raise conflict("NOT_PAYABLE", f"This booking is {booking.status.lower().replace('_', ' ')} and cannot be paid.")
    provider, session_id, url = payments.create_checkout(booking)
    service.start_checkout(session, booking, provider, session_id)
    return CheckoutResponse(checkout_url=url, session_id=session_id)


@app.post("/api/bookings/{booking_id}/cancel", response_model=Booking, tags=["bookings"])
def cancel(booking_id: uuid.UUID, principal: Principal = Depends(current_principal), session: Session = Depends(get_session)):
    booking = service.get_owned(session, booking_id, principal, lock=True)
    return to_api(service.cancel_booking(session, booking))


@app.post("/api/bookings/{booking_id}/mock-payment", response_model=Booking, tags=["payments"],
          summary="Local and demo only: completes a mock checkout session (404 when payment_mode=stripe)")
def mock_payment(booking_id: uuid.UUID, body: MockPaymentRequest, principal: Principal = Depends(current_principal),
                 session: Session = Depends(get_session)):
    if get_settings().payment_mode != "mock":
        raise not_found("Route")
    booking = service.get_owned(session, booking_id, principal)
    if not any(p.session_id == body.session_id for p in booking.payments):
        raise not_found("Payment session")
    return to_api(service.complete_payment(session, body.session_id, body.outcome == "succeeded"))


@app.post("/api/bookings/webhooks/stripe", tags=["payments"], summary="Stripe webhook (signature verified, no user token)")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
                         session: Session = Depends(get_session)):
    event_type, session_id = payments.parse_webhook(await request.body(), stripe_signature)
    if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        service.complete_payment(session, session_id, succeeded=True)
    elif event_type in ("checkout.session.expired", "checkout.session.async_payment_failed"):
        service.complete_payment(session, session_id, succeeded=False)
    return {"received": True}
