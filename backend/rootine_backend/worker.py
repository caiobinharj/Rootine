"""Worker CLI do backend Rootine.

Comandos:
  python -m rootine_backend.worker collect-news         # notícias + filtro LLM
  python -m rootine_backend.worker collect-events       # Sympla + INEA + expiração
  python -m rootine_backend.worker run-all              # rodada completa (uma vez)
  python -m rootine_backend.worker run-all --loop       # roda a cada 12h (worker síncrono)
  python -m rootine_backend.worker demo-quiz --user-id <uuid> [--no-persist]
  python -m rootine_backend.worker serve-api --port 8000

Agendamento recomendado em produção: cron/Task Scheduler chamando `run-all`
a cada 12h (ver README). O modo --loop existe para ambientes sem cron.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time

from .config import Settings
from .db import get_supabase


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )


def _print(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


def cmd_collect_news(settings: Settings) -> dict:
    from .biosphere.pipeline import run_news_pipeline

    return run_news_pipeline(get_supabase(settings), settings)


def cmd_collect_events(settings: Settings) -> dict:
    from .biosphere.pipeline import run_events_pipeline

    return run_events_pipeline(get_supabase(settings), settings)


def cmd_run_all(settings: Settings, loop: bool, interval_hours: float) -> None:
    while True:
        started = time.monotonic()
        summary = {
            "news": cmd_collect_news(settings),
            "events": cmd_collect_events(settings),
        }
        _print(summary)
        if not loop:
            return
        elapsed = time.monotonic() - started
        sleep_for = max(60.0, interval_hours * 3600 - elapsed)
        logging.getLogger(__name__).info(
            "Próxima rodada em %.1f horas.", sleep_for / 3600
        )
        time.sleep(sleep_for)


def cmd_demo_quiz(settings: Settings, user_id: str, persist: bool) -> dict:
    from .quiz.service import QuizGeneratorService

    service = QuizGeneratorService(settings, get_supabase(settings))
    return service.generate_for_user(user_id, persist=persist)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="rootine-worker", description=__doc__)
    parser.add_argument("--verbose", action="store_true", help="logs em nível DEBUG")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("collect-news", help="coleta RSS de notícias + filtro Gemini Flash")
    commands.add_parser("collect-events", help="coleta Sympla/INEA + expira eventos passados")

    run_all = commands.add_parser("run-all", help="rodada completa de coleta")
    run_all.add_argument("--loop", action="store_true", help="repete indefinidamente")
    run_all.add_argument("--interval-hours", type=float, default=12.0)

    demo = commands.add_parser("demo-quiz", help="gera um quiz adaptativo para um usuário")
    demo.add_argument("--user-id", required=True, help="UUID em public.profiles")
    demo.add_argument("--no-persist", action="store_true", help="não grava em public.quizzes")

    serve = commands.add_parser("serve-api", help="sobe a API FastAPI do quiz")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=8000)

    args = parser.parse_args(argv)
    _configure_logging(args.verbose)
    settings = Settings.from_env()

    if args.command == "collect-news":
        _print(cmd_collect_news(settings))
    elif args.command == "collect-events":
        _print(cmd_collect_events(settings))
    elif args.command == "run-all":
        cmd_run_all(settings, loop=args.loop, interval_hours=args.interval_hours)
    elif args.command == "demo-quiz":
        _print(cmd_demo_quiz(settings, args.user_id, persist=not args.no_persist))
    elif args.command == "serve-api":
        import uvicorn

        uvicorn.run("rootine_backend.quiz.api:app", host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
