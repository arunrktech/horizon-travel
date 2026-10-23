"""Calls to other services. Service to service traffic stays inside the VPC
and carries the shared internal token."""
import httpx

from horizon_common.auth import Principal, internal_headers
from horizon_common.config import get_settings
from horizon_common.errors import ApiError

TIMEOUT = httpx.Timeout(5.0)


def held_offer(supplier_ref: str) -> dict:
    url = f"{get_settings().search_service_url}/internal/offers/{supplier_ref}"
    try:
        resp = httpx.get(url, headers=internal_headers(), timeout=TIMEOUT)
    except httpx.HTTPError:
        raise ApiError(503, "SEARCH_UNAVAILABLE", "We could not confirm prices right now. Please try again in a minute.")
    if resp.status_code == 404:
        raise ApiError(409, "OFFER_EXPIRED", "One of the offers in your trip has expired. Search again for current prices.")
    if resp.status_code != 200:
        raise ApiError(502, "SEARCH_ERROR", "The search service returned an error.")
    return resp.json()


def ensure_customer(principal: Principal, phone: str | None) -> dict:
    url = f"{get_settings().customer_service_url}/internal/customers/ensure"
    body = {"sub": principal.sub, "email": principal.email, "name": principal.name, "phone": phone}
    try:
        resp = httpx.post(url, json=body, headers=internal_headers(), timeout=TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPError:
        raise ApiError(503, "CUSTOMER_UNAVAILABLE", "We could not load your profile right now. Please try again in a minute.")
    return resp.json()
