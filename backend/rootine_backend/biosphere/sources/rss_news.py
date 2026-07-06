"""Coletor genérico de notícias via RSS (feedparser + httpx).

Fontes configuradas:
- O Eco            -> jornalismo ambiental especializado (aceita tudo que não for ruído)
- G1 Meio Ambiente -> editoria ambiental nacional ativa (a antiga "natureza" está morta)
- G1 Rio           -> feed generalista do RJ; exige match de palavra-chave ambiental
- Agência Brasil   -> feed de últimas notícias (sem paywall); exige match de
                      palavra-chave. Se a EBC publicar feed dedicado da editoria
                      Meio Ambiente, basta trocar a URL aqui.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import feedparser
import httpx

from ..filters import keyword_gate
from ..models import CollectedNews, detect_region
from ..parsing import clean_text, parse_datetime_flexible, strip_html

logger = logging.getLogger(__name__)

USER_AGENT = "RootineBiosphereBot/1.0 (worker de agregacao; contato: equipe Rootine)"

# Alguns feeds (ex.: G1 Natureza) trazem matérias antigas "evergreen";
# o feed do app é de atualidade, então cortamos por idade.
MAX_AGE_DAYS = 60


@dataclass(frozen=True)
class RssSource:
    key: str
    name: str
    url: str
    default_region: str = "brasil"
    require_keyword_match: bool = False


NEWS_SOURCES: tuple[RssSource, ...] = (
    RssSource(
        key="oeco",
        name="O Eco",
        url="https://oeco.org.br/feed/",
    ),
    RssSource(
        key="g1_meio_ambiente",
        name="G1 Meio Ambiente",
        # A editoria antiga "natureza" parou de ser alimentada em 2023;
        # "meio-ambiente" é o feed ativo (verificado em 2026-07-05).
        url="https://g1.globo.com/rss/g1/meio-ambiente/",
    ),
    RssSource(
        key="g1_rio",
        name="G1 Rio de Janeiro",
        url="https://g1.globo.com/rss/g1/rj/rio-de-janeiro/",
        default_region="rio_de_janeiro",
        require_keyword_match=True,
    ),
    RssSource(
        key="agencia_brasil",
        name="Agência Brasil",
        url="https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
        require_keyword_match=True,
    ),
)


def _entry_external_id(entry) -> str:
    raw = entry.get("id") or entry.get("guid") or entry.get("link") or entry.get("title", "")
    return hashlib.sha256(str(raw).encode("utf-8")).hexdigest()[:32]


def _entry_published(entry) -> datetime | None:
    struct = entry.get("published_parsed") or entry.get("updated_parsed")
    if struct:
        return datetime(*struct[:6], tzinfo=timezone.utc)
    return parse_datetime_flexible(entry.get("published") or entry.get("updated"))


def _entry_image(entry) -> str | None:
    for media in entry.get("media_content", []) or []:
        if media.get("url"):
            return media["url"]
    for media in entry.get("media_thumbnail", []) or []:
        if media.get("url"):
            return media["url"]
    for link in entry.get("links", []) or []:
        if link.get("rel") == "enclosure" and str(link.get("type", "")).startswith("image"):
            return link.get("href")
    return None


def collect_source(source: RssSource, client: httpx.Client, limit: int = 40) -> list[CollectedNews]:
    response = client.get(
        source.url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
    )
    response.raise_for_status()
    feed = feedparser.parse(response.content)
    if feed.bozo and not feed.entries:
        raise ValueError(f"Feed ilegível ({source.url}): {feed.bozo_exception}")

    collected: list[CollectedNews] = []
    oldest_allowed = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    for entry in feed.entries[:limit]:
        title = clean_text(entry.get("title"), 300)
        url = clean_text(entry.get("link"), 600)
        published_at = _entry_published(entry)
        if not title or not url or not published_at:
            continue
        if published_at < oldest_allowed:
            continue

        summary = strip_html(entry.get("summary") or entry.get("description"))
        passed, topics = keyword_gate(title, summary, source.require_keyword_match)
        if not passed:
            continue

        region = source.default_region
        if region != "rio_de_janeiro":
            region = detect_region(title, summary)

        collected.append(
            CollectedNews(
                source=source.key,
                source_name=source.name,
                external_id=_entry_external_id(entry),
                title=title,
                url=url,
                published_at=published_at,
                summary=summary,
                image_url=_entry_image(entry),
                author=clean_text(entry.get("author"), 120) or None,
                region_scope=region,
                topics=topics,
                raw={"feed_title": clean_text(feed.feed.get("title", ""), 120)},
            )
        )
    return collected


def collect_news(timeout: float = 20.0) -> dict[str, list[CollectedNews] | Exception]:
    """Coleta todas as fontes; falha em uma fonte não derruba as demais."""
    results: dict[str, list[CollectedNews] | Exception] = {}
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for source in NEWS_SOURCES:
            try:
                items = collect_source(source, client)
                logger.info("[news:%s] %d itens relevantes", source.key, len(items))
                results[source.key] = items
            except Exception as exc:  # noqa: BLE001 — isola a fonte com problema
                logger.error("[news:%s] falha na coleta: %s", source.key, exc)
                results[source.key] = exc
    return results
