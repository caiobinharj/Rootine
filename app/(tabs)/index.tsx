import { HabitatScene } from "@/components/HabitatScene";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import { getLevelFromXp, getXpMinimumForLevel, XP_LEVEL_THRESHOLDS } from "@/lib/domain/xp";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface HabitatLeaf {
  id?: string;
  position: number;
  title: string;
  message: string;
}

const FALLBACK_LEAVES: HabitatLeaf[] = [
  {
    position: 1,
    title: "Raiz da Jornada",
    message: "Jovem guardião, tuas escolhas já tocaram o solo. Cada resposta tua alimenta as raízes deste bosque interior.",
  },
  {
    position: 2,
    title: "Folha da Memória",
    message: "Recordo tuas missões como inscrições antigas: pequenas ações, quando repetidas, tornam-se linhagem.",
  },
  {
    position: 3,
    title: "Vento do Perfil",
    message: "Teu contexto é terreno sagrado. Nenhum conselho deve exigir de ti o que tua realidade não permite sustentar.",
  },
  {
    position: 4,
    title: "Copa do Amanhã",
    message: "Segue com constância, não com pressa. Florestas antigas nasceram de gestos quase invisíveis.",
  },
];

export default function HabitatScreen() {
  const { xp, impactTotals, fetchProfile } = useEcoStore();
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [leaves, setLeaves] = useState<HabitatLeaf[]>(FALLBACK_LEAVES);
  const [selectedLeaf, setSelectedLeaf] = useState<HabitatLeaf | null>(null);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [previewLevel, setPreviewLevel] = useState<number | null>(null);
  const levelInfo = getLevelFromXp(xp || 0);
  const previewXp = previewLevel === null ? null : getXpMinimumForLevel(previewLevel);

  const impactPulse = Math.min(
    45,
    (impactTotals.water_l || 0) * 0.08 +
      (impactTotals.co2_kg || 0) * 8 +
      (impactTotals.waste_g || 0) * 0.015 +
      (impactTotals.energy_kwh || 0) * 10,
  );
  const vitalityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round((xp > 0 ? 20 : 8) + levelInfo.progress * 35 + impactPulse),
    ),
  );
  const displayXp = previewXp ?? xp ?? 0;
  const displayLevelInfo = previewXp === null ? levelInfo : getLevelFromXp(displayXp);
  const displayVisualLevel = displayLevelInfo.level + displayLevelInfo.progress;
  const displayVitalityScore = previewLevel === null ? vitalityScore : 82;
  const displayVitalityLabel = getVitalityLabel(displayVitalityScore);
  const xpToNext = Math.max(0, displayLevelInfo.xpNext - displayXp);

  const loadLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await fetchProfile(user.id);
      console.log("[HABITAT] Perfil do Habitat carregado:", {
        userId: user.id,
      });

      const { data: profileRole, error: roleError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (roleError) {
        console.warn("[HABITAT] Não foi possível verificar cargo:", roleError.message);
        setIsDeveloper(false);
      } else {
        setIsDeveloper(profileRole?.role === "developer");
      }

      const { data, error } = await supabase.functions.invoke("habitat-leaves", {
        body: { userId: user.id },
      });

      if (error) throw error;
      if (data?.leaves?.length) {
        setLeaves(data.leaves);
      }
    } catch (error) {
      console.error("[HABITAT] Erro ao carregar folhas:", error);
      setLeaves(FALLBACK_LEAVES);
    } finally {
      setLoadingLeaves(false);
    }
  }, [fetchProfile]);

  useFocusEffect(
    useCallback(() => {
      loadLeaves();
    }, [loadLeaves]),
  );

  const handleLeafPress = (index: number) => {
    setSelectedLeaf(leaves[index] || FALLBACK_LEAVES[index]);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HabitatScene
          onLeafPress={handleLeafPress}
          visualLevel={displayVisualLevel}
          vitalityScore={displayVitalityScore}
          vitalityLabel={displayVitalityLabel}
          loadingLeaves={loadingLeaves}
          previewXp={previewXp ?? undefined}
        />

        <View style={styles.progressPanel}>
          <View style={styles.levelHeader}>
            <View style={styles.levelCopy}>
              <Text style={styles.panelEyebrow}>Progresso do habitat</Text>
              <Text style={styles.levelTitle}>
                Nível {displayLevelInfo.level} · {displayLevelInfo.milestone}
              </Text>
            </View>
            <Text style={styles.vitalityBadge}>{displayVitalityLabel}</Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(displayLevelInfo.progress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {displayXp} XP acumulados · faltam {xpToNext} XP para o próximo marco
          </Text>
        </View>

        {isDeveloper ? (
          <View style={styles.devPanel}>
            <View style={styles.devHeader}>
              <View style={styles.levelCopy}>
                <Text style={styles.panelEyebrow}>Prévia da árvore</Text>
                <Text style={styles.devTitle}>
                  {previewLevel === null
                    ? "Conta real"
                    : `Nível ${displayLevelInfo.level} · ${displayLevelInfo.milestone}`}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.devResetButton, previewLevel === null && styles.devButtonActive]}
                onPress={() => setPreviewLevel(null)}
              >
                <Text style={[styles.devResetText, previewLevel === null && styles.devButtonActiveText]}>
                  Real
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.levelSelector}
            >
              {XP_LEVEL_THRESHOLDS.map((entry) => {
                const active = previewLevel === entry.level;
                return (
                  <TouchableOpacity
                    key={entry.level}
                    style={[styles.levelButton, active && styles.devButtonActive]}
                    onPress={() => setPreviewLevel(entry.level)}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.levelButtonNumber, active && styles.devButtonActiveText]}>
                      {entry.level}
                    </Text>
                    <Text style={[styles.levelButtonLabel, active && styles.devButtonActiveText]}>
                      {entry.milestone}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={!!selectedLeaf} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalLabel}>Mensagem da árvore</Text>
            <Text style={styles.modalTitle}>{selectedLeaf?.title}</Text>
            <Text style={styles.modalMessage}>{selectedLeaf?.message}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedLeaf(null)}
            >
              <Text style={styles.closeText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getVitalityLabel(score: number) {
  return score >= 70 ? "alta" : score >= 35 ? "em crescimento" : "em recuperação";
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.habitat.foreground,
    },
    scroll: {
      flex: 1,
      backgroundColor: theme.habitat.foreground,
    },
    content: {
      backgroundColor: theme.habitat.foreground,
      paddingBottom: 30,
    },
    progressPanel: {
      marginHorizontal: 20,
      marginTop: 16,
      backgroundColor: theme.habitat.progressSurface,
      borderRadius: 8,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.habitat.progressBorder,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.18 : 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    levelHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    levelCopy: {
      flex: 1,
    },
    panelEyebrow: {
      color: theme.habitat.blossom,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0,
      textTransform: "uppercase",
    },
    levelTitle: {
      color: theme.habitat.progressText,
      fontSize: 17,
      fontWeight: "800",
      marginTop: 4,
      lineHeight: 22,
    },
    vitalityBadge: {
      backgroundColor: theme.habitat.progressBadgeSurface,
      color: theme.habitat.progressText,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 11,
      fontWeight: "800",
      overflow: "hidden",
    },
    progressTrack: {
      height: 9,
      backgroundColor: theme.habitat.progressTrack,
      borderRadius: 999,
      overflow: "hidden",
      marginTop: 14,
    },
    progressFill: {
      height: "100%",
      backgroundColor: theme.habitat.headerOrnament,
      borderRadius: 999,
    },
    progressText: {
      color: theme.habitat.progressTextMuted,
      marginTop: 8,
      fontWeight: "700",
      lineHeight: 18,
    },
    devPanel: {
      marginHorizontal: 20,
      marginTop: 12,
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 12,
    },
    devHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    devTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800",
      marginTop: 4,
    },
    devResetButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.colors.surface,
    },
    devResetText: {
      color: theme.colors.primaryStrong,
      fontSize: 12,
      fontWeight: "800",
    },
    levelSelector: {
      gap: 8,
      paddingRight: 4,
    },
    levelButton: {
      width: 112,
      minHeight: 62,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 9,
      justifyContent: "center",
    },
    devButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primaryStrong,
    },
    devButtonActiveText: {
      color: theme.colors.textOnPrimary,
    },
    levelButtonNumber: {
      color: theme.colors.primaryStrong,
      fontSize: 17,
      fontWeight: "900",
      lineHeight: 20,
    },
    levelButtonLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      lineHeight: 15,
      marginTop: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 8,
      padding: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    modalLabel: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: theme.colors.primaryStrong,
      marginBottom: 12,
      lineHeight: 30,
    },
    modalMessage: {
      fontSize: 16,
      color: theme.colors.text,
      lineHeight: 24,
    },
    closeButton: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 8,
      marginTop: 22,
      alignItems: "center",
    },
    closeText: {
      color: theme.colors.textOnPrimary,
      fontWeight: "800",
    },
  });
