import pytest

from app.errors import DomainError
from app.services.phone import normalize_phone


def test_normalize_indian_mobile():
    assert normalize_phone("98765 43210") == "+919876543210"
    assert normalize_phone("+91 98123 45678") == "+919812345678"
    assert normalize_phone("09876543210") == "+919876543210"


def test_normalize_international():
    assert normalize_phone("+1 202 555 0123") == "+12025550123"


@pytest.mark.parametrize("bad", ["123", "abcdefghij", "", "+91 12345"])
def test_normalize_invalid(bad):
    with pytest.raises(DomainError) as exc:
        normalize_phone(bad)
    assert exc.value.code == "INVALID_PHONE_NUMBER"
