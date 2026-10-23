"""Email: Amazon SES in AWS, logged to stdout locally."""
import logging

from horizon_common.config import get_settings

logger = logging.getLogger("notification.email")


def send_email(to: str, subject: str, text: str) -> None:
    s = get_settings()
    if s.email_backend == "ses":
        import boto3

        boto3.client("ses", region_name=s.aws_region).send_email(
            Source=s.ses_from_address,
            Destination={"ToAddresses": [to]},
            Message={"Subject": {"Data": subject}, "Body": {"Text": {"Data": text}}},
        )
    logger.info("Email sent", extra={"extra_fields": {"to": to, "subject": subject, "backend": s.email_backend,
                                                       "body": text if s.email_backend == "log" else None}})
