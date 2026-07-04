import MissionCard from "@/components/MissionCard";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  softShadow,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AdventureScreen() {
  const {
    missions,
    fetchPendingMissions,
    generateMissions,
    loading,
    lastError,
    lastNotice,
    lastProgressEvent,
    clearProgressEvent,
    clearLastError,
    clearLastNotice,
  } = useEcoStore();
  const [userId, setUserId] = useState<string | null>(null);
  const { T, night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

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

  useEffect(() => {
    if (!lastProgressEvent) return undefined;
    const timeoutId = setTimeout(clearProgressEvent, 4500);
    return () => clearTimeout(timeoutId);
  }, [clearProgressEvent, lastProgressEvent]);

  useEffect(() => {
    if (!lastError) return undefined;
    const timeoutId = setTimeout(clearLastError, 6500);
    return () => clearTimeout(timeoutId);
  }, [clearLastError, lastError]);

  useEffect(() => {
    if (!lastNotice) return undefined;
    const timeoutId = setTimeout(clearLastNotice, 5200);
    return () => clearTimeout(timeoutId);
  }, [clearLastNotice, lastNotice]);

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
    console.log("[TRILHA] Solicitando geração de missão:", missionType);
    await generateMissions(userId, missionType);
  };

  if (loading && missions.length === 0) {
    return (
      <View style={styles.centered}>
        <SceneBackdrop night={night} />
        <ActivityIndicator size="large" color={T.moss} />
        <Text style={styles.loadingText}>
          A Trilha está compondo sua próxima missão...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SceneBackdrop night={night} />
      <Text style={styles.eyebrow}>Caminho do guardião</Text>
      <Text style={styles.title}>Trilha</Text>
      <Text style={styles.subtitle}>
        Missões diárias e semanais ajustadas ao seu perfil e aos seus fatos aprendidos.
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, loading && styles.actionButtonDisabled]}
          onPress={() => handleGenerate("daily")}
          disabled={loading}
        >
          <Text style={styles.actionText}>{loading ? "Gerando..." : "Gerar diária"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.specializedButton,
            loading && styles.actionButtonDisabled,
          ]}
          onPress={() => handleGenerate("specialized")}
          disabled={loading}
        >
          <Text style={styles.specializedText}>{loading ? "Gerando..." : "Gerar semanal"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={missions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.sectionRow}>
            <View style={styles.sectionChip}>
              <Text style={styles.sectionChipText}>Diárias · {dailyMissions.length}</Text>
            </View>
            <View style={styles.sectionChip}>
              <Text style={styles.sectionChipText}>
                Semanais · {specializedMissions.length}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <MissionCard
            missionId={item.id}
            title={item.title}
            description={item.description}
            category={item.category || item.ai_justification?.category || "consumption"}
            justification={
              item.personalization_reason || item.ai_justification?.reason || ""
            }
            expiresAt={item.expires_at}
            xp={item.xp_reward ?? (item.mission_type === "specialized" ? 25 : 10)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Nenhuma missão ativa. Peça uma nova missão para continuar sua Trilha.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listPadding}
      />

      {lastProgressEvent ? (
        <View style={styles.progressToast}>
          <View style={styles.toastHeader}>
            <Text style={styles.progressTitle}>Progresso registrado</Text>
            <TouchableOpacity onPress={clearProgressEvent} hitSlop={8}>
              <Text style={styles.progressDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.progressText}>
            +{lastProgressEvent.missionXp} XP da missão
            {lastProgressEvent.achievementXp > 0
              ? ` + ${lastProgressEvent.achievementXp} XP de ${lastProgressEvent.achievementCount} conquista(s)`
              : ""}
          </Text>
          {lastProgressEvent.pending ? (
            <Text style={styles.progressPendingText}>Sincronizando conquistas...</Text>
          ) : null}
        </View>
      ) : null}

      {lastError ? (
        <View style={styles.errorToast}>
          <View style={styles.toastHeader}>
            <Text style={styles.errorTitle}>Missão não gerada</Text>
            <TouchableOpacity onPress={clearLastError} hitSlop={8}>
              <Text style={styles.errorDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.errorText}>{lastError}</Text>
        </View>
      ) : null}

      {lastNotice ? (
        <View style={styles.noticeToast}>
          <View style={styles.toastHeader}>
            <Text style={styles.noticeTitle}>Limite de missões</Text>
            <TouchableOpacity onPress={clearLastNotice} hitSlop={8}>
              <Text style={styles.noticeDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.noticeText}>{lastNotice}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: T.bg,
      paddingHorizontal: 20,
      paddingTop: 60,
    },
    centered: {
      flex: 1,
      backgroundColor: T.bg,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 30,
    },
    loadingText: { marginTop: 12, color: T.inkSoft, textAlign: "center", lineHeight: 21 },
    eyebrow: {
      color: T.accent,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2.6,
      textTransform: "uppercase",
    },
    title: {
      fontFamily: Fonts.serif,
      fontSize: 32,
      fontWeight: "600",
      color: T.ink,
      marginTop: 6,
      letterSpacing: 0.2,
    },
    subtitle: {
      color: T.inkSoft,
      lineHeight: 21,
      marginTop: 6,
      marginBottom: 18,
      maxWidth: 460,
    },
    actions: { flexDirection: "row", gap: 10, marginBottom: 16 },
    actionButton: {
      flex: 1,
      backgroundColor: T.moss,
      paddingVertical: 13,
      borderRadius: 16,
      alignItems: "center",
      ...softShadow(T),
    },
    actionButtonDisabled: { opacity: 0.65 },
    specializedButton: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: T.accent,
      shadowOpacity: 0,
      elevation: 0,
    },
    actionText: { color: T.onMoss, fontWeight: "700", letterSpacing: 0.3 },
    specializedText: { color: T.accent, fontWeight: "700", letterSpacing: 0.3 },
    sectionRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
    sectionChip: {
      backgroundColor: T.chipBg,
      borderWidth: 1,
      borderColor: T.chipBorder,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    sectionChipText: { color: T.chipText, fontWeight: "700", fontSize: 12 },
    emptyContainer: { marginTop: 80, alignItems: "center" },
    emptyText: { color: T.inkFaint, textAlign: "center", lineHeight: 22, maxWidth: 320 },
    listPadding: { paddingBottom: 40 },
    toastHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    errorToast: {
      position: "absolute",
      right: 16,
      top: 54,
      zIndex: 35,
      minWidth: 260,
      maxWidth: 380,
      backgroundColor: T.card,
      borderRadius: 18,
      paddingHorizontal: 15,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: T.cardBorder,
      borderLeftWidth: 3,
      borderLeftColor: T.danger,
      ...softShadow(T),
    },
    errorTitle: { color: T.danger, fontWeight: "700", marginBottom: 4 },
    errorText: { color: T.inkSoft, lineHeight: 20 },
    errorDismiss: { color: T.danger, fontWeight: "700" },
    noticeToast: {
      position: "absolute",
      right: 16,
      top: 54,
      zIndex: 34,
      minWidth: 260,
      maxWidth: 380,
      backgroundColor: T.card,
      borderRadius: 18,
      paddingHorizontal: 15,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: T.cardBorder,
      borderLeftWidth: 3,
      borderLeftColor: T.accent,
      ...softShadow(T),
    },
    noticeTitle: { color: T.accent, fontWeight: "700", marginBottom: 4 },
    noticeText: { color: T.inkSoft, lineHeight: 20 },
    noticeDismiss: { color: T.accent, fontWeight: "700" },
    progressToast: {
      position: "absolute",
      right: 16,
      bottom: 22,
      zIndex: 30,
      minWidth: 240,
      maxWidth: 360,
      backgroundColor: T.card,
      borderRadius: 18,
      paddingHorizontal: 15,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: T.cardBorder,
      borderLeftWidth: 3,
      borderLeftColor: T.moss,
      ...softShadow(T),
    },
    progressTitle: { color: T.mossDeep, fontWeight: "700" },
    progressText: { color: T.ink, fontWeight: "600", lineHeight: 20, marginTop: 2 },
    progressPendingText: { color: T.inkFaint, fontSize: 12, marginTop: 2 },
    progressDismiss: { color: T.mossDeep, fontWeight: "700" },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
