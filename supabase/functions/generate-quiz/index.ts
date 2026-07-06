import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_CATEGORIES,
  ADVENTURE_SCHEMA_VERSION,
  type AdventureCategory,
  hashScore,
  isoDaysAgo,
  utcDayKey,
} from "../_shared/adventure.ts";
import { logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

const BALANCED_QUIZ_ALGORITHM_VERSION = "balanced_quiz_composer_v2";
const OPTION_IDS = ["A", "B", "C", "D"] as const;
const QUIZ_CACHE_TTL_HOURS = 6;

type OptionId = typeof OPTION_IDS[number];
type QuizFocusMode = "reinforce_weak" | "challenge_strong" | "explore";

interface QuizOption {
  id: OptionId;
  text: string;
  feedback?: string;
}

interface BalancedQuiz {
  question: string;
  options: QuizOption[];
  correctOption: OptionId;
  explanation: string;
  source: "ai" | "deterministic_fallback";
  fallbackReason?: string | null;
  fallbackDetail?: string | null;
  agentProvider?: string | null;
  agentModel?: string | null;
  validationIssues?: string[];
}

interface AdaptiveFocus {
  mode: QuizFocusMode;
  category: AdventureCategory;
  reason: string;
  targetDifficulty: number;
}

interface OutcomeBucket {
  answered: number;
  correct: number;
  completed: number;
  refused: number;
  failed: number;
}

interface QuizCacheMetadata {
  quiz_question_id?: string;
  difficulty?: number | null;
  signal_key?: string | null;
  schema_version?: number;
  composer?: BalancedQuiz["source"];
  fallback_reason?: string | null;
  fallback_detail?: string | null;
  ai_provider?: string | null;
  ai_model?: string | null;
  validation_issues?: string[];
  adaptive_focus?: QuizFocusMode;
  adaptive_focus_reason?: string;
  target_difficulty?: number;
  focus?: AdaptiveFocus;
}

const CATEGORY_LABELS: Record<AdventureCategory, string> = {
  water: "água",
  energy: "energia",
  waste: "resíduos",
  transport: "transporte",
  food: "alimentação",
  consumption: "consumo",
};

const XP_LEVEL_THRESHOLDS = [
  0,
  10,
  45,
  100,
  180,
  300,
  470,
  700,
  1000,
  1400,
  1900,
  2500,
  3200,
];

const CATEGORY_FALLBACK_DISTRACTORS: Record<string, string[]> = {
  water: [
    "Priorizar apenas a ação que aparece na conta, mesmo sem observar o uso diário.",
    "Trocar equipamentos antes de confirmar hábitos simples e vazamentos visíveis.",
    "Reduzir um uso visível, mas sem considerar segurança, higiene ou controle real.",
    "Esperar uma mudança grande em casa antes de ajustar pequenos momentos de uso.",
    "Focar só na água direta e ignorar decisões de consumo que também usam água.",
    "Medir apenas uma vez e assumir que todo dia terá o mesmo padrão de uso.",
  ],
  energy: [
    "Trocar aparelhos antes de revisar horários, espera e usos sob controle pessoal.",
    "Reduzir conforto de forma brusca, mesmo quando há ajustes graduais possíveis.",
    "Focar só no valor da conta e ignorar stand-by, iluminação e uso recorrente.",
    "Adiar qualquer ação até conseguir comprar equipamentos mais eficientes.",
    "Concentrar vários usos ao mesmo tempo sem considerar demanda ou segurança.",
    "Mexer em tomadas ou instalações antes de confirmar se o local está seguro.",
  ],
  waste: [
    "Separar muitos materiais de uma vez, mesmo sem espaço ou destino definido.",
    "Guardar resíduos por tempo indefinido para tentar resolver tudo depois.",
    "Priorizar aparência de organização sem verificar contaminação ou coleta real.",
    "Lavar todo material em excesso, mesmo quando isso aumenta água e esforço.",
    "Comprar vários recipientes antes de testar uma separação pequena e consistente.",
    "Tratar todo descarte do mesmo jeito, sem diferenciar risco, material e destino.",
  ],
  transport: [
    "Escolher a opção de menor emissão sem avaliar segurança, distância e energia pessoal.",
    "Planejar apenas pela distância, ignorando horário, acesso e ocupação do veículo.",
    "Substituir deslocamentos por soluções remotas mesmo quando a presença é necessária.",
    "Combinar trajetos sem checar se isso aumenta espera, rota ou esforço total.",
    "Focar em uma troca radical antes de reduzir deslocamentos extras recorrentes.",
    "Comparar modos de transporte sem considerar quantas pessoas dividem a viagem.",
  ],
  food: [
    "Mudar a alimentação inteira antes de observar estoque, validade e desperdício real.",
    "Comprar ingredientes novos para evitar desperdício sem usar o que já existe.",
    "Priorizar impacto ambiental sem respeitar saúde, cultura, acesso ou orçamento.",
    "Planejar refeições sem verificar armazenamento, tempo disponível e segurança.",
    "Reduzir embalagens sem olhar se a escolha aumenta distância ou desperdício.",
    "Focar só em carbono e deixar de fora água, solo, transporte e perdas de alimento.",
  ],
  consumption: [
    "Comprar uma versão verde antes de avaliar reparo, reuso ou necessidade real.",
    "Usar preço promocional como principal critério para decidir uma compra.",
    "Trocar itens que ainda funcionam para sentir que houve uma ação sustentável.",
    "Planejar economia só para compras grandes e ignorar impulsos pequenos recorrentes.",
    "Guardar objetos sem uso definido como se isso sempre evitasse descarte futuro.",
    "Escolher segunda mão sem avaliar segurança, durabilidade e utilidade real.",
  ],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toOptionId(value: unknown): OptionId | null {
  return OPTION_IDS.includes(value as OptionId) ? value as OptionId : null;
}

function isAdventureCategory(value: unknown): value is AdventureCategory {
  return typeof value === "string" && ADVENTURE_CATEGORIES.includes(value as AdventureCategory);
}

function normalizeNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function xpLevel(rawXp: unknown) {
  const xp = Math.max(0, normalizeNumber(rawXp, 0));
  let level = 0;
  for (let index = 0; index < XP_LEVEL_THRESHOLDS.length; index += 1) {
    if (xp >= XP_LEVEL_THRESHOLDS[index]) level = index;
  }
  return level;
}

function emptyBucket(): OutcomeBucket {
  return { answered: 0, correct: 0, completed: 0, refused: 0, failed: 0 };
}

function getCategoryBucket(
  stats: Record<AdventureCategory, OutcomeBucket>,
  category: unknown,
) {
  if (!isAdventureCategory(category)) return null;
  return stats[category] ??= emptyBucket();
}

function readJoinedCategory(answer: any) {
  const quiz = answer?.quizzes;
  if (Array.isArray(quiz)) return quiz[0]?.category;
  if (quiz?.category) return quiz.category;

  const joined = answer?.quiz_questions;
  if (Array.isArray(joined)) return joined[0]?.category;
  return joined?.category;
}

function buildOutcomeStats(recentAnswers: any[], recentMissions: any[]) {
  const stats = Object.fromEntries(
    ADVENTURE_CATEGORIES.map((category) => [category, emptyBucket()]),
  ) as Record<AdventureCategory, OutcomeBucket>;

  for (const answer of recentAnswers) {
    const bucket = getCategoryBucket(stats, readJoinedCategory(answer));
    if (!bucket) continue;
    bucket.answered += 1;
    if (answer?.correct === true) bucket.correct += 1;
  }

  for (const mission of recentMissions) {
    const bucket = getCategoryBucket(stats, mission?.category);
    if (!bucket) continue;
    if (mission?.status === "completed") bucket.completed += 1;
    if (mission?.status === "refused") bucket.refused += 1;
    if (mission?.status === "failed") bucket.failed += 1;
  }

  return stats;
}

function targetDifficultyFor(level: number, mode: QuizFocusMode) {
  let base = level <= 2 ? 1 : level <= 5 ? 2 : level <= 8 ? 3 : 4;
  if (mode === "challenge_strong") base += 1;
  if (mode === "reinforce_weak") base -= 1;
  return Math.max(1, Math.min(5, base));
}

function pickStableCategory(userId: string, categories: AdventureCategory[], salt: string) {
  const pool = categories.length ? categories : [...ADVENTURE_CATEGORIES];
  const seed = `${userId}:${utcDayKey()}:${salt}`;
  return [...pool].sort((left, right) =>
    hashScore(`${seed}:${left}`) - hashScore(`${seed}:${right}`)
  )[0];
}

function chooseAdaptiveFocus(
  userId: string,
  profile: any,
  recentAnswers: any[],
  recentMissions: any[],
): AdaptiveFocus {
  const stats = buildOutcomeStats(recentAnswers, recentMissions);
  const weak: Array<{ category: AdventureCategory; reason: string; score: number }> = [];
  const strong: Array<{ category: AdventureCategory; reason: string; score: number }> = [];

  for (const category of ADVENTURE_CATEGORIES) {
    const bucket = stats[category];
    const wrong = Math.max(0, bucket.answered - bucket.correct);
    const accuracy = bucket.answered > 0 ? bucket.correct / bucket.answered : null;
    const missionFriction = bucket.failed + bucket.refused;
    const missionAttempts = bucket.completed + bucket.failed + bucket.refused;

    if (bucket.answered >= 2 && accuracy !== null && accuracy < 0.6) {
      weak.push({
        category,
        reason: `reforçar ${CATEGORY_LABELS[category]} porque houve ${wrong} revisão(ões) em ${bucket.answered} quiz(es) recentes`,
        score: wrong * 3 + (1 - accuracy) * 4,
      });
    }

    if (missionAttempts >= 2 && missionFriction / missionAttempts >= 0.5) {
      weak.push({
        category,
        reason: `reforçar ${CATEGORY_LABELS[category]} porque missões recentes tiveram mais atrito`,
        score: missionFriction * 2,
      });
    }

    if (bucket.answered >= 3 && accuracy !== null && accuracy >= 0.8) {
      strong.push({
        category,
        reason: `aprofundar ${CATEGORY_LABELS[category]} porque o histórico recente mostra boa precisão`,
        score: bucket.correct + accuracy,
      });
    }

    if (bucket.completed >= 3 && missionFriction === 0) {
      strong.push({
        category,
        reason: `aprofundar ${CATEGORY_LABELS[category]} porque missões recentes foram concluídas com consistência`,
        score: bucket.completed,
      });
    }
  }

  const level = xpLevel(profile?.xp);
  if (weak.length > 0) {
    const bestScore = Math.max(...weak.map((item) => item.score));
    const candidates = weak.filter((item) => item.score === bestScore).map((item) => item.category);
    const category = pickStableCategory(userId, candidates, "weak");
    return {
      mode: "reinforce_weak",
      category,
      reason: weak.find((item) => item.category === category)?.reason ?? `reforçar ${CATEGORY_LABELS[category]}`,
      targetDifficulty: targetDifficultyFor(level, "reinforce_weak"),
    };
  }

  if (strong.length > 0) {
    const bestScore = Math.max(...strong.map((item) => item.score));
    const candidates = strong.filter((item) => item.score === bestScore).map((item) => item.category);
    const category = pickStableCategory(userId, candidates, "strong");
    return {
      mode: "challenge_strong",
      category,
      reason: strong.find((item) => item.category === category)?.reason ?? `aprofundar ${CATEGORY_LABELS[category]}`,
      targetDifficulty: targetDifficultyFor(level, "challenge_strong"),
    };
  }

  const affinities = profile?.affinities && typeof profile.affinities === "object" ? profile.affinities : {};
  const preferred = ADVENTURE_CATEGORIES
    .map((category) => ({ category, affinity: normalizeNumber(affinities[category], 0) }))
    .filter((item) => item.affinity > 0)
    .sort((left, right) => right.affinity - left.affinity)
    .slice(0, 3)
    .map((item) => item.category);
  const category = pickStableCategory(userId, preferred.length ? preferred : [...ADVENTURE_CATEGORIES], "explore");
  return {
    mode: "explore",
    category,
    reason: `explorar ${CATEGORY_LABELS[category]} sem sinal forte de erro ou domínio recente`,
    targetDifficulty: targetDifficultyFor(level, "explore"),
  };
}

function selectAdaptiveQuizQuestion(
  questions: any[],
  recentQuestionIds: Set<string>,
  userId: string,
  focus: AdaptiveFocus,
) {
  const valid = questions.filter((question) => isAdventureCategory(question?.category));
  const preferred = valid.filter((question) => !recentQuestionIds.has(question.id));
  const pool = preferred.length > 0 ? preferred : valid;
  const focused = pool.filter((question) => question.category === focus.category);
  const finalPool = focused.length > 0 ? focused : pool;
  const seed = `${userId}:${utcDayKey()}:adaptive-quiz:${focus.mode}:${focus.category}`;

  return [...finalPool].sort((left, right) => {
    const leftDifficulty = Math.abs(normalizeNumber(left.difficulty, 3) - focus.targetDifficulty);
    const rightDifficulty = Math.abs(normalizeNumber(right.difficulty, 3) - focus.targetDifficulty);
    if (leftDifficulty !== rightDifficulty) return leftDifficulty - rightDifficulty;
    return hashScore(`${seed}:${left.signal_key ?? ""}:${left.id}`) -
      hashScore(`${seed}:${right.signal_key ?? ""}:${right.id}`);
  })[0] ?? null;
}

function cleanQuizText(value: unknown, maxLength = 220) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function optionText(option: unknown) {
  if (typeof option === "string") return cleanQuizText(option, 160);
  const asObject = option && typeof option === "object" && !Array.isArray(option)
    ? option as Record<string, unknown>
    : {};
  return cleanQuizText(asObject.text ?? asObject.texto ?? asObject.label ?? asObject.value, 160);
}

function getCorrectSeedText(selected: any) {
  const options = Array.isArray(selected.options) ? selected.options : [];
  const correct = options.find((option: any) => option?.id === selected.correct_option);
  return optionText(correct) || cleanQuizText(selected.explanation, 160);
}

function readTextField(source: Record<string, unknown>, keys: string[], maxLength = 220) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return cleanQuizText(value, maxLength);
  }
  return "";
}

function readArrayField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function buildOptionFeedback(
  optionTextValue: string,
  isCorrect: boolean,
  correctAnswer: string,
  explanation: string,
  provided?: string,
) {
  const cleanedProvided = cleanQuizText(provided, 220);
  if (cleanedProvided.length >= 18) return cleanedProvided;
  if (isCorrect) return cleanQuizText(explanation, 220);

  const correct = cleanQuizText(correctAnswer, 120);
  const option = cleanQuizText(optionTextValue, 90);
  return cleanQuizText(
    `Essa alternativa não é a mais apropriada: "${option}" desvia do mecanismo central. Compare com a melhor resposta: ${correct}.`,
    220,
  );
}

function normalizeCorrectIndex(value: unknown, length: number) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  if (numeric >= 0 && numeric < length) return numeric;
  if (numeric >= 1 && numeric <= length) return numeric - 1;
  return null;
}

function extractAiQuizDraft(aiResult: any) {
  const source = aiResult && typeof aiResult === "object" && !Array.isArray(aiResult)
    ? aiResult as Record<string, unknown>
    : {};
  let question = readTextField(source, ["question", "pergunta"], 180);
  let correctAnswer = readTextField(source, [
    "correct_answer",
    "correctAnswer",
    "resposta_correta",
    "resposta_correta_texto",
    "alternativa_correta",
  ], 150);
  let distractors = readArrayField(source, [
    "distractors",
    "distratores",
    "wrong_options",
    "alternativas_incorretas",
    "opcoes_incorretas",
  ]).map((item) => optionText(item)).filter(Boolean).slice(0, 3);
  const explanation = readTextField(source, [
    "explanation",
    "explicacao",
    "explicação",
    "explicacao_educativa",
    "justificativa",
  ], 240);
  let correctFeedback = readTextField(source, [
    "correct_feedback",
    "correctFeedback",
    "feedback_correto",
    "comentario_correto",
    "motivo_correto",
  ], 220);
  let distractorFeedbacks = readArrayField(source, [
    "distractor_feedbacks",
    "distractorFeedbacks",
    "feedback_distratores",
    "comentarios_distratores",
    "motivos_distratores",
  ]).map((item) => cleanQuizText(item, 220)).filter(Boolean).slice(0, 3);

  const rawOptions = readArrayField(source, ["options", "opcoes", "opções", "alternatives", "alternativas"]);
  const optionEntries = rawOptions
    .map((option, index) => {
      const asObject = option && typeof option === "object" && !Array.isArray(option)
        ? option as Record<string, unknown>
        : {};
      return {
        index,
        id: typeof asObject.id === "string" ? asObject.id.trim().toUpperCase() : null,
        text: optionText(option),
        feedback: readTextField(asObject, ["feedback", "comment", "comentario", "motivo"], 220),
        correct: asObject.correct === true || asObject.correta === true,
      };
    })
    .filter((option) => option.text);

  if (optionEntries.length >= 4) {
    const correctOptionKey = readTextField(source, [
      "correct_option",
      "correctOption",
      "opcao_correta",
      "opção_correta",
      "alternativa_correta_id",
    ], 8).toUpperCase();
    const correctIndex = normalizeCorrectIndex(
      source.correct_index ?? source.correctIndex ?? source.resposta_correta_index,
      optionEntries.length,
    );
    const correctEntry = optionEntries.find((option) => option.correct) ??
      optionEntries.find((option) => option.id && option.id === correctOptionKey) ??
      (correctIndex === null ? null : optionEntries[correctIndex]);

    if (correctEntry) {
      correctAnswer ||= cleanQuizText(correctEntry.text, 150);
      correctFeedback ||= correctEntry.feedback;
      if (distractors.length < 3) {
        const distractorEntries = optionEntries
          .filter((option) => option.index !== correctEntry.index)
          .filter((option) => normalizeText(option.text) !== normalizeText(correctAnswer))
          .slice(0, 3);
        distractors = distractorEntries.map((option) => cleanQuizText(option.text, 150));
        if (distractorFeedbacks.length < 3) {
          distractorFeedbacks = distractorEntries.map((option) => option.feedback);
        }
      }
    }
  }

  return { question, correctAnswer, distractors, explanation, correctFeedback, distractorFeedbacks };
}

function hasWeakDistractorTone(text: string) {
  const normalized = normalizeText(text);
  const weakSignals = [
    "abrir mais",
    "usar carro para qualquer",
    "deixar motor ligado",
    "ignorar",
    "jogar fora antes",
    "comprar mais",
    "comprar kit",
    "impor mudanca",
    "culpar",
    "desistir",
    "forcar dieta",
    "sem tratamento",
    "ralo ou pia",
    "queima domestica",
    "cor do",
    "marca do",
    "nome da rua",
    "nao usa energia",
    "existe apenas em aplicativos",
    "sempre aumenta",
    "nunca precisam",
    "qualquer distancia",
  ];

  return weakSignals.some((signal) => normalized.includes(signal));
}

function uniqueNormalizedTexts(values: string[]) {
  return new Set(values.map(normalizeText).filter(Boolean));
}

function balancedDraftIssues(input: {
  question: string;
  correctAnswer: string;
  distractors: string[];
  explanation: string;
}) {
  const { question, correctAnswer, distractors, explanation } = input;
  const allOptions = [correctAnswer, ...distractors];
  const issues: string[] = [];
  if (question.length < 24) issues.push("question_too_short");
  if (question.length > 180) issues.push("question_too_long");
  if (explanation.length < 24) issues.push("explanation_too_short");
  if (explanation.length > 260) issues.push("explanation_too_long");
  if (allOptions.length !== 4) issues.push("wrong_option_count");
  if (allOptions.some((text) => text.length < 14)) issues.push("option_too_short");
  if (allOptions.some((text) => text.length > 150)) issues.push("option_too_long");
  if (uniqueNormalizedTexts(allOptions).size !== 4) issues.push("duplicate_options");
  if (distractors.some(hasWeakDistractorTone)) issues.push("weak_distractor_tone");
  if (allOptions.some((text) => /^[A-D][).:-]/i.test(text.trim()))) issues.push("option_has_letter_prefix");
  return issues;
}

function isBalancedDraft(input: {
  question: string;
  correctAnswer: string;
  distractors: string[];
  explanation: string;
}) {
  return balancedDraftIssues(input).length === 0;
}

function materializeOptions(
  correctAnswer: string,
  distractors: string[],
  seed: string,
  feedbacks: {
    correctFeedback?: string;
    distractorFeedbacks?: string[];
    explanation: string;
  },
) {
  const entries = [
    {
      text: correctAnswer,
      correct: true,
      feedback: buildOptionFeedback(
        correctAnswer,
        true,
        correctAnswer,
        feedbacks.explanation,
        feedbacks.correctFeedback,
      ),
    },
    ...distractors.map((text, index) => ({
      text,
      correct: false,
      feedback: buildOptionFeedback(
        text,
        false,
        correctAnswer,
        feedbacks.explanation,
        feedbacks.distractorFeedbacks?.[index],
      ),
    })),
  ].sort((left, right) => hashScore(`${seed}:${left.text}`) - hashScore(`${seed}:${right.text}`));

  let correctOption: OptionId = "A";
  const options = entries.map((entry, index) => {
    const id = OPTION_IDS[index];
    if (entry.correct) correctOption = id;
    return { id, text: entry.text, feedback: entry.feedback };
  });

  return { options, correctOption };
}

function seedOptionsFallback(selected: any) {
  const correctOption = toOptionId(selected?.correct_option);
  const seedOptions = Array.isArray(selected?.options)
    ? selected.options
      .map((option: any) => {
        const id = toOptionId(option?.id);
        const text = optionText(option);
        const isCorrect = id === correctOption;
        const correctAnswer = getCorrectSeedText(selected);
        const feedback = buildOptionFeedback(
          text,
          isCorrect,
          correctAnswer,
          cleanQuizText(selected.explanation, 220),
          option?.feedback ?? option?.comentario ?? option?.motivo,
        );
        return id && text ? { id, text, feedback } : null;
      })
      .filter((option: QuizOption | null): option is QuizOption => Boolean(option))
    : [];

  if (
    correctOption &&
    seedOptions.length === 4 &&
    seedOptions.some((option) => option.id === correctOption) &&
    uniqueNormalizedTexts(seedOptions.map((option) => option.text)).size === 4
  ) {
    return { options: seedOptions, correctOption };
  }

  return null;
}

function deterministicFallbackQuiz(
  selected: any,
  userId: string,
  metadata: Partial<Pick<
    BalancedQuiz,
    "fallbackReason" | "fallbackDetail" | "agentProvider" | "agentModel" | "validationIssues"
  >> = {},
): BalancedQuiz {
  const category = String(selected.category ?? "consumption");
  const seed = `${userId}:${utcDayKey()}:${selected.id}:fallback`;
  const seedFallback = seedOptionsFallback(selected);

  if (seedFallback) {
    return {
      question: cleanQuizText(selected.question, 180),
      options: seedFallback.options,
      correctOption: seedFallback.correctOption,
      explanation: cleanQuizText(selected.explanation, 240),
      source: "deterministic_fallback",
      fallbackReason: metadata.fallbackReason ?? "ai_unavailable_or_invalid_seed_options",
      fallbackDetail: metadata.fallbackDetail ?? null,
      agentProvider: metadata.agentProvider ?? null,
      agentModel: metadata.agentModel ?? null,
      validationIssues: metadata.validationIssues ?? [],
    };
  }

  const fallbackDistractors = CATEGORY_FALLBACK_DISTRACTORS[category] ?? CATEGORY_FALLBACK_DISTRACTORS.consumption;
  const correctAnswer = cleanQuizText(getCorrectSeedText(selected), 150);
  const startIndex = Math.floor(hashScore(seed) * fallbackDistractors.length);
  const distractors = [...fallbackDistractors.slice(startIndex), ...fallbackDistractors.slice(0, startIndex)]
    .filter((text) => normalizeText(text) !== normalizeText(correctAnswer))
    .slice(0, 3);
  const { options, correctOption } = materializeOptions(correctAnswer, distractors, seed, {
    explanation: cleanQuizText(selected.explanation, 220),
  });

  return {
    question: cleanQuizText(selected.question, 180),
    options,
    correctOption,
    explanation: cleanQuizText(selected.explanation, 240),
    source: "deterministic_fallback",
    fallbackReason: metadata.fallbackReason ?? "ai_unavailable_or_invalid_category_fallback",
    fallbackDetail: metadata.fallbackDetail ?? null,
    agentProvider: metadata.agentProvider ?? null,
    agentModel: metadata.agentModel ?? null,
    validationIssues: metadata.validationIssues ?? [],
  };
}

function buildQuizCacheMetadata(
  selected: any,
  balancedQuiz: BalancedQuiz,
  focus: AdaptiveFocus,
): QuizCacheMetadata {
  return {
    quiz_question_id: selected.id,
    difficulty: selected.difficulty ?? null,
    signal_key: selected.signal_key ?? null,
    schema_version: ADVENTURE_SCHEMA_VERSION,
    composer: balancedQuiz.source,
    fallback_reason: balancedQuiz.fallbackReason ?? null,
    fallback_detail: balancedQuiz.fallbackDetail ?? null,
    ai_provider: balancedQuiz.agentProvider ?? null,
    ai_model: balancedQuiz.agentModel ?? null,
    validation_issues: balancedQuiz.validationIssues ?? [],
    adaptive_focus: focus.mode,
    adaptive_focus_reason: focus.reason,
    target_difficulty: focus.targetDifficulty,
    focus,
  };
}

function normalizeQuizCacheMetadata(value: unknown): QuizCacheMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as QuizCacheMetadata
    : {};
}

function quizPayloadFromRow(quiz: any) {
  const metadata = normalizeQuizCacheMetadata(quiz?.cache_metadata);
  return {
    ...quiz,
    quiz_question_id: metadata.quiz_question_id,
    difficulty: metadata.difficulty,
    signal_key: metadata.signal_key,
    schema_version: metadata.schema_version ?? ADVENTURE_SCHEMA_VERSION,
    composer: metadata.composer,
    fallback_reason: metadata.fallback_reason ?? null,
    fallback_detail: metadata.fallback_detail ?? null,
    ai_provider: metadata.ai_provider ?? null,
    ai_model: metadata.ai_model ?? null,
    validation_issues: metadata.validation_issues ?? [],
    adaptive_focus: metadata.adaptive_focus,
    adaptive_focus_reason: metadata.adaptive_focus_reason,
    target_difficulty: metadata.target_difficulty,
  };
}

function quizResponseFromRow(quiz: any, message: string, cached: boolean) {
  const payload = quizPayloadFromRow(quiz);
  const metadata = normalizeQuizCacheMetadata(quiz?.cache_metadata);
  return {
    success: true,
    persisted: true,
    cached,
    message,
    source: cached ? "quiz_cache" : "quiz_questions",
    algorithm: BALANCED_QUIZ_ALGORITHM_VERSION,
    base_algorithm: ADVENTURE_ALGORITHM_VERSION,
    composer: payload.composer,
    fallback_reason: payload.fallback_reason ?? null,
    fallback_detail: payload.fallback_detail ?? null,
    ai_provider: payload.ai_provider ?? null,
    ai_model: payload.ai_model ?? null,
    validation_issues: payload.validation_issues ?? [],
    focus: metadata.focus ?? {
      mode: metadata.adaptive_focus,
      category: quiz.category,
      reason: metadata.adaptive_focus_reason,
      targetDifficulty: metadata.target_difficulty,
    },
    quiz: payload,
  };
}

async function expireCachedQuizzes(supabaseAdmin: any, userId: string) {
  await supabaseAdmin
    .from("quizzes")
    .update({ delivery_status: "expired_cache" })
    .eq("user_id", userId)
    .eq("delivery_status", "cached")
    .lt("expires_at", new Date().toISOString());
}

async function findCachedQuiz(supabaseAdmin: any, userId: string) {
  await expireCachedQuizzes(supabaseAdmin, userId);
  const { data, error } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("user_id", userId)
    .eq("delivery_status", "cached")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar quiz em cache: ${error.message}`);
  return data ?? null;
}

async function claimCachedQuiz(supabaseAdmin: any, userId: string) {
  const cached = await findCachedQuiz(supabaseAdmin, userId);
  if (!cached) return null;

  const { data, error } = await supabaseAdmin
    .from("quizzes")
    .update({
      delivery_status: "delivered",
      claimed_at: new Date().toISOString(),
      expires_at: null,
      cache_metadata: {
        ...(normalizeQuizCacheMetadata(cached.cache_metadata) as Record<string, unknown>),
        claimed_from_cache: true,
      },
    })
    .eq("id", cached.id)
    .eq("user_id", userId)
    .eq("delivery_status", "cached")
    .select()
    .maybeSingle();

  if (error) throw new Error(`Erro ao reivindicar quiz em cache: ${error.message}`);
  return data ?? null;
}

async function composeBalancedQuiz(
  selected: any,
  userId: string,
  profile: any,
  focus: AdaptiveFocus,
) {
  const seedOptions = Array.isArray(selected.options)
    ? selected.options.map((option: unknown) => optionText(option)).filter(Boolean)
    : [];
  const correctSeedText = getCorrectSeedText(selected);

  const aiResult = await runJsonAgent({
    role: "guardian",
    task: `Crie uma versão adaptativa e balanceada deste quiz em português brasileiro.
Regras obrigatórias:
- Gere uma pergunta curta e prática sobre o mesmo conceito da seed, respeitando o foco adaptativo.
- No modo reinforce_weak, ensine o fundamento sem infantilizar.
- No modo challenge_strong, aprofunde com trade-offs reais e detalhe técnico moderado.
- No modo explore, desperte curiosidade prática sem virar trivia.
- Gere 1 resposta correta e 3 distratores plausíveis.
- Os distratores devem parecer razoáveis para uma pessoa apressada, mas estar tecnicamente menos corretos.
- Não use alternativas absurdas, moralistas, caricatas, genéricas ou com pistas óbvias como "sempre", "nunca", "qualquer coisa" ou ações claramente perigosas.
- Todas as alternativas devem ter tom, tamanho e especificidade parecidos.
- Deve existir exatamente uma melhor resposta.
- Não use letras A/B/C/D no texto das alternativas.
- Gere feedback educativo curto para a resposta correta e para cada distrator.
- Cada feedback deve ter no máximo 180 caracteres e explicar o mecanismo, sem humilhar o usuário.
JSON esperado:
{
  "question": "string",
  "correct_answer": "string",
  "distractors": ["string", "string", "string"],
  "explanation": "string",
  "correct_feedback": "string",
  "distractor_feedbacks": ["string", "string", "string"]
}`,
    context: {
      seed_question: selected.question,
      seed_correct_answer: correctSeedText,
      seed_options: seedOptions,
      seed_explanation: selected.explanation,
      category: selected.category,
      difficulty: selected.difficulty,
      signal_key: selected.signal_key,
      user_level_hint: Number(profile?.xp ?? 0),
      affinities: profile?.affinities ?? {},
      adaptive_focus: {
        mode: focus.mode,
        category: focus.category,
        reason: focus.reason,
        target_difficulty: focus.targetDifficulty,
      },
    },
    fallback: {
      question: "",
      correct_answer: "",
      distractors: [],
      explanation: "",
    },
  }) as any;

  const {
    question,
    correctAnswer,
    distractors,
    explanation,
    correctFeedback,
    distractorFeedbacks,
  } = extractAiQuizDraft(aiResult);
  const fallbackReason = typeof aiResult?._fallback_reason === "string"
    ? aiResult._fallback_reason
    : null;
  const fallbackDetail = typeof aiResult?._fallback_detail === "string"
    ? aiResult._fallback_detail
    : fallbackReason;
  const agentProvider = typeof aiResult?._agent_provider === "string" ? aiResult._agent_provider : null;
  const agentModel = typeof aiResult?._agent_model === "string" ? aiResult._agent_model : null;
  const validationIssues = balancedDraftIssues({ question, correctAnswer, distractors, explanation });

  if (!fallbackReason && isBalancedDraft({ question, correctAnswer, distractors, explanation })) {
    const seed = `${userId}:${utcDayKey()}:${selected.id}:ai`;
    const { options, correctOption } = materializeOptions(correctAnswer, distractors, seed, {
      correctFeedback,
      distractorFeedbacks,
      explanation,
    });
    return {
      question,
      options,
      correctOption,
      explanation,
      source: "ai" as const,
      fallbackReason: null,
      fallbackDetail: null,
      agentProvider,
      agentModel,
      validationIssues: [],
    };
  }

  const effectiveFallbackReason = fallbackReason ?? "ai_validation_failed";
  const effectiveFallbackDetail = fallbackDetail ?? validationIssues.join(",");
  console.warn("[ADVENTURE] Quiz AI draft rejected; using deterministic fallback.", {
    quizQuestionId: selected.id,
    fallbackReason: effectiveFallbackReason,
    fallbackDetail: effectiveFallbackDetail,
    agentProvider,
    agentModel,
    validationIssues,
  });

  return deterministicFallbackQuiz(selected, userId, {
    fallbackReason: effectiveFallbackReason,
    fallbackDetail: effectiveFallbackDetail,
    agentProvider,
    agentModel,
    validationIssues,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

	  try {
	    const body = await req.json();
	    const { userId } = body;
	    const prefetchOnly = body?.prefetchOnly === true;
	    if (!userId) throw new Error("O parâmetro 'userId' é obrigatório.");

	    await requireUserIdFromJwt(req, userId);

	    const supabaseAdmin = createSupabaseAdmin();
	    console.log("[ADVENTURE] Selecionando base e compondo quiz balanceado.", { userId });

	    if (!prefetchOnly) {
	      const cachedQuiz = await claimCachedQuiz(supabaseAdmin, userId);
	      if (cachedQuiz) {
	        console.log("[ADVENTURE] Quiz entregue do cache.", { userId, quizId: cachedQuiz.id });
	        return jsonResponse(quizResponseFromRow(cachedQuiz, "cached_quiz_claimed", true));
	      }
	    } else {
	      const existingCachedQuiz = await findCachedQuiz(supabaseAdmin, userId);
	      if (existingCachedQuiz) {
	        return jsonResponse({
	          success: true,
	          prefetched: true,
	          cached: true,
	          message: "cached_quiz_already_ready",
	          quiz_id: existingCachedQuiz.id,
	        });
	      }
	    }

    const [
      { data: profile },
      { data: questions, error: questionsError },
      { data: recentAnswers },
      { data: recentMissions },
      { data: recentGenerated },
    ] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("xp, affinities")
          .eq("id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("quiz_questions")
          .select("id, category, question, options, correct_option, explanation, difficulty, signal_key, metadata")
          .eq("active", true),
        supabaseAdmin
          .from("user_quiz_answers")
          .select("quiz_question_id, correct, answered_at, quizzes(category)")
          .eq("user_id", userId)
          .not("quiz_question_id", "is", null)
          .gte("answered_at", isoDaysAgo(30)),
        supabaseAdmin
          .from("user_missions")
          .select("category, status, created_at")
          .eq("user_id", userId)
          .eq("delivery_status", "delivered")
          .gte("created_at", isoDaysAgo(30)),
        supabaseAdmin
          .from("agent_interactions")
          .select("input_summary, created_at")
          .eq("user_id", userId)
          .eq("event_type", "GENERATE_BALANCED_QUIZ")
          .gte("created_at", isoDaysAgo(3))
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (questionsError) {
      throw new Error(`Erro ao buscar quiz_questions: ${questionsError.message}`);
    }

    if (!questions?.length) {
      throw new Error("Nenhuma quiz_question ativa disponível.");
    }

    const recentQuestionIds = new Set(
      (recentAnswers ?? [])
        .filter((answer: any) =>
          new Date(answer?.answered_at ?? 0).getTime() >= new Date(isoDaysAgo(7)).getTime()
        )
        .map((answer: any) => answer.quiz_question_id)
        .concat(
          (recentGenerated ?? [])
            .map((interaction: any) => interaction?.input_summary?.quizQuestionId)
            .filter((id: unknown): id is string => typeof id === "string"),
        )
        .filter((id: unknown): id is string => typeof id === "string"),
    );

    const focus = chooseAdaptiveFocus(userId, profile, recentAnswers ?? [], recentMissions ?? []);
    const selected = selectAdaptiveQuizQuestion(questions as any, recentQuestionIds, userId, focus);

    if (!selected) {
      throw new Error("Não foi possível selecionar uma base rastreável para o quiz.");
    }

    const balancedQuiz = await composeBalancedQuiz(selected, userId, profile, focus);

	    const cacheMetadata = buildQuizCacheMetadata(selected, balancedQuiz, focus);
	    const now = new Date();
	    const { data: quiz, error: insertErr } = await supabaseAdmin
	      .from("quizzes")
	      .insert({
	        user_id: userId,
	        question: balancedQuiz.question,
	        options: balancedQuiz.options,
	        correct_option: balancedQuiz.correctOption,
	        explanation: balancedQuiz.explanation,
	        category: selected.category,
	        delivery_status: prefetchOnly ? "cached" : "delivered",
	        claimed_at: prefetchOnly ? null : now.toISOString(),
	        expires_at: prefetchOnly
	          ? new Date(now.getTime() + QUIZ_CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString()
	          : null,
	        cache_metadata: cacheMetadata,
	      })
	      .select()
	      .single();

	    if (insertErr) {
	      if (prefetchOnly && insertErr.code === "23505") {
	        const existingCachedQuiz = await findCachedQuiz(supabaseAdmin, userId);
	        return jsonResponse({
	          success: true,
	          prefetched: true,
	          cached: true,
	          message: "cached_quiz_already_ready",
	          quiz_id: existingCachedQuiz?.id ?? null,
	        });
	      }
	      throw new Error(`Erro ao criar snapshot do quiz: ${insertErr.message}`);
	    }

	    if (prefetchOnly) {
	      console.log("[ADVENTURE] Quiz salvo em cache.", { userId, quizId: quiz.id });
	      return jsonResponse({
	        success: true,
	        prefetched: true,
	        cached: true,
	        message: "cached_quiz_created",
	        quiz_id: quiz.id,
	        composer: balancedQuiz.source,
	        fallback_reason: balancedQuiz.fallbackReason ?? null,
	        fallback_detail: balancedQuiz.fallbackDetail ?? null,
	        ai_provider: balancedQuiz.agentProvider ?? null,
	        ai_model: balancedQuiz.agentModel ?? null,
	      });
	    }

	    console.log("[ADVENTURE] Quiz selecionado.", {
	      userId,
	      quizId: quiz.id,
	      quizQuestionId: selected.id,
	      category: selected.category,
	      difficulty: selected.difficulty,
	      recentAvoided: recentQuestionIds.size,
	      composer: balancedQuiz.source,
	      fallbackReason: balancedQuiz.fallbackReason,
	      fallbackDetail: balancedQuiz.fallbackDetail,
	      aiProvider: balancedQuiz.agentProvider,
	      aiModel: balancedQuiz.agentModel,
	      validationIssues: balancedQuiz.validationIssues,
	      focus: focus.mode,
	      focusReason: focus.reason,
	      targetDifficulty: focus.targetDifficulty,
	    });

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "guardian",
      eventType: "GENERATE_BALANCED_QUIZ",
      inputSummary: {
	        quizQuestionId: selected.id,
	        category: selected.category,
	        difficulty: selected.difficulty,
	        signalKey: selected.signal_key,
	        focus,
	      },
	      output: {
	        quiz_id: quiz.id,
	        composer: balancedQuiz.source,
	        fallback_reason: balancedQuiz.fallbackReason ?? null,
	        fallback_detail: balancedQuiz.fallbackDetail ?? null,
	        ai_provider: balancedQuiz.agentProvider ?? null,
	        ai_model: balancedQuiz.agentModel ?? null,
	        validation_issues: balancedQuiz.validationIssues ?? [],
	        correct_option: balancedQuiz.correctOption,
	        focus,
	      },
	    });

	    return jsonResponse(quizResponseFromRow(quiz, "quiz_created", false));
  } catch (error: any) {
    console.error("[ADVENTURE] Erro ao gerar quiz:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
