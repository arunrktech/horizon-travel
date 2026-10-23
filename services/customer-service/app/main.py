"""Customer service: traveller profiles. Owns the "customer" schema.

Passport numbers are encrypted in the application with a Fernet key held in
AWS Secrets Manager (PII_ENCRYPTION_KEY) before they reach the database, on
top of RDS encryption at rest. Only the last four digits are ever returned.
"""
import base64
import hashlib
import uuid
from datetime import datetime

from cryptography.fernet import Fernet
from fastapi import Depends, Query
from sqlalchemy import DateTime, String, func, or_, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from horizon_common.app import create_app
from horizon_common.auth import Principal, current_principal, require_internal, require_staff
from horizon_common.config import get_settings
from horizon_common.db import Base, get_session, init_db
from horizon_common.errors import ApiError, forbidden, not_found
from horizon_common.models import ApiModel, Page

app = create_app("customer-service", "Customer profiles. Path prefix /api/customers.")


@app.on_event("startup")
def _startup() -> None:
    init_db()


class CustomerRow(Base):
    __tablename__ = "customers"
    __table_args__ = {"schema": "customer"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    auth_sub: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str]
    email: Mapped[str]
    phone: Mapped[str | None]
    address_line: Mapped[str | None]
    city: Mapped[str | None]
    postal_code: Mapped[str | None]
    country: Mapped[str | None]
    passport_number_encrypted: Mapped[str | None]
    passport_last4: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Customer(ApiModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None = None
    address_line: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    passport_last4: str | None = None
    created_at: datetime


class CustomerUpdate(ApiModel):
    name: str | None = None
    phone: str | None = None
    address_line: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    passport_number: str | None = None


class EnsureCustomer(ApiModel):
    sub: str
    email: str
    name: str
    phone: str | None = None


def _fernet() -> Fernet:
    s = get_settings()
    if s.pii_encryption_key:
        return Fernet(s.pii_encryption_key)
    if s.environment != "local":
        raise ApiError(500, "PII_KEY_MISSING", "Encryption key is not configured.")
    # Local development only: a fixed key derived from the service name.
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"horizon-local-pii").digest()))


def _upsert(session: Session, sub: str, email: str, name: str, phone: str | None = None) -> CustomerRow:
    row = session.scalar(select(CustomerRow).where(CustomerRow.auth_sub == sub))
    if row is None:
        row = CustomerRow(auth_sub=sub, email=email, name=name or email, phone=phone)
        session.add(row)
        session.commit()
        session.refresh(row)
    elif phone and not row.phone:
        row.phone = phone
        session.commit()
    return row


@app.get("/api/customers/me", response_model=Customer, tags=["customers"])
def get_me(principal: Principal = Depends(current_principal), session: Session = Depends(get_session)):
    return _upsert(session, principal.sub, principal.email, principal.name)


@app.put("/api/customers/me", response_model=Customer, tags=["customers"])
def update_me(body: CustomerUpdate, principal: Principal = Depends(current_principal), session: Session = Depends(get_session)):
    row = _upsert(session, principal.sub, principal.email, principal.name)
    for field in ("name", "phone", "address_line", "city", "postal_code", "country"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value.strip() or None)
    if body.passport_number:
        number = body.passport_number.replace(" ", "").upper()
        if not (6 <= len(number) <= 12 and number.isalnum()):
            raise ApiError(422, "INVALID_PASSPORT", "Passport numbers are 6 to 12 letters and digits.")
        row.passport_number_encrypted = _fernet().encrypt(number.encode()).decode()
        row.passport_last4 = number[-4:]
    session.commit()
    session.refresh(row)
    return row


@app.get("/api/customers", response_model=Page[Customer], tags=["customers"], dependencies=[Depends(require_staff)])
def list_customers(
    query: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    session: Session = Depends(get_session),
):
    stmt = select(CustomerRow)
    if query:
        like = f"%{query.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(CustomerRow.name).like(like), func.lower(CustomerRow.email).like(like), CustomerRow.phone.like(like)))
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = session.scalars(stmt.order_by(CustomerRow.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": rows, "page": page, "pageSize": page_size, "total": total}


@app.get("/api/customers/{customer_id}", response_model=Customer, tags=["customers"])
def get_customer(customer_id: uuid.UUID, principal: Principal = Depends(current_principal), session: Session = Depends(get_session)):
    row = session.get(CustomerRow, customer_id)
    if row is None:
        raise not_found("Customer")
    if not principal.is_staff and row.auth_sub != principal.sub:
        raise forbidden()
    return row


@app.post("/internal/customers/ensure", response_model=Customer, tags=["internal"], dependencies=[Depends(require_internal)],
          summary="Find or create the customer for a signed in user (called by booking-service)")
def ensure_customer(body: EnsureCustomer, session: Session = Depends(get_session)):
    return _upsert(session, body.sub, body.email, body.name, body.phone)
