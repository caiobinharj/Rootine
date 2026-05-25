import { supabase } from "@/lib/supabase"; // Certifique-se de ter o client configurado
import { create } from "zustand";

// Tipagens baseadas no nosso esquema do Supabase
interface Mission {
  id: string;
  status: "active" | "completed" | "refused" | "failed";
  title: string;
  description: string;
  expires_at: string;
  mission_type?: "daily" | "specialized";
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
  sendFeedback: (userId: string, missionId: string, feedbackText: string) => Promise<void>;
  editMission: (userId: string, missionId: string, userInput: string) => Promise<void>;
}

function createLocalUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function buildFallbackMission(missionType: "daily" | "specialized") {
  const isSpecialized = missionType === "specialized";

  return {
    id: createLocalUuid(),
    title: isSpecialized ? "Ritual de Observação da Rotina" : "Missão da Pequena Mudança",
    description: isSpecialized
      ? "Durante hoje, observe três momentos em que sua rotina gera descarte, gasto de água ou consumo por impulso. Anote uma alteração possível para amanhã."
      : "Escolha uma ação simples e sustentável para praticar hoje por pelo menos 10 minutos.",
    ai_justification: {
      category: isSpecialized ? "consumption" : "water",
      reason: "Missão fallback criada localmente para manter sua jornada ativa enquanto o agente remoto não responde.",
    },
    status: "active" as const,
    mission_type: missionType,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
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
      .select("xp, impact_totals")
      .eq("id", userId)
      .maybeSingle(); // maybeSingle evita erro 406 se o perfil demorar a propagar

    if (!error && data) {
      set({
        xp: data.xp || 1,
        impactTotals: data.impact_totals || {
          co2_kg: 0,
          water_l: 0,
          waste_g: 0,
        },
      });
    }
  },

  fetchPendingMissions: async (userId: string, missionType?: "daily" | "specialized") => {
    set({ loading: true });
    console.log("[ECO] Buscando missões ativas para o user:", userId);
    let query = supabase
      .from("user_missions")
      .select(`
        id, 
        status, 
        title,
        description,
        ai_justification, 
        expires_at,
        mission_type
      `)
      .eq("user_id", userId)
      .eq("status", "active");

    if (missionType) {
      query = query.eq("mission_type", missionType);
    }

    let { data, error } = await query;

    if (error?.message?.includes("mission_type")) {
      const legacy = await supabase
        .from("user_missions")
        .select(`
          id,
          status,
          title,
          description,
          ai_justification,
          expires_at
        `)
        .eq("user_id", userId)
        .eq("status", "active");

      data = legacy.data?.map((mission: any) => ({ ...mission, mission_type: "daily" })) as any;
      error = legacy.error;
    }

    if (error) {
      console.error("[ECO] Erro detectado na query:", error);
      set({ lastError: error.message, loading: false });
      return;
    }

    if (data) {
      set({ missions: data as any, lastError: null });
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

      // Após gerar, recarrega as missões para a trilha atualizar
      await get().fetchPendingMissions(userId);
    } catch (err) {
      console.error("Erro no Guardião:", err);
      const message = err instanceof Error ? err.message : String(err);
      const fallbackMission = buildFallbackMission(missionType);
      set((state) => ({
        missions: [fallbackMission, ...state.missions],
        lastError: `A função remota falhou, então gerei uma missão local temporária. Detalhe: ${message}`,
      }));

      const insertPayload = {
        id: fallbackMission.id,
        user_id: userId,
        title: fallbackMission.title,
        description: fallbackMission.description,
        ai_justification: fallbackMission.ai_justification,
        status: fallbackMission.status,
        mission_type: fallbackMission.mission_type,
        created_at: new Date().toISOString(),
        expires_at: fallbackMission.expires_at,
      };

      const { error: insertErr } = await supabase.from("user_missions").insert(insertPayload);
      if (insertErr?.message?.includes("mission_type")) {
        const legacyPayload = { ...insertPayload } as any;
        delete legacyPayload.mission_type;
        await supabase.from("user_missions").insert(legacyPayload);
      }
    } finally {
      set({ loading: false });
    }
  },

  refuseMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("user_missions")
      .update({ status: "refused" })
      .eq("id", missionId);

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
          .catch((err) => console.error("[ECO] Brain sync (refuse) error:", err));
      }
    }
  },

  completeMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("user_missions")
      .update({ status: "completed" })
      .eq("id", missionId);

    if (!error) {
      // Dispara sync-user-brain (não-bloqueante)
      supabase.functions
        .invoke("sync-user-brain", {
          body: { userId: user.id, event_type: "MISSION_ACTION", missionId, missionAction: "COMPLETED" },
        })
        .catch((err) => console.error("[ECO] Brain sync (complete) error:", err));

      // Atualiza tudo em paralelo para dar sensação de velocidade
      await Promise.all([
        get().fetchProfile(user.id),
        get().fetchPendingMissions(user.id),
      ]);
    }
  },

  sendFeedback: async (userId, missionId, feedbackText) => {
    // Salva o feedback no banco (opcional: campo feedback_notes em user_missions)
    await supabase
      .from("user_missions")
      .update({ feedback_notes: { text: feedbackText } })
      .eq("id", missionId);

    // Dispara sync-user-brain (não-bloqueante)
    supabase.functions
      .invoke("sync-user-brain", {
        body: { userId, event_type: "FEEDBACK_SENT", missionId, feedbackText },
      })
      .catch((err) => console.error("[ECO] Brain sync (feedback) error:", err));
  },

  editMission: async (userId, missionId, userInput) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.functions.invoke("edit-mission", {
        body: { userId, missionId, userInput },
      });

      if (error) throw error;
      
      console.log("[ECO] Missão editada com sucesso:", data);
      await get().fetchPendingMissions(userId);
    } catch (err) {
      console.error("[ECO] Erro ao editar missão:", err);
    } finally {
      set({ loading: false });
    }
  },
}));
