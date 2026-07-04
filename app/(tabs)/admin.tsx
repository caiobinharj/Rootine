import { SceneBackdrop } from "@/components/SceneBackdrop";
import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  softShadow,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import { supabase } from "@/lib/supabase";
import { useFlashcardStore } from "@/store/useFlashcardStore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AdminTab() {
  const [loading, setLoading] = useState(false);
  const fetchActiveBatch = useFlashcardStore((s) => s.fetchActiveBatch);
  const { T, night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

  const handleResetBatch = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Pega o último batch do usuário
      const { data: batches } = await supabase
        .from("user_daily_flashcards")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (batches && batches.length > 0) {
        const batchId = batches[0].id;

        // 1. Reativa o batch
        await supabase
          .from("user_daily_flashcards")
          .update({ active: true, completed_at: null, amount: 0 })
          .eq("id", batchId);

        // 2. Apaga as respostas dadas
        await supabase
          .from("user_flashcards_answers")
          .update({ answer: null })
          .eq("daily_batch", batchId);

        // 3. Marca no perfil como não completado hoje
        await supabase
          .from("profiles")
          .update({ daily_flashcards_completed: false })
          .eq("id", user.id);

        // 4. Atualiza a store
        await fetchActiveBatch(user.id);

        Alert.alert("Sucesso", "Último lote reiniciado. Vá para a aba Flashcards.");
      } else {
        Alert.alert("Erro", "Nenhum lote encontrado.");
      }
    } catch (err: any) {
      Alert.alert("Erro", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearContext = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      await supabase
        .from("profiles")
        .update({
          learned_preferences: { interests: [], hard_blocks: [], evolution_tags: [], deficits: [], ai_justification: "" },
          affinities: {},
        })
        .eq("id", user.id);

      Alert.alert("Sucesso", "Contexto (learned_preferences e affinities) apagado.");
    } catch (err: any) {
      Alert.alert("Erro", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SceneBackdrop night={night} />
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Uso interno</Text>
        <Text style={styles.title}>Ferramentas de desenvolvimento</Text>
        <Text style={styles.subtitle}>
          Ferramentas fáceis de apagar antes do deploy final.
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={T.moss} style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.warnButton]} onPress={handleResetBatch}>
              <Text style={styles.warnButtonText}>Reiniciar lote atual</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleClearContext}>
              <Text style={styles.dangerButtonText}>Apagar contexto aprendido</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 24,
      backgroundColor: T.bg,
      justifyContent: "center",
    },
    panel: {
      backgroundColor: T.card,
      borderWidth: 1,
      borderColor: T.cardBorder,
      borderRadius: 28,
      padding: 26,
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
      ...softShadow(T),
    },
    eyebrow: {
      color: T.accent,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2.4,
      textTransform: "uppercase",
      textAlign: "center",
    },
    title: {
      fontFamily: Fonts.serif,
      fontSize: 23,
      fontWeight: "600",
      color: T.ink,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 8,
      letterSpacing: 0.2,
    },
    subtitle: {
      fontSize: 14,
      color: T.inkSoft,
      textAlign: "center",
      marginBottom: 28,
      lineHeight: 21,
    },
    buttonContainer: {
      gap: 14,
    },
    button: {
      padding: 16,
      borderRadius: 16,
      alignItems: "center",
      borderWidth: 1,
    },
    warnButton: {
      backgroundColor: T.warnSoft,
      borderColor: T.warn,
    },
    warnButtonText: {
      color: T.warn,
      fontSize: 15,
      fontWeight: "700",
    },
    dangerButton: {
      backgroundColor: T.dangerSoft,
      borderColor: T.danger,
    },
    dangerButtonText: {
      color: T.danger,
      fontSize: 15,
      fontWeight: "700",
    },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
