"""API HTTP mínima do serviço de quiz (FastAPI).

Uso: o app (ou uma Edge Function proxy) chama POST /v1/quiz/generate com o
token compartilhado. Rode com:

    uvicorn rootine_backend.quiz.api:app --port 8000
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from ..config import Settings
from ..db import get_supabase
from .service import QuizGenerationError, QuizGeneratorService

app = FastAPI(title="Rootine — Quiz Adaptativo (Gemini)", version="1.0.0")


class GenerateQuizRequest(BaseModel):
    user_id: str = Field(min_length=8, description="UUID do usuário (profiles.id)")
    persist: bool = True


@lru_cache(maxsize=1)
def _service() -> QuizGeneratorService:
    settings = Settings.from_env()
    return QuizGeneratorService(settings, get_supabase(settings))


def _check_token(authorization: str | None = Header(default=None)) -> None:
    expected = Settings.from_env().quiz_api_token
    if not expected:
        raise HTTPException(500, "QUIZ_API_TOKEN não configurado no servidor.")
    if authorization != f"Bearer {expected}":
        raise HTTPException(401, "Token inválido.")


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/v1/quiz/generate", dependencies=[Depends(_check_token)])
def generate_quiz(body: GenerateQuizRequest) -> dict:
    try:
        quiz = _service().generate_for_user(body.user_id, persist=body.persist)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except QuizGenerationError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"success": True, "quiz": quiz}
