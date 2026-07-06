"""Orquestração dos pipelines da Biosfera.

Fluxo (rodado pelo worker a cada 12h):
  Notícias : coleta RSS -> gate de palavras-chave (nas fontes) -> upsert
             (source, external_id) -> sanity check Gemini Flash nos 'pending'.
  Eventos  : coleta Sympla + INEA -> valida data futura e escopo geográfico ->
             upsert -> varredura de expiração (status='expired').

Cada fonte gera uma linha em biosphere_sync_runs; falha em uma fonte nunca
derruba as demais.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Iterable

from supabase import Client

from ..config import Settings
from .filters import GeminiNewsFilter
from .models import CollectedEvent, CollectedNews
from .sources import collect_inea_events, collect_news, collect_sympla_events

logger = logging.getLogger(__name__)

VISIBLE_WITHOUT_LLM = "skipped"  # fail-open: passou no filtro de keywords


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _chunked(items: list, size: int = 200) -> Iterable[list]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _log_run(
    supabase: Client,
    job: str,
    source: str,
    started_at: str,
    *,
    status: str = "success",
    found: int = 0,
    new: int = 0,
    updated: int = 0,
    rejected: int = 0,
    error: str | None = None,
    metadata: dict | None = None,
) -> None:
    try:
        supabase.table("biosphere_sync_runs").insert(
            {
                "job": job,
                "source": source,
                "status": status,
                "items_found": found,
                "items_new": new,
                "items_updated": updated,
                "items_rejected": rejected,
                "error_message": error,
                "metadata": metadata or {},
                "started_at": started_at,
                "finished_at": _utc_now_iso(),
            }
        ).execute()
    except Exception:  # observabilidade nunca derruba o pipeline
        logger.exception("Falha ao registrar biosphere_sync_runs (ignorada).")


def _count_existing(supabase: Client, table: str, source: str, external_ids: list[str]) -> set[str]:
    existing: set[str] = set()
    for chunk in _chunked(external_ids):
        response = (
            supabase.table(table)
            .select("external_id")
            .eq("source", source)
            .in_("external_id", chunk)
            .execute()
        )
        existing.update(row["external_id"] for row in (response.data or []))
    return existing


def _upsert_rows(
    supabase: Client, table: str, source: str, rows: list[dict[str, Any]]
) -> tuple[int, int]:
    """Upsert em (source, external_id); retorna (novos, atualizados)."""
    if not rows:
        return 0, 0
    existing = _count_existing(supabase, table, source, [r["external_id"] for r in rows])
    for chunk in _chunked(rows, 100):
        supabase.table(table).upsert(chunk, on_conflict="source,external_id").execute()
    new = sum(1 for r in rows if r["external_id"] not in existing)
    return new, len(rows) - new


# ------------------------------------------------------------------- notícias
def run_news_pipeline(supabase: Client, settings: Settings) -> dict[str, Any]:
    summary: dict[str, Any] = {"job": "news", "sources": {}}

    results = collect_news(timeout=settings.http_timeout_seconds)
    for source_key, outcome in results.items():
        started = _utc_now_iso()
        if isinstance(outcome, Exception):
            _log_run(supabase, "news", source_key, started, status="error", error=str(outcome)[:500])
            summary["sources"][source_key] = {"error": str(outcome)}
            continue

        items: list[CollectedNews] = outcome
        rows = [item.to_row() for item in items]
        new, updated = _upsert_rows(supabase, "biosphere_news", source_key, rows)
        _log_run(supabase, "news", source_key, started, found=len(items), new=new, updated=updated)
        summary["sources"][source_key] = {"found": len(items), "new": new, "updated": updated}

    summary["llm_filter"] = _apply_llm_filter(supabase, settings)
    return summary


def _apply_llm_filter(supabase: Client, settings: Settings, batch_limit: int = 80) -> dict[str, Any]:
    pending = (
        supabase.table("biosphere_news")
        .select("*")
        .eq("llm_verdict", "pending")
        .order("published_at", desc=True)
        .limit(batch_limit)
        .execute()
    ).data or []

    if not pending:
        return {"pending": 0}

    enabled = settings.news_llm_filter_enabled and settings.gemini_api_key
    started = _utc_now_iso()

    if not enabled:
        # Filtro desligado/sem chave: keywords já validaram; publica como 'skipped'.
        return _finalize_pending(supabase, pending, verdict_by_index={}, model=None)

    try:
        verdicts = GeminiNewsFilter(settings).classify(
            [{"title": row["title"], "summary": row.get("summary")} for row in pending]
        )
        verdict_by_index = {v.indice: v for v in verdicts}
        result = _finalize_pending(
            supabase, pending, verdict_by_index, model=settings.filter_model
        )
        _log_run(
            supabase, "news", "gemini_filter", started,
            found=len(pending),
            updated=result["approved"] + result["rejected"],
            rejected=result["rejected"],
            metadata={"model": settings.filter_model},
        )
        return result
    except Exception as exc:  # noqa: BLE001 — fail-open documentado
        logger.error("Filtro LLM indisponível (%s); aplicando fail-open.", exc)
        result = _finalize_pending(supabase, pending, verdict_by_index={}, model=None)
        _log_run(
            supabase, "news", "gemini_filter", started,
            status="partial", found=len(pending), error=str(exc)[:500],
        )
        return result


def _finalize_pending(
    supabase: Client,
    pending: list[dict[str, Any]],
    verdict_by_index: dict[int, Any],
    model: str | None,
) -> dict[str, Any]:
    approved = rejected = skipped = 0
    now = _utc_now_iso()

    for index, row in enumerate(pending):
        verdict = verdict_by_index.get(index)
        if verdict is None:
            row["llm_verdict"] = VISIBLE_WITHOUT_LLM
            skipped += 1
        elif verdict.aprovar:
            row["llm_verdict"] = "approved"
            approved += 1
        else:
            row["llm_verdict"] = "rejected"
            rejected += 1
        if verdict is not None:
            row["llm_score"] = round(float(verdict.score), 3)
            row["llm_reason"] = verdict.motivo[:300]
            row["llm_model"] = model
        row["updated_at"] = now

    for chunk in _chunked(pending, 100):
        supabase.table("biosphere_news").upsert(chunk, on_conflict="source,external_id").execute()

    return {"pending": len(pending), "approved": approved, "rejected": rejected, "skipped": skipped}


# -------------------------------------------------------------------- eventos
def run_events_pipeline(supabase: Client, settings: Settings) -> dict[str, Any]:
    summary: dict[str, Any] = {"job": "events", "sources": {}}
    now = datetime.now(timezone.utc)

    collectors = (
        ("sympla", collect_sympla_events),
        ("inea", collect_inea_events),
    )

    for source_key, collector in collectors:
        started = _utc_now_iso()
        try:
            events: list[CollectedEvent] = collector(timeout=settings.http_timeout_seconds)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[events:%s] coleta falhou", source_key)
            _log_run(supabase, "events", source_key, started, status="error", error=str(exc)[:500])
            summary["sources"][source_key] = {"error": str(exc)}
            continue

        # Reforço das invariantes do produto (os coletores já filtram):
        # ainda vai acontecer (início ou término futuro) + presencial só no RJ /
        # online Brasil + link de inscrição.
        valid = [
            e for e in events
            if (e.starts_at > now or (e.ends_at is not None and e.ends_at > now))
            and e.in_product_scope() and e.registration_url
        ]
        rejected = len(events) - len(valid)

        rows = [event.to_row() for event in valid]
        new, updated = _upsert_rows(supabase, "biosphere_events", source_key, rows)
        _log_run(
            supabase, "events", source_key, started,
            found=len(events), new=new, updated=updated, rejected=rejected,
        )
        summary["sources"][source_key] = {
            "found": len(events), "valid": len(valid), "new": new, "updated": updated,
        }

    summary["expired"] = expire_past_events(supabase)
    return summary


def expire_past_events(supabase: Client) -> int:
    """Marca como 'expired' eventos ativos cuja data (fim ou início) já passou."""
    started = _utc_now_iso()
    now = _utc_now_iso()
    response = (
        supabase.table("biosphere_events")
        .update({"status": "expired", "updated_at": now})
        .eq("status", "active")
        .or_(f"and(ends_at.is.null,starts_at.lt.{now}),ends_at.lt.{now}")
        .execute()
    )
    expired = len(response.data or [])
    if expired:
        _log_run(supabase, "expire", "scheduler", started, updated=expired)
    logger.info("[events] %d eventos expirados", expired)
    return expired
