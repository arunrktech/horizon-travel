"""Document service: itineraries and invoices. Owns the "document" schema.

Files live in Amazon S3 (encrypted with KMS, public access blocked). The API
hands out short lived links: S3 presigned URLs in AWS, or HMAC signed links
served by this service when running locally.
"""
import hashlib
import hmac
import time
import uuid
from datetime import datetime
from typing import Literal

from fastapi import Depends, Query
from fastapi.responses import Response
from sqlalchemy import DateTime, String, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Mapped, Session, mapped_column

from horizon_common import storage
from horizon_common.app import create_app
from horizon_common.auth import Principal, current_principal, require_internal
from horizon_common.config import get_settings
from horizon_common.db import Base, get_session, init_db
from horizon_common.errors import ApiError, not_found
from horizon_common.models import ApiModel

app = create_app("document-service", "Itineraries and invoices. Path prefix /api/documents.")
LINK_TTL_SECONDS = 300


@app.on_event("startup")
def _startup() -> None:
    init_db()


class DocumentRow(Base):
    __tablename__ = "documents"
    __table_args__ = {"schema": "document"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID]
    customer_sub: Mapped[str]
    kind: Mapped[str]
    storage_key: Mapped[str] = mapped_column(String, unique=True)
    file_name: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Document(ApiModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    kind: Literal["itinerary", "invoice"]
    file_name: str
    created_at: datetime
    download_url: str


class RegisterDocument(ApiModel):
    booking_id: uuid.UUID
    customer_sub: str
    kind: Literal["itinerary", "invoice"]
    storage_key: str
    file_name: str


def _sign(doc_id: str, expires: int) -> str:
    key = get_settings().internal_token.encode()
    return hmac.new(key, f"{doc_id}:{expires}".encode(), hashlib.sha256).hexdigest()


def _download_url(row: DocumentRow) -> str:
    s = get_settings()
    if s.storage_backend == "s3":
        return storage.presigned_url(row.storage_key, row.file_name, LINK_TTL_SECONDS)
    expires = int(time.time()) + LINK_TTL_SECONDS
    return f"{s.public_api_url}/api/documents/{row.id}/download?expires={expires}&sig={_sign(str(row.id), expires)}"


@app.get("/api/documents", response_model=list[Document], tags=["documents"])
def list_documents(booking_id: uuid.UUID = Query(alias="bookingId"), principal: Principal = Depends(current_principal),
                   session: Session = Depends(get_session)):
    stmt = select(DocumentRow).where(DocumentRow.booking_id == booking_id)
    if not principal.is_staff:
        stmt = stmt.where(DocumentRow.customer_sub == principal.sub)
    rows = session.scalars(stmt.order_by(DocumentRow.kind.desc())).all()
    return [Document(id=r.id, booking_id=r.booking_id, kind=r.kind, file_name=r.file_name, created_at=r.created_at,
                     download_url=_download_url(r)) for r in rows]


@app.get("/api/documents/{document_id}/download", tags=["documents"], summary="Signed download link (local storage mode)")
def download(document_id: uuid.UUID, expires: int, sig: str, session: Session = Depends(get_session)):
    if expires < time.time() or not hmac.compare_digest(sig, _sign(str(document_id), expires)):
        raise ApiError(403, "LINK_EXPIRED", "This download link has expired. Open the booking again for a fresh link.")
    row = session.get(DocumentRow, document_id)
    if row is None:
        raise not_found("Document")
    try:
        data = storage.read_local(row.storage_key)
    except FileNotFoundError:
        raise not_found("Document file")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{row.file_name}"'})


@app.post("/internal/documents", response_model=Document, tags=["internal"], dependencies=[Depends(require_internal)],
          summary="Register a generated file (called by notification-worker)")
def register(body: RegisterDocument, session: Session = Depends(get_session)):
    stmt = insert(DocumentRow).values(
        id=uuid.uuid4(), booking_id=body.booking_id, customer_sub=body.customer_sub, kind=body.kind,
        storage_key=body.storage_key, file_name=body.file_name,
    ).on_conflict_do_update(
        index_elements=["booking_id", "kind"], set_={"storage_key": body.storage_key, "file_name": body.file_name}
    ).returning(DocumentRow.id)
    doc_id = session.scalar(stmt)
    session.commit()
    row = session.get(DocumentRow, doc_id)
    return Document(id=row.id, booking_id=row.booking_id, kind=row.kind, file_name=row.file_name, created_at=row.created_at,
                    download_url=_download_url(row))
