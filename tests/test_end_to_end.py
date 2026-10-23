"""End to end test of the booking flow across all five services.

Needs the stack running (docker compose up, or scripts/run-local.sh) with
AUTH_MODE=dev and PAYMENT_MODE=mock. By default it calls the gateway on
http://localhost:8080; set HORIZON_API to point elsewhere, or set the
per service variables (SEARCH_URL, BOOKING_URL, CUSTOMER_URL, DOCUMENT_URL)
to call services directly.

    pip install pytest httpx
    pytest -q tests/test_end_to_end.py
"""
import datetime as dt
import os
import random
import time
import uuid

import httpx
import pytest

API = os.environ.get("HORIZON_API", "http://localhost:8080")
SEARCH = os.environ.get("SEARCH_URL", API)
BOOKING = os.environ.get("BOOKING_URL", API)
CUSTOMER = os.environ.get("CUSTOMER_URL", API)
DOCUMENT = os.environ.get("DOCUMENT_URL", API)

CUSTOMER_A = {"Authorization": "Bearer dev-customer"}
STAFF = {"Authorization": "Bearer dev-staff"}
run = uuid.uuid4().hex[:8]
CUSTOMER_B = {"Authorization": f"Bearer dev:customer:test-{run}:sam.{run}@example.com:Sam Lee"}


def _up() -> bool:
    try:
        return httpx.get(f"{BOOKING}/api/bookings/stats", headers=STAFF, timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(not _up(), reason="Horizon stack is not running")


@pytest.fixture(scope="module")
def trip():
    """Search a random future date so repeated runs never collide with earlier bookings."""
    offset = random.randint(60, 300)
    d1 = (dt.date.today() + dt.timedelta(days=offset)).isoformat()
    d2 = (dt.date.today() + dt.timedelta(days=offset + 6)).isoformat()
    flights = httpx.get(f"{SEARCH}/api/search/flights", params={"from": "BOS", "to": "LIS", "departDate": d1, "returnDate": d2, "passengers": 2}).json()["items"]
    hotels = httpx.get(f"{SEARCH}/api/search/hotels", params={"city": "Lisbon", "checkIn": d1, "checkOut": d2, "guests": 2}).json()["items"]
    out = next(f for f in flights if f["direction"] == "outbound")
    ret = next(f for f in flights if f["direction"] == "return")
    return {
        "expected": out["priceCents"] + ret["priceCents"] + hotels[0]["totalPriceCents"],
        "body": {
            "leadTraveller": {"firstName": "Priya", "lastName": "Shah", "email": "priya.shah@example.com", "phone": "+1 617 555 0142"},
            "items": [{"type": "flight", "supplierRef": out["supplierRef"]}, {"type": "flight", "supplierRef": ret["supplierRef"]},
                      {"type": "accommodation", "supplierRef": hotels[0]["supplierRef"]}],
        },
    }


def _create(body, headers, key=None):
    return httpx.post(f"{BOOKING}/api/bookings", json=body, headers={**headers, "Idempotency-Key": key or str(uuid.uuid4())})


def test_search_caches_results():
    params = {"city": "Rome", "date": (dt.date.today() + dt.timedelta(days=30)).isoformat()}
    httpx.get(f"{SEARCH}/api/search/activities", params=params)
    assert httpx.get(f"{SEARCH}/api/search/activities", params=params).json()["cached"] is True


def test_full_booking_lifecycle(trip):
    key = str(uuid.uuid4())
    created = _create(trip["body"], CUSTOMER_A, key)
    assert created.status_code == 201
    booking = created.json()
    assert booking["status"] == "PENDING_PAYMENT"
    assert booking["totalCents"] == trip["expected"], "the server must price items itself"

    # Same key, same body: the original booking comes back, nothing new is created.
    replay = _create(trip["body"], CUSTOMER_A, key)
    assert replay.status_code == 200 and replay.json()["id"] == booking["id"]

    # Same key, different body: rejected.
    reuse = _create({**trip["body"], "items": trip["body"]["items"][:1]}, CUSTOMER_A, key)
    assert reuse.status_code == 409 and reuse.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"

    # Another customer cannot take the same offers while they are held.
    clash = _create(trip["body"], CUSTOMER_B)
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "OFFER_ALREADY_BOOKED"

    # Nor read the booking.
    assert httpx.get(f"{BOOKING}/api/bookings/{booking['id']}", headers=CUSTOMER_B).status_code == 403

    # Pay through the mock checkout.
    checkout = httpx.post(f"{BOOKING}/api/bookings/{booking['id']}/checkout", headers=CUSTOMER_A).json()
    paid = httpx.post(f"{BOOKING}/api/bookings/{booking['id']}/mock-payment", json={"sessionId": checkout["sessionId"]}, headers=CUSTOMER_A).json()
    assert paid["status"] == "CONFIRMED" and paid["payment"]["status"] == "PAID"

    # The worker turns the event into two PDFs.
    docs = []
    for _ in range(20):
        docs = httpx.get(f"{DOCUMENT}/api/documents", params={"bookingId": booking["id"]}, headers=CUSTOMER_A).json()
        if len(docs) == 2:
            break
        time.sleep(1)
    assert sorted(d["kind"] for d in docs) == ["invoice", "itinerary"]
    pdf = httpx.get(docs[0]["downloadUrl"] if docs[0]["downloadUrl"].startswith("http") else f"{DOCUMENT}{docs[0]['downloadUrl']}")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    # Cancelling releases the offers and flags the refund.
    cancelled = httpx.post(f"{BOOKING}/api/bookings/{booking['id']}/cancel", headers=CUSTOMER_A).json()
    assert cancelled["status"] == "CANCELLED" and cancelled["payment"]["status"] == "REFUND_PENDING"
    assert _create(trip["body"], CUSTOMER_B).status_code == 201


def test_staff_only_routes():
    assert httpx.get(f"{BOOKING}/api/bookings/stats", headers=CUSTOMER_A).status_code == 403
    assert httpx.get(f"{CUSTOMER}/api/customers", headers=CUSTOMER_A).status_code == 403
    assert httpx.get(f"{CUSTOMER}/api/customers", headers=STAFF).status_code == 200


def test_requests_without_a_token_are_rejected():
    resp = httpx.get(f"{BOOKING}/api/bookings")
    assert resp.status_code == 401 and resp.json()["error"]["code"] == "UNAUTHORIZED"
