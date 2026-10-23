"""Event publishing and consuming.

event_backend=aws   publish to an SNS topic; the worker reads from an SQS queue
                    subscribed to that topic. Failed messages are left on the
                    queue and move to the dead letter queue after 3 receives
                    (redrive policy set in infrastructure).
event_backend=redis local stand in using a Valkey/Redis list, with the same
                    retry and dead letter behaviour implemented in code.
"""
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from .config import get_settings

logger = logging.getLogger("horizon.events")
QUEUE_KEY = "horizon:events"
DLQ_KEY = "horizon:events:dlq"
MAX_ATTEMPTS = 3


@dataclass
class Event:
    id: str
    type: str
    occurred_at: str
    data: dict[str, Any]
    attempts: int = 0

    def to_json(self) -> str:
        return json.dumps({"id": self.id, "type": self.type, "occurredAt": self.occurred_at, "data": self.data, "attempts": self.attempts})

    @staticmethod
    def from_json(raw: str) -> "Event":
        body = json.loads(raw)
        if "Message" in body and "TopicArn" in body:  # SNS envelope when raw delivery is off
            body = json.loads(body["Message"])
        return Event(body["id"], body["type"], body["occurredAt"], body["data"], body.get("attempts", 0))


def _redis():
    import redis

    return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)


def publish(event_type: str, data: dict[str, Any]) -> str:
    event = Event(str(uuid.uuid4()), event_type, datetime.now(timezone.utc).isoformat(), data)
    s = get_settings()
    if s.event_backend == "aws":
        import boto3

        boto3.client("sns", region_name=s.aws_region).publish(
            TopicArn=s.sns_topic_arn,
            Message=event.to_json(),
            MessageAttributes={"eventType": {"DataType": "String", "StringValue": event_type}},
        )
    else:
        _redis().lpush(QUEUE_KEY, event.to_json())
    logger.info("Published event", extra={"extra_fields": {"eventType": event_type, "eventId": event.id}})
    return event.id


def consume_forever(handler: Callable[[Event], None], stop: Callable[[], bool]) -> None:
    s = get_settings()
    if s.event_backend == "aws":
        import boto3

        sqs = boto3.client("sqs", region_name=s.aws_region)
        while not stop():
            resp = sqs.receive_message(QueueUrl=s.sqs_queue_url, MaxNumberOfMessages=5, WaitTimeSeconds=20)
            for msg in resp.get("Messages", []):
                try:
                    handler(Event.from_json(msg["Body"]))
                    sqs.delete_message(QueueUrl=s.sqs_queue_url, ReceiptHandle=msg["ReceiptHandle"])
                except Exception:
                    logger.exception("Event handling failed; SQS will retry and then dead letter it")
    else:
        r = _redis()
        while not stop():
            item = r.brpop([QUEUE_KEY], timeout=2)
            if not item:
                continue
            event = Event.from_json(item[1])
            try:
                handler(event)
            except Exception:
                event.attempts += 1
                target = DLQ_KEY if event.attempts >= MAX_ATTEMPTS else QUEUE_KEY
                logger.exception("Event handling failed", extra={"extra_fields": {"eventId": event.id, "attempts": event.attempts, "requeuedTo": target}})
                r.lpush(target, event.to_json())
