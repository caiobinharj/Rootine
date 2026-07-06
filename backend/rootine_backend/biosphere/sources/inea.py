"""Coletor best-effort da agenda do INEA (Instituto Estadual do Ambiente - RJ).

ATENÇÃO: o portal do INEA não publica API nem RSS e o HTML não tem contrato
estável. Este parser é genérico e defensivo: varre as páginas configuradas em
AGENDA_URLS atrás de links cujo texto contenha palavras-chave de ação ambiental
(mutirão, plantio, trilha guiada...) e tenta extrair uma data futura do texto
ao redor. Qualquer item sem data futura ou link é ignorado; falha total apenas
gera lista vazia (o pipeline registra em biosphere_sync_runs).

Antes de confiar em produção, valide as URLs e ajuste os seletores olhando o
HTML real — este módulo foi desenhado para degradar sem quebrar o worker.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from ..models import CollectedEvent
from ..parsing import clean_text, normalize_for_match, parse_datetime_flexible
from .sympla import classify_event_type, relevance_score

logger = logging.getLogger(__name__)

USER_AGENT = "RootineBiosphereBot/1.0 (agenda ambiental; uso educacional)"

# Páginas candidatas da agenda/notícias do INEA. Ajuste conforme o portal.
AGENDA_URLS: tuple[str, ...] = (
    "https://www.inea.rj.gov.br/agenda/",
    "https://www.inea.rj.gov.br/category/noticias/",
)

ACTION_KEYWORDS = (
    "mutirao", "plantio", "trilha", "visita guiada", "voluntariado", "limpeza",
    "praia", "parque estadual", "oficina", "educacao ambiental", "inscricao", "inscricoes",
)


def _candidate_anchors(soup: BeautifulSoup):
    for anchor in soup.find_all("a", href=True):
        text = clean_text(anchor.get_text(" "), 300)
        if len(text) < 12:
            continue
        if any(term in normalize_for_match(text) for term in ACTION_KEYWORDS):
            yield anchor, text


def _nearby_text(anchor) -> str:
    parent = anchor
    for _ in range(3):
        if parent.parent is None:
            break
        parent = parent.parent
    return clean_text(parent.get_text(" "), 600)


def collect_inea_events(timeout: float = 20.0) -> list[CollectedEvent]:
    now = datetime.now(timezone.utc)
    collected: dict[str, CollectedEvent] = {}

    with httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"},
    ) as client:
        for page_url in AGENDA_URLS:
            try:
                response = client.get(page_url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("[inea] página indisponível (%s): %s", page_url, exc)
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            for anchor, title in _candidate_anchors(soup):
                url = urljoin(page_url, anchor["href"])
                if url in collected:
                    continue

                context_text = _nearby_text(anchor)
                starts_at = parse_datetime_flexible(context_text)
                if not starts_at or starts_at <= now:
                    continue

                collected[url] = CollectedEvent(
                    source="inea",
                    title=title,
                    description=context_text[:600],
                    registration_url=url,
                    starts_at=starts_at,
                    modality="presencial",
                    event_type=classify_event_type(title, context_text),
                    state="RJ",
                    organizer_name="INEA — Instituto Estadual do Ambiente",
                    tags=["inea", "parques_estaduais"],
                    relevance_score=relevance_score(title, context_text),
                    relevance_source="keyword",
                    raw={"page": page_url},
                )

    logger.info("[inea] %d eventos futuros extraídos", len(collected))
    return list(collected.values())
