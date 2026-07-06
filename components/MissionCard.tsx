import { useEcoStore } from "@/store/useEcoStore";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import relativeTime from "dayjs/plugin/relativeTime";
import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MissionEditModal from "./MissionEditModal";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

interface MissionCardProps {
  missionId: string;
  title: string;
  description: string;
  category: string;
  justification: string;
  helpText?: string | null;
  xp: number;
  expiresAt: string;
}

function sanitizeJustification(value: string) {
  const cleaned = String(value ?? "")
    .replace(
      /Usei como base o fato\s+"[^"]+"\s+e respeitei tempo, custo e autonomia do perfil\./gi,
      "Ela considera aprendizados do seu perfil e respeita tempo, custo e autonomia.",
    )
    .replace(
      /\b(?:water|energy|waste|transport|food|consumption|onboarding|adventure|trail|cold_start|feedback)\.[a-z0-9_.-]+\b/gi,
      "um aprendizado do seu perfil",
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "A missão foi ajustada ao seu perfil e aos limites informados.";
}

function buildLocalHelpText(title: string, description: string) {
  return [
    `1. Comece pela ação central: ${title}.`,
    `2. Use a descrição como limite prático: ${description}`,
    "3. Se algo não estiver sob seu controle, faça a menor versão segura e sem compra nova.",
    "4. Considere concluída quando houver uma decisão, destino ou mudança concreta ligada à missão.",
  ].join("\n");
}

function sanitizeHelpText(value: string | null | undefined, title: string, description: string) {
  const fallback = buildLocalHelpText(title, description);
  const cleaned = String(value || fallback)
    .replace(
      /\b(?:water|energy|waste|transport|food|consumption|onboarding|adventure|trail|cold_start|feedback)\.[a-z0-9_.-]+\b/gi,
      "um detalhe do seu perfil",
    )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  return (cleaned || fallback).slice(0, 760);
}

export default function MissionCard({
  missionId,
  title,
  description,
  category,
  justification,
  helpText,
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
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const readableJustification = sanitizeJustification(justification);
  const readableHelp = sanitizeHelpText(helpText, title, description);

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
            <TouchableOpacity onPress={() => setHelpModalVisible(true)} style={styles.helpButton}>
              <Text style={styles.helpText}>Ajuda</Text>
            </TouchableOpacity>
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
          <Text style={styles.aiContent}>{readableJustification}</Text>
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
      <Modal
        visible={helpModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setHelpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.helpModal}>
            <View style={styles.helpModalHeader}>
              <Text style={styles.helpModalTitle}>Ajuda</Text>
              <TouchableOpacity onPress={() => setHelpModalVisible(false)} hitSlop={10}>
                <Text style={styles.helpModalClose}>Fechar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.helpModalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.helpModalMission}>{title}</Text>
              <Text style={styles.helpModalText}>{readableHelp}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  rightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    flexShrink: 1,
  },
  helpButton: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  helpText: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: "800",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "center",
    padding: 20,
  },
  helpModal: {
    maxHeight: "78%",
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  helpModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  helpModalTitle: {
    color: theme.colors.primaryStrong,
    fontSize: 18,
    fontWeight: "800",
  },
  helpModalClose: {
    color: theme.colors.accentStrong,
    fontWeight: "800",
    fontSize: 13,
  },
  helpModalBody: {
    maxHeight: 360,
  },
  helpModalMission: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    marginBottom: 10,
  },
  helpModalText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
