import { RootineBackground } from "@/components/RootineBackground";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import { supabase } from "@/lib/supabase";
import { useFlashcardStore } from "@/store/useFlashcardStore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const DEVELOPER_ACCESS_CODE = "82754";

export default function AdminTab() {
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessCode, setAccessCode] = useState("");
  const [isDeveloper, setIsDeveloper] = useState(false);
  const fetchActiveBatch = useFlashcardStore((s) => s.fetchActiveBatch);

  const checkDeveloperAccess = useCallback(async () => {
    setCheckingAccess(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsDeveloper(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      setIsDeveloper(data?.role === "developer");
    } catch (err) {
      console.warn("[ADMIN] Não foi possível verificar cargo:", err);
      setIsDeveloper(false);
    } finally {
      setCheckingAccess(false);
    }
  }, []);

  useEffect(() => {
    checkDeveloperAccess();
  }, [checkDeveloperAccess]);

  const handleUnlockDeveloper = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (accessCode.trim() !== DEVELOPER_ACCESS_CODE) {
        setAccessCode("");
        Alert.alert("Acesso negado", "Senha inválida.");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("profiles")
        .update({ role: "developer" })
        .eq("id", user.id);

      if (error) throw error;
      setIsDeveloper(true);
      setAccessCode("");
      Alert.alert("Acesso liberado", "Cargo desenvolvedor ativado para esta conta.");
    } catch (err: any) {
      Alert.alert("Erro", err.message);
    } finally {
      setLoading(false);
    }
  };

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
      <RootineBackground variant="journal" />

      {checkingAccess ? (
        <ActivityIndicator size="large" color={theme.colors.accent} style={{ marginTop: 20 }} />
      ) : !isDeveloper ? (
        <View style={styles.lockCard}>
          <Text style={styles.title}>Acesso reservado</Text>
          <Text style={styles.subtitle}>
            Informe a senha para continuar.
          </Text>
          <TextInput
            value={accessCode}
            onChangeText={setAccessCode}
            placeholder="Senha"
            placeholderTextColor={theme.colors.textSubtle}
            secureTextEntry
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={handleUnlockDeveloper}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.disabledButton]}
            onPress={handleUnlockDeveloper}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? "Verificando..." : "Entrar"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.title}>Admin de Desenvolvimento</Text>
          <Text style={styles.subtitle}>
            Cargo desenvolvedor ativo nesta conta.
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={theme.colors.accent} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.button} onPress={handleResetBatch}>
                <Text style={styles.buttonText}>Reiniciar Lote Atual</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleClearContext}>
                <Text style={styles.buttonText}>Apagar Contexto (Cérebro)</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 24,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: theme.colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: "center",
      marginBottom: 40,
    },
    lockCard: {
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 8,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 12,
    },
    input: {
      backgroundColor: theme.colors.input,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      paddingHorizontal: 14,
      paddingVertical: 13,
      textAlign: "center",
    },
    buttonContainer: {
      gap: 16,
    },
    button: {
      padding: 16,
      borderRadius: 999,
      alignItems: "center",
      backgroundColor: theme.colors.warning,
    },
    dangerButton: {
      backgroundColor: theme.colors.danger,
    },
    disabledButton: {
      opacity: 0.6,
    },
    buttonText: {
      color: theme.colors.textOnPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
  });
