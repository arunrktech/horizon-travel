-- One PostgreSQL database (Amazon RDS), one schema per microservice.
-- Each service reads and writes only its own schema. Services that need
-- another service's data call that service's API instead.
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS customer;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS document;

-- In AWS, create one login role per service and grant it only its schema, for example:
--   CREATE ROLE booking_svc LOGIN PASSWORD '<from Secrets Manager>';
--   GRANT USAGE ON SCHEMA booking TO booking_svc;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA booking TO booking_svc;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA booking GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO booking_svc;
-- Each service's DATABASE_URL then uses its own role.
