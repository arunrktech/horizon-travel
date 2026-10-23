"""Authentication shared by all services.

auth_mode=dev     accepts the mock tokens the frontend issues in local mode:
                  "dev-customer", "dev-staff", or "dev:<role>:<sub>:<email>:<name>".
auth_mode=cognito verifies Amazon Cognito JWTs (RS256) against the user pool's
                  public keys, checks issuer, expiry and client id, and maps the
                  "staff" Cognito group to the staff role.

Internal routes (service to service) require the X-Internal-Token header.
"""
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

import jwt
from fastapi import Depends, Header

from .config import get_settings
from .errors import ApiError, forbidden

Role = Literal["customer", "staff"]


@dataclass(frozen=True)
class Principal:
    sub: str
    email: str
    name: str
    role: Role

    @property
    def is_staff(self) -> bool:
        return self.role == "staff"


DEV_USERS = {
    "dev-customer": Principal("dev-customer-1", "priya.shah@example.com", "Priya Shah", "customer"),
    "dev-staff": Principal("dev-staff-1", "dana.lopez@horizontravel.example", "Dana Lopez", "staff"),
}


def _parse_dev_token(token: str) -> Principal:
    if token in DEV_USERS:
        return DEV_USERS[token]
    if token.startswith("dev:"):
        parts = token.split(":", 4)
        if len(parts) == 5 and parts[1] in ("customer", "staff"):
            return Principal(sub=parts[2], email=parts[3], name=parts[4], role=parts[1])  # type: ignore[arg-type]
    raise ApiError(401, "UNAUTHORIZED", "Sign in again: the session token is not valid.")


@lru_cache
def _jwks_client(region: str, pool_id: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json")


def _verify_cognito(token: str) -> Principal:
    s = get_settings()
    if not s.cognito_user_pool_id or not s.cognito_client_id:
        raise ApiError(500, "AUTH_NOT_CONFIGURED", "Cognito settings are missing on the server.")
    issuer = f"https://cognito-idp.{s.aws_region}.amazonaws.com/{s.cognito_user_pool_id}"
    try:
        key = _jwks_client(s.aws_region, s.cognito_user_pool_id).get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=["RS256"], issuer=issuer, options={"verify_aud": False})
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "TOKEN_EXPIRED", "Your session has expired. Sign in again.")
    except jwt.PyJWTError:
        raise ApiError(401, "UNAUTHORIZED", "Sign in again: the session token is not valid.")

    token_use = claims.get("token_use")
    client = claims.get("aud") if token_use == "id" else claims.get("client_id")
    if client != s.cognito_client_id:
        raise ApiError(401, "UNAUTHORIZED", "This token was issued for a different application.")
    groups = claims.get("cognito:groups", []) or []
    role: Role = "staff" if s.cognito_staff_group in groups else "customer"
    return Principal(
        sub=claims["sub"],
        email=claims.get("email", ""),
        name=claims.get("name") or claims.get("given_name") or claims.get("email", ""),
        role=role,
    )


def current_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "UNAUTHORIZED", "Sign in to continue.")
    token = authorization.split(" ", 1)[1].strip()
    if get_settings().auth_mode == "dev":
        return _parse_dev_token(token)
    return _verify_cognito(token)


def require_staff(principal: Principal = Depends(current_principal)) -> Principal:
    if not principal.is_staff:
        raise forbidden("This area is for agency staff only.")
    return principal


def require_internal(x_internal_token: str | None = Header(default=None)) -> None:
    if x_internal_token != get_settings().internal_token:
        raise forbidden("Internal endpoint.")


def internal_headers() -> dict[str, str]:
    return {"X-Internal-Token": get_settings().internal_token}
