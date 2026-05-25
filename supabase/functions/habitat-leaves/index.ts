import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import { corsHeaders, createSupabaseAdmin, jsonResponse } from "../_shared/supabase-admin.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, forceRefresh = false } = await req.json();
    if (!userId) throw new Error("O parâmetro 'userId' é obrigatório.");

    const supabaseAdmin = createSupabaseAdmin();

    if (!forceRefresh) {
      const { data: cachedLeaves } = await supabaseAdmin
        .from("habitat_leaves")
        .select("id, position, title, message, source_event, created_at")
        .eq("user_id", userId)
        .order("position", { ascending: true })
        .limit(4);

      if (cachedLeaves && cachedLeaves.length === 4) {
        return jsonResponse({ success: true, leaves: cachedLeaves, cached: true });
      }
    }

    const [{ data: profile }, { data: missions }, { data: answers }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("xp, socioeconomic_context, learned_preferences, affinities, impact_totals")
        .eq("id", userId)
        .single(),
      supabaseAdmin
        .from("user_missions")
        .select("title, description, status, ai_justification, mission_type, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("user_flashcards_answers")
        .select("answer, flashcards(question)")
        .eq("user_id", userId)
        .order("id", { ascending: false })
        .limit(8),
    ]);

    const aiResult = await runJsonAgent({
      role: "habitat",
      task: `Generate exactly four clickable leaves for Rootine's habitat tree.
Each leaf is a short ancestral message grounded in the user's history.
The tree voice must be epic, ancient, cultured, respectful, and in Brazilian Portuguese.
No direct user prompt is involved.
Expected JSON:
{
  "leaves": [
    { "position": 1, "title": "string", "message": "string", "source_event": { "kind": "string" } }
  ]
}`,
      context: { profile, missions: missions || [], recent_flashcards: answers || [] },
      fallback: {
        leaves: [
          {
            position: 1,
            title: "Raiz da Jornada",
            message: "Jovem guardião, tuas escolhas já tocaram o solo. Cada resposta tua alimenta as raízes deste bosque interior.",
            source_event: { kind: "fallback" },
          },
          {
            position: 2,
            title: "Folha da Memória",
            message: "Recordo tuas missões como inscrições antigas: pequenas ações, quando repetidas, tornam-se linhagem.",
            source_event: { kind: "fallback" },
          },
          {
            position: 3,
            title: "Vento do Perfil",
            message: "Teu contexto é terreno sagrado. Nenhum conselho deve exigir de ti o que tua realidade não permite sustentar.",
            source_event: { kind: "fallback" },
          },
          {
            position: 4,
            title: "Copa do Amanhã",
            message: "Segue com constância, não com pressa. Florestas antigas nasceram de gestos quase invisíveis.",
            source_event: { kind: "fallback" },
          },
        ],
      },
    }) as any;

    const leaves = Array.isArray(aiResult.leaves) ? aiResult.leaves.slice(0, 4) : [];

    await supabaseAdmin.from("habitat_leaves").delete().eq("user_id", userId);

    const rows = leaves.map((leaf: any, index: number) => ({
      user_id: userId,
      position: Number(leaf.position) || index + 1,
      title: String(leaf.title || `Folha ${index + 1}`),
      message: String(leaf.message || ""),
      source_event: leaf.source_event || {},
    }));

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("habitat_leaves")
      .insert(rows)
      .select("id, position, title, message, source_event, created_at")
      .order("position", { ascending: true });

    if (insertErr) throw new Error(`Erro ao salvar folhas: ${insertErr.message}`);

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "habitat",
      eventType: "HABITAT_LEAVES",
      inputSummary: { forceRefresh },
      output: { leaves: inserted || rows },
    });

    return jsonResponse({ success: true, leaves: inserted || rows, cached: false });
  } catch (error: any) {
    console.error("[HABITAT ERROR]:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
