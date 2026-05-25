import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type ProfileTab = "stats" | "achievements" | "history" | "scientist";

function buildLocalScientistAnswer({
  message,
  missionsCount,
  flashcardsCount,
  quizzesCount,
}: {
  message: string;
  missionsCount: number;
  flashcardsCount: number;
  quizzesCount: number;
}) {
  const contextSummary = [
    missionsCount > 0 ? `${missionsCount} missão(ões) recentes` : "nenhuma missão recente",
    flashcardsCount > 0 ? `${flashcardsCount} flashcard(s)` : "nenhum flashcard recente",
    quizzesCount > 0 ? `${quizzesCount} quiz(zes)` : "nenhum quiz recente",
  ].join(", ");

  return `Modo local do Cientista: ainda não consegui alcançar a Edge Function, então vou responder com base no histórico carregado no app (${contextSummary}).

Para a sua pergunta: "${message}", recomendo um protocolo simples de 3 passos:

1. Escolha uma ação ambiental pequena que caiba em menos de 10 minutos.
2. Repita por 3 dias e marque mentalmente se foi fácil, difícil ou irrelevante.
3. Se foi difícil, reduza a ação pela metade; se foi fácil, transforme em missão especializada.

Esse modo local não usa IA remota, mas mantém a interação funcionando enquanto o Supabase Functions é configurado.`;
}

export default function ProfileScreen() {
  const [profileData, setProfileData] = useState<any>(null);
  const [missions, setMissions] = useState<any[]>([]);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [flashcardHistory, setFlashcardHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("stats");
  const [scientistInput, setScientistInput] = useState("");
  const [scientistMessages, setScientistMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [scientistLoading, setScientistLoading] = useState(false);
  const { xp, impactTotals, fetchProfile } = useEcoStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await fetchProfile(user.id);

        const [{ data: profile }, { data: missionRows }, { data: quizRows }, { data: flashcardRows }] =
          await Promise.all([
            supabase.from("profiles").select("*").eq("id", user.id).single(),
            supabase
              .from("user_missions")
              .select("title, status, mission_type, created_at, ai_justification")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(8),
            supabase
              .from("user_quiz_answers")
              .select("selected_option, correct, answered_at, quizzes(question, category)")
              .eq("user_id", user.id)
              .order("answered_at", { ascending: false })
              .limit(8),
            supabase
              .from("user_flashcards_answers")
              .select("answer, flashcards(question)")
              .eq("user_id", user.id)
              .order("id", { ascending: false })
              .limit(12),
          ]);

        setProfileData(profile);
        setMissions(missionRows || []);
        setQuizHistory(quizRows || []);
        setFlashcardHistory(flashcardRows || []);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  const derivedStats = useMemo(() => {
    const completedMissions = missions.filter((mission) => mission.status === "completed").length;
    const specializedMissions = missions.filter(
      (mission) => mission.status === "completed" && mission.mission_type === "specialized",
    ).length;
    const answeredFlashcards = flashcardHistory.filter((answer) => answer.answer !== null).length;
    const positiveFlashcards = flashcardHistory.filter((answer) => answer.answer === true).length;
    const correctQuizzes = quizHistory.filter((answer) => answer.correct).length;

    return {
      xp: Math.max(xp, completedMissions * 12 + specializedMissions * 18 + correctQuizzes * 5 + answeredFlashcards),
      water_l: Math.round((completedMissions * 6 + positiveFlashcards * 1.5 + correctQuizzes * 2) * 10) / 10,
      co2_kg: Math.round((completedMissions * 0.35 + specializedMissions * 0.8 + correctQuizzes * 0.12) * 10) / 10,
      waste_g: Math.round(completedMissions * 120 + positiveFlashcards * 25 + correctQuizzes * 35),
      vitality: Math.min(100, Math.round(completedMissions * 18 + correctQuizzes * 8 + answeredFlashcards * 2)),
    };
  }, [flashcardHistory, missions, quizHistory, xp]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sendScientistMessage = async () => {
    const message = scientistInput.trim();
    if (!message || scientistLoading) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const nextMessages = [...scientistMessages, { role: "user" as const, content: message }];
    setScientistMessages(nextMessages);
    setScientistInput("");
    setScientistLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("profile-scientist-chat", {
        body: { userId: user.id, message, history: scientistMessages },
      });
      if (error) throw error;

      const protocols = Array.isArray(data?.protocols)
        ? `\n\nProtocolos sugeridos:\n${data.protocols
            .map((protocol: any) => `• ${protocol.title}: ${(protocol.steps || []).join(" ")}`)
            .join("\n")}`
        : "";

      setScientistMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: `${data?.answer || "Não consegui responder agora."}${protocols}`,
        },
      ]);
    } catch (error) {
      console.error("[PROFILE] Erro no cientista:", error);
      const detail = error instanceof Error ? error.message : String(error);
      setScientistMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: `${buildLocalScientistAnswer({
            message,
            missionsCount: missions.length,
            flashcardsCount: flashcardHistory.length,
            quizzesCount: quizHistory.length,
          })}\n\nDetalhe técnico: ${detail}`,
        },
      ]);
    } finally {
      setScientistLoading(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#4CAF50" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content} // Centralização aplicada aqui
    >
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>🌱</Text>
      </View>

      <Text style={styles.userName}>
        {profileData?.nome || profileData?.name || "Protetor do Habitat"}
      </Text>
      <Text style={styles.userXp}>{derivedStats.xp} XP Total acumulado</Text>

      <View style={styles.tabs}>
        {[
          ["stats", "Estatísticas"],
          ["achievements", "Conquistas"],
          ["history", "Histórico"],
          ["scientist", "Cientista"],
        ].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.tabButton, activeTab === id && styles.tabButtonActive]}
            onPress={() => setActiveTab(id as ProfileTab)}
          >
            <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "stats" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estatísticas de Impacto</Text>
          <View style={styles.statsGrid}>
            <StatCard label="XP" value={String(derivedStats.xp)} />
            <StatCard label="Água" value={`${derivedStats.water_l || impactTotals.water_l || 0}L`} />
            <StatCard label="CO2" value={`${derivedStats.co2_kg || impactTotals.co2_kg || 0}kg`} />
            <StatCard label="Resíduos" value={`${derivedStats.waste_g || impactTotals.waste_g || 0}g`} />
            <StatCard label="Vitalidade" value={`${derivedStats.vitality}/100`} />
          </View>
          <Text style={styles.formulaText}>
            Fórmula: missões concluídas, quizzes corretos e flashcards respondidos viram impacto estimado.
          </Text>
        </View>
      )}

      {activeTab === "achievements" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conquistas</Text>
          <Achievement
            title="Primeiras raízes"
            unlocked={Boolean(profileData?.onboarding_completed)}
            description="Completou o diagnóstico inicial."
          />
          <Achievement
            title="Discípulo da trilha"
            unlocked={Boolean(profileData?.daily_flashcards_completed)}
            description="Completou um lote diário de flashcards."
          />
          <Achievement
            title="Guardião em marcha"
            unlocked={missions.some((mission) => mission.status === "completed")}
            description="Concluiu pelo menos uma missão."
          />
        </View>
      )}

      {activeTab === "history" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Histórico recente</Text>
          {missions.map((mission) => (
            <View key={`${mission.title}-${mission.created_at}`} style={styles.historyItem}>
              <Text style={styles.historyTitle}>{mission.title}</Text>
              <Text style={styles.historyMeta}>
                {mission.mission_type || "daily"} • {mission.status}
              </Text>
            </View>
          ))}
          {quizHistory.map((answer) => (
            <View key={`${answer.answered_at}-${answer.selected_option}`} style={styles.historyItem}>
              <Text style={styles.historyTitle}>{answer.quizzes?.question}</Text>
              <Text style={styles.historyMeta}>
                Quiz • {answer.correct ? "acerto" : "revisar"}
              </Text>
            </View>
          ))}
          {flashcardHistory.map((answer, index) => (
            <View key={`flashcard-${index}`} style={styles.historyItem}>
              <Text style={styles.historyTitle}>
                {answer.flashcards?.question || "Flashcard respondido"}
              </Text>
              <Text style={styles.historyMeta}>
                Flashcard • {answer.answer === true ? "sim" : answer.answer === false ? "não" : "pulado"}
              </Text>
            </View>
          ))}
          {missions.length === 0 && quizHistory.length === 0 && flashcardHistory.length === 0 && (
            <Text style={styles.emptyText}>Ainda não há histórico recente suficiente.</Text>
          )}
        </View>
      )}

      {activeTab === "scientist" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agente Cientista</Text>
          <Text style={styles.scientistIntro}>
            Pergunte sobre protocolos de rotina, interpretação das suas estatísticas ou próximos passos.
          </Text>
          <View style={styles.chatBox}>
            {scientistMessages.length === 0 ? (
              <Text style={styles.emptyText}>
                Exemplo: Que protocolo simples posso seguir essa semana?
              </Text>
            ) : (
              scientistMessages.map((message, index) => (
                <View
                  key={`${message.role}-${index}`}
                  style={[
                    styles.messageBubble,
                    message.role === "user" ? styles.userBubble : styles.assistantBubble,
                  ]}
                >
                  <Text style={styles.messageText}>{message.content}</Text>
                </View>
              ))
            )}
          </View>
          <TextInput
            value={scientistInput}
            onChangeText={setScientistInput}
            placeholder="Converse com o cientista..."
            placeholderTextColor="#9E9E9E"
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, scientistLoading && styles.sendButtonDisabled]}
            onPress={sendScientistMessage}
            disabled={scientistLoading}
          >
            <Text style={styles.sendText}>
              {scientistLoading ? "Analisando..." : "Enviar"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sua Realidade (Socioeconomico)</Text>
        {profileData?.socioeconomic_context &&
          Object.entries(profileData.socioeconomic_context).map(
            ([key, value]) => (
              <View key={key} style={styles.dataRow}>
                <Text style={styles.dataLabel}>{key.replace("_", " ")}</Text>
                <Text style={styles.dataValue}>
                  {String(value).toUpperCase()}
                </Text>
              </View>
            ),
          )}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Achievement({
  title,
  description,
  unlocked,
}: {
  title: string;
  description: string;
  unlocked: boolean;
}) {
  return (
    <View style={[styles.achievement, unlocked && styles.achievementUnlocked]}>
      <Text style={styles.achievementTitle}>{title}</Text>
      <Text style={styles.achievementDescription}>{description}</Text>
      <Text style={styles.achievementStatus}>{unlocked ? "Desbloqueada" : "A caminho"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { alignItems: "center", paddingTop: 80, paddingHorizontal: 20, paddingBottom: 40 },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  avatarText: { fontSize: 50 },
  userName: { fontSize: 22, fontWeight: "bold", marginTop: 15, color: "#333" },
  userXp: { fontSize: 14, color: "#4CAF50", fontWeight: "bold" },
  tabs: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 24,
  },
  tabButton: {
    flexGrow: 1,
    backgroundColor: "#FFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: "#2E7D32" },
  tabText: { color: "#607D8B", fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: "#FFF" },
  section: {
    width: "100%",
    marginTop: 30,
    backgroundColor: "#FFF",
    borderRadius: 15,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1B5E20",
    marginBottom: 15,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "47%",
    backgroundColor: "#F1F8E9",
    borderRadius: 16,
    padding: 16,
  },
  statValue: { fontSize: 22, fontWeight: "bold", color: "#1B5E20" },
  statLabel: { color: "#607D8B", marginTop: 4, fontWeight: "600" },
  formulaText: { color: "#78909C", marginTop: 12, fontSize: 12, lineHeight: 18 },
  achievement: {
    borderWidth: 1,
    borderColor: "#ECEFF1",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  achievementUnlocked: {
    borderColor: "#A5D6A7",
    backgroundColor: "#F1F8E9",
  },
  achievementTitle: { fontWeight: "bold", color: "#263238", fontSize: 15 },
  achievementDescription: { color: "#607D8B", marginTop: 4 },
  achievementStatus: { color: "#2E7D32", marginTop: 8, fontWeight: "bold" },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#ECEFF1",
    paddingVertical: 10,
  },
  historyTitle: { color: "#263238", fontWeight: "700" },
  historyMeta: { color: "#78909C", marginTop: 3, fontSize: 12, textTransform: "capitalize" },
  emptyText: { color: "#78909C", lineHeight: 20 },
  scientistIntro: { color: "#607D8B", lineHeight: 20, marginBottom: 12 },
  chatBox: {
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    padding: 12,
    minHeight: 110,
    marginBottom: 12,
  },
  messageBubble: { padding: 10, borderRadius: 12, marginBottom: 8 },
  userBubble: { backgroundColor: "#E3F2FD", alignSelf: "flex-end" },
  assistantBubble: { backgroundColor: "#E8F5E9", alignSelf: "flex-start" },
  messageText: { color: "#263238", lineHeight: 20 },
  input: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    textAlignVertical: "top",
    color: "#263238",
  },
  sendButton: {
    backgroundColor: "#2E7D32",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 10,
  },
  sendButtonDisabled: { backgroundColor: "#A5D6A7" },
  sendText: { color: "#FFF", fontWeight: "bold" },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    paddingBottom: 5,
  },
  dataLabel: { color: "#999", fontSize: 14, textTransform: "capitalize" },
  dataValue: { color: "#333", fontWeight: "600", fontSize: 14 },
});
