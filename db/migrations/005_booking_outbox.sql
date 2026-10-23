-- Transactional outbox for booking-service.
-- Events are written in the same transaction as the booking change, then a
-- relay publishes them to SNS. A crash between commit and publish can no
-- longer lose a "booking.confirmed" event.
CREATE TABLE IF NOT EXISTS booking.outbox (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    text NOT NULL,
    payload       jsonb NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    published_at  timestamptz,
    attempts      integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON booking.outbox (created_at) WHERE published_at IS NULL;
