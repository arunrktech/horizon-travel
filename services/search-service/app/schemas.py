from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from horizon_common.models import ApiModel

T = TypeVar("T")


class Location(ApiModel):
    code: str
    city: str
    country: str
    airport: str


class FlightOffer(ApiModel):
    id: str
    supplier_ref: str
    direction: Literal["outbound", "return"]
    airline: str
    airline_code: str
    flight_number: str
    origin: str
    destination: str
    depart_at: datetime
    arrive_at: datetime
    duration_minutes: int
    stops: int
    cabin: str
    passengers: int
    price_cents: int
    currency: str
    seats_left: int


class HotelOffer(ApiModel):
    id: str
    supplier_ref: str
    name: str
    city: str
    neighbourhood: str
    stars: int
    review_score: float
    review_count: int
    room_type: str
    check_in: date
    check_out: date
    nights: int
    guests: int
    price_per_night_cents: int
    total_price_cents: int
    currency: str
    amenities: list[str]
    free_cancellation: bool


class ActivityOffer(ApiModel):
    id: str
    supplier_ref: str
    name: str
    city: str
    category: str
    date: date
    start_time: str
    duration_minutes: int
    rating: float
    price_cents: int
    currency: str
    spots_left: int


class SearchResult(ApiModel, Generic[T]):
    items: list[T]
    total: int
    cached: bool


class HeldOffer(ApiModel):
    """What the booking service gets back when it re-validates an offer."""
    supplier_ref: str
    type: Literal["flight", "accommodation", "activity"]
    title: str
    price_cents: int
    currency: str
    start_at: datetime | None
    end_at: datetime | None
    details: dict
