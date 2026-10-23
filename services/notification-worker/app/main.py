"""Notification worker: consumes booking events from SQS (or the local queue),
writes itinerary and invoice PDFs to S3, registers them with the document
service, and emails the traveller through Amazon SES.

It has no public API. GET /health exists only so ECS and the load balancer can
check that the container is alive.
"""
import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx

from horizon_common import events, storage
from horizon_common.app import create_app
from horizon_common.auth import internal_headers
from horizon_common.config import get_settings

from .emails import send_email
from .pdfs import invoice_pdf, itinerary_pdf

logger = logging.getLogger("notification.worker")
_stop = threading.Event()
stats = {"processed": 0, "failed": 0}


def _register(booking: dict, kind: str, key: str, file_name: str) -> None:
    resp = httpx.post(
        f"{get_settings().document_service_url}/internal/documents",
        json={"bookingId": booking["bookingId"], "customerSub": booking["customerSub"], "kind": kind,
              "storageKey": key, "fileName": file_name},
        headers=internal_headers(), timeout=10,
    )
    resp.raise_for_status()


def on_confirmed(b: dict) -> None:
    ref = b["reference"]
    issued = datetime.now(timezone.utc)
    for kind, data in (("itinerary", itinerary_pdf(b)), ("invoice", invoice_pdf(b, issued))):
        file_name = f"{kind}-{ref}.pdf"
        key = f"bookings/{b['bookingId']}/{file_name}"
        storage.put_object(key, data, "application/pdf")
        _register(b, kind, key, file_name)
    lead = b["leadTraveller"]
    trip_url = f"{get_settings().frontend_url}/trips/{b['bookingId']}"
    lines = "\n".join(f"  {i['title']}" for i in b["items"])
    send_email(
        to=lead["email"],
        subject=f"Booking confirmed: {ref}",
        text=(f"Hi {lead['firstName']},\n\nYour trip is confirmed. Booking reference {ref}.\n\n{lines}\n\n"
              f"Total paid: {b['currency']} {b['totalCents'] / 100:,.2f}\n\n"
              f"Your itinerary and invoice are ready: {trip_url}\n\nHorizon Travel Services"),
    )


def on_cancelled(b: dict) -> None:
    lead = b["leadTraveller"]
    send_email(
        to=lead["email"],
        subject=f"Booking cancelled: {b['reference']}",
        text=(f"Hi {lead['firstName']},\n\nBooking {b['reference']} has been cancelled. If you paid for it, "
              "a refund is being processed and will reach your card within 5 to 10 business days.\n\nHorizon Travel Services"),
    )


HANDLERS = {"booking.confirmed": on_confirmed, "booking.cancelled": on_cancelled}


def handle(event: events.Event) -> None:
    handler = HANDLERS.get(event.type)
    if handler is None:
        logger.info("Ignoring event", extra={"extra_fields": {"eventType": event.type}})
        return
    try:
        handler(event.data)
        stats["processed"] += 1
        logger.info("Handled event", extra={"extra_fields": {"eventType": event.type, "reference": event.data.get("reference")}})
    except Exception:
        stats["failed"] += 1
        raise


def _run() -> None:
    while not _stop.is_set():
        try:
            events.consume_forever(handle, _stop.is_set)
        except Exception:
            logger.exception("Consumer crashed; restarting in 5 seconds")
            _stop.wait(5)


@asynccontextmanager
async def lifespan(_app):
    thread = threading.Thread(target=_run, name="consumer", daemon=True)
    thread.start()
    yield
    _stop.set()


app = create_app("notification-worker", "Background worker. No public API.", lifespan=lifespan)


@app.get("/internal/stats", tags=["internal"])
def worker_stats():
    return stats
