"""Recording storage. Local disk by default; S3/MinIO when STORAGE_BACKEND=s3."""
import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def _recordings_dir() -> Path:
    path = Path(settings.STORAGE_DIR) / "recordings"
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_recording(call_id: str, wav_bytes: bytes) -> str:
    """Persist WAV bytes; returns the stored relative path / S3 key."""
    rel = f"recordings/{call_id}.wav"
    if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
        try:
            import boto3

            client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL or None,
                aws_access_key_id=settings.S3_ACCESS_KEY or None,
                aws_secret_access_key=settings.S3_SECRET_KEY or None,
            )
            client.put_object(Bucket=settings.S3_BUCKET, Key=rel, Body=wav_bytes, ContentType="audio/wav")
            return rel
        except Exception as exc:  # fall back to local disk rather than losing the recording
            logger.warning("S3 recording upload failed (%s); saving locally", exc)
    target = _recordings_dir() / f"{call_id}.wav"
    target.write_bytes(wav_bytes)
    return rel


def recording_abspath(rel_path: str) -> Path:
    return Path(settings.STORAGE_DIR) / rel_path
