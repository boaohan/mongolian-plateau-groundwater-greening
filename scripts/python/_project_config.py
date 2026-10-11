"""Portable local paths; this module does not change research calculations."""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def get_work_dir() -> Path:
    value = os.environ.get("MP_WORK_DIR")
    result = Path(value).expanduser() if value else PROJECT_ROOT / "data" / "work"
    if not result.is_absolute():
        result = PROJECT_ROOT / result
    result.mkdir(parents=True, exist_ok=True)
    return result.resolve()
