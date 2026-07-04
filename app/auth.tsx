import { SceneBackdrop } from "@/components/SceneBackdrop";
import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  softShadow,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { T, night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

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
      <SceneBackdrop night={night} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowRule} />
            <Text style={styles.eyebrow}>Habitat pessoal</Text>
            <View style={styles.eyebrowRule} />
          </View>
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
              placeholderTextColor={T.placeholder}
              onChangeText={setFullName}
              autoCorrect={false}
            />
          )}

          <TextInput
            placeholder="E-mail"
            style={styles.input}
            placeholderTextColor={T.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            autoCorrect={false}
          />

          <TextInput
            placeholder="Senha"
            style={styles.input}
            placeholderTextColor={T.placeholder}
            secureTextEntry
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={T.onMoss} />
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

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: T.bg },
    scrollContent: { flexGrow: 1, justifyContent: "center", padding: 25 },
    header: { alignItems: "center", marginBottom: 36 },
    eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    eyebrowRule: { width: 26, height: 1, backgroundColor: T.rule },
    eyebrow: {
      fontSize: 11,
      color: T.accent,
      fontWeight: "700",
      letterSpacing: 3,
      textTransform: "uppercase",
    },
    logo: {
      fontFamily: Fonts.serif,
      fontSize: 40,
      fontWeight: "600",
      color: T.ink,
      marginTop: 12,
      letterSpacing: 0.4,
    },
    subtitle: { fontSize: 14.5, color: T.inkSoft, marginTop: 8 },
    form: {
      backgroundColor: T.card,
      padding: 26,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: T.cardBorder,
      width: "100%",
      maxWidth: 460,
      alignSelf: "center",
      ...softShadow(T),
    },
    label: {
      fontFamily: Fonts.serif,
      fontSize: 22,
      fontWeight: "600",
      color: T.ink,
      marginBottom: 20,
      letterSpacing: 0.2,
    },
    input: {
      backgroundColor: T.inputBg,
      padding: 15,
      borderRadius: 15,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: T.inputBorder,
      color: T.ink,
    },
    button: {
      backgroundColor: T.moss,
      padding: 17,
      borderRadius: 16,
      alignItems: "center",
      marginTop: 10,
      ...softShadow(T),
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: T.onMoss, fontWeight: "700", fontSize: 16, letterSpacing: 0.4 },
    switchButton: { marginTop: 22, alignItems: "center" },
    switchText: { color: T.accent, fontWeight: "600", fontSize: 14 },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
