import MissionCard from "@/components/MissionCard";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AdventureScreen() {
  const { missions, fetchPendingMissions, generateMissions, loading, lastError } = useEcoStore();
  const [userId, setUserId] = useState<string | null>(null);

  const loadMissions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      await fetchPendingMissions(user.id);
    }
  }, [fetchPendingMissions]);

  useFocusEffect(
    useCallback(() => {
      loadMissions();
    }, [loadMissions]),
  );

  const dailyMissions = useMemo(
    () => missions.filter((mission) => (mission.mission_type || "daily") === "daily"),
    [missions],
  );
  const specializedMissions = useMemo(
    () => missions.filter((mission) => mission.mission_type === "specialized"),
    [missions],
  );

  const handleGenerate = async (missionType: "daily" | "specialized") => {
    if (!userId) return;
    await generateMissions(userId, missionType);
  };

  if (loading && missions.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>
          O Aventureiro está compondo sua próxima jornada...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aventura</Text>
      <Text style={styles.subtitle}>
        Missões diárias e especializadas criadas pelo Agente Aventureiro.
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleGenerate("daily")}>
          <Text style={styles.actionText}>Gerar diária</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.specializedButton]}
          onPress={() => handleGenerate("specialized")}
        >
          <Text style={styles.actionText}>Gerar especializada</Text>
        </TouchableOpacity>
      </View>

      {lastError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Missão não gerada</Text>
          <Text style={styles.errorText}>{lastError}</Text>
          <Text style={styles.errorHint}>
            Verifique se a função `generate-missions`, a secret `OPENAI_API_KEY` e a migration do Supabase foram aplicadas.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={missions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>Diárias: {dailyMissions.length}</Text>
            <Text style={styles.sectionTitle}>
              Especializadas: {specializedMissions.length}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <MissionCard
            missionId={item.id}
            title={item.title}
            description={item.description}
            category={item.ai_justification?.category || "general"}
            justification={item.ai_justification?.reason || ""}
            expiresAt={item.expires_at}
            xp={item.mission_type === "specialized" ? 25 : 10}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Nenhuma missão ativa. Complete a Trilha ou peça uma nova aventura.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F4F8",
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#666" },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#1B5E20",
  },
  subtitle: {
    color: "#607D8B",
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 18,
  },
  actions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionButton: {
    flex: 1,
    backgroundColor: "#2E7D32",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  specializedButton: { backgroundColor: "#7B1FA2" },
  actionText: { color: "#FFF", fontWeight: "bold" },
  sectionTitle: {
    color: "#607D8B",
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyContainer: { marginTop: 80, alignItems: "center" },
  emptyText: { color: "#78909C", textAlign: "center", lineHeight: 22 },
  listPadding: { paddingBottom: 40 },
  errorBox: {
    backgroundColor: "#FFEBEE",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#C62828",
  },
  errorTitle: { color: "#B71C1C", fontWeight: "bold", marginBottom: 4 },
  errorText: { color: "#C62828", lineHeight: 20 },
  errorHint: { color: "#795548", marginTop: 8, fontSize: 12, lineHeight: 18 },
});
