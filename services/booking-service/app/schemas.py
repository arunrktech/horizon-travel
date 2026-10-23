import uuid
from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, field_validator

from horizon_common.models import ApiModel

BookingStatus = Literal["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "FAILED"]
ItemType = Literal["flight", "accommodation", "activity"]


class LeadTraveller(ApiModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=20)

    @field_validator("first_name", "last_name", "phone")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class BookingItemRequest(ApiModel):
    type: ItemType
    supplier_ref: str = Field(min_length=4, max_length=40)


class CreateBookingRequest(ApiModel):
    lead_traveller: LeadTraveller
    items: list[BookingItemRequest] = Field(min_length=1, max_length=10)


class BookingItem(ApiModel):
    id: uuid.UUID
    type: ItemType
    supplier_ref: str
    title: str
    start_at: datetime | None
    end_at: datetime | None
    price_cents: int
    details: dict


class PaymentSummary(ApiModel):
    provider: Literal["stripe", "mock"]
    status: Literal["PENDING", "PAID", "FAILED", "REFUND_PENDING"]
    amount_cents: int
    updated_at: datetime


class Booking(ApiModel):
    id: uuid.UUID
    reference: str
    status: BookingStatus
    customer_id: uuid.UUID
    lead_traveller: LeadTraveller
    items: list[BookingItem]
    total_cents: int
    currency: str
    payment: PaymentSummary | None
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None
    cancelled_at: datetime | None


class CheckoutResponse(ApiModel):
    checkout_url: str
    session_id: str


class MockPaymentRequest(ApiModel):
    session_id: str
    outcome: Literal["succeeded", "failed"] = "succeeded"


class Departure(ApiModel):
    booking_id: uuid.UUID
    reference: str
    traveller_name: str
    title: str
    start_at: datetime


class BookingStats(ApiModel):
    bookings_today: int
    revenue_month_cents: int
    currency: str
    upcoming_departures: int
    next_departures: list[Departure]
    failed_payments_last_30_days: int
    pending_payment: int
