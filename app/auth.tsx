import { RootineBackground } from "@/components/RootineBackground";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import { supabase } from "@/lib/supabase";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function getAuthErrorMessage(error: unknown, isSignUp: boolean) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message)
        : "Não foi possível autenticar agora.";

  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code)
      : "";

  if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "Muitas tentativas de cadastro em pouco tempo. Aguarde cerca de 1 hora e tente novamente.";
  }

  if (message.includes("Invalid login credentials")) {
    return isSignUp
      ? "Não foi possível concluir o cadastro. Tente outro e-mail ou faça login se a conta já existir."
      : "E-mail ou senha incorretos. Se você acabou de migrar de projeto Supabase, cadastre-se de novo neste ambiente.";
  }

  if (message.includes("Email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada e o spam.";
  }

  if (message.includes("User already registered")) {
    return "Este e-mail já está cadastrado. Use a opção Entrar.";
  }

  if (message.includes("Password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (
    message.includes("fetch") ||
    message.includes("Failed to send") ||
    message.includes("Network")
  ) {
    return "Falha de conexão com o Supabase. Teste outra rede, VPN ou aguarde alguns minutos.";
  }

  return message;
}

export default function AuthScreen() {
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    // 1. Validação inicial para evitar chamadas desnecessárias à API
    if (!email || !password || (isSignUp && !fullName)) {
      Alert.alert(
        "Campos obrigatórios",
        "Por favor, preencha todos os campos para prosseguir.",
      );
      return;
    }

    setLoading(true);
    console.log(
      `[AUTH] Iniciando ${isSignUp ? "cadastro" : "login"} para: ${email}`,
    );

    try {
      if (isSignUp) {
        // FLUXO DE CADASTRO
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: fullName },
            // Definimos como undefined para evitar conflitos de redirecionamento
            // enquanto testamos no ambiente local (localhost/IP).
            emailRedirectTo: undefined,
          },
        });

        if (error) throw error;

        console.log("[AUTH] Cadastro concluído com sucesso:", data.user?.id);

        if (data.user) {
          const { error: profileError } = await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              name: fullName.trim() || data.user.email?.split("@")[0] || "Guardião",
              xp: 0,
              onboarding_completed: false,
            },
            { onConflict: "id" },
          );

          if (profileError) {
            console.error("[AUTH] Erro ao criar perfil:", profileError.message);
          }
        }

        // Feedback caso o e-mail de confirmação esteja ligado no dashboard
        if (!data.session) {
          Alert.alert(
            "Verifique seu e-mail",
            "Enviamos um link de confirmação para você.",
          );
        }
        // Se a sessão existir (confirmação desligada), o _layout.tsx detectará
        // automaticamente e enviará o usuário para o /diagnostic.
      } else {
        // FLUXO DE LOGIN
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        console.log("[AUTH] Login realizado com sucesso.");
        // O _layout.tsx detectará a sessão e enviará o usuário para a Home (/).
      }
    } catch (error: unknown) {
      const friendlyMessage = getAuthErrorMessage(error, isSignUp);
      console.error("[AUTH ERROR]:", friendlyMessage, error);
      Alert.alert("Erro na Autenticação", friendlyMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <RootineBackground variant="journal" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logo}>Rootine</Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? "Junte-se à jornada sustentável"
              : "Sua árvore sente sua falta"}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>
            {isSignUp ? "Criar Conta" : "Entrar"}
          </Text>

          {isSignUp && (
            <TextInput
              placeholder="Nome Completo"
              style={styles.input}
              placeholderTextColor={theme.colors.textSubtle}
              onChangeText={setFullName}
              autoCorrect={false}
            />
          )}

          <TextInput
            placeholder="E-mail"
            style={styles.input}
            placeholderTextColor={theme.colors.textSubtle}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            autoCorrect={false}
          />

          <TextInput
            placeholder="Senha"
            style={styles.input}
            placeholderTextColor={theme.colors.textSubtle}
            secureTextEntry
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.textOnPrimary} />
            ) : (
              <Text style={styles.buttonText}>
                {isSignUp ? "Cadastrar" : "Entrar"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            style={styles.switchButton}
          >
            <Text style={styles.switchText}>
              {isSignUp
                ? "Já tem uma conta? Faça login"
                : "Não tem conta? Cadastre-se agora"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { flexGrow: 1, justifyContent: "center", padding: 25 },
    header: { alignItems: "center", marginBottom: 40 },
    logo: { fontSize: 34, fontWeight: "800", color: theme.colors.primaryStrong },
    subtitle: { fontSize: 14, color: theme.colors.textMuted, marginTop: 5 },
    form: {
      backgroundColor: theme.colors.surfaceRaised,
      padding: 25,
      borderRadius: 8,
      elevation: 4,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    label: { fontSize: 20, fontWeight: "800", color: theme.colors.text, marginBottom: 20 },
    input: {
      backgroundColor: theme.colors.input,
      padding: 15,
      borderRadius: 8,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    button: {
      backgroundColor: theme.colors.primary,
      padding: 16,
      borderRadius: 999,
      alignItems: "center",
      marginTop: 10,
    },
    buttonDisabled: { backgroundColor: theme.colors.surfacePressed },
    buttonText: { color: theme.colors.textOnPrimary, fontWeight: "800", fontSize: 16 },
    switchButton: { marginTop: 25, alignItems: "center" },
    switchText: { color: theme.colors.primaryStrong, fontWeight: "700", fontSize: 14 },
  });
