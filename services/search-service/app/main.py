"""Search service: flights, hotels and activities from supplier systems, cached in Valkey."""
from datetime import date, datetime, time, timezone

from fastapi import Depends, Query

from horizon_common.app import create_app
from horizon_common.auth import require_internal
from horizon_common.errors import ApiError, not_found

from . import cache
from .schemas import ActivityOffer, FlightOffer, HeldOffer, HotelOffer, Location, SearchResult
from .suppliers import BY_CITY, BY_CODE, LOCATIONS, get_supplier

app = create_app("search-service", "Searches supplier inventory and caches results. Path prefix /api/search.")
supplier = get_supplier()


def _cached(kind: str, params: dict, produce):
    key = cache.query_key(kind, params)
    hit = cache.get_json(key)
    if hit is not None:
        return hit, True
    items = [o.model_dump(mode="json", by_alias=True) for o in produce()]
    cache.set_json(key, items, cache.SEARCH_TTL)
    cache.hold_offers(items)
    return items, False


def _city(name: str) -> str:
    loc = BY_CITY.get(name.strip().lower()) or BY_CODE.get(name.strip().upper())
    if not loc:
        raise ApiError(422, "UNKNOWN_CITY", f"We do not have inventory for '{name}' yet.")
    return loc.city


@app.get("/api/search/locations", response_model=list[Location], tags=["search"], summary="Airports and cities we sell")
def locations() -> list[Location]:
    return LOCATIONS


@app.get("/api/search/flights", response_model=SearchResult[FlightOffer], tags=["search"])
def search_flights(
    from_: str = Query(alias="from", min_length=3, max_length=3, description="IATA code, e.g. BOS"),
    to: str = Query(min_length=3, max_length=3),
    depart_date: date = Query(alias="departDate"),
    return_date: date | None = Query(default=None, alias="returnDate"),
    passengers: int = Query(default=1, ge=1, le=9),
):
    origin, destination = from_.upper(), to.upper()
    if origin not in BY_CODE or destination not in BY_CODE:
        raise ApiError(422, "UNKNOWN_AIRPORT", "Choose airports from the list.")
    if origin == destination:
        raise ApiError(422, "SAME_AIRPORT", "Origin and destination must be different.")
    if depart_date < date.today():
        raise ApiError(422, "DATE_IN_PAST", "The departure date has already passed.")
    if return_date and return_date < depart_date:
        raise ApiError(422, "RETURN_BEFORE_DEPART", "The return date must be on or after the departure date.")

    def produce():
        offers = supplier.flights(origin, destination, depart_date, passengers, "outbound")
        if return_date:
            offers += supplier.flights(destination, origin, return_date, passengers, "return")
        return offers

    params = {"from": origin, "to": destination, "depart": depart_date, "return": return_date, "pax": passengers}
    items, cached = _cached("flights", params, produce)
    return {"items": items, "total": len(items), "cached": cached}


@app.get("/api/search/hotels", response_model=SearchResult[HotelOffer], tags=["search"])
def search_hotels(
    city: str = Query(min_length=2),
    check_in: date = Query(alias="checkIn"),
    check_out: date = Query(alias="checkOut"),
    guests: int = Query(default=2, ge=1, le=8),
):
    name = _city(city)
    if check_in < date.today():
        raise ApiError(422, "DATE_IN_PAST", "The check in date has already passed.")
    if check_out <= check_in:
        raise ApiError(422, "CHECKOUT_BEFORE_CHECKIN", "Check out must be after check in.")
    if (check_out - check_in).days > 30:
        raise ApiError(422, "STAY_TOO_LONG", "Stays are limited to 30 nights online. Call the agency for longer trips.")
    items, cached = _cached("hotels", {"city": name, "in": check_in, "out": check_out, "guests": guests},
                            lambda: supplier.hotels(name, check_in, check_out, guests))
    return {"items": items, "total": len(items), "cached": cached}


@app.get("/api/search/activities", response_model=SearchResult[ActivityOffer], tags=["search"])
def search_activities(city: str = Query(min_length=2), day: date = Query(alias="date")):
    name = _city(city)
    if day < date.today():
        raise ApiError(422, "DATE_IN_PAST", "That date has already passed.")
    items, cached = _cached("activities", {"city": name, "date": day}, lambda: supplier.activities(name, day))
    return {"items": items, "total": len(items), "cached": cached}


@app.get("/internal/offers/{supplier_ref}", response_model=HeldOffer, tags=["internal"],
         dependencies=[Depends(require_internal)], summary="Re-validate a held offer (called by booking-service)")
def held_offer(supplier_ref: str) -> HeldOffer:
    offer = cache.get_json(f"offer:{supplier_ref}")
    if offer is None:
        raise ApiError(404, "OFFER_EXPIRED", "This offer has expired. Search again for current prices.")
    prefix = supplier_ref.split("-", 1)[0]
    if prefix == "FL":
        return HeldOffer(
            supplier_ref=supplier_ref, type="flight", price_cents=offer["priceCents"], currency=offer["currency"],
            title=f"{offer['airline']} {offer['flightNumber']} {offer['origin']} to {offer['destination']}",
            start_at=offer["departAt"], end_at=offer["arriveAt"], details=offer,
        )
    if prefix == "HT":
        start = datetime.combine(date.fromisoformat(offer["checkIn"]), time(15), tzinfo=timezone.utc)
        end = datetime.combine(date.fromisoformat(offer["checkOut"]), time(11), tzinfo=timezone.utc)
        return HeldOffer(
            supplier_ref=supplier_ref, type="accommodation", price_cents=offer["totalPriceCents"], currency=offer["currency"],
            title=f"{offer['name']}, {offer['nights']} nights", start_at=start, end_at=end, details=offer,
        )
    hh, mm = (int(x) for x in offer["startTime"].split(":"))
    start = datetime.combine(date.fromisoformat(offer["date"]), time(hh, mm), tzinfo=timezone.utc)
    return HeldOffer(
        supplier_ref=supplier_ref, type="activity", price_cents=offer["priceCents"], currency=offer["currency"],
        title=offer["name"], start_at=start, end_at=None, details=offer,
    )
