"""Unit tests for booking rules that need no database or network.

Run from services/booking-service:  pytest -q
"""
import re

import pytest
from pydantic import ValidationError

from app.schemas import CreateBookingRequest
from app.service import REF_ALPHABET, new_reference, request_hash

BODY = {
    "leadTraveller": {"firstName": "Priya", "lastName": "Shah", "email": "priya@example.com", "phone": "+1 617 555 0142"},
    "items": [{"type": "flight", "supplierRef": "FL-ABC123"}, {"type": "accommodation", "supplierRef": "HT-DEF456"}],
}


def test_reference_format_avoids_ambiguous_characters():
    for _ in range(500):
        ref = new_reference()
        assert re.fullmatch(r"HZ-[A-Z2-9]{6}", ref)
        assert not set(ref[3:]) & set("01OI")
    assert "O" not in REF_ALPHABET and "0" not in REF_ALPHABET


def test_request_hash_is_stable_and_detects_changes():
    a = request_hash(CreateBookingRequest.model_validate(BODY))
    b = request_hash(CreateBookingRequest.model_validate({**BODY}))
    assert a == b
    changed = {**BODY, "items": BODY["items"][:1]}
    assert request_hash(CreateBookingRequest.model_validate(changed)) != a


def test_request_hash_ignores_surrounding_whitespace_in_names():
    padded = {**BODY, "leadTraveller": {**BODY["leadTraveller"], "firstName": "  Priya "}}
    assert request_hash(CreateBookingRequest.model_validate(padded)) == request_hash(CreateBookingRequest.model_validate(BODY))


@pytest.mark.parametrize("bad", [
    {**BODY, "items": []},
    {**BODY, "items": [{"type": "cruise", "supplierRef": "CR-1234"}]},
    {**BODY, "leadTraveller": {**BODY["leadTraveller"], "email": "not-an-email"}},
    {**BODY, "leadTraveller": {**BODY["leadTraveller"], "phone": "12"}},
])
def test_invalid_requests_are_rejected(bad):
    with pytest.raises(ValidationError):
        CreateBookingRequest.model_validate(bad)


def test_prices_cannot_be_sent_by_the_browser():
    """Items carry only a supplier reference; any price field is ignored, so the server always re-prices."""
    body = {**BODY, "items": [{"type": "flight", "supplierRef": "FL-ABC123", "priceCents": 1}]}
    parsed = CreateBookingRequest.model_validate(body)
    assert "price_cents" not in parsed.items[0].model_dump()
