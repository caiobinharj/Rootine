"""Helpers de texto e data compartilhados pelos coletores da Biosfera."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

BR_TZ = ZoneInfo("America/Sao_Paulo")

PT_MONTHS = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4,
    "maio": 5, "junho": 6, "julho": 7, "agosto": 8, "setembro": 9,
    "outubro": 10, "novembro": 11, "dezembro": 12,
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}

_PT_DATE_RE = re.compile(
    r"(\d{1,2})\s*(?:de)?\s*([a-zçã]{3,9})\.?\s*(?:de)?\s*(\d{4})?",
    re.IGNORECASE,
)
_NUMERIC_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{2,4})")
_TIME_RE = re.compile(r"(\d{1,2})[h:](\d{2})?")


def strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = BeautifulSoup(value, "html.parser").get_text(" ")
    return clean_text(text)


def clean_text(value: str | None, max_length: int = 1200) -> str:
    if not value:
        return ""
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text[:max_length]


def normalize_for_match(value: str) -> str:
    """minúsculas + sem acentos, para casar palavras-chave com segurança."""
    text = unicodedata.normalize("NFD", value.lower())
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def content_hash(*parts: str) -> str:
    joined = "|".join(normalize_for_match(clean_text(p, 400)) for p in parts if p)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def ensure_utc(dt: datetime) -> datetime:
    """Datas naive são interpretadas como horário de Brasília."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BR_TZ)
    return dt.astimezone(timezone.utc)


def parse_datetime_flexible(value, reference_year: int | None = None) -> datetime | None:
    """Aceita ISO 8601, RFC 822 (RSS), dd/mm/aaaa e '12 de julho de 2026 às 9h'."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return ensure_utc(value)

    text = clean_text(str(value), 120)
    if not text:
        return None

    # ISO 8601
    try:
        return ensure_utc(datetime.fromisoformat(text.replace("Z", "+00:00")))
    except ValueError:
        pass

    # RFC 822 (pubDate de RSS)
    try:
        return ensure_utc(parsedate_to_datetime(text))
    except (TypeError, ValueError):
        pass

    hour, minute = 0, 0
    time_match = _TIME_RE.search(text)
    if time_match:
        hour = min(23, int(time_match.group(1)))
        minute = int(time_match.group(2) or 0)

    numeric = _NUMERIC_DATE_RE.search(text)
    if numeric:
        day, month, year = (int(g) for g in numeric.groups())
        if year < 100:
            year += 2000
        try:
            return ensure_utc(datetime(year, month, day, hour, minute))
        except ValueError:
            return None

    pt_match = _PT_DATE_RE.search(normalize_for_match(text))
    if pt_match:
        day = int(pt_match.group(1))
        month = PT_MONTHS.get(pt_match.group(2))
        year = int(pt_match.group(3)) if pt_match.group(3) else (
            reference_year or datetime.now(BR_TZ).year
        )
        if month:
            try:
                candidate = datetime(year, month, day, hour, minute)
                # Sem ano explícito e data já passada => provavelmente ano seguinte.
                if not pt_match.group(3):
                    now_local = datetime.now(BR_TZ).replace(tzinfo=None)
                    if candidate < now_local:
                        candidate = candidate.replace(year=year + 1)
                return ensure_utc(candidate)
            except ValueError:
                return None
    return None
