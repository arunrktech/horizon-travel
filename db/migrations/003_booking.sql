-- Owned by booking-service
CREATE TABLE IF NOT EXISTS booking.bookings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       text NOT NULL UNIQUE,                   -- human friendly, e.g. HZ-7K3QPD
    customer_id     uuid NOT NULL,                          -- id in customer-service (no cross schema FK)
    customer_sub    text NOT NULL,
    status          text NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'FAILED')),
    total_cents     integer NOT NULL CHECK (total_cents >= 0),
    currency        char(3) NOT NULL,
    lead_traveller  jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    confirmed_at    timestamptz,
    cancelled_at    timestamptz
);
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON booking.bookings (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_status_idx   ON booking.bookings (status, created_at DESC);

CREATE TABLE IF NOT EXISTS booking.booking_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    uuid NOT NULL REFERENCES booking.bookings (id) ON DELETE CASCADE,
    type          text NOT NULL CHECK (type IN ('flight', 'accommodation', 'activity')),
    supplier_ref  text NOT NULL,
    title         text NOT NULL,
    start_at      timestamptz,
    end_at        timestamptz,
    price_cents   integer NOT NULL CHECK (price_cents >= 0),
    details       jsonb NOT NULL DEFAULT '{}'::jsonb,
    active        boolean NOT NULL DEFAULT true             -- false once the booking is cancelled or failed
);
CREATE INDEX IF NOT EXISTS booking_items_booking_idx ON booking.booking_items (booking_id);
-- Double booking protection: one supplier hold can belong to only one live booking.
CREATE UNIQUE INDEX IF NOT EXISTS booking_items_supplier_ref_active_uq
    ON booking.booking_items (supplier_ref) WHERE active;

CREATE TABLE IF NOT EXISTS booking.payments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    uuid NOT NULL REFERENCES booking.bookings (id) ON DELETE CASCADE,
    provider      text NOT NULL CHECK (provider IN ('stripe', 'mock')),
    session_id    text NOT NULL UNIQUE,
    status        text NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUND_PENDING')),
    amount_cents  integer NOT NULL,
    currency      char(3) NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_booking_idx ON booking.payments (booking_id);

-- Idempotency: the same Idempotency-Key always returns the same booking.
CREATE TABLE IF NOT EXISTS booking.idempotency_keys (
    key           text PRIMARY KEY,
    customer_sub  text NOT NULL,
    request_hash  text NOT NULL,
    booking_id    uuid NOT NULL REFERENCES booking.bookings (id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now()
);
