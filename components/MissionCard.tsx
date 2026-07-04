import { useEcoStore } from "@/store/useEcoStore";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
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
  const { theme } = useRootineTheme();
  const categoryColor =
    theme.categories[String(category ?? "") as keyof typeof theme.categories] ??
    theme.categories.default;
  const styles = createStyles(theme, categoryColor);
  const { completeMission, failMission, refuseMission } = useEcoStore();
  const [editModalVisible, setEditModalVisible] = useState(false);

  const timeLeft = dayjs(expiresAt).fromNow();
  const isExpired = dayjs().isAfter(dayjs(expiresAt));

  if (isExpired) return null;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Text style={styles.categoryTag}>
              {category?.toUpperCase() || "GERAL"}
            </Text>
            <Text style={styles.deadlineTag}>{timeLeft}</Text>
          </View>
          
          <View style={styles.rightHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.editButton}>
              <Text style={styles.editText}>Editar</Text>
            </TouchableOpacity>
            <Text style={styles.xpText}>+{xp} XP missão</Text>
          </View>
        </View>

        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.aiBox}>
          <Text style={styles.aiLabel}>POR QUE ESTA MISSÃO?</Text>
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

const createStyles = (theme: RootineTheme, categoryColor: string) =>
  StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 8,
    padding: 20,
    marginVertical: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  rightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editButton: {
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  editText: {
    color: theme.colors.accentStrong,
    fontSize: 10,
    fontWeight: "800",
  },
  badgeRow: { flexDirection: "row", gap: 8 },
  categoryTag: {
    backgroundColor: theme.colors.primarySoft,
    color: categoryColor,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
  },
  deadlineTag: {
    backgroundColor: theme.colors.warningSoft,
    color: theme.colors.accentStrong,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
  },
  xpText: { color: theme.colors.info, fontWeight: "800", fontSize: 14 },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.primaryStrong,
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  aiBox: {
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.accent,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  aiLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.colors.accent,
    marginBottom: 4,
    letterSpacing: 0,
  },
  aiContent: {
    fontSize: 13,
    fontStyle: "italic",
    color: theme.colors.text,
    lineHeight: 18,
  },
  actions: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  completeButton: { backgroundColor: theme.colors.primary },
  failButton: {
    backgroundColor: theme.colors.warningSoft,
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  refuseButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  buttonText: { color: theme.colors.textOnPrimary, fontWeight: "800", fontSize: 14 },
  failText: { color: theme.colors.warning, fontWeight: "800", fontSize: 13, textAlign: "center" },
  refuseText: { color: theme.colors.danger, fontWeight: "800", fontSize: 14 },
});
