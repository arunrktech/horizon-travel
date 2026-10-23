"""Configuration read from environment variables only.

Nothing secret is ever hard coded. In AWS, ECS task definitions inject plain
values as environment variables and secrets (DATABASE_URL, STRIPE keys,
INTERNAL_TOKEN) from AWS Secrets Manager.
"""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    service_name: str = "horizon-service"
    environment: Literal["local", "dev", "prod"] = "local"
    log_level: str = "INFO"

    # Data stores
    database_url: str | None = None
    redis_url: str = "redis://localhost:6379/0"

    # Authentication: "dev" accepts mock tokens for local work, "cognito" verifies real JWTs.
    auth_mode: Literal["dev", "cognito"] = "dev"
    aws_region: str = "us-east-1"
    cognito_user_pool_id: str | None = None
    cognito_client_id: str | None = None
    cognito_staff_group: str = "staff"

    # Shared secret for service to service calls on /internal routes
    internal_token: str = "local-internal-token-change-me"

    # Events: "redis" for local, "aws" for SNS publish and SQS consume
    event_backend: Literal["redis", "aws"] = "redis"
    sns_topic_arn: str | None = None
    sqs_queue_url: str | None = None

    # Documents: "local" folder for local, "s3" in AWS
    storage_backend: Literal["local", "s3"] = "local"
    s3_bucket: str | None = None
    local_storage_dir: str = "./.data/documents"

    # Email: "log" prints emails, "ses" sends through Amazon SES
    email_backend: Literal["log", "ses"] = "log"
    ses_from_address: str = "bookings@horizontravel.example"

    # Payments: "mock" simulates the hosted checkout, "stripe" uses Stripe Checkout
    payment_mode: Literal["mock", "stripe"] = "mock"
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None

    # Where other services and the browser app live
    frontend_url: str = "http://localhost:5173"
    public_api_url: str = ""  # empty means links are relative to the site (same origin behind CloudFront)
    search_service_url: str = "http://localhost:8001"
    booking_service_url: str = "http://localhost:8002"
    customer_service_url: str = "http://localhost:8003"
    document_service_url: str = "http://localhost:8004"

    # Fernet key for encrypting passport numbers at rest (from Secrets Manager in AWS)
    pii_encryption_key: str | None = None

    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
