# Horizon Travel

Booking website and staff back office for **Horizon Travel Services**, a 15 person travel agency in Andover, MA. Built as five Python microservices and a React frontend, designed to run on AWS (ECS on EC2, RDS, ElastiCache, SNS/SQS, S3, SES, Cognito) and to run locally with one command.

This is the application for the Horizon Travel cloud migration project. The architecture diagram is `docs/horizon-aws-architecture.drawio` (open it in draw.io).

## Architecture

| Component | Tech | Owns | Path prefix | AWS in production |
|---|---|---|---|---|
| frontend | React 18, TypeScript, Vite, Tailwind, TanStack Query | | `/` | ECS container (nginx) behind the ALB, CloudFront in front |
| search-service | Python 3.12, FastAPI | Valkey cache | `/api/search` | ECS on EC2, ElastiCache (Valkey) |
| booking-service | FastAPI, SQLAlchemy | `booking` schema | `/api/bookings` | ECS on EC2, RDS PostgreSQL, SNS, Stripe |
| customer-service | FastAPI, SQLAlchemy | `customer` schema | `/api/customers` | ECS on EC2, RDS PostgreSQL |
| document-service | FastAPI, SQLAlchemy | `document` schema | `/api/documents` | ECS on EC2, RDS PostgreSQL, S3 |
| notification-worker | FastAPI (health only), ReportLab | | none (internal) | ECS on EC2, SQS, S3, SES |

```
Browser ─ CloudFront ─ ALB ─┬─ /api/search    ─ search-service ──── ElastiCache (Valkey)
                            ├─ /api/bookings  ─ booking-service ─┬─ RDS (booking schema)
                            │                                    ├─ outbox ─ SNS ─ SQS ─ notification-worker ─ S3, SES
                            │                                    └─ Stripe Checkout + webhook
                            ├─ /api/customers ─ customer-service ── RDS (customer schema)
                            ├─ /api/documents ─ document-service ── RDS (document schema), S3 presigned links
                            └─ /             ─ frontend (nginx)
```

### Design decisions worth knowing

1. **Database per service, inside one RDS instance.** Each service has its own PostgreSQL schema and (in AWS) its own database login. Services never read each other's tables; they call each other's APIs over `/internal` routes protected by a shared token.
2. **Prices come from the server, never the browser.** A booking request carries only supplier references. The booking service re-validates each one with the search service, which holds every offer it returned for 30 minutes.
3. **Idempotent booking.** `POST /api/bookings` requires an `Idempotency-Key`. Replaying the same key returns the original booking; reusing it with a different body returns 409.
4. **No double booking.** A partial unique index on `booking_items(supplier_ref) WHERE active` lets one supplier offer belong to only one live booking. Cancelling or a failed payment releases it. Unpaid bookings expire after 30 minutes.
5. **Transactional outbox.** "Booking confirmed" events are written in the same database transaction as the status change, then relayed to SNS. A crash between commit and publish cannot lose an itinerary email.
6. **Card data never enters AWS.** Payment uses Stripe hosted Checkout; the webhook confirms the booking. This keeps the agency's PCI DSS scope minimal.
7. **Passport numbers are encrypted in the application** (Fernet key from Secrets Manager) on top of RDS encryption at rest. Only the last four characters are ever returned.
8. **Documents are private.** PDFs sit in S3 with public access blocked; the API hands out 5 minute presigned links.

## Run it

### Option 1: the whole system with Docker (recommended, works on Windows)

Requires Docker Desktop. On an 8 GB laptop, give Docker Desktop about 4 GB in Settings, Resources. Each service is capped at 256 MB.

```
docker compose up --build
```

Open http://localhost:8080. Sign in as the sample traveller or the sample staff member. Payments use a test checkout page; documents are written to a Docker volume; emails are printed in the `notification-worker` logs (`docker compose logs -f notification-worker`).

### Option 2: frontend only, on mock data

```
cd frontend
npm install
npm run dev
```

With `VITE_API_BASE_URL` empty, the app runs entirely in the browser on a mock backend that follows the same rules as the real services. Good for UI work and demos.

### Option 3: services without Docker (Linux or macOS)

Needs PostgreSQL 16 and Redis or Valkey running locally.

```
python -m venv .venv && source .venv/bin/activate
pip install -e services/common -r services/booking-service/requirements.txt -r services/customer-service/requirements.txt -r services/notification-worker/requirements.txt
scripts/run-local.sh
cd frontend && VITE_API_BASE_URL=/ npm run dev
```

The Vite dev server proxies `/api/*` to the right service by path, the same way the load balancer does. Each service's interactive API docs are at `http://localhost:800N/docs` (search 8001, booking 8002, customer 8003, document 8004).

## Tests

```
cd services/booking-service && pytest -q          # unit tests, no services needed
pytest -q tests/test_end_to_end.py                 # needs the stack running on localhost:8080
```

The end to end test walks a full booking: search, create, idempotent replay, double booking attempt, ownership check, payment, PDF generation, signed download, cancellation and rebooking.

## API contract

`frontend/src/api/types.ts` is the single source of truth. Every service mirrors it with Pydantic models using camelCase JSON.

| Service | Endpoints |
|---|---|
| Search | `GET /api/search/locations`, `GET /api/search/flights?from&to&departDate&returnDate&passengers`, `GET /api/search/hotels?city&checkIn&checkOut&guests`, `GET /api/search/activities?city&date` |
| Booking | `POST /api/bookings` (Idempotency-Key header), `GET /api/bookings/{id}`, `GET /api/bookings?customerId&status&from&to&query&page&pageSize`, `GET /api/bookings/stats` (staff), `POST /api/bookings/{id}/checkout`, `POST /api/bookings/{id}/cancel`, `POST /api/bookings/webhooks/stripe`, `POST /api/bookings/{id}/mock-payment` (mock mode only) |
| Customer | `GET /api/customers/me`, `PUT /api/customers/me`, `GET /api/customers?query&page&pageSize` (staff), `GET /api/customers/{id}` |
| Document | `GET /api/documents?bookingId`, `GET /api/documents/{id}/download` (signed link, local storage mode) |
| All | `GET /health` for load balancer health checks |

Conventions: money is integer cents plus a currency code; timestamps are ISO 8601 UTC; errors are `{"error": {"code", "message"}}`; lists are `{items, page, pageSize, total}`.

## Configuration

Every setting is an environment variable. Nothing secret is in the code. In AWS, values marked **Secret** come from AWS Secrets Manager through the ECS task definition; the rest are plain environment variables.

| Variable | Used by | Local default | In AWS |
|---|---|---|---|
| `DATABASE_URL` | booking, customer, document | compose Postgres | **Secret**: RDS endpoint with that service's own login |
| `REDIS_URL` | search, (events locally) | compose Valkey | ElastiCache primary endpoint, `rediss://` |
| `AUTH_MODE` | all | `dev` | `cognito` |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `AWS_REGION` | all | | from the Cognito user pool |
| `INTERNAL_TOKEN` | all | placeholder | **Secret** |
| `EVENT_BACKEND` | booking, worker | `redis` | `aws` |
| `SNS_TOPIC_ARN` | booking | | booking events topic |
| `SQS_QUEUE_URL` | worker | | queue subscribed to the topic, redrive to a DLQ after 3 receives |
| `STORAGE_BACKEND`, `S3_BUCKET` | document, worker | `local` | `s3`, the documents bucket |
| `EMAIL_BACKEND`, `SES_FROM_ADDRESS` | worker | `log` | `ses`, a verified sender |
| `PAYMENT_MODE` | booking | `mock` | `stripe` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | booking | | **Secret** |
| `PII_ENCRYPTION_KEY` | customer | derived dev key | **Secret** (Fernet key) |
| `FRONTEND_URL` | booking, worker | `http://localhost:8080` | the CloudFront domain |
| `*_SERVICE_URL` | booking, worker | compose service names | ECS Service Connect or internal ALB names |
| `VITE_API_BASE_URL` | frontend build | `/` | `/` (same origin through CloudFront) |

See `.env.example` for a template.

## Deploying to AWS (outline)

1. Build and push one image per service to **Amazon ECR** (`docker build -f services/booking-service/Dockerfile services`, and `frontend/`).
2. Create the network: VPC, public subnets for the ALB and NAT gateway, private app subnets for ECS, private data subnets for RDS and ElastiCache, across two Availability Zones.
3. Create **RDS PostgreSQL** (Multi AZ), **ElastiCache Valkey**, the **S3** documents bucket (block public access, KMS), the **SNS** topic and **SQS** queue with a dead letter queue, a verified **SES** sender, a **Cognito** user pool with a `staff` group, and the secrets in **Secrets Manager**.
4. Run `db/Dockerfile` once as an ECS task to apply migrations.
5. Create an **ECS cluster** with an **EC2 Auto Scaling group** capacity provider, one ECS service per container, and **ALB** listener rules by path (`/api/search*`, `/api/bookings*`, `/api/customers*`, `/api/documents*`, default to the frontend). Health checks use `/health`.
6. Put **CloudFront** with **AWS WAF** in front of the ALB, and point Stripe's webhook at `https://<domain>/api/bookings/webhooks/stripe`.

## Still to do

* Cognito sign in in the frontend: `src/auth/AuthProvider.tsx` defines the interface; the mock provider is the only implementation so far.
* A real supplier adapter (GDS) in `services/search-service/app/suppliers.py`.
* Infrastructure as code (CloudFormation or Terraform) for the steps above.

## Photo credits

Photographs are free to use under the [Unsplash License](https://unsplash.com/license): Ed Wingate, aurélie sgnl, Aayush Gupta, Chris Grant, Roméo A., Alexander Korte and v2osk. Sources are listed in `frontend/src/content/images.ts`.
