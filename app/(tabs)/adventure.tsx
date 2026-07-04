import { AppHeader } from "@/components/AppHeader";
import MissionCard from "@/components/MissionCard";
import { RootineBackground } from "@/components/RootineBackground";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
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
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
        <RootineBackground variant="trail" />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>
          A Trilha está compondo sua próxima missão...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RootineBackground variant="trail" />
      <AppHeader
        eyebrow="Trilha"
        title="Missões em terreno real"
        subtitle="Diárias e semanais ajustadas ao seu perfil, sem forçar rotinas que não cabem no seu dia."
        compact
      />

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
          <Text style={styles.specializedActionText}>
            {loading ? "Gerando..." : "Gerar semanal"}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={missions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.sectionSummary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{dailyMissions.length}</Text>
              <Text style={styles.summaryLabel}>diárias</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{specializedMissions.length}</Text>
              <Text style={styles.summaryLabel}>semanais</Text>
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
            <Text style={styles.emptyTitle}>A trilha está quieta por enquanto</Text>
            <Text style={styles.emptyText}>
              Peça uma missão nova quando quiser continuar.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listPadding}
        showsVerticalScrollIndicator={false}
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

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.background,
      paddingHorizontal: 28,
    },
    loadingText: {
      marginTop: 12,
      color: theme.colors.textMuted,
      fontWeight: "700",
      textAlign: "center",
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 6,
    },
    actionButton: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 999,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    actionButtonDisabled: { opacity: 0.68 },
    specializedButton: {
      backgroundColor: theme.colors.accentSoft,
    },
    actionText: {
      color: theme.colors.textOnPrimary,
      fontWeight: "800",
    },
    specializedActionText: {
      color: theme.colors.accentStrong,
      fontWeight: "800",
    },
    sectionSummary: {
      flexDirection: "row",
      gap: 10,
      paddingTop: 8,
      paddingBottom: 6,
    },
    summaryItem: {
      minWidth: 108,
      backgroundColor: theme.colors.transparentSurface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    summaryValue: {
      color: theme.colors.primaryStrong,
      fontSize: 22,
      fontWeight: "800",
    },
    summaryLabel: {
      color: theme.colors.textMuted,
      fontWeight: "700",
      marginTop: 2,
    },
    emptyContainer: {
      marginTop: 70,
      alignItems: "flex-start",
      backgroundColor: theme.colors.transparentSurface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 18,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontWeight: "800",
      fontSize: 17,
    },
    emptyText: {
      color: theme.colors.textMuted,
      lineHeight: 22,
      marginTop: 6,
    },
    listPadding: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    errorToast: {
      position: "absolute",
      right: 16,
      top: 54,
      zIndex: 35,
      minWidth: 260,
      maxWidth: 380,
      backgroundColor: theme.colors.dangerSoft,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.danger,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 8,
    },
    toastHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    errorTitle: { color: theme.colors.danger, fontWeight: "800", marginBottom: 4 },
    errorText: { color: theme.colors.danger, lineHeight: 20 },
    errorDismiss: { color: theme.colors.danger, fontWeight: "800" },
    noticeToast: {
      position: "absolute",
      right: 16,
      top: 54,
      zIndex: 34,
      minWidth: 260,
      maxWidth: 380,
      backgroundColor: theme.colors.infoSoft,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.info,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 8,
    },
    noticeTitle: { color: theme.colors.info, fontWeight: "800", marginBottom: 4 },
    noticeText: { color: theme.colors.info, lineHeight: 20 },
    noticeDismiss: { color: theme.colors.info, fontWeight: "800" },
    progressToast: {
      position: "absolute",
      right: 16,
      bottom: 22,
      zIndex: 30,
      minWidth: 240,
      maxWidth: 360,
      backgroundColor: theme.colors.successSoft,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.success,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 8,
    },
    progressTitle: { color: theme.colors.success, fontWeight: "800" },
    progressText: { color: theme.colors.success, fontWeight: "700", lineHeight: 20 },
    progressPendingText: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
    progressDismiss: { color: theme.colors.success, fontWeight: "800" },
  });
