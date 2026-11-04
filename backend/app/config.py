"""Application settings, loaded from backend/.env via pydantic-settings."""
from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Security — SECRET_KEY has no usable default: the app refuses to start without it.
    SECRET_KEY: str = ""
    ADMIN_EMAIL: str = "admin@finalsaas.local"
    ADMIN_PASSWORD: str = ""

    DATABASE_URL: str = "sqlite+aiosqlite:///./data/finalsaas.db"
    PUBLIC_BASE_URL: str = ""

    # Telephony (VoBiz)
    VOBIZ_AUTH_ID: str = ""
    VOBIZ_AUTH_TOKEN: str = ""
    VOBIZ_FROM_NUMBER: str = ""

    # Voice AI
    VOICE_PROVIDER: str = "sarvam"  # "sarvam" | "local"
    SARVAM_API_KEY: str = ""
    SARVAM_TTS_MODEL: str = "bulbul:v3"
    SARVAM_STT_MODEL: str = "saaras:v3"
    SARVAM_LLM_MODEL: str = "sarvam-105b-conversations"
    LOCAL_AI_BASE_URL: str = "http://localhost:8002/v1"
    LOCAL_AI_API_KEY: str = ""
    LOCAL_LLM_MODEL: str = ""
    LOCAL_STT_MODEL: str = "whisper-large-v3-turbo"
    LOCAL_TTS_MODEL: str = "kokoro"

    # Webhook signing (falls back to SECRET_KEY when empty)
    WEBHOOK_SECRET: str = ""

    # Calling policy
    CALLING_HOURS_START: int = 9
    CALLING_HOURS_END: int = 21
    BUSINESS_TIMEZONE: str = "Asia/Kolkata"
    MAX_CONCURRENT_CALLS_PER_AGENT: int = 5

    # Storage
    STORAGE_BACKEND: str = "local"  # "local" | "s3"
    STORAGE_DIR: str = "./data"
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = ""

    CORS_ORIGINS: List[str] = ["http://localhost:5173"]

    # Runtime behaviour
    SEED_DEMO: bool = True
    START_DISPATCHER: bool = True

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json

                return json.loads(v)
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @model_validator(mode="after")
    def _require_secret_key(self):
        if not self.SECRET_KEY or len(self.SECRET_KEY.strip()) < 8:
            raise ValueError(
                "SECRET_KEY is missing or too short. Set SECRET_KEY in backend/.env "
                "(e.g. generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\")"
            )
        return self

    @property
    def webhook_secret(self) -> str:
        return self.WEBHOOK_SECRET or self.SECRET_KEY

    @property
    def telephony_configured(self) -> bool:
        return bool(self.VOBIZ_AUTH_ID and self.VOBIZ_AUTH_TOKEN and self.VOBIZ_FROM_NUMBER)

    @property
    def voice_provider_configured(self) -> bool:
        if self.VOICE_PROVIDER == "local":
            return bool(self.LOCAL_AI_BASE_URL)
        return bool(self.SARVAM_API_KEY)


settings = Settings()
