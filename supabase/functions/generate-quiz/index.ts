import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_SCHEMA_VERSION,
  hashScore,
  isoDaysAgo,
  selectDeterministicQuizQuestion,
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

type OptionId = typeof OPTION_IDS[number];

interface QuizOption {
  id: OptionId;
  text: string;
}

interface BalancedQuiz {
  question: string;
  options: QuizOption[];
  correctOption: OptionId;
  explanation: string;
  source: "ai" | "deterministic_fallback";
  fallbackReason?: string | null;
}

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

function cleanQuizText(value: unknown, maxLength = 220) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function optionText(option: unknown) {
  const asObject = option && typeof option === "object" && !Array.isArray(option)
    ? option as Record<string, unknown>
    : {};
  return cleanQuizText(asObject.text, 160);
}

function getCorrectSeedText(selected: any) {
  const options = Array.isArray(selected.options) ? selected.options : [];
  const correct = options.find((option: any) => option?.id === selected.correct_option);
  return optionText(correct) || cleanQuizText(selected.explanation, 160);
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

function isBalancedDraft(input: {
  question: string;
  correctAnswer: string;
  distractors: string[];
  explanation: string;
}) {
  const { question, correctAnswer, distractors, explanation } = input;
  const allOptions = [correctAnswer, ...distractors];
  if (question.length < 24 || question.length > 180) return false;
  if (explanation.length < 24 || explanation.length > 260) return false;
  if (allOptions.length !== 4) return false;
  if (allOptions.some((text) => text.length < 18 || text.length > 150)) return false;
  if (uniqueNormalizedTexts(allOptions).size !== 4) return false;
  if (distractors.some(hasWeakDistractorTone)) return false;
  if (allOptions.some((text) => /^[A-D][).:-]/i.test(text.trim()))) return false;
  return true;
}

function materializeOptions(
  correctAnswer: string,
  distractors: string[],
  seed: string,
) {
  const entries = [
    { text: correctAnswer, correct: true },
    ...distractors.map((text) => ({ text, correct: false })),
  ].sort((left, right) => hashScore(`${seed}:${left.text}`) - hashScore(`${seed}:${right.text}`));

  let correctOption: OptionId = "A";
  const options = entries.map((entry, index) => {
    const id = OPTION_IDS[index];
    if (entry.correct) correctOption = id;
    return { id, text: entry.text };
  });

  return { options, correctOption };
}

function deterministicFallbackQuiz(selected: any, userId: string): BalancedQuiz {
  const category = String(selected.category ?? "consumption");
  const seed = `${userId}:${utcDayKey()}:${selected.id}:fallback`;
  const fallbackDistractors = CATEGORY_FALLBACK_DISTRACTORS[category] ?? CATEGORY_FALLBACK_DISTRACTORS.consumption;
  const correctAnswer = cleanQuizText(getCorrectSeedText(selected), 150);
  const startIndex = Math.floor(hashScore(seed) * fallbackDistractors.length);
  const distractors = [...fallbackDistractors.slice(startIndex), ...fallbackDistractors.slice(0, startIndex)]
    .filter((text) => normalizeText(text) !== normalizeText(correctAnswer))
    .slice(0, 3);
  const { options, correctOption } = materializeOptions(correctAnswer, distractors, seed);

  return {
    question: cleanQuizText(selected.question, 180),
    options,
    correctOption,
    explanation: cleanQuizText(selected.explanation, 240),
    source: "deterministic_fallback",
    fallbackReason: "ai_unavailable_or_invalid",
  };
}

async function composeBalancedQuiz(selected: any, userId: string, profile: any) {
  const seedOptions = Array.isArray(selected.options)
    ? selected.options.map((option: unknown) => optionText(option)).filter(Boolean)
    : [];
  const correctSeedText = getCorrectSeedText(selected);

  const aiResult = await runJsonAgent({
    role: "guardian",
    task: `Crie uma versão balanceada deste quiz em português brasileiro.
Regras obrigatórias:
- Gere uma pergunta curta e prática sobre o mesmo conceito da seed.
- Gere 1 resposta correta e 3 distratores plausíveis.
- Os distratores devem parecer razoáveis para uma pessoa apressada, mas estar tecnicamente menos corretos.
- Não use alternativas absurdas, moralistas, caricatas ou com pistas óbvias como "sempre", "nunca", "qualquer coisa" ou ações claramente perigosas.
- Todas as alternativas devem ter tom, tamanho e especificidade parecidos.
- Deve existir exatamente uma melhor resposta.
- Não use letras A/B/C/D no texto das alternativas.
JSON esperado:
{
  "question": "string",
  "correct_answer": "string",
  "distractors": ["string", "string", "string"],
  "explanation": "string"
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
    },
    fallback: {
      question: "",
      correct_answer: "",
      distractors: [],
      explanation: "",
    },
  }) as any;

  const question = cleanQuizText(aiResult?.question, 180);
  const correctAnswer = cleanQuizText(aiResult?.correct_answer, 150);
  const distractors = Array.isArray(aiResult?.distractors)
    ? aiResult.distractors.map((item: unknown) => cleanQuizText(item, 150)).filter(Boolean).slice(0, 3)
    : [];
  const explanation = cleanQuizText(aiResult?.explanation, 240);

  if (isBalancedDraft({ question, correctAnswer, distractors, explanation })) {
    const seed = `${userId}:${utcDayKey()}:${selected.id}:ai`;
    const { options, correctOption } = materializeOptions(correctAnswer, distractors, seed);
    return {
      question,
      options,
      correctOption,
      explanation,
      source: "ai" as const,
      fallbackReason: null,
    };
  }

  return deterministicFallbackQuiz(selected, userId);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("O parâmetro 'userId' é obrigatório.");

    await requireUserIdFromJwt(req, userId);

    const supabaseAdmin = createSupabaseAdmin();
    console.log("[ADVENTURE] Selecionando base e compondo quiz balanceado.", { userId });

    const [{ data: profile }, { data: questions, error: questionsError }, { data: recentAnswers }] =
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
          .select("quiz_question_id")
          .eq("user_id", userId)
          .not("quiz_question_id", "is", null)
          .gte("answered_at", isoDaysAgo(7)),
      ]);

    if (questionsError) {
      throw new Error(`Erro ao buscar quiz_questions: ${questionsError.message}`);
    }

    if (!questions?.length) {
      throw new Error("Nenhuma quiz_question ativa disponível.");
    }

    const recentQuestionIds = new Set(
      (recentAnswers ?? [])
        .map((answer: any) => answer.quiz_question_id)
        .filter((id: unknown): id is string => typeof id === "string"),
    );

    const selected = selectDeterministicQuizQuestion(
      questions as any,
      recentQuestionIds,
      profile?.affinities ?? {},
      userId,
    );

    if (!selected) {
      throw new Error("Não foi possível selecionar uma base rastreável para o quiz.");
    }

    const balancedQuiz = await composeBalancedQuiz(selected, userId, profile);

    const { data: quiz, error: insertErr } = await supabaseAdmin
      .from("quizzes")
      .insert({
        user_id: userId,
        question: balancedQuiz.question,
        options: balancedQuiz.options,
        correct_option: balancedQuiz.correctOption,
        explanation: balancedQuiz.explanation,
        category: selected.category,
      })
      .select()
      .single();

    if (insertErr) {
      throw new Error(`Erro ao criar snapshot do quiz: ${insertErr.message}`);
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
      },
      output: {
        quiz_id: quiz.id,
        composer: balancedQuiz.source,
        fallback_reason: balancedQuiz.fallbackReason ?? null,
        correct_option: balancedQuiz.correctOption,
      },
    });

    return jsonResponse({
      success: true,
      persisted: true,
      source: "quiz_questions",
      algorithm: BALANCED_QUIZ_ALGORITHM_VERSION,
      base_algorithm: ADVENTURE_ALGORITHM_VERSION,
      composer: balancedQuiz.source,
      quiz: {
        ...quiz,
        quiz_question_id: selected.id,
        difficulty: selected.difficulty,
        signal_key: selected.signal_key,
        schema_version: ADVENTURE_SCHEMA_VERSION,
      },
    });
  } catch (error: any) {
    console.error("[ADVENTURE] Erro ao gerar quiz:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
