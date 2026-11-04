"""Phone number normalisation to E.164 (default region: India)."""
import phonenumbers

from app.errors import DomainError


def normalize_phone(raw: str) -> str:
    if raw is None or not str(raw).strip():
        raise DomainError("INVALID_PHONE_NUMBER", "Phone number is empty.", 400)
    text = str(raw).strip()
    try:
        number = phonenumbers.parse(text, None if text.startswith("+") else "IN")
    except phonenumbers.NumberParseException:
        raise DomainError("INVALID_PHONE_NUMBER", f"Invalid phone number: {raw}", 400)
    if not phonenumbers.is_valid_number(number):
        raise DomainError("INVALID_PHONE_NUMBER", f"Invalid phone number: {raw}", 400)
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
