from fastapi import APIRouter, Depends

from app.config import settings
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/status")
async def status(user: User = Depends(get_current_user)):
    """Configuration status — booleans and masked values ONLY, never secrets."""
    from_number = settings.VOBIZ_FROM_NUMBER or ""
    return {
        "telephony_configured": settings.telephony_configured,
        "from_number_masked": (f"***{from_number[-4:]}" if len(from_number) >= 4 else None),
        "voice_provider": settings.VOICE_PROVIDER,
        "voice_provider_configured": settings.voice_provider_configured,
        "public_url_configured": settings.PUBLIC_BASE_URL.startswith("https://"),
        "calling_hours": (
            f"{settings.CALLING_HOURS_START:02d}:00-{settings.CALLING_HOURS_END:02d}:00 "
            f"{settings.BUSINESS_TIMEZONE}"
        ),
        "storage_backend": settings.STORAGE_BACKEND,
    }
