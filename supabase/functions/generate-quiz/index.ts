import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { allowedCategories, logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import { corsHeaders, createSupabaseAdmin, jsonResponse } from "../_shared/supabase-admin.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("O parâmetro 'userId' é obrigatório.");

    const supabaseAdmin = createSupabaseAdmin();

    const [{ data: profile }, { data: recentAnswers }, { data: recentQuizzes }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("xp, socioeconomic_context, learned_preferences, affinities")
        .eq("id", userId)
        .single(),
      supabaseAdmin
        .from("user_flashcards_answers")
        .select("answer, flashcards(question)")
        .eq("user_id", userId)
        .order("id", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("quizzes")
        .select("question, category, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const aiResult = await runJsonAgent({
      role: "guardian",
      task: `Generate one educational quiz for Rootine's Trilha.
Rules:
- Do not create flashcards.
- Use the user's context and recent learning gaps.
- The question, options and explanation must be in Brazilian Portuguese.
- There must be exactly four options, each with id A, B, C, D.
- correct_option must be one of A, B, C, D.
- category must be one of ${allowedCategories.join(", ")}.
Expected JSON:
{
  "question": "string",
  "options": [
    { "id": "A", "text": "string" },
    { "id": "B", "text": "string" },
    { "id": "C", "text": "string" },
    { "id": "D", "text": "string" }
  ],
  "correct_option": "A",
  "explanation": "string",
  "category": "water"
}`,
      context: { profile, recent_flashcards: recentAnswers || [], recent_quizzes: recentQuizzes || [] },
      fallback: {
        question: "Qual atitude costuma reduzir desperdício no dia a dia sem exigir compra nova?",
        options: [
          { id: "A", text: "Planejar o uso do que já existe antes de comprar mais" },
          { id: "B", text: "Trocar todos os objetos por versões novas" },
          { id: "C", text: "Ignorar pequenos hábitos domésticos" },
          { id: "D", text: "Separar apenas resíduos grandes" },
        ],
        correct_option: "A",
        explanation: "Planejar antes de comprar reduz consumo impulsivo e desperdício sem custo adicional.",
        category: "consumption",
      },
    }) as any;

    const options = Array.isArray(aiResult.options) ? aiResult.options.slice(0, 4) : [];
    const correctOption = ["A", "B", "C", "D"].includes(aiResult.correct_option)
      ? aiResult.correct_option
      : "A";
    const category = allowedCategories.includes(aiResult.category)
      ? aiResult.category
      : "consumption";

    const { data: quiz, error: insertErr } = await supabaseAdmin
      .from("quizzes")
      .insert({
        user_id: userId,
        question: String(aiResult.question || ""),
        options,
        correct_option: correctOption,
        explanation: String(aiResult.explanation || ""),
        category,
      })
      .select()
      .single();

    if (insertErr) {
      console.warn("[QUIZ] Não foi possível persistir o quiz; retornando quiz transitório:", insertErr.message);
      const transientQuiz = {
        id: `local-${crypto.randomUUID()}`,
        user_id: userId,
        question: String(aiResult.question || ""),
        options,
        correct_option: correctOption,
        explanation: String(aiResult.explanation || ""),
        category,
        persisted: false,
      };

      return jsonResponse({ success: true, quiz: transientQuiz, persisted: false });
    }

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "guardian",
      eventType: "GENERATE_QUIZ",
      inputSummary: { recentQuizzes: recentQuizzes?.length || 0 },
      output: quiz,
    });

    return jsonResponse({ success: true, quiz });
  } catch (error: any) {
    console.error("[QUIZ ERROR]:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
