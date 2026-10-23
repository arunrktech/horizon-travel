import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from horizon_common.db import Base

SCHEMA = {"schema": "booking"}


class BookingRow(Base):
    __tablename__ = "bookings"
    __table_args__ = SCHEMA

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String, unique=True)
    customer_id: Mapped[uuid.UUID]
    customer_sub: Mapped[str]
    status: Mapped[str]
    total_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    lead_traveller: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["BookingItemRow"]] = relationship(back_populates="booking", lazy="selectin", order_by="BookingItemRow.start_at")
    payments: Mapped[list["PaymentRow"]] = relationship(back_populates="booking", lazy="selectin", order_by="PaymentRow.created_at")


class BookingItemRow(Base):
    __tablename__ = "booking_items"
    __table_args__ = SCHEMA

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("booking.bookings.id", ondelete="CASCADE"))
    type: Mapped[str]
    supplier_ref: Mapped[str]
    title: Mapped[str]
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    price_cents: Mapped[int] = mapped_column(Integer)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    booking: Mapped[BookingRow] = relationship(back_populates="items")


class PaymentRow(Base):
    __tablename__ = "payments"
    __table_args__ = SCHEMA

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("booking.bookings.id", ondelete="CASCADE"))
    provider: Mapped[str]
    session_id: Mapped[str] = mapped_column(String, unique=True)
    status: Mapped[str]
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    booking: Mapped[BookingRow] = relationship(back_populates="payments")


class IdempotencyKeyRow(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = SCHEMA

    key: Mapped[str] = mapped_column(String, primary_key=True)
    customer_sub: Mapped[str]
    request_hash: Mapped[str]
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("booking.bookings.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutboxRow(Base):
    __tablename__ = "outbox"
    __table_args__ = SCHEMA

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str]
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
