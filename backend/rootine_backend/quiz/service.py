"""Serviço de geração de quiz adaptativo com Gemini (saída estruturada estrita).

Fluxo:
  1. build_quiz_context lê a view v_user_quiz_context (nível, missões
     concluídas/falhas, acurácia de quiz, interesses) e fecha o foco adaptativo.
  2. O Gemini é chamado com system_instruction fixa do produto,
     response_mime_type="application/json" e response_schema=GeneratedQuiz —
     o SDK converte o modelo Pydantic no schema estrito da API.
  3. As alternativas são embaralhadas localmente (LLMs tendem a colocar a
     correta no índice 0) e o quiz é persistido em public.quizzes no MESMO
     shape que o app já consome: options [{id:"A",text}], correct_option "A".."D".
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import time
from typing import Any

from google import genai
from google.genai import errors, types
from supabase import Client

from ..config import Settings
from .context import build_quiz_context
from .schemas import GeneratedQuiz, QuizContext

logger = logging.getLogger(__name__)

PROMPT_VERSION = "gemini_adaptive_v1"
OPTION_IDS = ("A", "B", "C", "D")
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 3

SYSTEM_INSTRUCTION = """Você é o motor de gamificação e conscientização do aplicativo Rootine.
Seu objetivo é gerar uma pergunta de quiz inédita, de múltipla escolha, com 4 opções e apenas 1 correta.
A pergunta deve fundir a filosofia do app (sustentabilidade, hábitos naturais, saúde ancestral) com os dados contextuais do usuário fornecidos.
Retorne estritamente um JSON no formato especificado.

Regras de qualidade obrigatórias:
- Escreva em português brasileiro, com tom acolhedor e prático (o usuário é um "Guardião" cuidando do seu habitat).
- Respeite o foco_desta_pergunta: no modo reinforce_weak, eduque sobre o fundamento do hábito em que o usuário está falhando; no modo challenge_strong, aprofunde com conhecimento avançado; no modo explore, desperte curiosidade sobre o tema.
- Calibre a complexidade pela dificuldade_alvo_1_a_5 (1 = noções básicas, 5 = detalhes científicos e trade-offs).
- Os 3 distratores devem ser plausíveis para uma pessoa apressada, com tom, tamanho e especificidade parecidos com a resposta correta.
- Proibido: alternativas absurdas, moralistas ou caricatas; pistas como "sempre", "nunca", "qualquer coisa"; prefixos "A)", "B)"; repetir qualquer pergunta da lista nao_repetir_estas_perguntas.
- Deve existir exatamente uma melhor resposta, defensável cientificamente.
- A explicacao_educativa deve ensinar o porquê em até 3 frases, citando o mecanismo (científico ou filosófico), sem jargão vazio."""


class QuizGenerationError(RuntimeError):
    """Falha definitiva ao gerar quiz (após retries e validação)."""


class QuizGeneratorService:
    def __init__(self, settings: Settings, supabase: Client):
        self._settings = settings
        self._supabase = supabase
        self._client = genai.Client(api_key=settings.require_gemini_key())

    # ------------------------------------------------------------------ público
    def generate_for_user(self, user_id: str, persist: bool = True) -> dict[str, Any]:
        context = build_quiz_context(self._supabase, user_id)
        generated = self._call_gemini(context)
        quiz_row = self._materialize(context, generated)

        if persist:
            quiz_row = self._persist(context, generated, quiz_row)

        return quiz_row

    # ------------------------------------------------------------ chamada Gemini
    def _call_gemini(self, context: QuizContext) -> GeneratedQuiz:
        payload = json.dumps(context.to_prompt_payload(), ensure_ascii=False, indent=2)
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=GeneratedQuiz,
            temperature=1.0,
            top_p=0.95,
        )

        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = self._client.models.generate_content(
                    model=self._settings.quiz_model,
                    contents=(
                        "Gere a próxima pergunta do quiz para este contexto de usuário:\n"
                        f"{payload}"
                    ),
                    config=config,
                )
                return self._extract(response)
            except errors.APIError as exc:
                last_error = exc
                if exc.code in RETRYABLE_STATUS and attempt < MAX_ATTEMPTS:
                    wait = 2 ** attempt
                    logger.warning(
                        "Gemini retornou %s (tentativa %d/%d); aguardando %ss",
                        exc.code, attempt, MAX_ATTEMPTS, wait,
                    )
                    time.sleep(wait)
                    continue
                raise QuizGenerationError(f"Gemini API falhou: {exc}") from exc
            except (ValueError, json.JSONDecodeError) as exc:
                # JSON fora do schema: uma nova tentativa costuma resolver.
                last_error = exc
                if attempt < MAX_ATTEMPTS:
                    logger.warning("Saída inválida do Gemini (%s); regenerando.", exc)
                    continue

        raise QuizGenerationError(f"Não foi possível gerar quiz válido: {last_error}")

    @staticmethod
    def _extract(response: types.GenerateContentResponse) -> GeneratedQuiz:
        parsed = response.parsed
        if isinstance(parsed, GeneratedQuiz):
            return parsed
        # Fallback: valida o texto bruto contra o schema Pydantic.
        return GeneratedQuiz.model_validate_json(response.text or "")

    # ------------------------------------------------------- materialização/DB
    def _materialize(self, context: QuizContext, quiz: GeneratedQuiz) -> dict[str, Any]:
        """Embaralha alternativas e converte para o shape consumido pelo app."""
        assert context.focus is not None
        seed = hashlib.sha256(
            f"{context.user_id}:{quiz.pergunta}".encode("utf-8")
        ).hexdigest()
        rng = random.Random(seed)

        indexed = list(enumerate(quiz.opcoes))
        rng.shuffle(indexed)

        options = []
        correct_option = "A"
        for slot, (original_index, text) in enumerate(indexed):
            option_id = OPTION_IDS[slot]
            options.append({"id": option_id, "text": text})
            if original_index == quiz.resposta_correta_index:
                correct_option = option_id

        return {
            "user_id": context.user_id,
            "question": quiz.pergunta,
            "options": options,
            "correct_option": correct_option,
            "explanation": quiz.explicacao_educativa,
            "category": context.focus.category,
            "origin": "gemini_adaptive",
            "difficulty": context.target_difficulty,
            "topic": context.focus.category,
            "focus_mode": context.focus.mode,
            "model": self._settings.quiz_model,
            "prompt_version": PROMPT_VERSION,
            "generation_context": {
                "focus_reason": context.focus.reason,
                "level": context.level,
                "milestone": context.milestone,
                "interests": context.interest_categories,
                "raw_correct_index": quiz.resposta_correta_index,
            },
        }

    def _persist(
        self, context: QuizContext, generated: GeneratedQuiz, quiz_row: dict[str, Any]
    ) -> dict[str, Any]:
        insert = self._supabase.table("quizzes").insert(quiz_row).execute()
        if not insert.data:
            raise QuizGenerationError("Insert em public.quizzes não retornou linha.")
        saved = insert.data[0]

        # Observabilidade no mesmo padrão das Edge Functions existentes.
        try:
            self._supabase.table("agent_interactions").insert(
                {
                    "user_id": context.user_id,
                    "agent": "quiz_gemini",
                    "event_type": "GENERATE_ADAPTIVE_QUIZ",
                    "input_summary": context.to_prompt_payload()["foco_desta_pergunta"],
                    "output": {
                        "quiz_id": saved["id"],
                        "model": self._settings.quiz_model,
                        "prompt_version": PROMPT_VERSION,
                        "correct_option": quiz_row["correct_option"],
                    },
                }
            ).execute()
        except Exception:  # log é acessório: nunca derruba a geração
            logger.exception("Falha ao registrar agent_interactions (ignorada).")

        return saved
