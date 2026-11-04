from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator


def _as_utc(value: datetime) -> datetime:
    # SQLite drops tzinfo; every stored timestamp is UTC, so make that explicit for clients.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]
