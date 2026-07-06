"""Camada de relevância em dois estágios.

1) Filtro de palavras-chave (grátis, sempre ativo): descarta ruído óbvio e
   marca tópicos canônicos.
2) Sanity check com Gemini Flash Lite (opcional, NEWS_LLM_FILTER=true): valida
   em lote se cada notícia agrega valor à jornada ecológica, descartando ruído
   político e sensacionalismo. Falha da LLM => fail-open: o item fica com
   verdict 'skipped' (visível no app), nunca some por indisponibilidade de API.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ..config import Settings
from .parsing import normalize_for_match

logger = logging.getLogger(__name__)

# Tópicos canônicos exibíveis no app -> termos (sem acento, casados por palavra
# inteira via \b — "reservas" de futebol não casa com "reserva natural").
TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "clima": ("clima", "climatico", "climatica", "mudanca climatica", "aquecimento global",
              "emissoes", "emissao de carbono", "gases de efeito estufa", "efeito estufa",
              "carbono", "el nino", "la nina", "onda de calor", "seca", "estiagem",
              "enchente", "alagamento", "temporal", "ressaca", "nivel do mar"),
    "biodiversidade": ("biodiversidade", "fauna", "flora", "especie", "especies",
                       "animais silvestres", "mata atlantica", "amazonia", "cerrado",
                       "restinga", "manguezal", "corais", "baleia", "tartaruga",
                       "mico-leao", "onca", "trafico de animais"),
    "conservacao": ("conservacao", "preservacao", "unidade de conservacao", "parque estadual",
                    "parque nacional", "reserva natural", "reserva biologica",
                    "reserva ecologica", "reserva ambiental", "reserva extrativista",
                    "desmatamento", "reflorestamento", "restauracao ecologica",
                    "restauracao florestal", "nascente", "ibama", "icmbio", "inea"),
    "residuos": ("reciclagem", "residuo", "residuos", "lixo", "compostagem",
                 "coleta seletiva", "plastico", "aterro sanitario", "logistica reversa"),
    "agua": ("agua", "recursos hidricos", "crise hidrica", "saneamento", "esgoto",
             "balneabilidade", "lagoa", "baia de guanabara", "poluicao"),
    "energia": ("energia solar", "energia eolica", "energia renovavel", "energia limpa",
                "eficiencia energetica", "transicao energetica", "fotovoltaica"),
    "transicao_verde": ("sustentabilidade", "sustentavel", "economia verde", "economia circular",
                        "transicao verde", "bioeconomia", "agroecologia",
                        "agricultura organica", "meio ambiente", "ambiental",
                        "educacao ambiental", "mutirao", "plantio", "horta comunitaria"),
}

# Ruído a descartar mesmo quando alguma palavra ambiental aparece de raspão.
NOISE_KEYWORDS: tuple[str, ...] = (
    "futebol", "flamengo", "vasco", "botafogo", "fluminense fc", "campeonato",
    "copa do mundo", "libertadores", "selecao brasileira", "torcedores",
    "bbb", "big brother", "novela", "celebridade", "famosos", "loteria",
    "mega-sena", "horoscopo", "eleicao", "eleicoes", "candidato", "partido",
    "camara dos deputados", "senado", "cpi", "impeachment", "pesquisa eleitoral",
    "iptu", "ipva", "concurso publico", "enem", "vestibular",
    "homicidio", "assassinato", "tiroteio", "assalto", "granada", "feminicidio",
    "trafico de drogas", "operacao policial",
)


@lru_cache(maxsize=512)
def _term_pattern(term: str) -> re.Pattern[str]:
    return re.compile(rf"\b{re.escape(term)}\b")


def _matches_any(haystack: str, terms: tuple[str, ...]) -> bool:
    return any(_term_pattern(term).search(haystack) for term in terms)


def keyword_topics(*texts: str) -> list[str]:
    haystack = normalize_for_match(" ".join(t for t in texts if t))
    return [topic for topic, terms in TOPIC_KEYWORDS.items() if _matches_any(haystack, terms)]


def looks_like_noise(*texts: str) -> bool:
    haystack = normalize_for_match(" ".join(t for t in texts if t))
    return _matches_any(haystack, NOISE_KEYWORDS)


def keyword_gate(title: str, summary: str, require_match: bool) -> tuple[bool, list[str]]:
    """(passa?, tópicos).

    Fontes generalistas (require_match=True: G1 Rio, Agência Brasil geral)
    exigem tópico ambiental NO TÍTULO — os resumos desses feeds embutem listas
    de "veja também" que geram falso positivo. Fontes especializadas (O Eco,
    G1 Natureza) só bloqueiam ruído. Os tópicos retornados usam título+resumo.
    """
    if looks_like_noise(title, summary):
        return False, []
    if require_match and not keyword_topics(title):
        return False, []
    return True, keyword_topics(title, summary)


# ----------------------------------------------------------------- filtro LLM
class NewsVerdict(BaseModel):
    indice: int = Field(ge=0, description="Índice do item na lista enviada.")
    aprovar: bool = Field(
        description="true somente se a notícia agrega valor real à jornada ecológica."
    )
    score: float = Field(ge=0, le=1, description="Confiança na decisão.")
    motivo: str = Field(description="Justificativa em uma frase curta.")


FILTER_SYSTEM_INSTRUCTION = """Você é o curador do feed Biosfera do app Rootine (sustentabilidade, conservação, clima, biodiversidade e transição verde no Brasil, com foco no Rio de Janeiro).
Avalie cada item (título + resumo) e decida se ele agrega valor à jornada ecológica de um usuário comum.
Aprove: conservação, clima e eventos climáticos, biodiversidade, poluição, balneabilidade, reciclagem, energia limpa, soluções e políticas ambientais concretas, ciência ambiental.
Rejeite: disputa político-partidária sem conteúdo ambiental concreto, sensacionalismo, fofoca, esporte, entretenimento, crime comum, itens cujo vínculo ambiental é apenas retórico.
Responda estritamente no JSON pedido, um veredito por item, na mesma ordem."""


class GeminiNewsFilter:
    """Sanity check em lote — um request para até `chunk_size` notícias."""

    def __init__(self, settings: Settings, chunk_size: int = 20):
        self._settings = settings
        self._chunk_size = chunk_size
        self._client = genai.Client(api_key=settings.require_gemini_key())

    def classify(self, items: list[dict]) -> list[NewsVerdict]:
        """items: [{"title": ..., "summary": ...}, ...] -> vereditos alinhados por índice."""
        verdicts: list[NewsVerdict] = []
        for start in range(0, len(items), self._chunk_size):
            chunk = items[start : start + self._chunk_size]
            payload = [
                {
                    "indice": start + offset,
                    "titulo": item.get("title", ""),
                    "resumo": (item.get("summary") or "")[:280],
                }
                for offset, item in enumerate(chunk)
            ]
            response = self._client.models.generate_content(
                model=self._settings.filter_model,
                contents=json.dumps(payload, ensure_ascii=False),
                config=types.GenerateContentConfig(
                    system_instruction=FILTER_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=list[NewsVerdict],
                    temperature=0.0,
                    # Classificação não precisa de raciocínio longo: corta custo/latência.
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            parsed = response.parsed
            if not isinstance(parsed, list):
                raise ValueError("Filtro LLM não retornou a lista esperada.")
            verdicts.extend(parsed)
        return verdicts
