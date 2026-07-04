import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface MissionEditModalProps {
  missionId: string;
  visible: boolean;
  onClose: () => void;
}

export default function MissionEditModal({
  missionId,
  visible,
  onClose,
}: MissionEditModalProps) {
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const { editMission, loading, lastError } = useEcoStore();
  const { T, night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

  const handleEdit = async () => {
    if (!input.trim()) return;
    setLocalError(null);
    setAttemptedSave(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLocalError("Entre novamente para editar a missão.");
      return;
    }

    const edited = await editMission(user.id, missionId, input);
    if (edited) {
      setInput("");
      setLocalError(null);
      setAttemptedSave(false);
      onClose();
    } else {
      setLocalError("A edição não foi salva. A missão original continua ativa.");
    }
  };

  const handleClose = () => {
    if (loading) return;
    setLocalError(null);
    setAttemptedSave(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.eyebrow}>Missão sob medida</Text>
          <Text style={styles.title}>Adaptar missão</Text>
          <Text style={styles.subtitle}>
            Descreva o que não encaixa na sua rotina. A adaptação mantém o objetivo ambiental e respeita suas restrições.
          </Text>

          <TextInput
            style={styles.input}
            multiline
            placeholder="Ex: Não tenho tempo de manhã, prefiro fazer isso à noite..."
            placeholderTextColor={T.placeholder}
            value={input}
            onChangeText={setInput}
            editable={!loading}
          />

          {localError || (attemptedSave && lastError) ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError || lastError}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (loading || !input.trim()) && styles.submitButtonDisabled,
              ]}
              onPress={handleEdit}
              disabled={loading || !input.trim()}
            >
              <Text style={styles.submitText}>
                {loading ? "Salvando..." : localError ? "Tentar novamente" : "Adaptar missão"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: T.overlay,
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: T.card,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderWidth: 1,
      borderColor: T.cardBorder,
      padding: 26,
      minHeight: 300,
    },
    eyebrow: {
      color: T.accent,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2.4,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    title: {
      fontFamily: Fonts.serif,
      fontSize: 24,
      fontWeight: "600",
      color: T.ink,
      marginBottom: 8,
      letterSpacing: 0.2,
    },
    subtitle: {
      fontSize: 14,
      color: T.inkSoft,
      marginBottom: 20,
      lineHeight: 21,
    },
    input: {
      backgroundColor: T.inputBg,
      borderWidth: 1,
      borderColor: T.inputBorder,
      borderRadius: 16,
      padding: 16,
      minHeight: 100,
      textAlignVertical: "top",
      fontSize: 16,
      color: T.ink,
      marginBottom: 16,
    },
    errorBox: {
      backgroundColor: T.dangerSoft,
      borderLeftColor: T.danger,
      borderLeftWidth: 3,
      borderRadius: 12,
      padding: 11,
      marginBottom: 16,
    },
    errorText: {
      color: T.danger,
      fontSize: 13,
      lineHeight: 18,
    },
    actions: {
      flexDirection: "row",
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 15,
      alignItems: "center",
      borderWidth: 1,
      borderColor: T.cardBorder,
      backgroundColor: "transparent",
    },
    cancelText: {
      color: T.inkSoft,
      fontWeight: "700",
      fontSize: 15,
    },
    submitButton: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: 15,
      alignItems: "center",
      backgroundColor: T.moss,
    },
    submitButtonDisabled: {
      opacity: 0.55,
    },
    submitText: {
      color: T.onMoss,
      fontWeight: "700",
      fontSize: 15,
      letterSpacing: 0.3,
    },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
