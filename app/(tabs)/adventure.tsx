import { AppHeader } from "@/components/AppHeader";
import MissionCard from "@/components/MissionCard";
import { ProgressBar } from "@/components/ProgressBar";
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

type MissionType = "daily" | "specialized";

const GENERATION_ESTIMATE_MS: Record<MissionType, number> = {
  daily: 32000,
  specialized: 45000,
};

export default function AdventureScreen() {
  const {
    missions,
    fetchPendingMissions,
    fetchMissionRewardLimit,
    generateMissions,
    loading,
    lastError,
    lastNotice,
    lastProgressEvent,
    missionRewardLimit,
    clearProgressEvent,
    clearLastError,
    clearLastNotice,
  } = useEcoStore();
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [userId, setUserId] = useState<string | null>(null);
  const [generatingMissionType, setGeneratingMissionType] = useState<MissionType | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  useEffect(() => {
    if (!missionRewardLimit.reached) return undefined;
    setNowMs(Date.now());
    const intervalId = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [missionRewardLimit.reached]);

  useEffect(() => {
    if (!generatingMissionType || !generationStartedAt) {
      setGenerationProgress(0);
      return undefined;
    }

    const estimateMs = GENERATION_ESTIMATE_MS[generatingMissionType];
    const updateProgress = () => {
      const elapsed = Date.now() - generationStartedAt;
      const easedProgress = 1 - Math.exp(-elapsed / (estimateMs * 0.56));
      setGenerationProgress(Math.min(0.94, Math.max(0.06, easedProgress)));
    };

    updateProgress();
    const intervalId = setInterval(updateProgress, 350);
    return () => clearInterval(intervalId);
  }, [generatingMissionType, generationStartedAt]);

  const dailyMissions = useMemo(
    () => missions.filter((mission) => (mission.mission_type || "daily") === "daily"),
    [missions],
  );
  const specializedMissions = useMemo(
    () => missions.filter((mission) => mission.mission_type === "specialized"),
    [missions],
  );

  const generationEstimateMs = generatingMissionType
    ? GENERATION_ESTIMATE_MS[generatingMissionType]
    : GENERATION_ESTIMATE_MS.daily;
  const generationElapsedMs = generationStartedAt ? Date.now() - generationStartedAt : 0;
  const generationRemainingSeconds = Math.max(
    1,
    Math.ceil((generationEstimateMs - generationElapsedMs) / 1000),
  );
  const generationOverEstimate = generationElapsedMs > generationEstimateMs;
  const generationPercent = Math.round(generationProgress * 100);
  const generationStage = generationProgress < 0.28
    ? "Lendo contexto do perfil"
    : generationProgress < 0.58
      ? "Selecionando blueprints seguros"
      : generationProgress < 0.84
        ? "Compondo uma missão concreta"
        : "Validando impacto e segurança";
  const rewardResetMs = new Date(missionRewardLimit.resetAt).getTime();
  const rewardResetRemainingMs = Math.max(
    0,
    Number.isFinite(rewardResetMs) ? rewardResetMs - nowMs : 0,
  );
  const rewardResetHours = Math.floor(rewardResetRemainingMs / 3_600_000);
  const rewardResetMinutes = Math.floor((rewardResetRemainingMs % 3_600_000) / 60_000);
  const rewardResetSeconds = Math.floor((rewardResetRemainingMs % 60_000) / 1000);
  const rewardResetCountdown = `${String(rewardResetHours).padStart(2, "0")}:${String(rewardResetMinutes).padStart(2, "0")}:${String(rewardResetSeconds).padStart(2, "0")}`;

  useEffect(() => {
    if (!userId || !missionRewardLimit.reached || rewardResetRemainingMs > 0) return;
    void fetchMissionRewardLimit(userId);
  }, [
    fetchMissionRewardLimit,
    missionRewardLimit.reached,
    rewardResetRemainingMs,
    userId,
  ]);

  const rewardLimitCard = missionRewardLimit.reached ? (
    <View style={styles.rewardLimitCard}>
      <View style={styles.rewardLimitHeader}>
        <View style={styles.rewardLimitCopy}>
          <Text style={styles.rewardLimitTitle}>Limite diário de XP atingido</Text>
          <Text style={styles.rewardLimitText}>
            Você concluiu {missionRewardLimit.completedToday} missões hoje. Novas missões continuam disponíveis, mas não recompensam XP até o reset diário.
          </Text>
        </View>
        <View style={styles.rewardCountdownBox}>
          <Text style={styles.rewardCountdownLabel}>reset em</Text>
          <Text style={styles.rewardCountdownValue}>{rewardResetCountdown}</Text>
        </View>
      </View>
    </View>
  ) : null;
  const generationProgressPanel = generatingMissionType ? (
    <View style={styles.generationPanel}>
      <View style={styles.generationHeader}>
        <View>
          <Text style={styles.generationTitle}>
            Gerando missão {generatingMissionType === "daily" ? "diária" : "semanal"}
          </Text>
          <Text style={styles.generationStage}>{generationStage}</Text>
        </View>
        <Text style={styles.generationPercent}>{generationPercent}%</Text>
      </View>
      <ProgressBar progress={generationProgress} />
      <Text style={styles.generationHint}>
        {generationOverEstimate
          ? "A IA está demorando um pouco mais; a geração continua em andamento."
          : `Cerca de ${generationRemainingSeconds}s restantes se a IA responder no tempo esperado.`}
      </Text>
    </View>
  ) : null;

  const handleGenerate = async (missionType: MissionType) => {
    if (!userId) return;
    console.log("[TRILHA] Solicitando geração de missão:", missionType);
    setGeneratingMissionType(missionType);
    setGenerationStartedAt(Date.now());
    setGenerationProgress(0.06);
    try {
      await generateMissions(userId, missionType);
    } finally {
      setGenerationProgress(1);
      setGeneratingMissionType(null);
      setGenerationStartedAt(null);
    }
  };

  if (loading && missions.length === 0) {
    return (
      <View style={styles.centered}>
        <RootineBackground variant="trail" />
        {generationProgressPanel ?? (
          <>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>
              A Trilha está compondo sua próxima missão...
            </Text>
          </>
        )}
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

      {generationProgressPanel}

      <FlatList
        data={missions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {rewardLimitCard}
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
          </>
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
            helpText={item.ai_justification?.help_text || null}
            expiresAt={item.expires_at}
            xp={item.xp_reward ?? (item.mission_type === "specialized" ? 25 : 10)}
            rewardDisabled={missionRewardLimit.reached}
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
            {lastProgressEvent.missionXp > 0
              ? `+${lastProgressEvent.missionXp} XP da missão`
              : "Limite diário aplicado: esta missão não gerou XP"}
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
    generationPanel: {
      alignSelf: "stretch",
      maxWidth: 460,
      marginHorizontal: 20,
      marginTop: 8,
      marginBottom: 6,
      backgroundColor: theme.colors.transparentSurface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 14,
      gap: 10,
    },
    generationHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 14,
    },
    generationTitle: {
      color: theme.colors.text,
      fontWeight: "800",
      fontSize: 14,
    },
    generationStage: {
      color: theme.colors.textMuted,
      fontWeight: "700",
      marginTop: 3,
      fontSize: 12,
    },
    generationPercent: {
      color: theme.colors.primaryStrong,
      fontWeight: "800",
      fontSize: 18,
    },
    generationHint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    rewardLimitCard: {
      backgroundColor: theme.colors.infoSoft,
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: 8,
      padding: 14,
      marginTop: 8,
      marginBottom: 8,
    },
    rewardLimitHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    rewardLimitCopy: {
      flex: 1,
      minWidth: 220,
    },
    rewardLimitTitle: {
      color: theme.colors.info,
      fontWeight: "800",
      fontSize: 15,
    },
    rewardLimitText: {
      color: theme.colors.text,
      marginTop: 5,
      lineHeight: 20,
      fontSize: 13,
    },
    rewardCountdownBox: {
      minWidth: 104,
      alignItems: "center",
      backgroundColor: theme.colors.transparentSurface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    rewardCountdownLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    rewardCountdownValue: {
      color: theme.colors.info,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 2,
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
