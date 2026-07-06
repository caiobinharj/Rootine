"""Monta o QuizContext a partir do banco e decide o foco adaptativo.

Regras do produto:
- Muitas falhas em um hábito  -> modo reinforce_weak: o quiz educa sobre o tema.
- Alto desempenho em um hábito -> modo challenge_strong: pergunta avançada.
- Sem sinal claro              -> modo explore: segue interesses/afinidades.

A escolha entre candidatos empatados é determinística por (usuário, dia),
então o foco varia ao longo da semana sem repetir dentro do mesmo dia.
"""

from __future__ import annotations

import hashlib
from datetime import date

from supabase import Client

from .schemas import CANONICAL_CATEGORIES, QuizContext, QuizFocus

# Espelho de lib/domain/xp.ts (XP_LEVEL_THRESHOLDS). Manter em sincronia.
XP_LEVEL_THRESHOLDS: list[tuple[int, int, str]] = [
    (0, 0, "Semente"),
    (1, 10, "Broto"),
    (2, 45, "Folhas novas"),
    (3, 100, "Muda firme"),
    (4, 180, "Primeiros galhos"),
    (5, 300, "Árvore jovem"),
    (6, 470, "Copa aberta"),
    (7, 700, "Habitat vivo"),
    (8, 1000, "Florescimento"),
    (9, 1400, "Frutos"),
    (10, 1900, "Ecossistema maduro"),
    (11, 2500, "Bosque"),
    (12, 3200, "Referência sustentável"),
]

MIN_FAILED_FOR_WEAK = 2
MIN_ANSWERED_FOR_SIGNAL = 3
WEAK_FAILURE_RATE = 0.5
STRONG_ACCURACY = 0.8
STRONG_COMPLETED = 3


def xp_minimum_for_level(level: int) -> int:
    level = max(0, int(level))
    for known_level, xp, _ in XP_LEVEL_THRESHOLDS:
        if known_level == level:
            return xp
    xp = XP_LEVEL_THRESHOLDS[-1][1]
    for current in range(12, level):
        xp += round(700 + (current - 12) * 180)
    return xp


def level_from_xp(raw_xp: int) -> tuple[int, str]:
    xp = max(0, int(raw_xp or 0))
    level = 0
    while xp_minimum_for_level(level + 1) <= xp:
        level += 1
    milestone = next(
        (name for known, _, name in XP_LEVEL_THRESHOLDS if known == level),
        f"Nível {level}",
    )
    return level, milestone


def _daily_pick(user_id: str, candidates: list[str], salt: str) -> str:
    """Escolha estável por (usuário, dia): varia dia a dia, não a cada request."""
    digest = hashlib.sha256(
        f"{user_id}:{date.today().isoformat()}:{salt}".encode("utf-8")
    ).digest()
    return sorted(candidates)[digest[0] % len(candidates)]


def choose_focus(
    user_id: str,
    mission_stats: dict[str, dict[str, int]],
    quiz_stats: dict[str, dict[str, int]],
    interests: list[str],
) -> QuizFocus:
    weak: dict[str, str] = {}
    strong: dict[str, str] = {}

    for category, stats in mission_stats.items():
        completed = int(stats.get("completed", 0))
        failed = int(stats.get("failed", 0))
        total = completed + failed
        if total == 0:
            continue
        failure_rate = failed / total
        if failed >= MIN_FAILED_FOR_WEAK and failure_rate >= WEAK_FAILURE_RATE:
            weak[category] = (
                f"{failed} de {total} missões de {category} falharam nos últimos 30 dias"
            )
        elif completed >= STRONG_COMPLETED and failure_rate <= 0.2:
            strong[category] = (
                f"{completed} missões de {category} concluídas com consistência"
            )

    for category, stats in quiz_stats.items():
        answered = int(stats.get("answered", 0))
        correct = int(stats.get("correct", 0))
        if answered < MIN_ANSWERED_FOR_SIGNAL:
            continue
        accuracy = correct / answered
        if accuracy < 0.5:
            weak.setdefault(
                category,
                f"acertou só {correct} de {answered} quizzes de {category} em 30 dias",
            )
        elif accuracy >= STRONG_ACCURACY:
            strong.setdefault(
                category,
                f"acertou {correct} de {answered} quizzes de {category} em 30 dias",
            )

    if weak:
        category = _daily_pick(user_id, list(weak), "weak")
        return QuizFocus("reinforce_weak", category, weak[category])
    if strong:
        category = _daily_pick(user_id, list(strong), "strong")
        return QuizFocus("challenge_strong", category, strong[category])

    pool = [c for c in interests if c in CANONICAL_CATEGORIES] or list(CANONICAL_CATEGORIES)
    category = _daily_pick(user_id, pool, "explore")
    return QuizFocus("explore", category, "sem sinal forte recente; explorando interesses")


def target_difficulty(level: int, mode: str) -> int:
    if level <= 2:
        base = 1
    elif level <= 5:
        base = 2
    elif level <= 8:
        base = 3
    else:
        base = 4
    if mode == "challenge_strong":
        base += 1
    elif mode == "reinforce_weak":
        base -= 1
    return min(5, max(1, base))


def build_quiz_context(supabase: Client, user_id: str) -> QuizContext:
    """Lê a view v_user_quiz_context (migração 2026-07-05) e fecha o foco."""
    response = (
        supabase.table("v_user_quiz_context")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise LookupError(
            f"Usuário {user_id} não encontrado em v_user_quiz_context. "
            "Confirme o user_id e se a migração SQL foi aplicada."
        )

    row = response.data[0]
    xp = int(row.get("xp") or 0)
    level, milestone = level_from_xp(xp)
    mission_stats = row.get("mission_stats") or {}
    quiz_stats = row.get("quiz_stats") or {}

    interests: list[str] = list(row.get("recent_interest_categories") or [])
    affinities = row.get("affinities") or {}
    if isinstance(affinities, dict):
        interests.extend(str(key) for key in affinities.keys())
    # dedupe preservando ordem
    interests = list(dict.fromkeys(interests))

    focus = choose_focus(user_id, mission_stats, quiz_stats, interests)

    return QuizContext(
        user_id=user_id,
        xp=xp,
        level=level,
        milestone=milestone,
        mission_stats=mission_stats,
        quiz_stats=quiz_stats,
        interest_categories=interests,
        recent_questions=[str(q) for q in (row.get("recent_questions") or [])],
        focus=focus,
        target_difficulty=target_difficulty(level, focus.mode),
    )
