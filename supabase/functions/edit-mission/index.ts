import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractStringArray, logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import { corsHeaders, createSupabaseAdmin, jsonResponse } from "../_shared/supabase-admin.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, missionId, userInput } = await req.json();

    if (!userId || !missionId || !userInput) {
      throw new Error("Parâmetros 'userId', 'missionId' e 'userInput' são obrigatórios.");
    }

    const supabaseAdmin = createSupabaseAdmin();

    console.log(`[EDIT] Iniciando edição da missão ${missionId} pelo usuário ${userId}`);

    // 1. Fetch Target Mission
    const { data: mission, error: missionErr } = await supabaseAdmin
      .from("user_missions")
      .select("*")
      .eq("id", missionId)
      .eq("user_id", userId)
      .single();

    if (missionErr || !mission) throw new Error(`Missão não encontrada: ${missionErr?.message}`);

    // 2. Fetch User Profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("learned_preferences, socioeconomic_context")
      .eq("id", userId)
      .single();

    if (profileErr) throw new Error("Perfil não encontrado.");

    const currentPrefs = profile.learned_preferences || { interests: [], hard_blocks: [], evolution_tags: [], deficits: [] };

    // 3. Refinement through Aventureiro, with profile learning hints.
    const aiParsed = await runJsonAgent({
      role: "adventurer",
      task: `Refine the current sustainability mission using the user's feedback.
Rules:
- Keep the original theme/category when possible.
- Adapt the mission to the user's constraints.
- Title, description and ai_justification.reason must be in Brazilian Portuguese.
- If the feedback reveals a durable constraint or deficit, include it in preference_updates.
Expected JSON:
{
  "title": "string",
  "description": "string",
  "ai_justification": { "reason": "string" },
  "preference_updates": {
    "new_hard_blocks": ["string"],
    "new_deficits": ["string"]
  }
}`,
      context: {
        current_mission: mission,
        user_feedback: userInput,
        profile_context: {
          socioeconomic_context: profile.socioeconomic_context,
          learned_preferences: currentPrefs,
        },
      },
      fallback: {
        title: mission.title,
        description: mission.description,
        ai_justification: {
          reason: "Mantive a missão original porque o agente não retornou uma adaptação confiável.",
        },
        preference_updates: {
          new_hard_blocks: [],
          new_deficits: [],
        },
      },
    }) as any;

    console.log(`[EDIT] Missão editada com sucesso. Novo título: ${aiParsed.title}`);

    // 4. Update the Mission
    const updatedJustification = {
      category: mission.ai_justification?.category || "general",
      reason: aiParsed.ai_justification?.reason || "Editada a pedido do usuário.",
    };

    const { error: updateErr } = await supabaseAdmin
      .from("user_missions")
      .update({
        title: aiParsed.title,
        description: aiParsed.description,
        ai_justification: updatedJustification,
        feedback_notes: { text: userInput }
      })
      .eq("id", missionId);

    if (updateErr) throw new Error(`Erro ao atualizar missão: ${updateErr.message}`);

    // 5. Update User Profile if there are new preferences
    const newHardBlocks = extractStringArray(aiParsed.preference_updates?.new_hard_blocks);
    const newDeficits = extractStringArray(aiParsed.preference_updates?.new_deficits);

    if (newHardBlocks.length > 0 || newDeficits.length > 0) {
      const updatedPrefs = { ...currentPrefs };
      
      if (newHardBlocks.length > 0) {
        updatedPrefs.hard_blocks = [...new Set([...(updatedPrefs.hard_blocks || []), ...newHardBlocks])];
      }
      if (newDeficits.length > 0) {
        updatedPrefs.deficits = [...new Set([...(updatedPrefs.deficits || []), ...newDeficits])];
      }

      await supabaseAdmin
        .from("profiles")
        .update({ learned_preferences: updatedPrefs })
        .eq("id", userId);
        
      console.log(`[EDIT] Perfil atualizado com novos hard_blocks/deficits aprendidos do feedback.`);
    }

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "adventurer",
      eventType: "EDIT_MISSION",
      inputSummary: { missionId, userInput },
      output: aiParsed,
    });

    return jsonResponse({ success: true, message: "mission_edited" });
  } catch (error: any) {
    console.error("[EDIT CRITICAL ERROR]:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
