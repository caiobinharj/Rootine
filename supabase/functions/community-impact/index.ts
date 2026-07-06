import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

type ImpactTotals = {
  co2_kg: number;
  water_l: number;
  waste_g: number;
  energy_kwh: number;
};

function emptyImpactTotals(): ImpactTotals {
  return { co2_kg: 0, water_l: 0, waste_g: 0, energy_kwh: 0 };
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function addImpact(target: ImpactTotals, impact: any) {
  target.co2_kg += numberValue(impact?.co2_kg?.mid);
  target.water_l += numberValue(impact?.water_l?.mid);
  target.waste_g += numberValue(impact?.waste_g?.mid);
  target.energy_kwh += numberValue(impact?.energy_kwh?.mid);
}

function roundImpactTotals(totals: ImpactTotals): ImpactTotals {
  return {
    co2_kg: Number(totals.co2_kg.toFixed(3)),
    water_l: Number(totals.water_l.toFixed(1)),
    waste_g: Number(totals.waste_g.toFixed(1)),
    energy_kwh: Number(totals.energy_kwh.toFixed(3)),
  };
}

function impactScore(totals: ImpactTotals) {
  return totals.water_l * 0.08 +
    totals.co2_kg * 8 +
    totals.waste_g * 0.015 +
    totals.energy_kwh * 10;
}

function buildComparisons(totals: ImpactTotals) {
  return {
    water_person_days: Number((totals.water_l / 110).toFixed(1)),
    waste_kg: Number((totals.waste_g / 1000).toFixed(2)),
    led_10w_hours: Number((totals.energy_kwh / 0.01).toFixed(1)),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userId = body?.userId;
    if (!userId) throw new Error("O parâmetro 'userId' é obrigatório.");

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();

    const { data: impactRows, error } = await supabaseAdmin
      .from("impact_ledger")
      .select("user_id, impact, logged_at, source_type")
      .order("logged_at", { ascending: false })
      .limit(5000);

    if (error) throw new Error(`Erro ao buscar impacto comunitário: ${error.message}`);

    const presentationRows = (impactRows ?? []).filter((row: any) =>
      row.source_type === "presentation_seed"
    );
    const aggregateRows = presentationRows.length > 0 ? presentationRows : impactRows ?? [];
    const communityTotals = emptyImpactTotals();
    const totalsByUser = new Map<string, ImpactTotals>();

    for (const row of aggregateRows) {
      const rowUserId = typeof row.user_id === "string" ? row.user_id : "";
      if (!rowUserId) continue;
      const userTotals = totalsByUser.get(rowUserId) ?? emptyImpactTotals();
      addImpact(userTotals, row.impact);
      addImpact(communityTotals, row.impact);
      totalsByUser.set(rowUserId, userTotals);
    }

    const userTotals = totalsByUser.get(userId) ?? emptyImpactTotals();
    const userScore = impactScore(userTotals);
    const rankedScores = [...totalsByUser.values()]
      .map(impactScore)
      .filter((score) => score > 0)
      .sort((left, right) => right - left);
    const participantCount = rankedScores.length;
    const userRank = userScore > 0
      ? rankedScores.findIndex((score) => score <= userScore) + 1
      : null;
    const lowerScoreCount = userScore > 0
      ? rankedScores.filter((score) => score < userScore).length
      : 0;
    const percentile = participantCount > 0
      ? Math.round((lowerScoreCount / participantCount) * 100)
      : 0;

    return jsonResponse({
      success: true,
      participant_count: participantCount,
      ledger_count: aggregateRows.length,
      presentation_seed_active: presentationRows.length > 0,
      community_totals: roundImpactTotals(communityTotals),
      user_totals: roundImpactTotals(userTotals),
      user_rank: userRank,
      user_percentile: percentile,
      comparisons: {
        community: buildComparisons(communityTotals),
        user: buildComparisons(userTotals),
        notes: {
          water_person_days: "Referência aproximada de 110 L por pessoa/dia.",
          led_10w_hours: "Referência aproximada de uma lâmpada LED de 10 W.",
        },
      },
    });
  } catch (error: any) {
    console.error("[COMMUNITY_IMPACT] Erro:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
