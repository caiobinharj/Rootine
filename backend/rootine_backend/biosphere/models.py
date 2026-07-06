"""Modelos intermediários dos coletores (normalizados antes do upsert)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .parsing import clean_text, content_hash, normalize_for_match

RJ_MARKERS = (
    "rio de janeiro", "niteroi", "fluminense", "baia de guanabara", "guanabara",
    "copacabana", "ipanema", "barra da tijuca", "maracana", "paqueta",
    "petropolis", "teresopolis", "nova friburgo", "cabo frio", "buzios",
    "angra dos reis", "paraty", "itaipu", "marica", "sao goncalo", "inea",
    "floresta da tijuca", "pedra branca", "serra dos orgaos", "restinga",
    "lagoa rodrigo de freitas", "arraial do cabo",
)


def detect_region(*texts: str) -> str:
    haystack = normalize_for_match(" ".join(t for t in texts if t))
    return "rio_de_janeiro" if any(marker in haystack for marker in RJ_MARKERS) else "brasil"


@dataclass
class CollectedNews:
    source: str          # oeco | g1_natureza | g1_rio | agencia_brasil
    source_name: str
    external_id: str
    title: str
    url: str
    published_at: datetime
    summary: str = ""
    image_url: str | None = None
    author: str | None = None
    region_scope: str = "brasil"
    topics: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def content_hash(self) -> str:
        return content_hash(self.title, self.url)

    def to_row(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "source_name": self.source_name,
            "external_id": self.external_id,
            "content_hash": self.content_hash,
            "title": clean_text(self.title, 300),
            "summary": clean_text(self.summary, 800) or None,
            "url": self.url,
            "image_url": self.image_url,
            "author": self.author,
            "published_at": self.published_at.astimezone(timezone.utc).isoformat(),
            "region_scope": self.region_scope,
            "topics": self.topics,
            "raw": self.raw,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }


@dataclass
class CollectedEvent:
    source: str          # sympla | inea | transforma_brasil | manual
    title: str
    registration_url: str
    starts_at: datetime
    modality: str        # presencial | online | hibrido
    external_id: str | None = None
    description: str = ""
    event_type: str = "outro"
    ends_at: datetime | None = None
    city: str | None = None
    state: str | None = None
    venue_name: str | None = None
    address: str | None = None
    is_free: bool | None = None
    price_min: float | None = None
    organizer_name: str | None = None
    image_url: str | None = None
    tags: list[str] = field(default_factory=list)
    relevance_score: float | None = None
    relevance_source: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def content_hash(self) -> str:
        return content_hash(self.title, self.registration_url, self.starts_at.date().isoformat())

    def in_product_scope(self) -> bool:
        """Presencial/híbrido só no RJ; online vale Brasil inteiro."""
        if self.modality == "online":
            return True
        return (self.state or "").upper() == "RJ"

    def to_row(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        return {
            "source": self.source,
            "external_id": self.external_id or self.content_hash,
            "content_hash": self.content_hash,
            "title": clean_text(self.title, 300),
            "description": clean_text(self.description, 1200) or None,
            "event_type": self.event_type,
            "modality": self.modality,
            "starts_at": self.starts_at.astimezone(timezone.utc).isoformat(),
            "ends_at": self.ends_at.astimezone(timezone.utc).isoformat() if self.ends_at else None,
            "city": self.city,
            "state": (self.state or "").upper() or None,
            "venue_name": self.venue_name,
            "address": self.address,
            "registration_url": self.registration_url,
            "is_free": self.is_free,
            "price_min": self.price_min,
            "organizer_name": self.organizer_name,
            "image_url": self.image_url,
            "tags": self.tags,
            "status": "active",
            "relevance_score": self.relevance_score,
            "relevance_source": self.relevance_source,
            "raw": self.raw,
            "last_seen_at": now,
            "updated_at": now,
        }
