"""Valkey (ElastiCache) cache.

Two kinds of keys:
  search:<hash of normalised query>  the whole result list, 10 minutes
  offer:<supplierRef>                each returned offer, 30 minutes. This is the
                                     "hold" the booking service re-validates, so
                                     prices are never taken from the browser.
If the cache is unavailable the service still answers, just without caching.
"""
import hashlib
import json
import logging

import redis

from horizon_common.config import get_settings

logger = logging.getLogger("search.cache")
SEARCH_TTL = 600
OFFER_TTL = 1800
_client: redis.Redis | None = None


def client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(get_settings().redis_url, decode_responses=True, socket_timeout=1)
    return _client


def query_key(kind: str, params: dict) -> str:
    normalised = json.dumps({k: str(v).strip().lower() for k, v in sorted(params.items()) if v is not None})
    return f"search:{kind}:" + hashlib.sha256(normalised.encode()).hexdigest()[:24]


def get_json(key: str):
    try:
        raw = client().get(key)
        return json.loads(raw) if raw else None
    except redis.RedisError:
        logger.warning("Cache read failed", exc_info=True)
        return None


def set_json(key: str, value, ttl: int) -> None:
    try:
        client().set(key, json.dumps(value, default=str), ex=ttl)
    except redis.RedisError:
        logger.warning("Cache write failed", exc_info=True)


def hold_offers(offers: list[dict]) -> None:
    try:
        pipe = client().pipeline()
        for offer in offers:
            pipe.set(f"offer:{offer['supplierRef']}", json.dumps(offer, default=str), ex=OFFER_TTL)
        pipe.execute()
    except redis.RedisError:
        logger.warning("Could not hold offers", exc_info=True)
