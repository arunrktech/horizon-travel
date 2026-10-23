-- Owned by customer-service
CREATE TABLE IF NOT EXISTS customer.customers (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_sub                  text NOT NULL UNIQUE,          -- Cognito "sub" claim
    name                      text NOT NULL,
    email                     text NOT NULL,
    phone                     text,
    address_line              text,
    city                      text,
    postal_code               text,
    country                   text,
    passport_number_encrypted text,                          -- Fernet ciphertext, key from Secrets Manager
    passport_last4            text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_email_idx ON customer.customers (lower(email));
CREATE INDEX IF NOT EXISTS customers_name_idx  ON customer.customers (lower(name));
