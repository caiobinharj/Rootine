import { supabase } from "@/lib/supabase"; // Certifique-se de ter o client configurado
import { create } from "zustand";

// Tipagens baseadas no nosso esquema do Supabase
interface Mission {
  id: string;
  status: "active" | "completed" | "refused" | "failed";
  title: string;
  description: string;
  expires_at: string;
  completed_at?: string | null;
  mission_type?: "daily" | "specialized";
  category?: string | null;
  personalization_reason?: string | null;
  xp_reward?: number | null;
  pattern_key?: string | null;
  action_fingerprint?: string | null;
  ai_justification: {
    category: string;
    reason: string;
  };
}

interface EcoState {
  xp: number;
  impactTotals: {
    co2_kg: number;
    water_l: number;
    waste_g: number;
  };
  missions: Mission[];
  loading: boolean;
  lastError: string | null;

  // Ações
  fetchProfile: (userId: string) => Promise<void>;
  fetchPendingMissions: (userId: string, missionType?: "daily" | "specialized") => Promise<void>;
  generateMissions: (userId: string, missionType?: "daily" | "specialized") => Promise<void>;
  completeMission: (missionId: string) => Promise<void>;
  refuseMission: (missionId: string) => Promise<void>;
  failMission: (missionId: string) => Promise<void>;
  sendFeedback: (userId: string, missionId: string, feedbackText: string) => Promise<void>;
  editMission: (userId: string, missionId: string, userInput: string) => Promise<boolean>;
}

function isMissionExpired(mission: Pick<Mission, "expires_at">) {
  return Boolean(mission.expires_at && new Date(mission.expires_at).getTime() <= Date.now());
}

function buildFeedbackNotes(text: string, source: "user_feedback" | "mission_edit" = "user_feedback") {
  return {
    text,
    source,
    created_at: new Date().toISOString(),
  };
}

async function getFunctionErrorMessage(err: unknown) {
  const context = (err as any)?.context;
  if (context?.clone) {
    try {
      const payload = await context.clone().json();
      if (payload?.message) return String(payload.message);
      if (payload?.error) return String(payload.error);
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // Mantem a mensagem original abaixo.
      }
    }
  }

  return err instanceof Error ? err.message : String(err);
}

async function markExpiredMissionsAsFailed(userId: string) {
  const now = new Date().toISOString();
  const { data: expiredMissions, error: selectError } = await supabase
    .from("user_missions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .lt("expires_at", now);

  if (selectError) {
    console.error("[TRILHA] Erro ao buscar missões vencidas:", selectError.message);
    return;
  }

  if (expiredMissions?.length) {
    const failedMissionIds: string[] = [];

    for (const mission of expiredMissions) {
      const { error } = await supabase
        .from("user_missions")
        .update({ status: "failed" })
        .eq("id", mission.id)
        .eq("user_id", userId)
        .eq("status", "active");

      if (error) {
        console.error("[TRILHA] Erro ao marcar missão vencida como failed:", {
          missionId: mission.id,
          message: error.message,
        });
      } else {
        failedMissionIds.push(mission.id);
      }
    }

    if (!failedMissionIds.length) return;

    console.log("[TRILHA] Missões vencidas marcadas como failed:", failedMissionIds.length);
    failedMissionIds.forEach((missionId) => {
      supabase.functions
        .invoke("sync-user-brain", {
          body: {
            userId,
            event_type: "MISSION_ACTION",
            missionId,
            missionAction: "FAILED",
          },
        })
        .catch((err) => console.error("[BRAIN] Sync failed mission error:", err));
    });
  }
}

function isTransientFunctionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|failed to send|err_network_changed|timeout|temporar/i.test(message);
}

async function invokeEditMissionWithRetry(
  userId: string,
  missionId: string,
  userInput: string,
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data, error } = await supabase.functions.invoke("edit-mission", {
        body: { userId, missionId, userInput },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      lastError = error;
      if (!isTransientFunctionError(error) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 350 : 900));
    }
  }

  throw lastError;
}

// app/store/useEcoStore.ts
export const useEcoStore = create<EcoState>((set, get) => ({
  xp: 1,
  impactTotals: { co2_kg: 0, water_l: 0, waste_g: 0 },
  missions: [],
  loading: false,
  lastError: null,

  fetchProfile: async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("xp")
      .eq("id", userId)
      .maybeSingle(); // maybeSingle evita erro 406 se o perfil demorar a propagar

    if (!error && data) {
      set({
        xp: data.xp || 1,
        impactTotals: {
          co2_kg: 0,
          water_l: 0,
          waste_g: 0,
        },
      });
    }
  },

  fetchPendingMissions: async (userId: string, missionType?: "daily" | "specialized") => {
    set({ loading: true });
    await markExpiredMissionsAsFailed(userId);
    console.log("[TRILHA] Buscando missões ativas:", { userId, missionType });
    const { data, error } = await supabase
      .from("user_missions")
      .select(`
        id, 
        status, 
        title,
        description,
        ai_justification, 
        mission_type,
        category,
        personalization_reason,
        xp_reward,
        pattern_key,
        action_fingerprint,
        expires_at,
        completed_at
      `)
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) {
      console.error("[TRILHA] Erro ao buscar missões:", error.message);
      set({ lastError: error.message, loading: false });
      return;
    }

    if (data) {
      const activeMissions = (data as Mission[])
        .map((mission: any) => ({
          ...mission,
          mission_type: mission.mission_type || mission.ai_justification?.mission_type || "daily",
          category: mission.category || mission.ai_justification?.category || "consumption",
          personalization_reason:
            mission.personalization_reason || mission.ai_justification?.reason || "",
          xp_reward: mission.xp_reward ?? (mission.mission_type === "specialized" ? 25 : 10),
        }))
        .filter((mission) => !isMissionExpired(mission));
      if (activeMissions.length !== data.length) {
        console.log("[TRILHA] Missões vencidas removidas da lista ativa:", data.length - activeMissions.length);
      }
      set({ missions: activeMissions, lastError: null });
    }
    set({ loading: false });
  },

  generateMissions: async (userId, missionType = "daily") => {
    if (get().loading) return;
    set({ loading: true, lastError: null });

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-missions",
        {
          body: { userId, missionType },
        },
      );

      if (error) throw error;

      console.log("[MISSION_GEN] Resposta da função:", {
        missionType,
        success: data?.success,
        message: data?.message,
      });

      // Após gerar, recarrega as missões para a trilha atualizar
      await get().fetchPendingMissions(userId);
    } catch (err) {
      console.error("[MISSION_GEN] Erro ao gerar missão:", err);
      const message = await getFunctionErrorMessage(err);
      set({
        lastError: `Não consegui gerar uma missão válida agora. Tente novamente em instantes. Detalhe: ${message}`,
      });
    } finally {
      set({ loading: false });
    }
  },

  refuseMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ lastError: "Usuário não autenticado." });
      return;
    }

    const { error } = await supabase
      .from("user_missions")
      .update({ status: "refused" })
      .eq("id", missionId)
      .eq("user_id", user.id);

    if (!error) {
      set((state) => ({
        missions: state.missions.filter((m) => m.id !== missionId),
      }));

      // Dispara sync-user-brain (não-bloqueante)
      if (user) {
        supabase.functions
          .invoke("sync-user-brain", {
            body: { userId: user.id, event_type: "MISSION_ACTION", missionId, missionAction: "REFUSED" },
          })
          .catch((err) => console.error("[BRAIN] Sync recusa de missão error:", err));
      }
    } else {
      console.error("[TRILHA] Erro ao recusar missão:", error.message);
      set({ lastError: error.message });
    }
  },

  failMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ lastError: "Usuário não autenticado." });
      return;
    }

    const { error } = await supabase
      .from("user_missions")
      .update({ status: "failed" })
      .eq("id", missionId)
      .eq("user_id", user.id)
      .eq("status", "active");

    if (!error) {
      set((state) => ({
        missions: state.missions.filter((mission) => mission.id !== missionId),
      }));

      supabase.functions
        .invoke("sync-user-brain", {
          body: { userId: user.id, event_type: "MISSION_ACTION", missionId, missionAction: "FAILED" },
        })
        .catch((err) => console.error("[BRAIN] Sync falha de missão error:", err));
    } else {
      console.error("[TRILHA] Erro ao marcar missão como failed:", error.message);
      set({ lastError: error.message });
    }
  },

  completeMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ lastError: "Usuário não autenticado." });
      return;
    }

    const { error } = await supabase
      .from("user_missions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", missionId)
      .eq("user_id", user.id);

    if (!error) {
      // Dispara sync-user-brain (não-bloqueante)
      supabase.functions
        .invoke("sync-user-brain", {
          body: { userId: user.id, event_type: "MISSION_ACTION", missionId, missionAction: "COMPLETED" },
        })
        .catch((err) => console.error("[BRAIN] Sync conclusão de missão error:", err));

      // Atualiza tudo em paralelo para dar sensação de velocidade
      await Promise.all([
        get().fetchProfile(user.id),
        get().fetchPendingMissions(user.id),
      ]);
    } else {
      console.error("[TRILHA] Erro ao concluir missão:", error.message);
      set({ lastError: error.message });
    }
  },

  sendFeedback: async (userId, missionId, feedbackText) => {
    const feedbackNotes = buildFeedbackNotes(feedbackText);
    const { error } = await supabase
      .from("user_missions")
      .update({ feedback_notes: feedbackNotes })
      .eq("id", missionId)
      .eq("user_id", userId);

    if (error) {
      console.error("[TRILHA] Erro ao salvar feedback da missão:", error.message);
      set({ lastError: error.message });
      return;
    }

    // Dispara sync-user-brain (não-bloqueante)
    supabase.functions
      .invoke("sync-user-brain", {
        body: { userId, event_type: "FEEDBACK_SENT", missionId, feedbackText },
      })
      .catch((err) => console.error("[BRAIN] Sync feedback de missão error:", err));
  },

  editMission: async (userId, missionId, userInput) => {
    set({ loading: true });
    try {
      const data = await invokeEditMissionWithRetry(userId, missionId, userInput);
      
      console.log("[MISSION_EDIT] Missão editada com sucesso:", {
        missionId,
        success: data?.success,
        issueType: data?.issue_type,
        fallbackReason: data?.fallback_reason,
      });
      await get().fetchPendingMissions(userId);
      set({ lastError: null });
      return true;
    } catch (err) {
      console.error("[MISSION_EDIT] Erro ao editar missão:", err);
      const message = await getFunctionErrorMessage(err);
      set({
        lastError: `Não consegui salvar a edição agora. A missão original foi mantida. Tente novamente. Detalhe: ${message}`,
      });
      return false;
    } finally {
      set({ loading: false });
    }
  },
}));
