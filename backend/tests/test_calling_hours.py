import asyncio
from datetime import datetime

from app.services import gates


def _within(*args):
    return asyncio.run(gates.within_calling_hours(datetime(*args)))


def test_within_hours_ist_afternoon():
    # 10:00 UTC = 15:30 IST -> inside 09:00-21:00
    assert _within(2026, 11, 4, 10, 0) is True


def test_before_window_ist_morning():
    # 03:00 UTC = 08:30 IST -> before 09:00
    assert _within(2026, 11, 4, 3, 0) is False


def test_after_window_ist_night():
    # 20:00 UTC = 01:30 IST next day -> outside
    assert _within(2026, 11, 4, 20, 0) is False


def test_clamp_moves_early_morning_to_start():
    clamped = gates.clamp_to_calling_hours(datetime(2026, 11, 4, 3, 0))  # 08:30 IST
    # clamped to 09:00 IST = 03:30 UTC same day
    assert (clamped.hour, clamped.minute) == (3, 30)
