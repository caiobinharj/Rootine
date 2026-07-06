"""Coletor de eventos ambientais no Sympla via API interna de busca.

A API oficial do Sympla só expõe eventos do próprio organizador autenticado e
a busca pública da Eventbrite foi descontinuada. As páginas de busca do site
são renderizadas client-side (sem HTML útil), mas o front chama um endpoint
JSON estável que atende sem autenticação:

    POST https://www.sympla.com.br/api/v1/search
    body: {"service": "/v4/search", "params": {...}}

(verificado em 2026-07-05; campos: name, url, start_date_utc, end_date_utc,
city, state, location, is_free, organizer, theme_name, subtheme_name, images).
Se o contrato mudar, capture o novo endpoint no DevTools na página de busca.

A busca textual do Sympla é permissiva (retorna eventos fora do tema), então
todo item passa por um gate de relevância por palavras-chave antes de entrar.
Escopo do produto: presencial no estado do RJ + online de qualquer lugar.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from ..models import CollectedEvent
from ..parsing import clean_text, normalize_for_match, parse_datetime_flexible

logger = logging.getLogger(__name__)

API_URL = "https://www.sympla.com.br/api/v1/search"
SEARCH_SERVICE = "/v4/search"
PAGE_LIMIT = "48"
MAX_PAGES_PER_QUERY = 2
PAUSE_BETWEEN_REQUESTS = 0.8  # cortesia com o endpoint não documentado

# A API devolve também eventos "em andamento" (início no passado, término no
# futuro). Cursos gravados ficam listados por anos assim; só aceitamos início
# recente para não poluir a aba com conteúdo sob demanda de 2023.
ONGOING_START_GRACE_DAYS = 90

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Origin": "https://www.sympla.com.br",
    "Referer": "https://www.sympla.com.br/eventos",
}

SEARCH_TERMS = (
    "sustentabilidade",
    "meio ambiente",
    "plantio de árvores",
    "mutirão limpeza praia",
    "educação ambiental",
)

MIN_RELEVANCE = 0.3  # exige >= 1 palavra-chave ambiental (a busca é permissiva)

# A modalidade vem do próprio item (campo event_type da API):
#   NORMAL   -> presencial (fica só se state == RJ)
#   ONLINE   -> online (Brasil inteiro)
#   ONDEMAND -> conteúdo gravado sob demanda; não é evento — descartado.
MODALITY_BY_EVENT_TYPE = {"NORMAL": "presencial", "ONLINE": "online"}


@dataclass(frozen=True)
class SearchBucket:
    label: str
    extra_params: dict[str, Any]


# Dois recortes de busca: RJ (garante cobertura local) e Brasil (captura os
# online, que o filtro geográfico esconderia). Dedupe por registration_url.
SEARCH_BUCKETS: tuple[SearchBucket, ...] = (
    SearchBucket(label="rj", extra_params={"state": "RJ"}),
    SearchBucket(label="brasil", extra_params={}),
)

EVENT_TYPE_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("mutirao", ("mutirao",)),
    ("plantio", ("plantio", "reflorestamento", "arborizacao", "mudas")),
    ("limpeza", ("limpeza de praia", "praia limpa", "clean up", "cleanup",
                 "coleta de residuos", "coleta de lixo", "mutirao de limpeza")),
    ("trilha", ("trilha", "caminhada ecologica")),
    ("congresso", ("congresso", "simposio", "conferencia", "seminario")),
    ("feira", ("feira", "festival")),
    ("oficina", ("oficina", "workshop", "curso", "imersao")),
    ("webinar", ("webinar", "aula online", "palestra online")),
    ("palestra", ("palestra", "roda de conversa", "encontro", "dialogo")),
)

# Termos qualificados: "limpeza" e "mutirão" sozinhos deixam passar "limpeza
# espiritual", "mutirão de saúde" etc. — só contam com contexto ambiental.
RELEVANCE_KEYWORDS = (
    "sustentab", "meio ambiente", "ambiental", "ecolog", "clima", "reciclagem",
    "plantio", "biodiversidade", "conservacao", "agroecologia",
    "compostagem", "horta", "permacultura", "energia solar", "residuo", "regenerativ",
    "restauracao", "reflorestamento", "agrofloresta",
    "limpeza de praia", "limpeza de rio", "praia limpa", "coleta de lixo", "beach clean",
    "mutirao de limpeza", "mutirao ambiental", "mutirao ecologico", "mutirao de plantio",
)


def classify_event_type(title: str, description: str = "") -> str:
    haystack = normalize_for_match(f"{title} {description}")
    for event_type, terms in EVENT_TYPE_KEYWORDS:
        if any(term in haystack for term in terms):
            return event_type
    return "outro"


def relevance_score(title: str, description: str = "") -> float:
    haystack = normalize_for_match(f"{title} {description}")
    hits = sum(1 for term in RELEVANCE_KEYWORDS if term in haystack)
    return min(1.0, 0.3 + hits * 0.2) if hits else 0.15


def _search(client: httpx.Client, term: str, bucket: SearchBucket, page: int = 1) -> list[dict]:
    body = {
        "service": SEARCH_SERVICE,
        "params": {
            # O parâmetro de busca textual é "q" ("search" é ignorado pela API).
            "q": term,
            # "score" é a ordenação que o site usa: devolve eventos atuais e
            # futuros. "date" ascende desde 2017 e nunca chega ao presente.
            "sort": "score",
            "limit": PAGE_LIMIT,
            "page": page,
            **bucket.extra_params,
        },
    }
    response = client.post(API_URL, json=body)
    response.raise_for_status()
    if "json" not in response.headers.get("content-type", ""):
        raise ValueError("resposta não-JSON (possível bloqueio/rate limit)")
    payload = response.json()
    data = payload.get("data")
    return data if isinstance(data, list) else []


def _event_from_api(item: dict[str, Any]) -> CollectedEvent | None:
    modality = MODALITY_BY_EVENT_TYPE.get(str(item.get("event_type") or "").upper())
    if modality is None:
        return None  # ONDEMAND (conteúdo gravado) ou tipo desconhecido

    title = clean_text(item.get("name") or item.get("title"), 300)
    url = str(item.get("url") or "")
    starts_at = parse_datetime_flexible(item.get("start_date_utc") or item.get("start_date"))
    if not title or not url.startswith("http") or not starts_at:
        return None
    ends_at = parse_datetime_flexible(item.get("end_date_utc") or item.get("end_date"))

    theme = clean_text(str(item.get("theme_name") or ""), 80)
    subtheme = clean_text(str(item.get("subtheme_name") or ""), 80)
    category = clean_text(str(item.get("category_prim") or ""), 80)
    context = " ".join(filter(None, (theme, subtheme, category)))

    score = relevance_score(title, context)
    if score < MIN_RELEVANCE:
        return None  # a busca do Sympla é permissiva; sem keyword ambiental, descarta

    location = item.get("location") if isinstance(item.get("location"), dict) else {}
    organizer = item.get("organizer") if isinstance(item.get("organizer"), dict) else {}
    images = item.get("images") if isinstance(item.get("images"), dict) else {}

    city = clean_text(str(item.get("city") or location.get("city") or ""), 80) or None
    state = clean_text(str(item.get("state") or location.get("state") or ""), 8) or None

    description_parts = [p for p in (theme, subtheme) if p]
    description = " · ".join(description_parts)

    return CollectedEvent(
        source="sympla",
        external_id=f"sympla-{item['id']}" if item.get("id") else None,
        title=title,
        description=description,
        registration_url=url,
        starts_at=starts_at,
        ends_at=ends_at,
        modality=modality,
        event_type=classify_event_type(title, context),
        city=city,
        state=state,
        venue_name=clean_text(str(location.get("name") or ""), 160) or None,
        address=clean_text(str(location.get("address") or ""), 240) or None,
        is_free=bool(item["is_free"]) if item.get("is_free") is not None else None,
        organizer_name=clean_text(str(organizer.get("name") or ""), 160) or None,
        image_url=images.get("original") or images.get("lg"),
        tags=[t for t in (theme.lower() or None, "sympla") if t],
        relevance_score=round(score, 3),
        relevance_source="keyword",
        raw={
            "sympla_id": item.get("id"),
            "sympla_event_type": item.get("event_type"),
            "theme_name": theme,
            "subtheme_name": subtheme,
            "category_prim": category,
        },
    )


def _keep_event(event: CollectedEvent, now: datetime) -> bool:
    """Futuro, ou em andamento com início recente (evita 'evergreen' de 2023)."""
    if not event.in_product_scope():
        return False
    if event.starts_at > now:
        return True
    if event.ends_at is None or event.ends_at <= now:
        return False
    started_days_ago = (now - event.starts_at).days
    if started_days_ago > ONGOING_START_GRACE_DAYS:
        return False
    event.tags.append("em_andamento")
    return True


def collect_sympla_events(timeout: float = 20.0) -> list[CollectedEvent]:
    now = datetime.now(timezone.utc)
    collected: dict[str, CollectedEvent] = {}

    with httpx.Client(timeout=timeout, headers=HEADERS) as client:
        for bucket in SEARCH_BUCKETS:
            for term in SEARCH_TERMS:
                found_raw = kept = 0
                for page in range(1, MAX_PAGES_PER_QUERY + 1):
                    try:
                        items = _search(client, term, bucket, page=page)
                    except (httpx.HTTPError, ValueError) as exc:
                        logger.warning(
                            "[sympla] busca '%s' (%s, p%d) falhou: %s",
                            term, bucket.label, page, exc,
                        )
                        break
                    finally:
                        time.sleep(PAUSE_BETWEEN_REQUESTS)

                    found_raw += len(items)
                    for item in items:
                        event = _event_from_api(item)
                        if event is None or not _keep_event(event, now):
                            continue
                        collected.setdefault(event.registration_url, event)
                        kept += 1

                    if len(items) < int(PAGE_LIMIT):
                        break  # última página desta busca

                logger.info(
                    "[sympla] '%s' (%s): %d brutos -> %d relevantes",
                    term, bucket.label, found_raw, kept,
                )

    return list(collected.values())
