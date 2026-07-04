import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  softShadow,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import { useEcoStore } from "@/store/useEcoStore";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import relativeTime from "dayjs/plugin/relativeTime";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MissionEditModal from "./MissionEditModal";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

interface MissionCardProps {
  missionId: string;
  title: string;
  description: string;
  category: string;
  justification: string;
  xp: number;
  expiresAt: string;
}

export default function MissionCard({
  missionId,
  title,
  description,
  category,
  justification,
  xp,
  expiresAt,
}: MissionCardProps) {
  const { completeMission, failMission, refuseMission } = useEcoStore();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const { night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

  const timeLeft = dayjs(expiresAt).fromNow();
  const isExpired = dayjs().isAfter(dayjs(expiresAt));

  if (isExpired) return null;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <View style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>
                {category?.toUpperCase() || "GERAL"}
              </Text>
            </View>
            <View style={styles.deadlineChip}>
              <Text style={styles.deadlineChipText}>expira {timeLeft}</Text>
            </View>
          </View>

          <View style={styles.rightHeader}>
            <TouchableOpacity
              onPress={() => setEditModalVisible(true)}
              style={styles.editButton}
              activeOpacity={0.8}
            >
              <Text style={styles.editText}>Ajustar</Text>
            </TouchableOpacity>
            <Text style={styles.xpText}>+{xp} XP</Text>
          </View>
        </View>

        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.aiBox}>
          <Text style={styles.aiLabel}>Por que esta missão</Text>
          <Text style={styles.aiContent}>{justification}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.refuseButton]}
            onPress={() => refuseMission(missionId)}
          >
            <Text style={styles.refuseText}>Recusar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.failButton]}
            onPress={() => failMission(missionId)}
          >
            <Text style={styles.failText}>Não consegui</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.completeButton]}
            onPress={() => completeMission(missionId)}
          >
            <Text style={styles.buttonText}>Concluir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <MissionEditModal
        missionId={missionId}
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
      />
    </>
  );
}

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    card: {
      backgroundColor: T.card,
      borderRadius: 26,
      padding: 20,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: T.cardBorder,
      ...softShadow(T),
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14,
    },
    rightHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    editButton: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: T.cardBorder,
      backgroundColor: T.claySoft,
    },
    editText: {
      color: T.accent,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    categoryChip: {
      backgroundColor: T.chipBg,
      borderWidth: 1,
      borderColor: T.chipBorder,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    categoryChipText: {
      color: T.chipText,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1,
    },
    deadlineChip: {
      backgroundColor: T.claySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    deadlineChipText: {
      color: T.accent,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    xpText: { color: T.mossDeep, fontWeight: "800", fontSize: 13, letterSpacing: 0.3 },
    cardTitle: {
      fontFamily: Fonts.serif,
      fontSize: 20,
      fontWeight: "600",
      color: T.ink,
      marginBottom: 6,
      letterSpacing: 0.2,
    },
    description: {
      fontSize: 14,
      color: T.inkSoft,
      marginBottom: 16,
      lineHeight: 21,
    },
    aiBox: {
      backgroundColor: T.claySoft,
      borderLeftWidth: 3,
      borderLeftColor: T.accent,
      padding: 13,
      borderRadius: 14,
      marginBottom: 18,
    },
    aiLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: T.accent,
      marginBottom: 5,
      letterSpacing: 1.6,
      textTransform: "uppercase",
    },
    aiContent: {
      fontSize: 13,
      fontStyle: "italic",
      color: T.inkSoft,
      lineHeight: 19,
    },
    actions: { flexDirection: "row", gap: 8 },
    button: {
      flex: 1,
      minHeight: 46,
      paddingHorizontal: 6,
      paddingVertical: 12,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    completeButton: { backgroundColor: T.moss },
    failButton: {
      backgroundColor: T.warnSoft,
      borderWidth: 1,
      borderColor: T.warn,
    },
    refuseButton: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: T.danger,
    },
    buttonText: { color: T.onMoss, fontWeight: "700", fontSize: 14, letterSpacing: 0.3 },
    failText: { color: T.warn, fontWeight: "700", fontSize: 13, textAlign: "center" },
    refuseText: { color: T.danger, fontWeight: "700", fontSize: 14 },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
