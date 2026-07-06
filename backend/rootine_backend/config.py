"""Carregamento e validação de configuração via variáveis de ambiente (.env)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Procura o .env na raiz de backend/ independentemente do cwd.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()  # fallback: .env do diretório atual, sem sobrescrever o anterior


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    gemini_api_key: str | None
    quiz_model: str
    filter_model: str
    news_llm_filter_enabled: bool
    quiz_api_token: str | None
    http_timeout_seconds: float

    @classmethod
    def from_env(cls) -> "Settings":
        supabase_url = os.getenv("SUPABASE_URL", "").strip()
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        missing = [
            name
            for name, value in (
                ("SUPABASE_URL", supabase_url),
                ("SUPABASE_SERVICE_ROLE_KEY", service_key),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(
                "Variáveis obrigatórias ausentes no .env: " + ", ".join(missing)
            )

        return cls(
            supabase_url=supabase_url,
            supabase_service_role_key=service_key,
            gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip() or None,
            quiz_model=os.getenv("GEMINI_QUIZ_MODEL", "gemini-2.5-flash").strip(),
            filter_model=os.getenv("GEMINI_FILTER_MODEL", "gemini-2.5-flash-lite").strip(),
            news_llm_filter_enabled=_env_bool("NEWS_LLM_FILTER", True),
            quiz_api_token=os.getenv("QUIZ_API_TOKEN", "").strip() or None,
            http_timeout_seconds=float(os.getenv("HTTP_TIMEOUT_SECONDS", "20")),
        )

    def require_gemini_key(self) -> str:
        if not self.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY não configurada no .env — obrigatória para gerar quiz "
                "ou rodar o filtro LLM de notícias."
            )
        return self.gemini_api_key
