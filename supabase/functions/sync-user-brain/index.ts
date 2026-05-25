import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  clampAffinities,
  extractStringArray,
  logAgentInteraction,
  runJsonAgent,
} from "../_shared/agents.ts";
import { corsHeaders, createSupabaseAdmin, jsonResponse } from "../_shared/supabase-admin.ts";

// Tipos de evento suportados
type EventType = "BATCH_COMPLETED" | "MISSION_ACTION" | "FEEDBACK_SENT" | "QUIZ_COMPLETED";
type MissionAction = "COMPLETED" | "REFUSED";

interface BrainSyncPayload {
  userId: string;
  event_type: EventType;
  // Para BATCH_COMPLETED: preenchido com o batchId
  batchId?: string;
  // Para MISSION_ACTION: preenchido com missionId e a ação
  missionId?: string;
  missionAction?: MissionAction;
  // Para FEEDBACK_SENT: texto livre do usuário
  feedbackText?: string;
  // Para QUIZ_COMPLETED
  quizId?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: BrainSyncPayload = await req.json();
    const { userId, event_type } = body;

    if (!userId || !event_type) {
      throw new Error("Parâmetros obrigatórios: userId, event_type");
    }

    const supabaseAdmin = createSupabaseAdmin();

    console.log(`[BRAIN] Event received: ${event_type} for userId: ${userId}`);

    // ── 1. Get current profile state ─────────────────────────────
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("learned_preferences, affinities, socioeconomic_context, xp")
      .eq("id", userId)
      .single();

    if (profileErr) throw new Error(`Error fetching profile: ${profileErr.message}`);

    // ── 2. Build event-specific context ─────────────────────
    let eventContext = "";

    if (event_type === "BATCH_COMPLETED" && body.batchId) {
      console.log(`[BRAIN] Processing batch: ${body.batchId}`);
      
      const { data: answers, error: ansErr } = await supabaseAdmin
        .from("user_flashcards_answers")
        .select("answer, flashcard_id")
        .eq("daily_batch", body.batchId);

      if (ansErr) throw new Error(`Error fetching answers: ${ansErr.message}`);
      
      console.log(`[BRAIN] Found ${answers?.length || 0} answers.`);

      if (!answers || answers.length === 0) {
        return new Response(JSON.stringify({ success: false, message: "No answers found for this batch." }), { headers: corsHeaders });
      }

      const flashcardIds = answers.map((a: any) => a.flashcard_id);

      const { data: flashcards, error: flashErr } = await supabaseAdmin
        .from("flashcards")
        .select("id, question")
        .in("id", flashcardIds);

      if (flashErr) throw new Error(`Error fetching flashcards: ${flashErr.message}`);
      
      console.log(`[BRAIN] Found ${flashcards?.length || 0} flashcards.`);

      const questionsMap = Object.fromEntries(
        (flashcards || []).map((f: any) => [f.id, f.question]),
      );

      const enriched = answers.map((a: any) => ({
        question: questionsMap[a.flashcard_id] || "Unknown Question",
        answer: a.answer,
      }));

      eventContext = `The user just answered a batch of daily flashcards. Here are the responses:
${JSON.stringify(enriched, null, 2)}
Analyze these answers to infer habits. If a question is 'Unknown Question', ignore it.`;

    } else if (event_type === "MISSION_ACTION" && body.missionId) {
      // Busca a missão para contexto (missões agora são dinâmicas, sem template)
      const { data: mission } = await supabaseAdmin
        .from("user_missions")
        .select("title, description, ai_justification")
        .eq("id", body.missionId)
        .single();

      eventContext = `The user ${body.missionAction === "COMPLETED" ? "COMPLETED" : "REFUSED"} the following mission:
${JSON.stringify(mission, null, 2)}
${body.missionAction === "COMPLETED"
  ? "Reinforce affinity and interest in this mission's category."
  : "Reduce affinity and register as a potential temporary hard block or lack of interest in this area."}`;

    } else if (event_type === "FEEDBACK_SENT" && body.feedbackText) {
      eventContext = `The user sent the following free-text feedback about their missions:
"${body.feedbackText}"
Extract constraints, preferences, or implicit sentiments to update the profile.`;
    } else if (event_type === "QUIZ_COMPLETED" && body.quizId) {
      const { data: quizAnswer } = await supabaseAdmin
        .from("user_quiz_answers")
        .select("selected_option, correct, quizzes(question, options, correct_option, explanation, category)")
        .eq("quiz_id", body.quizId)
        .eq("user_id", userId)
        .order("answered_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      eventContext = `The user answered a Trail quiz:
${JSON.stringify(quizAnswer, null, 2)}
Use correctness and category to infer learning needs, deficits, and affinities.`;
    } else {
      throw new Error(`Invalid event or incomplete payload for event_type: ${event_type}`);
    }

    // ── 3. Call Scientist Agent to distill learning ─────────────────
    console.log(`[BRAIN] Calling Scientist Agent for ${event_type}. Context sent to AI:\n${eventContext}`);

    const currentPrefs = profile.learned_preferences || { interests: [], hard_blocks: [], evolution_tags: [], deficits: [] };
    const currentAffinities = profile.affinities || {};

    const aiResult = await runJsonAgent({
      role: "scientist",
      task: `Synthesize the event into Rootine profile intelligence.
Rules:
- interests: habits the user already practices.
- hard_blocks: absolute constraints not already present in socioeconomic context.
- deficits: habits or knowledge gaps the user does not practice yet.
- affinities: only waste, energy, water, transport, food, consumption, clamped from -1 to 1.
- ai_justification must cite the provided questions/actions and answers.
- Merge with current state instead of replacing good evidence.
Expected JSON:
{
  "learned_preferences": {
    "interests": ["string"],
    "hard_blocks": ["string"],
    "deficits": ["string"],
    "evolution_tags": ["string"],
    "ai_justification": "string"
  },
  "affinities": {
    "transport": 0.1
  }
}`,
      context: {
        current_profile_state: {
          learned_preferences: currentPrefs,
          affinities: currentAffinities,
          socioeconomic_context: profile.socioeconomic_context || {},
        },
        event_type,
        eventContext,
      },
      fallback: {
        learned_preferences: {
          ...currentPrefs,
          ai_justification: "O agente cientista não retornou uma síntese confiável; mantive o perfil anterior.",
        },
        affinities: currentAffinities,
      },
    }) as any;

    console.log(`[BRAIN] AI Justification: ${aiResult.learned_preferences?.ai_justification}`);

    // ── 4. Validation and Structuring (Safe Post-Processing) ─────────
    const aiLp = aiResult.learned_preferences || {};
    
    const interests = extractStringArray(aiLp.interests);
    const hardBlocks = extractStringArray(aiLp.hard_blocks);
    const deficits = extractStringArray(aiLp.deficits);
    
    // Rigid Rule (Hardcoded): evolution_tags only change if the event is NOT a flashcard
    let evolutionTags = extractStringArray(aiLp.evolution_tags);
    if (event_type === "BATCH_COMPLETED") {
        evolutionTags = currentPrefs.evolution_tags || [];
        console.log(`[BRAIN] BATCH_COMPLETED event: evolution_tags from AI ignored, keeping current state.`);
    }

    const mergedPreferences = {
      interests: interests.length > 0 ? interests : (currentPrefs.interests || []),
      hard_blocks: hardBlocks.length > 0 ? hardBlocks : (currentPrefs.hard_blocks || []),
      deficits: deficits.length > 0 ? deficits : (currentPrefs.deficits || []),
      evolution_tags: evolutionTags,
      ai_justification: aiLp.ai_justification || "No justification provided by AI.",
    };

    const mergedAffinities = clampAffinities({
      ...currentAffinities,
      ...(aiResult.affinities || {}),
    });

    // ── 5. Save to database ───────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        learned_preferences: mergedPreferences,
        affinities: mergedAffinities,
      })
      .eq("id", userId);

    if (updateErr) throw new Error(`Error updating profile: ${updateErr.message}`);

    console.log(`[BRAIN] Profile successfully updated for userId: ${userId}`);

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "scientist",
      eventType: event_type,
      inputSummary: { event_type, payload: body },
      output: {
        updated_preferences: mergedPreferences,
        updated_affinities: mergedAffinities,
      },
    });

    // ── 6. Trigger Mission Generation ─────────────────────────────────
    console.log(`[BRAIN] Disparando generate-missions via fetch nativo para userId: ${userId}...`);
    try {
      const authHeader = req.headers.get("Authorization");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      
      if (!supabaseUrl) throw new Error("SUPABASE_URL não configurada.");

      const functionUrl = `${supabaseUrl}/functions/v1/generate-missions`;
      const genRes = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { "Authorization": authHeader } : {})
        },
        body: JSON.stringify({ userId, missionType: "daily" })
      });

      const genText = await genRes.text();
      console.log(`[BRAIN] Resposta do generate-missions (Status HTTP: ${genRes.status}):`, genText);
    } catch (err: any) {
      console.error("[BRAIN] Falha crítica ao tentar disparar generate-missions via fetch:", err.message);
    }

    return jsonResponse({
        success: true,
        event_type,
        ai_justification: mergedPreferences.ai_justification,
        updated_preferences: mergedPreferences,
        updated_affinities: mergedAffinities,
      });
  } catch (error: any) {
    console.error("[BRAIN ERROR]:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
