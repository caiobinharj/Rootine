import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import { corsHeaders, createSupabaseAdmin, jsonResponse } from "../_shared/supabase-admin.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, message, history = [] } = await req.json();
    if (!userId || !message) {
      throw new Error("Parâmetros obrigatórios: userId, message");
    }

    const supabaseAdmin = createSupabaseAdmin();

    const [{ data: profile }, { data: missions }, { data: flashcards }, { data: quizzes }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("xp, socioeconomic_context, learned_preferences, affinities, impact_totals")
        .eq("id", userId)
        .single(),
      supabaseAdmin
        .from("user_missions")
        .select("title, status, mission_type, ai_justification, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("user_flashcards_answers")
        .select("answer, flashcards(question)")
        .eq("user_id", userId)
        .order("id", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("user_quiz_answers")
        .select("selected_option, correct, quizzes(question, category, explanation)")
        .eq("user_id", userId)
        .order("answered_at", { ascending: false })
        .limit(8),
    ]);

    const aiResult = await runJsonAgent({
      role: "scientist",
      task: `Answer the user's profile question as Rootine's scientist.
Rules:
- Respond in Brazilian Portuguese.
- Be helpful, practical and evidence-based.
- When useful, provide day-to-day protocols based on past app interactions.
- Do not invent data that is not in the context.
Expected JSON:
{
  "answer": "string",
  "protocols": [
    { "title": "string", "steps": ["string"] }
  ],
  "referenced_context": ["string"]
}`,
      context: {
        user_message: message,
        chat_history: history,
        profile,
        recent_missions: missions || [],
        recent_flashcards: flashcards || [],
        recent_quizzes: quizzes || [],
      },
      fallback: {
        answer: "Ainda não consegui consultar o agente cientista com segurança. Posso sugerir começar com um protocolo simples: escolha uma ação sustentável pequena, repita por três dias e observe o que facilitou ou dificultou.",
        protocols: [
          {
            title: "Protocolo de observação",
            steps: [
              "Escolha um hábito ambiental pequeno.",
              "Registre se foi fácil, difícil ou irrelevante.",
              "Use essa evidência para ajustar a próxima missão.",
            ],
          },
        ],
        referenced_context: [],
      },
    }) as any;

    const usedFallback = Boolean(aiResult?._fallback_reason);

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "scientist",
      eventType: "SCIENTIST_CHAT",
      inputSummary: { message },
      output: aiResult,
      status: usedFallback ? "error" : "success",
      errorMessage: usedFallback ? String(aiResult._fallback_reason) : undefined,
    });

    return jsonResponse({ success: true, ...aiResult });
  } catch (error: any) {
    console.error("[SCIENTIST CHAT ERROR]:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
