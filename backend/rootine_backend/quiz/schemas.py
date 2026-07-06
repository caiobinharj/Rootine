"""Schemas do motor de quiz.

GeneratedQuiz é passado diretamente como response_schema ao SDK google-genai:
o Gemini fica obrigado a responder JSON válido nesse formato
(response_mime_type="application/json").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Domínios canônicos do app (mesmo vocabulário de user_missions/quiz_questions).
CANONICAL_CATEGORIES = ("water", "energy", "waste", "transport", "food", "consumption")

CATEGORY_LABELS_PT: dict[str, str] = {
    "water": "água e consumo consciente de recursos hídricos",
    "energy": "energia e eficiência no dia a dia",
    "waste": "resíduos, reciclagem e compostagem",
    "transport": "mobilidade sustentável",
    "food": "alimentação natural, densa em nutrientes e de baixo impacto",
    "consumption": "consumo consciente e vida simples",
}

FocusMode = Literal["reinforce_weak", "challenge_strong", "explore"]


class GeneratedQuiz(BaseModel):
    """Formato estrito exigido do Gemini (espelha o response_schema do produto)."""

    pergunta: str = Field(description="Pergunta inédita de múltipla escolha, em pt-BR.")
    opcoes: list[str] = Field(
        min_length=4,
        max_length=4,
        description="Exatamente 4 alternativas plausíveis, sem prefixos A/B/C/D.",
    )
    resposta_correta_index: int = Field(
        ge=0, le=3, description="Índice de 0 a 3 da resposta correta."
    )
    explicacao_educativa: str = Field(
        description="Explicação científica ou filosófica breve do porquê a resposta está correta."
    )

    @field_validator("opcoes")
    @classmethod
    def _opcoes_unicas(cls, opcoes: list[str]) -> list[str]:
        limpas = [opcao.strip() for opcao in opcoes]
        if any(not opcao for opcao in limpas):
            raise ValueError("Toda alternativa precisa de texto não vazio.")
        normalizadas = {opcao.casefold() for opcao in limpas}
        if len(normalizadas) != 4:
            raise ValueError("As 4 alternativas precisam ser distintas entre si.")
        return limpas

    @field_validator("pergunta", "explicacao_educativa")
    @classmethod
    def _texto_minimo(cls, valor: str) -> str:
        valor = valor.strip()
        if len(valor) < 16:
            raise ValueError("Texto curto demais para um quiz de qualidade.")
        return valor


@dataclass
class QuizFocus:
    mode: FocusMode
    category: str
    reason: str


@dataclass
class QuizContext:
    """Payload contextual enviado ao Gemini (context-awareness)."""

    user_id: str
    xp: int
    level: int
    milestone: str
    mission_stats: dict[str, dict[str, int]] = field(default_factory=dict)
    quiz_stats: dict[str, dict[str, int]] = field(default_factory=dict)
    interest_categories: list[str] = field(default_factory=list)
    recent_questions: list[str] = field(default_factory=list)
    focus: QuizFocus | None = None
    target_difficulty: int = 2

    def to_prompt_payload(self) -> dict:
        assert self.focus is not None, "choose_focus deve rodar antes do prompt"
        return {
            "usuario": {
                "nivel": self.level,
                "marco_da_arvore": self.milestone,
                "xp": self.xp,
            },
            "desempenho_missoes_30d": self.mission_stats,
            "desempenho_quiz_30d": self.quiz_stats,
            "topicos_de_interesse_recente": [
                CATEGORY_LABELS_PT.get(categoria, categoria)
                for categoria in self.interest_categories
            ],
            "foco_desta_pergunta": {
                "modo": self.focus.mode,
                "categoria": self.focus.category,
                "tema_em_portugues": CATEGORY_LABELS_PT.get(
                    self.focus.category, self.focus.category
                ),
                "motivo": self.focus.reason,
            },
            "dificuldade_alvo_1_a_5": self.target_difficulty,
            "nao_repetir_estas_perguntas": self.recent_questions,
        }
