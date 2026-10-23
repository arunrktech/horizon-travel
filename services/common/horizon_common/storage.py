"""Document storage: Amazon S3 in AWS, a local folder for development."""
from pathlib import Path

from .config import get_settings


def put_object(key: str, data: bytes, content_type: str) -> None:
    s = get_settings()
    if s.storage_backend == "s3":
        import boto3

        boto3.client("s3", region_name=s.aws_region).put_object(
            Bucket=s.s3_bucket, Key=key, Body=data, ContentType=content_type, ServerSideEncryption="aws:kms"
        )
    else:
        path = Path(s.local_storage_dir) / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def read_local(key: str) -> bytes:
    base = Path(get_settings().local_storage_dir).resolve()
    path = (base / key).resolve()
    if base not in path.parents:
        raise FileNotFoundError(key)
    return path.read_bytes()


def presigned_url(key: str, file_name: str, expires_seconds: int = 300) -> str:
    s = get_settings()
    import boto3

    return boto3.client("s3", region_name=s.aws_region).generate_presigned_url(
        "get_object",
        Params={"Bucket": s.s3_bucket, "Key": key, "ResponseContentDisposition": f'attachment; filename="{file_name}"'},
        ExpiresIn=expires_seconds,
    )
