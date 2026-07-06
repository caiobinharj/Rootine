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
import { z } from "zod/v4";

// Esquema de validação para cadastro
const signUpSchema = z
  .object({
    fullName: z.string().min(1, "Nome completo é obrigatório"),
    email: z.string().email("E-mail inválido"),
    password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
    confirmPassword: z.string().min(6, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

// 2. Função getAuthErrorMessage revisada
function getAuthErrorMessage(error: unknown, isSignUp: boolean) {
  // Extrai a mensagem bruta
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message)
        : "Não foi possível autenticar agora.";

  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code)
      : "";

  // Casos conhecidos (mapeamento)
  if (code === "over_email_send_rate_limit" || rawMessage.includes("rate limit")) {
    return "Muitas tentativas de cadastro em pouco tempo. Aguarde cerca de 1 hora e tente novamente.";
  }
  if (rawMessage.includes("Invalid login credentials")) {
    return isSignUp
      ? "Não foi possível concluir o cadastro. Tente outro e-mail ou faça login se a conta já existir."
      : "E-mail ou senha incorretos. Verifique seus dados.";
  }
  if (rawMessage.includes("Email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada e o spam.";
  }
  if (rawMessage.includes("User already registered")) {
    return "Este e-mail já está cadastrado. Use a opção Entrar.";
  }
  if (rawMessage.includes("Password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (
    rawMessage.includes("fetch") ||
    rawMessage.includes("Failed to send") ||
    rawMessage.includes("Network")
  ) {
    return "Falha de conexão com o servidor. Verifique sua internet.";
  }

  // --- Fallback: evita exibir JSON ou mensagens técnicas ---
  const trimmed = rawMessage.trim();
  // Se começa com { ou [ (JSON) ou é muito longa
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || rawMessage.length > 100) {
    // Tenta extrair propriedade 'message' se for JSON válido
    try {
      const parsed = JSON.parse(rawMessage);
      if (parsed && typeof parsed === "object" && parsed.message) {
        return String(parsed.message);
      }
    } catch {
      // Não é JSON válido, ignora
    }
    // Mensagem genérica como fallback
    return isSignUp
      ? "Ocorreu um erro ao criar sua conta. Tente novamente."
      : "Ocorreu um erro ao fazer login. Tente novamente.";
  }

  // Se chegou aqui, a mensagem é curta e sem caracteres suspeitos, pode exibi-la
  return rawMessage;
}

export default function AuthScreen() {
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); // ← novo estado
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    // Limpa campos de confirmação ao alternar modo (opcional)
    // mas não vamos resetar aqui para não atrapalhar a UX.

    // 1. Função de validação do Zod (dentro do handleAuth)
if (isSignUp) {
  const result = signUpSchema.safeParse({
    fullName,
    email,
    password,
    confirmPassword,
  });

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    let errorMessage = "Dados inválidos. Verifique os campos.";

    if (firstIssue) {
      const fieldMap: Record<string, string> = {
        fullName: "Nome completo",
        email: "E-mail",
        password: "Senha",
        confirmPassword: "Confirmação de senha",
      };
      const fieldKey = firstIssue.path[0] as string;
      const field = fieldMap[fieldKey] || fieldKey || "Campo";
      errorMessage = `${field}: ${firstIssue.message}`;
    }

    Alert.alert("Dados inválidos", errorMessage);
    return;
  }
}

    setLoading(true);
    console.log(
      `[AUTH] Iniciando ${isSignUp ? "cadastro" : "login"} para: ${email}`
    );

    try {
      if (isSignUp) {
        // FLUXO DE CADASTRO
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: fullName },
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
            { onConflict: "id" }
          );

          if (profileError) {
            console.error("[AUTH] Erro ao criar perfil:", profileError.message);
          }
        }

        if (!data.session) {
          Alert.alert(
            "Verifique seu e-mail",
            "Enviamos um link de confirmação para você."
          );
        }
      } else {
        // FLUXO DE LOGIN
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        console.log("[AUTH] Login realizado com sucesso.");
      }
    } catch (error: unknown) {
      const friendlyMessage = getAuthErrorMessage(error, isSignUp);
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
              value={fullName}
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
            value={email}
          />

          <TextInput
            placeholder="Senha"
            style={styles.input}
            placeholderTextColor={theme.colors.textSubtle}
            secureTextEntry
            onChangeText={setPassword}
            value={password}
          />

          {isSignUp && (
            <TextInput
              placeholder="Confirmar Senha"
              style={styles.input}
              placeholderTextColor={theme.colors.textSubtle}
              secureTextEntry
              onChangeText={setConfirmPassword}
              value={confirmPassword}
            />
          )}

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
    label: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.colors.text,
      marginBottom: 20,
    },
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
    buttonText: {
      color: theme.colors.textOnPrimary,
      fontWeight: "800",
      fontSize: 16,
    },
    switchButton: { marginTop: 25, alignItems: "center" },
    switchText: {
      color: theme.colors.primaryStrong,
      fontWeight: "700",
      fontSize: 14,
    },
  });
