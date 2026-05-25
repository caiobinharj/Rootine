import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { allowedCategories, logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import { corsHeaders, createSupabaseAdmin, jsonResponse } from "../_shared/supabase-admin.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, missionType = "daily" } = await req.json();
    if (!userId) {
      throw new Error("O parâmetro 'userId' é obrigatório no corpo da requisição.");
    }

    const supabaseAdmin = createSupabaseAdmin();

    console.log(`[MOTOR] Iniciando geração de missões para userId: ${userId}`);

    // ── 1. Validar e Buscar Perfil (O Snapshot do Usuário) ───────────
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("socioeconomic_context, xp, learned_preferences, affinities, onboarding_completed, daily_flashcards_completed")
      .eq("id", userId)
      .single();

    if (profileErr) throw new Error(`Erro ao buscar perfil: ${profileErr.message}`);

    if (!profile.onboarding_completed) {
      console.log(`[MOTOR] Abortando: Usuário ${userId} não completou o onboarding.`);
      return jsonResponse({ error: "onboarding_pending" }, 400);
    }

    if (!profile.daily_flashcards_completed) {
      console.log(`[MOTOR] Usuário ${userId} ainda não completou flashcards; gerando com contexto reduzido.`);
    }

    // ── 2. Contar Missões Ativas ─────────────────────────────────────
    const { data: activeMissions, error: countErr } = await supabaseAdmin
      .from("user_missions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active");

    if (countErr) throw new Error(`Erro ao contar missões: ${JSON.stringify(countErr)}`);

    const count = activeMissions?.length || 0;

    if (count >= 4) {
      console.log(`[MOTOR] Abortando: Usuário ${userId} já possui ${count} missões ativas (Limite >= 4).`);
      return jsonResponse({ success: true, message: "max_missions_reached" });
    }

    console.log(`[MOTOR] Validações passadas (Missões atuais: ${count}). Coletando contexto...`);

    // ── 3. Histórico Recente (Flashcards e Missões) ──────────────────
    const { data: recentAnswers } = await supabaseAdmin
      .from("user_flashcards_answers")
      .select("answer, flashcards(question)")
      .eq("user_id", userId)
      .order("id", { ascending: false })
      .limit(10);

    const mappedAnswers = (recentAnswers || []).map((a: any) => ({
      question: a.flashcards?.question ?? "?",
      answer: a.answer,
    }));

    const { data: recentMissions } = await supabaseAdmin
      .from("user_missions")
      .select("title, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // ── 4. Construir o Contexto (Prompt) ─────────────────────────────
    const snapshot = {
      user_level: profile.xp,
      user_constraints: profile.socioeconomic_context || {},
      user_profile: {
        learned_preferences: profile.learned_preferences || {},
        affinities: profile.affinities || {},
      },
      recent_diagnostics: mappedAnswers,
      mission_history: recentMissions || [],
    };

    console.log("[MOTOR] Chamando Agente Aventureiro para gerar missão...");

    const aiParsed = await runJsonAgent({
      role: "adventurer",
      task: `Generate EXACTLY ONE ${missionType} sustainability mission.
Rules:
- Use only these categories: ${allowedCategories.join(", ")}.
- Title, description, and ai_justification.reason must be in Brazilian Portuguese.
- Avoid generic missions and respect socioeconomic constraints.
- Specialized missions can be a bit deeper; daily missions must be quick and accessible.
Expected JSON:
{
  "title": "string",
  "description": "string",
  "category": "waste|energy|water|transport|food|consumption",
  "ai_justification": { "reason": "string" }
}`,
      context: { missionType, snapshot },
      fallback: {
        title: "Missão da Pequena Mudança",
        description: "Escolha uma ação simples e sustentável para praticar hoje por pelo menos 10 minutos.",
        category: "consumption",
        ai_justification: {
          reason: "Criei uma missão acessível porque os dados disponíveis ainda não foram suficientes para uma personalização mais precisa.",
        },
      },
    }) as any;

    const category = allowedCategories.includes(aiParsed.category)
      ? aiParsed.category
      : "consumption";

    console.log(`[MOTOR] Missão gerada: ${aiParsed.title}`);

    // ── 5. Inserir no Banco de Dados ─────────────────────────────────
    const newMissionId = crypto.randomUUID();

    const insertPayload = {
      id: newMissionId,
      user_id: userId,
      title: aiParsed.title,
      description: aiParsed.description,
      ai_justification: { category, reason: aiParsed.ai_justification?.reason || "" },
      status: "active",
      mission_type: missionType === "specialized" ? "specialized" : "daily",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h a partir de agora
    };

    const { error: insertErr } = await supabaseAdmin
      .from("user_missions")
      .insert(insertPayload);

    if (insertErr) {
      if (insertErr.message?.includes("mission_type")) {
        const legacyPayload = { ...insertPayload } as any;
        delete legacyPayload.mission_type;
        const { error: legacyErr } = await supabaseAdmin
          .from("user_missions")
          .insert(legacyPayload);

        if (legacyErr) throw new Error(`Erro ao salvar missão: ${legacyErr.message}`);
      } else {
        throw new Error(`Erro ao salvar missão: ${insertErr.message}`);
      }
    }

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "adventurer",
      eventType: "GENERATE_MISSION",
      inputSummary: { missionType, activeMissionCount: count },
      output: aiParsed,
    });

    return jsonResponse({ success: true, mission_id: newMissionId, message: "mission_created" });
  } catch (error: any) {
    console.error("[CRITICAL ERROR]:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
