import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { allowedCategories, configuredSecret, logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

const CONTEXT_VERSION = "MissionGenerationContextV1";
const ALGORITHM_VERSION = "hybrid_ai_mission_composer_v2";
const RECENT_DAYS = 14;
const HARD_REPEAT_DAYS = 3;
const HARD_REPEAT_MISSION_LIMIT = 12;
const MAX_ACTIVE_MISSIONS = 4;
const DAILY_COMPLETED_MISSION_AI_LIMIT = 4;
const MAX_AI_BLUEPRINTS = 8;
const MIN_AI_CANDIDATES = 3;
const MAX_AI_CANDIDATES = 4;
const MISSION_HELP_MAX_CHARS = 680;
const MISSION_CACHE_TTL_HOURS = 6;
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

const COST_ORDER = ["free", "low", "medium", "high"] as const;
const XP_REWARD_BY_DIFFICULTY: Record<number, number> = {
  1: 10,
  2: 16,
  3: 25,
  4: 40,
  5: 60,
};

type MissionType = "daily" | "specialized";
type Category = typeof allowedCategories[number];

interface PatternRow {
  key: string;
  action_fingerprint: string;
  category: Category;
  environmental_goal: string;
  difficulty_min: number;
  difficulty_max: number;
  cost_level: string;
  effort_minutes_min: number;
  effort_minutes_max: number;
  required_or_helpful_fact_types: string[];
  disqualifying_fact_keys: string[];
  personalization_slots: string[];
  impact_model_key: string;
  recurrence_allowed: boolean;
  fallback_title_pt: string;
  fallback_description_pt: string;
  fallback_reason_pt: string;
  metadata?: Record<string, unknown> | null;
}

interface ProfileFact {
  fact_key: string;
  fact_type: string;
  category: Category | null;
  value: Record<string, unknown>;
  confidence: number;
  active?: boolean;
  last_seen_at?: string | null;
}

interface MissionCandidate {
  title: string;
  description: string;
  category: Category;
  environmental_goal: string;
  difficulty: number;
  effort_minutes: number;
  cost_level: string;
  used_fact_keys: string[];
  personalization_reason: string;
  help_text: string;
  expected_impact: Record<string, unknown>;
  pattern_key: string;
  action_fingerprint: string;
  mission_type: MissionType;
  xp_reward: number;
  ai_justification: Record<string, unknown>;
}

interface RankedPattern {
  pattern: PatternRow;
  score: number;
  usedFacts: ProfileFact[];
  rejectedReasons: string[];
}

interface OutcomeBucket {
  attempts: number;
  completed: number;
  refused: number;
  failed: number;
}

interface OutcomeStats {
  byPattern: Record<string, OutcomeBucket>;
  byAction: Record<string, OutcomeBucket>;
  byCategory: Record<string, OutcomeBucket>;
}

const CATEGORY_LABELS: Record<string, string> = {
  water: "água",
  energy: "energia",
  waste: "resíduos",
  transport: "transporte",
  food: "alimentação",
  consumption: "consumo",
};

const SIGNAL_LABELS: Record<string, string> = {
  has_bucket: "balde disponível",
  has_kitchen_access: "acesso à cozinha",
  uses_public_transport: "uso possível de transporte público",
  recycling_inconsistent: "separação de resíduos ainda irregular",
  small_changes: "preferência por mudanças pequenas",
  money_low: "orçamento mais apertado",
  time_low: "pouco tempo livre",
  free_time_window: "janela de tempo informada",
  water_control: "controle sobre uso de água",
  energy_control: "controle sobre uso de energia",
  primary_mobility: "forma principal de deslocamento",
  financial_friction: "limite de orçamento",
  dietary_context: "contexto alimentar",
  safety_boundary: "limite de segurança",
};

function isMissionType(value: unknown): value is MissionType {
  return value === "daily" || value === "specialized";
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && allowedCategories.includes(value as Category);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
    : [];
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function costRank(value: string) {
  const index = COST_ORDER.indexOf(value as any);
  return index >= 0 ? index : COST_ORDER.length - 1;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLevelFromXp(rawXp: unknown) {
  const xp = Math.max(0, Math.floor(numberValue(rawXp, 0)));
  const thresholds = [0, 10, 45, 100, 180, 300, 470, 700, 1000, 1400, 1900, 2500, 3200];
  let level = 0;
  while (thresholds[level + 1] !== undefined && thresholds[level + 1] <= xp) level += 1;
  return level;
}

function timeBudgetFromProfile(profile: Record<string, unknown>, missionType: MissionType) {
  const context = asObject(profile.socioeconomic_context);
  const routine = asObject(context.routine);
  const time = String(context.time_availability ?? routine.free_time ?? "");

  const base = time === "micro"
    ? 5
    : time === "short"
      ? 15
      : time === "medium"
        ? 30
        : 45;

  return missionType === "specialized" ? Math.min(base * 2, 90) : base;
}

function missionWindowDays(missionType: MissionType) {
  return missionType === "specialized" ? 7 : 1;
}

function startOfUtcDay(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function endOfUtcDay(date = new Date()) {
  const start = new Date(startOfUtcDay(date));
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

function normalizeClientRequestId(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^a-zA-Z0-9:._-]/g, "")
    .slice(0, 120)
    .trim();
  return cleaned.length >= 12 ? cleaned : null;
}

async function findMissionByGenerationRequest(
  supabaseAdmin: any,
  userId: string,
  generationRequestId: string | null,
) {
  if (!generationRequestId) return null;

  const { data, error } = await supabaseAdmin
    .from("user_missions")
    .select("id, status, mission_type, category, pattern_key, action_fingerprint, generation_snapshot, cache_metadata, delivery_status, claimed_at, created_at")
    .eq("user_id", userId)
    .eq("generation_request_id", generationRequestId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar geração idempotente: ${error.message}`);
  }

  return data ?? null;
}

function maxCostFromProfile(profile: Record<string, unknown>) {
  const context = asObject(profile.socioeconomic_context);
  const friction = String(context.financial_friction ?? "");
  if (friction === "high") return "free";
  if (friction === "medium") return "low";
  return "medium";
}

function maxDifficultyFromProfile(
  profile: Record<string, unknown>,
  missionType: MissionType,
  facts: ProfileFact[],
) {
  const level = getLevelFromXp(profile.xp);
  const context = asObject(profile.socioeconomic_context);
  const sustainability = asObject(context.sustainability);
  const experience = String(sustainability.experience ?? "");
  const timeBudget = timeBudgetFromProfile(profile, missionType);
  const finance = String(context.financial_friction ?? "");
  const hasManyPositiveFacts = facts.filter((fact) =>
    ["habit", "capability", "interest", "preference", "goal"].includes(fact.fact_type)
  ).length >= 8;

  let maxDifficulty = 2;
  if (level >= 3 || experience === "some_habits" || hasManyPositiveFacts) maxDifficulty = 3;
  if (level >= 6 || experience === "consistent") maxDifficulty = 4;
  if (level >= 9 && missionType === "specialized") maxDifficulty = 5;

  if (missionType === "specialized") maxDifficulty += 1;
  if (timeBudget <= 5) maxDifficulty = Math.min(maxDifficulty, 2);
  if (finance === "high") {
    maxDifficulty = Math.min(maxDifficulty, missionType === "specialized" ? 4 : 3);
  }

  return clamp(maxDifficulty, 1, 5);
}

function factLabel(fact: ProfileFact) {
  const value = asObject(fact.value);
  const directLabel = [value.label, value.summary, value.signal_key]
    .find((item) => typeof item === "string" && item.trim().length > 0);
  const candidate = typeof directLabel === "string" ? directLabel : fact.fact_key;
  const readable = humanizeInternalToken(candidate);

  if (fact.fact_key.startsWith("cold_start.")) {
    return "informações iniciais do perfil";
  }

  if (isMissionActionFact(fact)) {
    const action = typeof value.action === "string" ? value.action : "";
    const category = CATEGORY_LABELS[String(fact.category ?? "")] ?? "sustentabilidade";
    if (action === "completed") return `histórico de missão concluída em ${category}`;
    if (action === "refused") return `histórico de missão recusada em ${category}`;
    if (action === "failed") return `histórico de missão difícil em ${category}`;
    return `histórico recente em ${category}`;
  }

  return readable || categoryFactFallback(fact);
}

function isMissionActionFact(fact: ProfileFact) {
  const value = asObject(fact.value);
  return fact.fact_key.startsWith("trail.mission.") || value.source === "mission_action";
}

function containsInternalIdentifier(value: string) {
  return /\b(?:water|energy|waste|transport|food|consumption|onboarding|adventure|trail|cold_start|feedback)\.[a-z0-9_.-]+\b/i
    .test(value);
}

function humanizeInternalToken(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/[._]/.test(text) && /\s/u.test(text)) {
    return text.replace(/\s+/g, " ").trim();
  }

  const normalized = text
    .replace(/^trail\.mission\./, "")
    .replace(/^adventure\.flashcard\./, "")
    .replace(/^adventure\.quiz\./, "")
    .replace(/^onboarding\./, "")
    .replace(/^feedback\./, "")
    .replace(/^cold_start\./, "")
    .replace(/^(water|energy|waste|transport|food|consumption)\./, "")
    .replace(/^(habit|capability|constraint|preference|interest|deficit|context|goal|risk)\./, "");
  const signalKey = normalized.split(".").pop()?.replace(/[^\p{L}\p{N}_ -]/gu, " ").trim() ?? "";
  const mapped = SIGNAL_LABELS[signalKey] ?? SIGNAL_LABELS[normalized.replace(/[.\s-]+/g, "_")];
  if (mapped) return mapped;

  return signalKey
    .replace(/_/g, " ")
    .replace(/\bhas\b/gi, "tem")
    .replace(/\bbucket\b/gi, "balde")
    .replace(/\bkitchen\b/gi, "cozinha")
    .replace(/\bpublic transport\b/gi, "transporte público")
    .replace(/\brecycling\b/gi, "reciclagem")
    .replace(/\btime\b/gi, "tempo")
    .replace(/\bmoney\b/gi, "orçamento")
    .replace(/\bsmall changes\b/gi, "mudanças pequenas")
    .trim();
}

function categoryFactFallback(fact: ProfileFact) {
  const category = CATEGORY_LABELS[String(fact.category ?? "")] ?? "sustentabilidade";
  switch (fact.fact_type) {
    case "capability":
      return `uma condição favorável em ${category}`;
    case "constraint":
      return `um limite a respeitar em ${category}`;
    case "preference":
      return `uma preferência em ${category}`;
    case "deficit":
      return `um ponto de aprendizado em ${category}`;
    case "habit":
      return `um hábito observado em ${category}`;
    case "goal":
      return `um objetivo em ${category}`;
    default:
      return `um aprendizado do perfil em ${category}`;
  }
}

function factReasonPhrase(fact: ProfileFact) {
  const label = factLabel(fact).toLowerCase();
  const category = CATEGORY_LABELS[String(fact.category ?? "")] ?? "sustentabilidade";

  if (fact.fact_key.startsWith("cold_start.")) {
    return "ainda há poucos dados no perfil, então a ação começa pequena e observável";
  }
  if (isMissionActionFact(fact)) {
    return `o histórico recente em ${category} ajudou a ajustar a intensidade`;
  }

  switch (fact.fact_type) {
    case "capability":
      return `aproveita ${label}`;
    case "constraint":
      return `respeita ${label}`;
    case "preference":
      return `combina com ${label}`;
    case "deficit":
      return `trabalha um ponto de aprendizado em ${category}`;
    case "habit":
      return `parte de um hábito já observado em ${category}`;
    case "goal":
      return `apoia seu objetivo em ${category}`;
    default:
      return `usa um aprendizado recente do seu perfil`;
  }
}

function sanitizePublicText(value: string, fallback: string) {
  if (containsInternalIdentifier(value)) return fallback;
  const cleaned = value
    .replace(
      /\b(?:water|energy|waste|transport|food|consumption|onboarding|adventure|trail|cold_start|feedback)\.[a-z0-9_.-]+\b/gi,
      "um aprendizado do perfil",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || containsInternalIdentifier(cleaned)) return fallback;
  return cleaned;
}

function joinNatural(items: string[]) {
  const uniqueItems = [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  if (uniqueItems.length <= 1) return uniqueItems[0] ?? "";
  if (uniqueItems.length === 2) return `${uniqueItems[0]} e ${uniqueItems[1]}`;
  return `${uniqueItems.slice(0, -1).join(", ")} e ${uniqueItems[uniqueItems.length - 1]}`;
}

function missionActionScoreForPattern(pattern: PatternRow, fact: ProfileFact) {
  if (!isMissionActionFact(fact)) return null;

  const value = asObject(fact.value);
  const confidence = clamp(numberValue(fact.confidence, 0.5), 0.1, 1);
  const patternKey = typeof value.pattern_key === "string" ? value.pattern_key : "";
  const action = typeof value.action === "string" ? value.action : "";
  const priorityDelta = numberValue(value.priority_delta, 0);
  const samePattern = patternKey === pattern.key ||
    fact.fact_key.startsWith(`trail.mission.${pattern.key}.`);
  const sameCategory = fact.category === pattern.category;
  let score = 0;

  if (samePattern) {
    score += priorityDelta * 70 * confidence;
    if (action === "completed") score += 8 * confidence;
    if (action === "refused") score -= 18 * confidence;
    if (action === "failed") score -= 14 * confidence;
  } else if (sameCategory) {
    if (action === "completed") score += 1.5 * confidence;
    if (action === "refused") score -= 2 * confidence;
    if (action === "failed") score -= 3 * confidence;
  }

  const priorDifficulty = numberValue(value.difficulty, NaN);
  if (
    sameCategory &&
    action === "failed" &&
    Number.isFinite(priorDifficulty) &&
    pattern.difficulty_min >= priorDifficulty
  ) {
    score -= 3 * confidence;
  }

  return score;
}

function factScoreForPattern(pattern: PatternRow, fact: ProfileFact) {
  const missionActionScore = missionActionScoreForPattern(pattern, fact);
  if (missionActionScore !== null) return missionActionScore;

  if (fact.fact_type === "deficit") return 5;
  if (fact.fact_type === "capability") return 3;
  if (fact.fact_type === "preference" || fact.fact_type === "goal") return 2;
  return 0;
}

function missionTextSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length > 3));
  const rightTokens = new Set(normalizeText(right).split(" ").filter((token) => token.length > 3));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function missionReferenceTimeMs(mission: any) {
  const rawValue = mission?.completed_at ?? mission?.created_at;
  const time = new Date(String(rawValue ?? "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function patternCooldownDays(pattern: PatternRow | null | undefined) {
  if (!pattern) return HARD_REPEAT_DAYS;
  const metadata = asObject(pattern.metadata);
  const configuredCooldown = numberValue(metadata.cooldown_days, NaN);
  if (Number.isFinite(configuredCooldown)) return clamp(Math.round(configuredCooldown), 0, RECENT_DAYS);
  if (pattern.recurrence_allowed) return 1;
  return clamp(pattern.difficulty_min + 1, 2, 10);
}

function buildPatternLookups(patterns: PatternRow[]) {
  return {
    byKey: new Map(patterns.map((pattern) => [pattern.key, pattern])),
    byAction: new Map(patterns.map((pattern) => [pattern.action_fingerprint, pattern])),
  };
}

function patternForMission(
  mission: any,
  lookups: ReturnType<typeof buildPatternLookups>,
) {
  const patternKey = typeof mission?.pattern_key === "string" ? mission.pattern_key : "";
  const actionFingerprint = typeof mission?.action_fingerprint === "string" ? mission.action_fingerprint : "";
  return lookups.byKey.get(patternKey) ?? lookups.byAction.get(actionFingerprint) ?? null;
}

function buildRepeatBlockMissions(
  activeMissions: any[],
  recentMissions: any[],
  patterns: PatternRow[],
) {
  const lookups = buildPatternLookups(patterns);
  const blocked: any[] = [];
  const seen = new Set<string>();

  const addMission = (mission: any) => {
    const id = typeof mission?.id === "string" ? mission.id : null;
    const key = id ?? `${mission?.pattern_key ?? ""}:${mission?.action_fingerprint ?? ""}:${mission?.created_at ?? ""}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    blocked.push(mission);
  };

  activeMissions.forEach(addMission);
  recentMissions
    .filter((mission) => String(mission?.status ?? "") !== "active")
    .filter((mission) => {
      const pattern = patternForMission(mission, lookups);
      const cooldownDays = patternCooldownDays(pattern);
      const cooldownSinceMs = Date.now() - cooldownDays * 24 * 60 * 60 * 1000;
      return missionReferenceTimeMs(mission) >= cooldownSinceMs;
    })
    .sort((left, right) => missionReferenceTimeMs(right) - missionReferenceTimeMs(left))
    .forEach(addMission);

  return blocked;
}

function emptyOutcomeBucket(): OutcomeBucket {
  return { attempts: 0, completed: 0, refused: 0, failed: 0 };
}

function addOutcome(bucket: OutcomeBucket, status: string) {
  if (!["completed", "refused", "failed"].includes(status)) return;
  bucket.attempts += 1;
  if (status === "completed") bucket.completed += 1;
  if (status === "refused") bucket.refused += 1;
  if (status === "failed") bucket.failed += 1;
}

function buildOutcomeStats(recentMissions: any[]): OutcomeStats {
  const stats: OutcomeStats = { byPattern: {}, byAction: {}, byCategory: {} };

  for (const mission of recentMissions) {
    const status = String(mission?.status ?? "");
    const patternKey = typeof mission?.pattern_key === "string" ? mission.pattern_key : "";
    const actionFingerprint = typeof mission?.action_fingerprint === "string" ? mission.action_fingerprint : "";
    const category = typeof mission?.category === "string" ? mission.category : "";

    if (patternKey) addOutcome(stats.byPattern[patternKey] ??= emptyOutcomeBucket(), status);
    if (actionFingerprint) addOutcome(stats.byAction[actionFingerprint] ??= emptyOutcomeBucket(), status);
    if (category) addOutcome(stats.byCategory[category] ??= emptyOutcomeBucket(), status);
  }

  return stats;
}

function outcomeScoreForPattern(pattern: PatternRow, outcomeStats: OutcomeStats) {
  const patternBucket = outcomeStats.byPattern[pattern.key] ??
    outcomeStats.byAction[pattern.action_fingerprint] ??
    emptyOutcomeBucket();
  const categoryBucket = outcomeStats.byCategory[pattern.category] ?? emptyOutcomeBucket();
  let score = 0;

  score += patternBucket.completed * 4;
  score -= patternBucket.refused * 16;
  score -= patternBucket.failed * 14;

  if (patternBucket.attempts >= 3) {
    const completionRate = patternBucket.completed / patternBucket.attempts;
    if (completionRate < 0.45) score -= 12;
  }

  score += categoryBucket.completed * 0.35;
  score -= categoryBucket.refused * 1.8;
  score -= categoryBucket.failed * 2.4;

  return score;
}

function rankPattern(input: {
  pattern: PatternRow;
  profile: Record<string, unknown>;
  facts: ProfileFact[];
  repeatBlockMissions: any[];
  recentCategoryCounts: Record<string, number>;
  activeCategoryCounts: Record<string, number>;
  outcomeStats: OutcomeStats;
  repeatBlockPatternKeys: Set<string>;
  repeatBlockActionFingerprints: Set<string>;
  missionType: MissionType;
  maxDifficulty: number;
  maxCost: string;
  timeBudget: number;
  userLevel: number;
}) {
  const {
    pattern,
    profile,
    facts,
    repeatBlockMissions,
    recentCategoryCounts,
    activeCategoryCounts,
    outcomeStats,
    repeatBlockPatternKeys,
    repeatBlockActionFingerprints,
    missionType,
    maxDifficulty,
    maxCost,
    timeBudget,
    userLevel,
  } = input;
  const rejectedReasons: string[] = [];

  if (pattern.difficulty_min > maxDifficulty) rejectedReasons.push("difficulty_above_profile");
  if (pattern.effort_minutes_min > timeBudget) rejectedReasons.push("effort_above_profile");
  if (costRank(pattern.cost_level) > costRank(maxCost)) rejectedReasons.push("cost_above_profile");
  if (userLevel >= 7 && pattern.difficulty_min <= 1 && pattern.effort_minutes_min <= 5) {
    rejectedReasons.push("pattern_too_trivial_for_experienced_user");
  }
  if (repeatBlockPatternKeys.has(pattern.key)) {
    rejectedReasons.push("pattern_in_cooldown");
  }
  if (repeatBlockActionFingerprints.has(pattern.action_fingerprint)) {
    rejectedReasons.push("action_fingerprint_in_cooldown");
  }

  const activeFactKeys = new Set(facts.map((fact) => fact.fact_key));
  const disqualified = pattern.disqualifying_fact_keys.some((factKey) => activeFactKeys.has(factKey));
  if (disqualified) rejectedReasons.push("disqualifying_fact_present");

  const matchingFacts = facts
    .filter((fact) =>
      (fact.category === pattern.category || fact.category === null) &&
      pattern.required_or_helpful_fact_types.includes(fact.fact_type)
    )
    .sort((left, right) => {
      const leftCategoryBoost = left.category === pattern.category ? 1 : 0;
      const rightCategoryBoost = right.category === pattern.category ? 1 : 0;
      if (leftCategoryBoost !== rightCategoryBoost) return rightCategoryBoost - leftCategoryBoost;
      return numberValue(right.confidence, 0) - numberValue(left.confidence, 0);
    });

  const factScores = matchingFacts.map((fact) => factScoreForPattern(pattern, fact));
  const hasHelpfulContext = matchingFacts.some((fact, index) =>
    !isMissionActionFact(fact) || factScores[index] > 0
  );

  let score = 0;
  score += hasHelpfulContext ? 18 : -12;
  score += factScores.reduce((total, factScore) => total + factScore, 0);
  score += outcomeScoreForPattern(pattern, outcomeStats);

  const affinities = asObject(profile.affinities);
  score += numberValue(affinities[pattern.category], 0) * 5;

  const categoryRepeatCount = recentCategoryCounts[pattern.category] ?? 0;
  score += Math.max(0, 6 - categoryRepeatCount * 2);

  const activeCategoryCount = activeCategoryCounts[pattern.category] ?? 0;
  if (activeCategoryCount > 0) {
    score -= activeCategoryCount === 1
      ? 18
      : activeCategoryCount === 2
        ? 50
        : 95 + (activeCategoryCount - 3) * 35;
  }

  const experienceTarget = userLevel >= 9
    ? 5
    : userLevel >= 7
      ? 4
      : userLevel >= 4
        ? 3
        : 2;
  const difficultyTarget = missionType === "specialized"
    ? Math.max(2, Math.min(maxDifficulty, experienceTarget + 1))
    : Math.max(1, Math.min(maxDifficulty, experienceTarget));
  score -= Math.abs(pattern.difficulty_min - difficultyTarget) * 2;
  if (pattern.difficulty_min === difficultyTarget) score += 3;

  if (pattern.cost_level === "free") score += 2;
  if (pattern.effort_minutes_max <= timeBudget) score += 2;

  const fallbackText = `${pattern.fallback_title_pt} ${pattern.fallback_description_pt}`;
  const similarRecent = repeatBlockMissions.some((mission) =>
    missionTextSimilarity(fallbackText, `${mission.title ?? ""} ${mission.description ?? ""}`) >= 0.72
  );
  if (similarRecent) rejectedReasons.push("mission_semantically_repeated_recently");

  return {
    pattern,
    score,
    usedFacts: matchingFacts.slice(0, 4),
    rejectedReasons,
  } satisfies RankedPattern;
}

function zeroImpact() {
  return {
    water_l: { low: 0, mid: 0, high: 0, confidence: 0.2 },
    co2_kg: { low: 0, mid: 0, high: 0, confidence: 0.2 },
    waste_g: { low: 0, mid: 0, high: 0, confidence: 0.2 },
    energy_kwh: { low: 0, mid: 0, high: 0, confidence: 0.2 },
  };
}

function impactEstimate(pattern: PatternRow, difficulty: number) {
  const impact = zeroImpact();
  const factor = Math.max(1, difficulty);
  const key = pattern.impact_model_key;

  if (pattern.category === "water" || key.includes("water")) {
    impact.water_l = { low: 2 * factor, mid: 6 * factor, high: 12 * factor, confidence: 0.45 };
  }
  if (pattern.category === "energy" || key.includes("energy")) {
    impact.energy_kwh = { low: 0.04 * factor, mid: 0.12 * factor, high: 0.3 * factor, confidence: 0.42 };
    impact.co2_kg = { low: 0.01 * factor, mid: 0.04 * factor, high: 0.1 * factor, confidence: 0.35 };
  }
  if (pattern.category === "waste" || key.includes("waste")) {
    impact.waste_g = { low: 40 * factor, mid: 120 * factor, high: 260 * factor, confidence: 0.48 };
  }
  if (pattern.category === "transport" || key.includes("transport") || key.includes("co2")) {
    impact.co2_kg = { low: 0.1 * factor, mid: 0.45 * factor, high: 1.2 * factor, confidence: 0.4 };
  }
  if (pattern.category === "food") {
    impact.waste_g = { low: 30 * factor, mid: 110 * factor, high: 240 * factor, confidence: 0.44 };
    impact.water_l = { low: 1 * factor, mid: 4 * factor, high: 10 * factor, confidence: 0.32 };
  }
  if (pattern.category === "consumption") {
    impact.waste_g = { low: 20 * factor, mid: 90 * factor, high: 220 * factor, confidence: 0.38 };
    impact.co2_kg = { low: 0.02 * factor, mid: 0.18 * factor, high: 0.55 * factor, confidence: 0.28 };
  }

  return impact;
}

function deriveActionFingerprint(pattern: Record<string, unknown>) {
  const explicit = typeof pattern.action_fingerprint === "string"
    ? pattern.action_fingerprint.trim()
    : "";
  if (explicit) return explicit;

  const metadata = asObject(pattern.metadata);
  const metadataFingerprint = typeof metadata.action_fingerprint === "string"
    ? metadata.action_fingerprint.trim()
    : "";
  if (metadataFingerprint) return metadataFingerprint;

  return typeof pattern.key === "string" && pattern.key.trim()
    ? pattern.key.trim()
    : "unknown.action";
}

function hasPositiveImpact(impact: Record<string, any>) {
  return Object.values(impact).some((range: any) =>
    Number(range?.mid ?? 0) > 0 || Number(range?.high ?? 0) > 0
  );
}

function hasConcreteActionLanguage(value: string) {
  const text = normalizeText(value);
	return [
	  "acompanhe",
	  "ajuste",
	  "anote",
	  "avalie",
	  "busque",
	  "calcule",
	  "combine",
	  "compartilhe",
	  "confira",
	  "considere",
	  "compare",
	  "converse",
	  "crie",
	  "defina",
	  "desligue",
	  "dispense",
	  "encaminhe",
	  "escolha",
	  "estabeleca",
	  "estime",
	  "evite",
	  "feche",
	  "identifique",
	  "liste",
	  "mapa",
	  "mapeie",
	  "marque",
	  "meca",
	  "monte",
	  "negocie",
	  "observe",
	  "olhe",
	  "organize",
	  "pegue",
	  "planeje",
    "prefira",
    "prepare",
    "priorize",
    "procure",
    "proponha",
    "reaproveite",
    "registre",
    "reduza",
    "remova",
	  "reuna",
	  "revise",
	  "separe",
	  "sinalize",
	  "substitua",
	  "teste",
	  "troque",
	  "use",
    "veja",
    "verifique",
  ].some((verb) => text.includes(verb));
}

function hasSustainabilityFollowThrough(value: string) {
  const text = normalizeText(value);
  const discoveryTerms = [
    "abra",
    "avalie",
    "confira",
    "identifique",
    "liste",
    "observe",
    "registre",
    "revise",
    "separe",
    "verifique",
  ];
  const isDiscoveryOnlyRisk = discoveryTerms.some((term) => text.includes(term));
  if (!isDiscoveryOnlyRisk) return true;

  return [
	  "armazene",
	  "carona",
	  "combine",
	  "combinado",
	  "compartilhado",
	  "compartilhe",
	  "consuma",
	  "criterio",
	  "defina",
	  "destino",
	  "doe",
	  "encaminhe",
	  "escolha",
	  "evite desperdicio",
	  "evitar descarte",
	  "guarde",
	  "nao usado",
	  "planeje",
	  "prioridade",
	  "proxima refeicao",
	  "reaproveite",
	  "reduzir descarte",
	  "regra",
	  "repare",
	  "rota compartilhada",
	  "substitua",
	  "use",
	].some((term) => text.includes(term));
}

function summarizeValidationErrors(validationErrors: unknown[]) {
  const counts: Record<string, number> = {};

  for (const entry of validationErrors) {
    const errors = stringArray(asObject(entry).errors);
    for (const error of errors) counts[error] = (counts[error] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([error, count]) => ({ error, count }));
}

function validateCandidate(
  candidate: MissionCandidate,
  options: {
    facts: ProfileFact[];
    repeatBlockMissions: any[];
    repeatBlockPatternKeys: Set<string>;
    repeatBlockActionFingerprints: Set<string>;
    userLevel: number;
  },
) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!candidate.title || candidate.title.trim().length < 4) errors.push("title_required");
  if (!candidate.description || candidate.description.trim().length < 20) errors.push("description_required");
  if (!isCategory(candidate.category)) errors.push("category_invalid");
  if (!COST_ORDER.includes(candidate.cost_level as any)) errors.push("cost_level_invalid");
  if (!Number.isInteger(candidate.difficulty) || candidate.difficulty < 1 || candidate.difficulty > 5) {
    errors.push("difficulty_invalid");
  }
  if (!Number.isFinite(candidate.effort_minutes) || candidate.effort_minutes < 0 || candidate.effort_minutes > 240) {
    errors.push("effort_minutes_invalid");
  }
  if (!candidate.environmental_goal || !normalizeText(candidate.environmental_goal).match(/reduzir|evitar|economizar|reutilizar|reaproveitar|reciclar|separar|consertar|reparar|diminuir|desperdicio|emissao|agua|energia|consumo|residuo|descarte|vida util|baixo carbono|prolongar|encaminhar|otimizar|planejar/)) {
    errors.push("environmental_goal_not_positive_or_explicit");
  }
  if (!candidate.used_fact_keys.length) errors.push("used_fact_keys_required");
  if (!candidate.personalization_reason || candidate.personalization_reason.trim().length < 20) {
    errors.push("personalization_reason_required");
  }
  if (!candidate.help_text || candidate.help_text.trim().length < 80) {
    errors.push("help_text_required");
  }
  if (candidate.help_text && candidate.help_text.length > MISSION_HELP_MAX_CHARS) {
    errors.push("help_text_too_long");
  }
  if (!hasPositiveImpact(candidate.expected_impact as any)) {
    errors.push("expected_impact_must_have_positive_metric");
  }

  const activeFactKeys = new Set(options.facts.map((fact) => fact.fact_key));
  for (const factKey of candidate.used_fact_keys) {
    if (!factKey.startsWith("cold_start.") && !activeFactKeys.has(factKey)) {
      errors.push(`used_fact_key_not_found:${factKey}`);
    }
  }

  const publicText = `${candidate.title} ${candidate.description} ${candidate.personalization_reason} ${candidate.help_text}`;
  const text = normalizeText(publicText);
  if (containsInternalIdentifier(publicText)) {
    errors.push("public_text_contains_internal_identifier");
  }
  if (
    text.includes("missao da pequena mudanca") ||
    text.includes("escolha uma acao simples") ||
    text.includes("praticar hoje por pelo menos 10 minutos")
  ) {
    errors.push("generic_fallback_mission");
  }

  if (
    text.includes("registre mentalmente o que funcionou") ||
    text.includes("reserve em cerca de") ||
    text.includes("nao compre nada para concluir") ||
    text.includes("distribua ou repita a acao") ||
    text.includes("ajuste a acao para que") ||
    text.includes("para que nao depende") ||
    text.includes("deve ser algo") ||
    text.includes("como preferir")
  ) {
    errors.push("mission_contains_boilerplate_suffix");
  }

  if (!hasConcreteActionLanguage(candidate.description)) {
    errors.push("description_lacks_concrete_action");
  }
  if (!hasSustainabilityFollowThrough(candidate.description)) {
    errors.push("description_lacks_sustainability_follow_through");
  }
  if (candidate.mission_type === "daily" && /\b(nesta semana|ao longo da semana|durante a semana)\b/.test(text)) {
    errors.push("daily_mission_uses_weekly_language");
  }
  if (candidate.mission_type === "specialized" && /\b(hoje|agora)\b/.test(text) && !/\b(nesta semana|ao longo da semana|durante a semana)\b/.test(text)) {
    errors.push("specialized_mission_lacks_weekly_language");
  }

  const harmful = [
    "compre mais",
    "comprar mais",
    "use mais agua",
    "use mais energia",
    "deixe ligado",
    "jogue fora",
    "banho mais longo",
    "ignore seguranca",
    "sem se preocupar com seguranca",
    "descarte no lixo comum",
    "misture residuos",
  ];
  if (harmful.some((term) => text.includes(term))) {
    errors.push("mission_increases_consumption_without_justification");
  }

  if (options.repeatBlockPatternKeys.has(candidate.pattern_key)) {
    errors.push("pattern_repeated_recently");
  }
  if (!candidate.action_fingerprint || candidate.action_fingerprint.trim().length < 3) {
    errors.push("action_fingerprint_required");
  }
  if (options.repeatBlockActionFingerprints.has(candidate.action_fingerprint)) {
    errors.push("action_fingerprint_repeated_recently");
  }

  const missionText = `${candidate.title} ${candidate.description}`;
  if (
    options.repeatBlockMissions.some((mission) =>
      missionTextSimilarity(missionText, `${mission.title ?? ""} ${mission.description ?? ""}`) >= 0.72
    )
  ) {
    errors.push("mission_semantically_repeated_recently");
  }

  if (options.userLevel >= 7 && candidate.difficulty <= 1 && candidate.effort_minutes <= 5) {
    errors.push("mission_too_trivial_for_experienced_user");
  }

  if (candidate.used_fact_keys.some((factKey) => factKey.startsWith("cold_start."))) {
    warnings.push("cold_start_fact_used");
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function buildFallbackCandidate(
  pattern: PatternRow,
  facts: ProfileFact[],
  profile: Record<string, unknown>,
  missionType: MissionType,
) {
  const timeBudget = timeBudgetFromProfile(profile, missionType);
  const difficulty = clamp(pattern.difficulty_min, 1, pattern.difficulty_max);
  const effortMinutes = clamp(
    Math.min(pattern.effort_minutes_max, Math.max(pattern.effort_minutes_min, Math.round(timeBudget * 0.7))),
    pattern.effort_minutes_min,
    pattern.effort_minutes_max,
  );
  const usedFacts = facts.length
    ? facts
    : [{
      fact_key: "cold_start.prompt7.context_available",
      fact_type: "context",
      category: pattern.category,
      value: { source: "fallback_context" },
      confidence: 0.45,
    } as ProfileFact];
  const expectedImpact = impactEstimate(pattern, difficulty);
  const xpReward = XP_REWARD_BY_DIFFICULTY[difficulty] ?? 10;
  const slotHints = buildPersonalizationSlotHints(pattern, usedFacts, profile, effortMinutes);
  const description = buildDeterministicDescription(pattern, missionType, slotHints);
  const personalizationReason = buildPersonalizationReason(pattern, usedFacts, slotHints);
  const helpText = buildDeterministicHelpText(pattern, description, missionType, effortMinutes);

  return {
    title: pattern.fallback_title_pt,
    description,
    category: pattern.category,
    environmental_goal: pattern.environmental_goal,
    difficulty,
    effort_minutes: effortMinutes,
    cost_level: pattern.cost_level,
    used_fact_keys: usedFacts.map((fact) => fact.fact_key).slice(0, 4),
    personalization_reason: personalizationReason,
    help_text: helpText,
    expected_impact: expectedImpact,
    pattern_key: pattern.key,
    action_fingerprint: pattern.action_fingerprint,
    mission_type: missionType,
    xp_reward: xpReward,
    ai_justification: {
      category: pattern.category,
      reason: personalizationReason,
      help_text: helpText,
      mission_type: missionType,
      generated_by: ALGORITHM_VERSION,
      personalization_slots: pattern.personalization_slots,
    },
  } satisfies MissionCandidate;
}

async function ensureColdStartFact(supabaseAdmin: any, userId: string, category: Category) {
  const now = new Date().toISOString();
  const fact = {
    user_id: userId,
    fact_key: "cold_start.prompt7.context_available",
    fact_type: "context",
    category,
    value: {
      source: "generate_missions",
      reason: "Perfil sem fatos ativos suficientes; fato frio criado explicitamente para permitir missão inicial auditável.",
      algorithm: ALGORITHM_VERSION,
    },
    confidence: 0.45,
    source_event_ids: [],
    active: true,
    derived_by: ALGORITHM_VERSION,
    evidence_count: 1,
    last_seen_at: now,
    updated_at: now,
  };

  const { error } = await supabaseAdmin
    .from("user_profile_facts")
    .upsert(fact, { onConflict: "user_id,fact_key" });

  if (error) throw new Error(`Erro ao criar fato cold start: ${error.message}`);
  return fact as ProfileFact;
}

interface MissionBlueprint {
  rankedPattern: RankedPattern;
  fallbackCandidate: MissionCandidate;
}

interface AiCompositionAttempt {
  candidate: MissionCandidate;
  source: "ai" | "fallback";
  fallbackReason: string | null;
}

function sanitizeAiText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const trimmed = sanitizePublicText(
    stripGenericMissionBoilerplate(value).replace(/\s+/g, " ").trim(),
    fallback,
  );
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function stripGenericMissionBoilerplate(value: string) {
  return value
    .replace(/\s*Faça em um momento seguro da rotina e registre mentalmente o que funcionou\./gi, "")
    .replace(/\s*Reserve em poucos minutos e não compre nada para concluir\./gi, "")
    .replace(/\s*Reserve em cerca de \d+ minutos e não compre nada para concluir\./gi, "")
    .replace(/\s*Reserve em até \d+ minutos, sem pressa e não compre nada para concluir\./gi, "")
    .replace(/\s*Reserve ao longo de até \d+ minutos e não compre nada para concluir\./gi, "")
    .replace(/\s*Distribua ou repita a ação ao longo de até 7 dias, acompanhando o que funcionou\./gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionForMissionType(pattern: PatternRow, missionType: MissionType) {
  const cleanDescription = stripGenericMissionBoilerplate(pattern.fallback_description_pt);
  if (missionType === "specialized" && cleanDescription.startsWith("Hoje, ")) {
    return `Nesta semana, ${cleanDescription.slice("Hoje, ".length)}`;
  }
  return cleanDescription;
}

function buildPersonalizationSlotHints(
  pattern: PatternRow,
  facts: ProfileFact[],
  profile: Record<string, unknown>,
  effortMinutes: number,
) {
  const context = asObject(profile.socioeconomic_context);
  const routine = asObject(context.routine);
  const slots = new Set(pattern.personalization_slots);
  const hints: string[] = [];
  const fact = facts[0];

  if (fact) hints.push(factReasonPhrase(fact));
  if (slots.has("time_limit")) hints.push(`cabe em até ${effortMinutes} minutos`);
  if (slots.has("budget_limit") || pattern.cost_level === "free") hints.push("não depende de compra nova");
  if (slots.has("control_level")) hints.push("fica restrita ao que estiver sob seu controle");
  if (slots.has("safe_pause") || slots.has("safety_boundary") || slots.has("safety_condition")) {
    hints.push("mantém segurança e saúde como limite");
  }
  if (slots.has("comfort_level")) hints.push("preserva conforto básico");
  if (slots.has("kitchen_access")) hints.push("respeita o acesso real à cozinha");
  if (slots.has("diet_boundary")) hints.push("não impõe mudança alimentar incompatível");
  if (slots.has("collection_access")) hints.push("considera se há destino viável para o resíduo");
  if (slots.has("available_space") || slots.has("storage_context")) hints.push("usa pouco espaço");
  if (slots.has("mobility_limit")) hints.push("não ignora mobilidade, clima ou segurança do trajeto");
  if (slots.has("route_type")) hints.push("atua em um deslocamento concreto");
  if (slots.has("purchase_context")) hints.push("age antes da decisão de compra");
  if (slots.has("reuse_option")) hints.push("prioriza reutilizar o que já existe");
  if (slots.has("delay_window")) hints.push("cria uma pausa antes do consumo automático");

  const freeTime = String(context.time_availability ?? routine.free_time ?? "");
  if (freeTime === "micro") hints.push("foi mantida bem curta");
  if (freeTime === "short") hints.push("foi mantida objetiva");

  return [...new Set(hints)].slice(0, 4);
}

function buildDeterministicDescription(
  pattern: PatternRow,
  missionType: MissionType,
  _slotHints: string[],
) {
  const base = descriptionForMissionType(pattern, missionType);
  return sanitizePublicText(base, base);
}

function buildPersonalizationReason(
  pattern: PatternRow,
  facts: ProfileFact[],
  slotHints: string[],
) {
  const reasonHints = slotHints.length
    ? slotHints.slice(0, 3)
    : facts.slice(0, 2).map(factReasonPhrase);
  const reason = reasonHints.length
    ? `${pattern.fallback_reason_pt} Ela foi escolhida porque ${joinNatural(reasonHints)}.`
    : `${pattern.fallback_reason_pt} Ela começa por uma ação concreta, segura e de baixa fricção.`;

  return sanitizePublicText(
    reason,
    `${pattern.fallback_reason_pt} Ela começa por uma ação concreta, segura e de baixa fricção.`,
  );
}

function buildDeterministicHelpText(
  pattern: PatternRow,
  description: string,
  missionType: MissionType,
  effortMinutes: number,
) {
  const timeWindow = missionType === "specialized"
    ? "Use como um roteiro da semana, dividindo a ação em dois ou três momentos curtos."
    : `Reserve cerca de ${effortMinutes} minutos hoje.`;
  const category = CATEGORY_LABELS[pattern.category] ?? "sustentabilidade";
  const text =
    `${timeWindow} Comece pela situação da missão: ${description} ` +
    `Se algo não estiver sob seu controle, faça a menor versão segura da ação. ` +
    `Considere concluída quando houver uma decisão ou destino claro ligado a ${category}, sem compra nova nem risco.`;

  return sanitizePublicText(
    text.slice(0, MISSION_HELP_MAX_CHARS),
    "Comece pela situação descrita na missão, faça a menor versão segura da ação e considere concluída quando houver um destino ou decisão sustentável claro.",
  );
}

function buildAiCandidateFromBlueprint(
  rawCandidate: Record<string, unknown>,
  blueprintByPatternKey: Map<string, MissionBlueprint>,
  candidateIndex: number,
) {
  const patternKey = typeof rawCandidate.pattern_key === "string"
    ? rawCandidate.pattern_key
    : "";
  const blueprint = blueprintByPatternKey.get(patternKey);
  if (!blueprint) return null;

  const baseCandidate = blueprint.fallbackCandidate;
  const allowedFactKeys = new Set(baseCandidate.used_fact_keys);
  const aiFactKeys = stringArray(rawCandidate.used_fact_keys)
    .filter((factKey) => allowedFactKeys.has(factKey));
  const usedFactKeys = aiFactKeys.length ? aiFactKeys : baseCandidate.used_fact_keys;

  return {
    ...baseCandidate,
    title: sanitizeAiText(rawCandidate.title, baseCandidate.title, 90),
    description: sanitizeAiText(rawCandidate.description, baseCandidate.description, 520),
    used_fact_keys: usedFactKeys,
    personalization_reason: sanitizeAiText(
      rawCandidate.personalization_reason,
      baseCandidate.personalization_reason,
      360,
    ),
    help_text: sanitizeAiText(
      rawCandidate.help_text,
      baseCandidate.help_text,
      MISSION_HELP_MAX_CHARS,
    ),
    ai_justification: {
      ...baseCandidate.ai_justification,
      reason: sanitizeAiText(
        rawCandidate.personalization_reason,
        baseCandidate.personalization_reason,
        360,
      ),
      help_text: sanitizeAiText(
        rawCandidate.help_text,
        baseCandidate.help_text,
        MISSION_HELP_MAX_CHARS,
      ),
      composed_by_ai: true,
      composer_candidate_index: candidateIndex,
    },
  } satisfies MissionCandidate;
}

async function composeMissionCandidatesWithAi(
  blueprints: MissionBlueprint[],
  contextSummary: Record<string, unknown>,
) {
  const hasAiKey = Boolean(
    configuredSecret(Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPEN_AI_KEY")) ??
      configuredSecret(Deno.env.get("GEMINI_API_KEY")) ??
      configuredSecret(Deno.env.get("GROQ_API_KEY")),
  );

  if (!hasAiKey) {
    return {
      candidates: [] as MissionCandidate[],
      usedAi: false,
      fallbackReason: "no_ai_key",
      fallbackDetail: "no_ai_key",
      aiProvider: null,
      aiModel: null,
    };
  }

  const blueprintByPatternKey = new Map(
    blueprints.map((blueprint) => [blueprint.fallbackCandidate.pattern_key, blueprint]),
  );
  const safeBlueprints = blueprints.map(({ rankedPattern, fallbackCandidate }) => ({
    pattern_key: fallbackCandidate.pattern_key,
    action_fingerprint: fallbackCandidate.action_fingerprint,
    category: fallbackCandidate.category,
    environmental_goal: fallbackCandidate.environmental_goal,
    difficulty: fallbackCandidate.difficulty,
    effort_minutes: fallbackCandidate.effort_minutes,
    cost_level: fallbackCandidate.cost_level,
    xp_reward: fallbackCandidate.xp_reward,
    mission_type: fallbackCandidate.mission_type,
    mission_window_days: missionWindowDays(fallbackCandidate.mission_type),
    used_fact_keys: fallbackCandidate.used_fact_keys,
    personalization_slots: rankedPattern.pattern.personalization_slots,
    fallback_title_pt: rankedPattern.pattern.fallback_title_pt,
    fallback_description_pt: rankedPattern.pattern.fallback_description_pt,
    fallback_reason_pt: rankedPattern.pattern.fallback_reason_pt,
    deterministic_reason_pt: fallbackCandidate.personalization_reason,
    score: Math.round(rankedPattern.score * 100) / 100,
  }));

	  const aiResult = await runJsonAgent({
	    role: "adventurer",
	    task: `Componha ${MIN_AI_CANDIDATES} a ${MAX_AI_CANDIDATES} candidatas de missão em português brasileiro usando APENAS os blueprints seguros.
	Regras:
	- Cada candidata deve escolher um pattern_key recebido nos blueprints.
	- Use pattern_keys diferentes sempre que houver blueprints suficientes; não concentre todas as candidatas no mesmo tipo de ação.
	- Pode variar título, momento da rotina, objeto concreto e abordagem dentro dos slots do blueprint.
	- Não altere categoria, action_fingerprint, objetivo ambiental, dificuldade, custo, tempo, XP, impacto ou facts fora dos recebidos.
	- Use somente used_fact_keys presentes no blueprint escolhido.
	- A descrição deve ser concreta, sustentável, segura, curta e não genérica.
	- A descrição precisa conter uma ação observável, não apenas intenção: combine, escolha, defina, encaminhe, guarde, use, substitua, compare e decida, mapeie e marque, separe e dê destino.
	- A descrição deve fechar o ciclo da ação: contexto ou objeto + ação concreta + destino, decisão, uso, prevenção ou próximo passo sustentável.
	- Não pare em "abrir", "listar", "separar", "observar", "verificar", "avaliar" ou "identificar"; diga o que a pessoa fará com o item, sobra, rota, resíduo, aparelho ou informação encontrada.
	- Para transporte, deixe explícita a decisão sustentável: carona segura, rota agrupada, viagem evitada, trecho ativo seguro, deslocamento fora de pico ou alternativa remota.
	- Para água/energia compartilhada, deixe explícito o combinado ou regra observável, como fechar, desligar, ajustar, avisar, sinalizar ou testar uma rotina.
	- Crie help_text como uma ajuda prática sob demanda, com no máximo ${MISSION_HELP_MAX_CHARS} caracteres.
	- help_text deve explicar "como fazer" em 3 a 5 passos curtos: por onde começar, o que observar/decidir, como adaptar se houver impedimento e o que conta como concluído.
	- help_text deve esclarecer a missão sem expandir escopo, sem pedir compra nova e sem repetir a descrição com outras palavras.
	- Se o blueprint tiver mission_window_days = 7, escreva como missão semanal: algo para distribuir, repetir ou acompanhar ao longo da semana.
	- Não copie nem acrescente rodapés genéricos como "registre mentalmente o que funcionou", "não compre nada para concluir" ou "Distribua ou repita a ação".
	- Evite frases robóticas como "certifique-se de completar em até X minutos".
- Evite justificativas genéricas como "seu nível de usuário"; cite limites, preferências ou fatos concretos do contexto.
- Nunca mostre fact_key, pattern_key, action_fingerprint, nomes de tabela ou códigos internos no texto ao usuário.
- Não invente restrições, dados médicos, custos, acesso doméstico ou fatos novos.
- Não mande comprar nada caro nem aumentar consumo de água, energia, descarte ou emissões.
JSON esperado:
{
  "candidates": [
    {
      "pattern_key": "string",
	      "title": "string",
	      "description": "string",
	      "used_fact_keys": ["string"],
	      "personalization_reason": "string",
	      "help_text": "string"
	    }
  ]
}`,
	    context: {
	      blueprints: safeBlueprints,
	      context_summary: contextSummary,
	      validation_checklist: {
	        description_must_include: [
	          "ação concreta observável",
	          "objeto, rotina, rota, aparelho, resíduo ou decisão específica",
	          "próximo passo sustentável ou critério de conclusão",
	        ],
	        reject_if_description_only: [
	          "observa sem decidir",
	          "lista sem usar ou encaminhar",
	          "separa sem destino",
	          "avalia transporte sem escolher rota, carona, deslocamento evitado ou alternativa segura",
	        ],
	      },
	    },
    fallback: {
      candidates: [],
    },
  }) as any;

  const fallbackReason = typeof aiResult?._fallback_reason === "string"
    ? aiResult._fallback_reason
    : null;
  const fallbackDetail = typeof aiResult?._fallback_detail === "string"
    ? aiResult._fallback_detail
    : fallbackReason;
  const aiProvider = typeof aiResult?._agent_provider === "string"
    ? aiResult._agent_provider
    : null;
  const aiModel = typeof aiResult?._agent_model === "string"
    ? aiResult._agent_model
    : null;

  if (fallbackReason) {
    return {
      candidates: [] as MissionCandidate[],
      usedAi: false,
      fallbackReason,
      fallbackDetail,
      aiProvider,
      aiModel,
    };
  }

  const rawCandidates = Array.isArray(aiResult?.candidates)
    ? aiResult.candidates.slice(0, MAX_AI_CANDIDATES)
    : [];
  const candidates = rawCandidates
    .map((rawCandidate: unknown, index: number) =>
      buildAiCandidateFromBlueprint(asObject(rawCandidate), blueprintByPatternKey, index)
    )
    .filter((candidate: MissionCandidate | null): candidate is MissionCandidate => Boolean(candidate));

  if (!candidates.length) {
    return {
      candidates: [] as MissionCandidate[],
      usedAi: false,
      fallbackReason: "ai_returned_no_valid_blueprint_candidate",
      fallbackDetail: "empty_candidate_list",
      aiProvider,
      aiModel,
    };
  }

  return { candidates, usedAi: true, fallbackReason: null, fallbackDetail: null, aiProvider, aiModel };
}

function aiRuntimeSummary() {
  const openAiKey = configuredSecret(Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPEN_AI_KEY"));
  const geminiKey = configuredSecret(Deno.env.get("GEMINI_API_KEY"));
  const groqKey = configuredSecret(Deno.env.get("GROQ_API_KEY"));

  if (openAiKey) {
    return {
      ai_available: true,
      ai_provider: "openai",
      ai_model: Deno.env.get("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL,
    };
  }

  if (geminiKey) {
    return {
      ai_available: true,
      ai_provider: "gemini",
      ai_model: Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL,
    };
  }

  if (groqKey) {
    return {
      ai_available: true,
      ai_provider: "groq",
      ai_model: Deno.env.get("GROQ_MODEL") ?? DEFAULT_GROQ_MODEL,
    };
  }

  return {
    ai_available: false,
    ai_provider: null,
    ai_model: null,
  };
}

function generationAiDebug(snapshot: unknown) {
  const ai = asObject(asObject(snapshot).ai);
  return {
    ai_used: ai.ai_used === true,
    ai_stage: typeof ai.ai_stage === "string" ? ai.ai_stage : null,
    used_fallback: Boolean(ai.fallback_reason),
    fallback_reason: typeof ai.fallback_reason === "string" ? ai.fallback_reason : null,
    fallback_detail: typeof ai.fallback_detail === "string" ? ai.fallback_detail : null,
    ai_provider: typeof ai.ai_provider === "string" ? ai.ai_provider : null,
    ai_model: typeof ai.ai_model === "string" ? ai.ai_model : null,
    candidate_count: numberValue(ai.candidate_count, 0),
    ai_candidate_count: numberValue(ai.ai_candidate_count, 0),
    blueprint_count: numberValue(ai.blueprint_count, 0),
    validation_error_count: numberValue(ai.validation_error_count, 0),
    validation_error_summary: typeof ai.validation_error_summary === "string"
      ? ai.validation_error_summary
      : null,
  };
}

function generationSourceFromAiDebug(aiDebug: ReturnType<typeof generationAiDebug>) {
  if (aiDebug.used_fallback) return "deterministic_fallback";
  if (aiDebug.ai_used) return "ai";
  return "unknown";
}

function missionCacheDebug(mission: any, aiDebug: ReturnType<typeof generationAiDebug>) {
  const cacheMetadata = asObject(mission?.cache_metadata);
  const prefetchedAt = typeof cacheMetadata.prefetched_at === "string"
    ? cacheMetadata.prefetched_at
    : null;
  const claimedAt = typeof cacheMetadata.claimed_at === "string"
    ? cacheMetadata.claimed_at
    : typeof mission?.claimed_at === "string"
      ? mission.claimed_at
      : null;
  const prefetchedMs = prefetchedAt ? new Date(prefetchedAt).getTime() : NaN;

  return {
    cache_generation_source: generationSourceFromAiDebug(aiDebug),
    cache_prefetched_at: prefetchedAt,
    cache_claimed_at: claimedAt,
    cache_age_ms: Number.isFinite(prefetchedMs) ? Math.max(0, Date.now() - prefetchedMs) : null,
  };
}

function missionResponseFromRow(
  mission: any,
  input: {
    missionType: MissionType;
    generationRequestId: string | null;
    message: string;
    idempotent?: boolean;
    usedCache?: boolean;
  },
) {
  const aiDebug = generationAiDebug(mission?.generation_snapshot);
  const cacheDebug = input.usedCache === true ? missionCacheDebug(mission, aiDebug) : {};
  return {
    success: true,
    mission_id: mission?.id,
    pattern_key: mission?.pattern_key ?? null,
    action_fingerprint: mission?.action_fingerprint ?? null,
    category: mission?.category ?? null,
    mission_status: mission?.status,
    mission_type: mission?.mission_type ?? input.missionType,
    client_request_id: input.generationRequestId,
    idempotent: input.idempotent === true,
    used_cache: input.usedCache === true,
    ...aiDebug,
    ...cacheDebug,
    message: input.message,
  };
}

async function expireCachedMissions(
  supabaseAdmin: any,
  userId: string,
  missionType: MissionType,
) {
  await supabaseAdmin
    .from("user_missions")
    .update({ delivery_status: "expired_cache" })
    .eq("user_id", userId)
    .eq("mission_type", missionType)
    .eq("delivery_status", "cached")
    .lt("expires_at", new Date().toISOString());
}

async function findCachedMission(
  supabaseAdmin: any,
  userId: string,
  missionType: MissionType,
) {
  await expireCachedMissions(supabaseAdmin, userId, missionType);

  const { data, error } = await supabaseAdmin
    .from("user_missions")
    .select("*")
    .eq("user_id", userId)
    .eq("mission_type", missionType)
    .eq("delivery_status", "cached")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar missão em cache: ${error.message}`);
  return data ?? null;
}

async function claimCachedMission(
  supabaseAdmin: any,
  userId: string,
  missionType: MissionType,
  generationRequestId: string | null,
) {
  const cached = await findCachedMission(supabaseAdmin, userId, missionType);
  if (!cached) return null;

  const now = new Date();
  const cacheMetadata = asObject(cached.cache_metadata);
  const { data, error } = await supabaseAdmin
    .from("user_missions")
    .update({
      delivery_status: "delivered",
      claimed_at: now.toISOString(),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + missionWindowDays(missionType) * 24 * 60 * 60 * 1000)
        .toISOString(),
      generation_request_id: generationRequestId,
      cache_metadata: {
        ...cacheMetadata,
        claimed_from_cache: true,
        claimed_at: now.toISOString(),
        client_request_id: generationRequestId,
      },
    })
    .eq("id", cached.id)
    .eq("user_id", userId)
    .eq("mission_type", missionType)
    .eq("delivery_status", "cached")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Erro ao reivindicar missão em cache: ${error.message}`);
  return data ?? null;
}

async function writeGenerationLog(
  supabaseAdmin: any,
  input: {
    userId: string;
    missionId?: string | null;
    missionType: MissionType;
    candidatePatternKeys: string[];
    selectedPatternKey?: string | null;
    selectedActionFingerprint?: string | null;
    rejectedCandidates: unknown[];
    validationErrors: unknown[];
    generationSnapshot: Record<string, unknown>;
    usedFallback: boolean;
    status: "success" | "error" | "rejected" | "fallback";
    errorMessage?: string | null;
  },
) {
  const { error } = await supabaseAdmin
    .from("mission_generation_logs")
    .insert({
      user_id: input.userId,
      mission_id: input.missionId ?? null,
      mission_type: input.missionType,
      context_version: CONTEXT_VERSION,
      candidate_pattern_keys: input.candidatePatternKeys,
      selected_pattern_key: input.selectedPatternKey ?? null,
      selected_action_fingerprint: input.selectedActionFingerprint ?? null,
      rejected_candidates: input.rejectedCandidates,
      validation_errors: input.validationErrors,
      generation_snapshot: input.generationSnapshot,
      used_fallback: input.usedFallback,
      status: input.status,
      error_message: input.errorMessage ?? null,
    });

  if (error) {
    console.error("[MISSION_GEN] Erro ao gravar log de geração:", error.message);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  try {
    const body = await req.json();
    const userId = body.userId;
    const missionType: MissionType = isMissionType(body.missionType) ? body.missionType : "daily";
    const generationRequestId = normalizeClientRequestId(body.clientRequestId ?? body.generationRequestId);
    const prefetchOnly = body?.prefetchOnly === true;

    if (!userId) {
      throw new Error("O parâmetro 'userId' é obrigatório no corpo da requisição.");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();

    console.log("[MISSION_GEN] Iniciando Trilha hiperpersonalizada.", {
      userId,
      missionType,
      prefetchOnly,
    });

    const existingMissionForRequest = await findMissionByGenerationRequest(
      supabaseAdmin,
      userId,
      generationRequestId,
    );

    if (existingMissionForRequest) {
      console.log("[MISSION_GEN] Requisição idempotente já atendida.", {
        userId,
        missionType,
        generationRequestId,
        missionId: existingMissionForRequest.id,
      });

      return jsonResponse(missionResponseFromRow(existingMissionForRequest, {
        missionType,
        generationRequestId,
        idempotent: true,
        message: "mission_already_created",
      }));
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("socioeconomic_context, xp, learned_preferences, affinities, onboarding_completed, daily_flashcards_completed")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
    if (!profile) throw new Error("Perfil não encontrado.");

    if (!profile.onboarding_completed) {
      return jsonResponse({ error: "onboarding_pending" }, 400);
    }

    const { data: activeMissions, error: activeError } = await supabaseAdmin
      .from("user_missions")
      .select("id, category, pattern_key, action_fingerprint, title, description, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("delivery_status", "delivered");

    if (activeError) throw new Error(`Erro ao contar missões ativas: ${activeError.message}`);
    const activeMissionCount = activeMissions?.length ?? 0;

    if (activeMissionCount >= MAX_ACTIVE_MISSIONS) {
      return jsonResponse({
        success: true,
        prefetched: false,
        message: "max_missions_reached",
      });
    }

    if (!prefetchOnly) {
      const cachedMission = await claimCachedMission(
        supabaseAdmin,
        userId,
        missionType,
        generationRequestId,
      );

      if (cachedMission) {
        console.log("[MISSION_GEN] Missão entregue do cache.", {
          userId,
          missionType,
          generationRequestId,
          missionId: cachedMission.id,
        });

        return jsonResponse(missionResponseFromRow(cachedMission, {
          missionType,
          generationRequestId,
          message: "mission_created",
          usedCache: true,
        }));
      }
    } else {
      const existingCachedMission = await findCachedMission(supabaseAdmin, userId, missionType);
      if (existingCachedMission) {
        return jsonResponse({
          success: true,
          prefetched: true,
          cached: true,
          message: "cached_mission_already_ready",
          mission_id: existingCachedMission.id,
          mission_type: missionType,
          ...generationAiDebug(existingCachedMission.generation_snapshot),
          ...missionCacheDebug(
            existingCachedMission,
            generationAiDebug(existingCachedMission.generation_snapshot),
          ),
        });
      }
    }

    const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const todayStart = startOfUtcDay();
    const todayEnd = endOfUtcDay();
    const [
      { data: rawFacts, error: factsError },
      { data: recentMissions, error: recentError },
      { data: patterns, error: patternsError },
      { data: completedTodayMissions, error: completedTodayError },
    ] = await Promise.all([
      supabaseAdmin
        .from("user_profile_facts")
        .select("fact_key, fact_type, category, value, confidence, active, last_seen_at")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(500),
      supabaseAdmin
        .from("user_missions")
        .select("id, title, description, status, category, pattern_key, action_fingerprint, created_at, completed_at")
        .eq("user_id", userId)
        .eq("delivery_status", "delivered")
        .gte("created_at", recentSince)
        .order("created_at", { ascending: false })
        .limit(40),
      supabaseAdmin
        .from("mission_patterns")
        .select("*")
        .eq("active", true),
      supabaseAdmin
        .from("user_missions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "completed")
        .eq("delivery_status", "delivered")
        .gte("completed_at", todayStart)
        .lt("completed_at", todayEnd),
    ]);

    if (factsError) throw new Error(`Erro ao buscar fatos: ${factsError.message}`);
    if (recentError) throw new Error(`Erro ao buscar histórico de missões: ${recentError.message}`);
    if (patternsError) throw new Error(`Erro ao buscar mission_patterns: ${patternsError.message}`);
    if (completedTodayError) {
      throw new Error(`Erro ao buscar missões concluídas hoje: ${completedTodayError.message}`);
    }

    let facts = ((rawFacts ?? []) as ProfileFact[])
      .filter((fact) => fact.active !== false);
    const typedPatterns = ((patterns ?? []) as Record<string, unknown>[])
      .map((pattern) => ({
        ...pattern,
        action_fingerprint: deriveActionFingerprint(pattern),
      }) as PatternRow)
      .filter((pattern) => isCategory(pattern.category));

    if (!typedPatterns.length) {
      throw new Error("Nenhum mission_pattern ativo encontrado. Aplique os seeds do Prompt 7 em add.sql.");
    }

    if (!facts.length) {
      facts = [await ensureColdStartFact(supabaseAdmin, userId, "consumption")];
    }

    const maxDifficulty = maxDifficultyFromProfile(profile, missionType, facts);
    const maxCost = maxCostFromProfile(profile);
    const timeBudget = timeBudgetFromProfile(profile, missionType);
    const userLevel = getLevelFromXp(profile.xp);
    const completedMissionsToday = completedTodayMissions?.length ?? 0;
    const deterministicOnlyByDailyLimit = completedMissionsToday >= DAILY_COMPLETED_MISSION_AI_LIMIT;
    const recentPatternKeys = new Set(
      (recentMissions ?? [])
        .map((mission: any) => mission.pattern_key)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );
    const recentActionFingerprints = new Set(
      (recentMissions ?? [])
        .map((mission: any) => mission.action_fingerprint)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );
    const recentCategoryCounts = (recentMissions ?? []).reduce((acc: Record<string, number>, mission: any) => {
      if (typeof mission.category === "string") {
        acc[mission.category] = (acc[mission.category] ?? 0) + 1;
      }
      return acc;
    }, {});
    const activeCategoryCounts = (activeMissions ?? []).reduce((acc: Record<string, number>, mission: any) => {
      if (typeof mission.category === "string") {
        acc[mission.category] = (acc[mission.category] ?? 0) + 1;
      }
      return acc;
    }, {});
    const outcomeStats = buildOutcomeStats(recentMissions ?? []);
    const repeatBlockMissions = buildRepeatBlockMissions(activeMissions ?? [], recentMissions ?? [], typedPatterns);
    const repeatBlockPatternKeys = new Set(
      repeatBlockMissions
        .map((mission: any) => mission.pattern_key)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );
    const repeatBlockActionFingerprints = new Set(
      repeatBlockMissions
        .map((mission: any) => mission.action_fingerprint)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );
    const activeRepeatBlockMissions = activeMissions ?? [];
    const activeRepeatBlockPatternKeys = new Set(
      activeRepeatBlockMissions
        .map((mission: any) => mission.pattern_key)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );
    const activeRepeatBlockActionFingerprints = new Set(
      activeRepeatBlockMissions
        .map((mission: any) => mission.action_fingerprint)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );

    const ranked = typedPatterns
      .map((pattern) =>
        rankPattern({
          pattern,
          profile,
          facts,
          repeatBlockMissions,
          recentCategoryCounts,
          activeCategoryCounts,
          outcomeStats,
          repeatBlockPatternKeys,
          repeatBlockActionFingerprints,
          missionType,
          maxDifficulty,
          maxCost,
          timeBudget,
          userLevel,
        })
      )
      .sort((left, right) => right.score - left.score);

    let selectionRanked = ranked;
    let selectionRepeatBlockMissions = repeatBlockMissions;
    let selectionRepeatBlockPatternKeys = repeatBlockPatternKeys;
    let selectionRepeatBlockActionFingerprints = repeatBlockActionFingerprints;
    let selectionRepeatPolicy = "pattern_metadata_cooldown_days";

    if (!ranked.some((item) => item.rejectedReasons.length === 0)) {
      const relaxedRanked = typedPatterns
        .map((pattern) =>
          rankPattern({
            pattern,
            profile,
            facts,
            repeatBlockMissions: activeRepeatBlockMissions,
            recentCategoryCounts,
            activeCategoryCounts,
            outcomeStats,
            repeatBlockPatternKeys: activeRepeatBlockPatternKeys,
            repeatBlockActionFingerprints: activeRepeatBlockActionFingerprints,
            missionType,
            maxDifficulty,
            maxCost,
            timeBudget,
            userLevel,
          })
        )
        .sort((left, right) => right.score - left.score);

      if (relaxedRanked.some((item) => item.rejectedReasons.length === 0)) {
        selectionRanked = relaxedRanked;
        selectionRepeatBlockMissions = activeRepeatBlockMissions;
        selectionRepeatBlockPatternKeys = activeRepeatBlockPatternKeys;
        selectionRepeatBlockActionFingerprints = activeRepeatBlockActionFingerprints;
        selectionRepeatPolicy = "active_missions_only_after_cooldown_exhaustion";
      }
    }

    const candidatePatternKeys = selectionRanked.slice(0, 12).map((item) => item.pattern.key);
    const rejectedCandidates: unknown[] = selectionRanked
      .filter((item) => item.rejectedReasons.length > 0)
      .slice(0, 20)
      .map((item) => ({
        pattern_key: item.pattern.key,
        action_fingerprint: item.pattern.action_fingerprint,
        reasons: item.rejectedReasons,
        score: Math.round(item.score * 100) / 100,
      }));

    const generationSnapshot = {
      context_version: CONTEXT_VERSION,
      algorithm: ALGORITHM_VERSION,
      requested_at: startedAt,
      client_request_id: generationRequestId,
      active_mission_count: activeMissionCount,
      profile: {
        user_level: userLevel,
        xp: profile.xp,
        max_difficulty: maxDifficulty,
        max_cost: maxCost,
        time_budget_minutes: timeBudget,
        daily_flashcards_completed: Boolean(profile.daily_flashcards_completed),
        completed_missions_today: completedMissionsToday,
        daily_completed_mission_ai_limit: DAILY_COMPLETED_MISSION_AI_LIMIT,
        deterministic_only_by_daily_completion_limit: deterministicOnlyByDailyLimit,
      },
      facts: {
        count: facts.length,
        fact_keys: facts.slice(0, 40).map((fact) => fact.fact_key),
      },
      recent_history: {
        recent_pattern_keys: [...recentPatternKeys],
        recent_action_fingerprints: [...recentActionFingerprints],
        recent_categories: recentCategoryCounts,
        active_categories: activeCategoryCounts,
        repeat_block_policy: "pattern_metadata_cooldown_days",
        default_repeat_block_window_days: HARD_REPEAT_DAYS,
        legacy_repeat_block_limit: HARD_REPEAT_MISSION_LIMIT,
        repeat_block_pattern_keys: [...repeatBlockPatternKeys],
        repeat_block_action_fingerprints: [...repeatBlockActionFingerprints],
        selection_repeat_policy: selectionRepeatPolicy,
        selection_repeat_block_pattern_keys: [...selectionRepeatBlockPatternKeys],
        selection_repeat_block_action_fingerprints: [...selectionRepeatBlockActionFingerprints],
        outcome_stats: {
          categories: outcomeStats.byCategory,
        },
      },
    };

    const validationErrors: unknown[] = [];
    let finalCandidate: MissionCandidate | null = null;
    let selectedPattern: PatternRow | null = null;
    let usedFallback = true;
    let usedAi = false;
    let aiAttemptCount = 0;
    let finalFallbackReason: string | null = null;
    const aiRuntime = aiRuntimeSummary();

    const blueprints: MissionBlueprint[] = [];
    for (const rankedPattern of selectionRanked) {
      if (rankedPattern.rejectedReasons.length > 0) continue;

      let usedFacts = rankedPattern.usedFacts;
      if (!usedFacts.length) {
        usedFacts = [await ensureColdStartFact(supabaseAdmin, userId, rankedPattern.pattern.category)];
        facts = [...facts.filter((fact) => fact.fact_key !== usedFacts[0].fact_key), ...usedFacts];
      }

      const fallbackCandidate = buildFallbackCandidate(
        rankedPattern.pattern,
        usedFacts,
        profile,
        missionType,
      );

      blueprints.push({ rankedPattern, fallbackCandidate });
      if (blueprints.length >= MAX_AI_BLUEPRINTS) break;
    }

    const aiComposition = blueprints.length && !deterministicOnlyByDailyLimit
      ? await composeMissionCandidatesWithAi(blueprints, {
        user_level: userLevel,
        max_difficulty: maxDifficulty,
        max_cost: maxCost,
        time_budget_minutes: timeBudget,
        facts: facts.slice(0, 24).map((fact) => ({
          fact_key: fact.fact_key,
          fact_type: fact.fact_type,
          category: fact.category,
          label: factLabel(fact),
          confidence: fact.confidence,
        })),
        recent_history: {
          recent_pattern_keys: [...recentPatternKeys],
          recent_action_fingerprints: [...recentActionFingerprints],
          recent_categories: recentCategoryCounts,
          active_categories: activeCategoryCounts,
          repeat_block_pattern_keys: [...repeatBlockPatternKeys],
          repeat_block_action_fingerprints: [...repeatBlockActionFingerprints],
        },
      })
      : {
        candidates: [] as MissionCandidate[],
        usedAi: false,
        fallbackReason: deterministicOnlyByDailyLimit
          ? "daily_completed_mission_ai_limit"
          : "no_valid_blueprint_after_filters",
        fallbackDetail: deterministicOnlyByDailyLimit
          ? `completed_missions_today:${completedMissionsToday};limit:${DAILY_COMPLETED_MISSION_AI_LIMIT}`
          : "no_valid_blueprint_after_filters",
        aiProvider: null,
        aiModel: null,
      };
    aiAttemptCount = aiComposition.usedAi ? aiComposition.candidates.length : blueprints.length;

    const blueprintByPatternKey = new Map(
      blueprints.map((blueprint) => [blueprint.fallbackCandidate.pattern_key, blueprint]),
    );
    const candidateAttempts: AiCompositionAttempt[] = [
      ...aiComposition.candidates.map((candidate) => ({
        candidate,
        source: "ai" as const,
        fallbackReason: null,
      })),
      ...blueprints.map((blueprint) => ({
        candidate: blueprint.fallbackCandidate,
        source: "fallback" as const,
        fallbackReason: aiComposition.fallbackReason ?? "deterministic_contextual_fallback",
      })),
    ];

    for (const attempt of candidateAttempts) {
      const blueprint = blueprintByPatternKey.get(attempt.candidate.pattern_key);
      const validation = validateCandidate(attempt.candidate, {
        facts,
        repeatBlockMissions: selectionRepeatBlockMissions,
        repeatBlockPatternKeys: selectionRepeatBlockPatternKeys,
        repeatBlockActionFingerprints: selectionRepeatBlockActionFingerprints,
        userLevel,
      });

      if (validation.valid && blueprint) {
        finalCandidate = attempt.candidate;
        selectedPattern = blueprint.rankedPattern.pattern;
        usedAi = attempt.source === "ai";
        usedFallback = attempt.source === "fallback";
        finalFallbackReason = usedFallback
          ? aiComposition.usedAi
            ? "ai_candidates_invalid_deterministic_fallback"
            : attempt.fallbackReason
          : null;
        break;
      }

      validationErrors.push({
        pattern_key: attempt.candidate.pattern_key,
        action_fingerprint: attempt.candidate.action_fingerprint,
        source: attempt.source,
        ai_used: attempt.source === "ai",
        errors: validation.errors,
        warnings: validation.warnings,
        ai_fallback_reason: attempt.fallbackReason,
      });

      if (!blueprint) {
        validationErrors.push({
          pattern_key: attempt.candidate.pattern_key,
          source: attempt.source,
          errors: ["unknown_pattern_key_from_ai_candidate"],
        });
      }
    }

    if (!finalCandidate || !selectedPattern) {
      const attemptedPatternKeys = new Set(
        candidateAttempts.map((attempt) => attempt.candidate.pattern_key),
      );

      for (const rankedPattern of selectionRanked) {
        if (rankedPattern.rejectedReasons.length > 0) continue;
        if (attemptedPatternKeys.has(rankedPattern.pattern.key)) continue;

        let usedFacts = rankedPattern.usedFacts;
        if (!usedFacts.length) {
          usedFacts = [await ensureColdStartFact(supabaseAdmin, userId, rankedPattern.pattern.category)];
          facts = [...facts.filter((fact) => fact.fact_key !== usedFacts[0].fact_key), ...usedFacts];
        }

        const fallbackCandidate = buildFallbackCandidate(
          rankedPattern.pattern,
          usedFacts,
          profile,
          missionType,
        );
        const validation = validateCandidate(fallbackCandidate, {
          facts,
          repeatBlockMissions: selectionRepeatBlockMissions,
          repeatBlockPatternKeys: selectionRepeatBlockPatternKeys,
          repeatBlockActionFingerprints: selectionRepeatBlockActionFingerprints,
          userLevel,
        });
        aiAttemptCount += 1;

        if (validation.valid) {
          finalCandidate = fallbackCandidate;
          selectedPattern = rankedPattern.pattern;
          usedAi = false;
          usedFallback = true;
          finalFallbackReason = "expanded_deterministic_fallback_after_invalid_candidates";
          break;
        }

        validationErrors.push({
          pattern_key: fallbackCandidate.pattern_key,
          action_fingerprint: fallbackCandidate.action_fingerprint,
          source: "expanded_fallback",
          ai_used: false,
          errors: validation.errors,
          warnings: validation.warnings,
          ai_fallback_reason: "expanded_deterministic_fallback_after_invalid_candidates",
        });
      }
    }

	    if (!finalCandidate || !selectedPattern) {
	      const effectiveAiProvider = aiComposition.aiProvider ?? aiRuntime.ai_provider;
	      const effectiveAiModel = aiComposition.aiModel ?? aiRuntime.ai_model;
	      const errorGenerationSnapshot = {
	        ...generationSnapshot,
	        ai: {
	          ...aiRuntime,
	          ai_provider: effectiveAiProvider,
	          ai_model: effectiveAiModel,
	          ai_used: false,
          ai_stage: "mission_composer",
          fallback_reason: "no_valid_pattern_candidate",
          fallback_detail: aiComposition.fallbackDetail ?? "no_valid_pattern_candidate",
          candidate_count: aiAttemptCount,
          blueprint_count: blueprints.length,
          ai_candidate_count: aiComposition.candidates.length,
          validation_error_count: validationErrors.length,
        },
      };

      await writeGenerationLog(supabaseAdmin, {
        userId,
        missionType,
        candidatePatternKeys,
        rejectedCandidates,
        validationErrors,
        generationSnapshot: errorGenerationSnapshot,
        usedFallback: true,
        status: "error",
        errorMessage: "no_valid_pattern_candidate",
      });

      return jsonResponse({
        error: "no_valid_pattern_candidate",
        message: "Não encontrei um pattern válido para o perfil atual.",
      }, 422);
    }

	    const missionId = crypto.randomUUID();
	    const expiresInHours = missionWindowDays(missionType) * 24;
	    const nowDate = new Date();
	    const now = nowDate.toISOString();
	    const effectiveAiProvider = aiComposition.aiProvider ?? aiRuntime.ai_provider;
	    const effectiveAiModel = aiComposition.aiModel ?? aiRuntime.ai_model;
	    const finalGenerationSnapshot = {
	      ...generationSnapshot,
	      ai: {
	        ...aiRuntime,
	        ai_provider: effectiveAiProvider,
	        ai_model: effectiveAiModel,
	        ai_used: usedAi,
	        ai_stage: "mission_composer",
        fallback_reason: usedFallback
          ? finalFallbackReason ?? "deterministic_contextual_fallback"
          : null,
        fallback_detail: usedFallback
          ? aiComposition.fallbackDetail ?? finalFallbackReason ?? "deterministic_contextual_fallback"
          : null,
        candidate_count: aiAttemptCount,
        blueprint_count: blueprints.length,
        ai_candidate_count: aiComposition.candidates.length,
        validation_error_count: validationErrors.length,
        validation_error_summary: summarizeValidationErrors(validationErrors),
      },
    };

    const insertPayload = {
      id: missionId,
      user_id: userId,
      title: finalCandidate.title,
      description: finalCandidate.description,
      ai_justification: {
        ...finalCandidate.ai_justification,
        category: finalCandidate.category,
        reason: finalCandidate.personalization_reason,
        mission_type: missionType,
        used_ai_for_text: usedAi,
        action_fingerprint: finalCandidate.action_fingerprint,
      },
      feedback_notes: {},
      status: "active",
      mission_type: missionType,
      category: finalCandidate.category,
      environmental_goal: finalCandidate.environmental_goal,
      difficulty: finalCandidate.difficulty,
      effort_minutes: finalCandidate.effort_minutes,
      cost_level: finalCandidate.cost_level,
      xp_reward: finalCandidate.xp_reward,
      used_fact_keys: finalCandidate.used_fact_keys,
      personalization_reason: finalCandidate.personalization_reason,
      generation_snapshot: finalGenerationSnapshot,
      expected_impact: finalCandidate.expected_impact,
      pattern_key: finalCandidate.pattern_key,
      action_fingerprint: finalCandidate.action_fingerprint,
      generation_request_id: prefetchOnly ? null : generationRequestId,
      delivery_status: prefetchOnly ? "cached" : "delivered",
      claimed_at: prefetchOnly ? null : now,
      cache_metadata: {
        prefetched: prefetchOnly,
        prefetched_at: prefetchOnly ? now : null,
        client_request_id: prefetchOnly ? null : generationRequestId,
      },
      created_at: now,
      expires_at: prefetchOnly
        ? new Date(nowDate.getTime() + MISSION_CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString()
        : new Date(nowDate.getTime() + expiresInHours * 60 * 60 * 1000).toISOString(),
    };

    const { error: insertError } = await supabaseAdmin
      .from("user_missions")
      .insert(insertPayload);

    if (insertError && prefetchOnly && insertError.code === "23505") {
      const existingCachedMission = await findCachedMission(supabaseAdmin, userId, missionType);
      return jsonResponse({
        success: true,
        prefetched: true,
        cached: true,
        message: "cached_mission_already_ready",
        mission_id: existingCachedMission?.id ?? null,
        mission_type: missionType,
        ...(existingCachedMission ? generationAiDebug(existingCachedMission.generation_snapshot) : {}),
        ...(existingCachedMission
          ? missionCacheDebug(
            existingCachedMission,
            generationAiDebug(existingCachedMission.generation_snapshot),
          )
          : {}),
      });
    }

    if (insertError && generationRequestId && insertError.code === "23505") {
      const existing = await findMissionByGenerationRequest(
        supabaseAdmin,
        userId,
        generationRequestId,
      );

      if (existing) {
        const aiDebug = generationAiDebug(existing.generation_snapshot);
        console.log("[MISSION_GEN] Conflito idempotente resolvido.", {
          userId,
          missionType,
          generationRequestId,
          missionId: existing.id,
        });

        return jsonResponse({
          success: true,
          mission_id: existing.id,
          pattern_key: existing.pattern_key ?? null,
          action_fingerprint: existing.action_fingerprint ?? null,
          category: existing.category ?? null,
          mission_status: existing.status,
          mission_type: existing.mission_type ?? missionType,
          client_request_id: generationRequestId,
          idempotent: true,
          ...aiDebug,
          message: "mission_already_created",
        });
      }
    }

    if (insertError) {
      throw new Error(`Erro ao salvar missão: ${insertError.message}`);
    }

    await writeGenerationLog(supabaseAdmin, {
      userId,
      missionId,
      missionType,
      candidatePatternKeys,
      selectedPatternKey: selectedPattern.key,
      selectedActionFingerprint: finalCandidate.action_fingerprint,
      rejectedCandidates,
      validationErrors,
      generationSnapshot: finalGenerationSnapshot,
      usedFallback,
      status: usedFallback ? "fallback" : "success",
    });

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "adventurer",
      eventType: prefetchOnly ? "PREFETCH_MISSION" : "GENERATE_MISSION",
      inputSummary: {
        missionType,
        generationRequestId,
        activeMissionCount,
        completedMissionsToday,
        dailyCompletedMissionAiLimit: DAILY_COMPLETED_MISSION_AI_LIMIT,
        deterministicOnlyByDailyLimit,
        selectedPatternKey: selectedPattern.key,
        selectedActionFingerprint: finalCandidate.action_fingerprint,
        usedFallback,
        usedAi,
      },
      output: {
        mission_id: missionId,
        category: finalCandidate.category,
        difficulty: finalCandidate.difficulty,
        used_fact_keys: finalCandidate.used_fact_keys,
        pattern_key: selectedPattern.key,
        action_fingerprint: finalCandidate.action_fingerprint,
      },
    });

	    console.log(prefetchOnly ? "[MISSION_GEN] Missão pré-gerada por pattern." : "[MISSION_GEN] Missão criada por pattern.", {
	      userId,
	      missionId,
      missionType,
      patternKey: selectedPattern.key,
      actionFingerprint: finalCandidate.action_fingerprint,
      category: finalCandidate.category,
      difficulty: finalCandidate.difficulty,
	      aiUsed: usedAi,
	      aiStage: "mission_composer",
	      aiProvider: effectiveAiProvider,
	      aiModel: effectiveAiModel,
      fallbackReason: usedFallback
        ? finalFallbackReason ?? "deterministic_contextual_fallback"
        : null,
      fallbackDetail: usedFallback
        ? aiComposition.fallbackDetail ?? finalFallbackReason ?? "deterministic_contextual_fallback"
        : null,
      completedMissionsToday,
      dailyCompletedMissionAiLimit: DAILY_COMPLETED_MISSION_AI_LIMIT,
      deterministicOnlyByDailyLimit,
      candidateCount: aiAttemptCount,
      blueprintCount: blueprints.length,
	      aiCandidateCount: aiComposition.candidates.length,
	      usedFallback,
	      generationRequestId,
	      validationErrorSummary: summarizeValidationErrors(validationErrors),
	    });

    if (prefetchOnly) {
      return jsonResponse({
        success: true,
        prefetched: true,
        cached: true,
        mission_id: missionId,
        mission_type: missionType,
        pattern_key: selectedPattern.key,
        action_fingerprint: finalCandidate.action_fingerprint,
        ai_used: usedAi,
        used_fallback: usedFallback,
        used_cache: false,
        fallback_reason: usedFallback
          ? finalFallbackReason ?? "deterministic_contextual_fallback"
          : null,
        fallback_detail: usedFallback
          ? aiComposition.fallbackDetail ?? finalFallbackReason ?? "deterministic_contextual_fallback"
          : null,
	      ai_provider: effectiveAiProvider,
	      ai_model: effectiveAiModel,
	      ai_candidate_count: aiComposition.candidates.length,
	      blueprint_count: blueprints.length,
	      validation_error_count: validationErrors.length,
	      validation_error_summary: summarizeValidationErrors(validationErrors),
        daily_completed_mission_count: completedMissionsToday,
        daily_completed_mission_ai_limit: DAILY_COMPLETED_MISSION_AI_LIMIT,
        deterministic_due_to_daily_completion_limit: deterministicOnlyByDailyLimit,
        message: "cached_mission_created",
      });
    }

    return jsonResponse({
      success: true,
      mission_id: missionId,
      client_request_id: generationRequestId,
      pattern_key: selectedPattern.key,
      action_fingerprint: finalCandidate.action_fingerprint,
      ai_used: usedAi,
      used_fallback: usedFallback,
      used_cache: false,
      fallback_reason: usedFallback
        ? finalFallbackReason ?? "deterministic_contextual_fallback"
        : null,
      fallback_detail: usedFallback
        ? aiComposition.fallbackDetail ?? finalFallbackReason ?? "deterministic_contextual_fallback"
        : null,
	      ai_provider: effectiveAiProvider,
	      ai_model: effectiveAiModel,
	      ai_candidate_count: aiComposition.candidates.length,
	      blueprint_count: blueprints.length,
	      validation_error_count: validationErrors.length,
	      validation_error_summary: summarizeValidationErrors(validationErrors),
        daily_completed_mission_count: completedMissionsToday,
        daily_completed_mission_ai_limit: DAILY_COMPLETED_MISSION_AI_LIMIT,
        deterministic_due_to_daily_completion_limit: deterministicOnlyByDailyLimit,
	      message: "mission_created",
	    });
  } catch (error: any) {
    console.error("[MISSION_GEN] Erro crítico:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
