-- Owned by document-service
CREATE TABLE IF NOT EXISTS document.documents (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    uuid NOT NULL,
    customer_sub  text NOT NULL,
    kind          text NOT NULL CHECK (kind IN ('itinerary', 'invoice')),
    storage_key   text NOT NULL UNIQUE,                     -- S3 object key
    file_name     text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (booking_id, kind)
);
CREATE INDEX IF NOT EXISTS documents_booking_idx ON document.documents (booking_id);
