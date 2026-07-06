import { DiagnosticCard } from "@/components/DiagnosticCard";
import { ProgressBar } from "@/components/ProgressBar";
import { RootineBackground } from "@/components/RootineBackground";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import {
  ONBOARDING_QUESTIONS,
  type OnboardingAnswers,
} from "@/lib/domain/onboarding";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";

export default function DiagnosticScreen() {
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleAnswer = async (value: string) => {
    if (isSubmitting) return;

    const q = ONBOARDING_QUESTIONS[currentStep];
    const updatedAnswers = { ...answers, [q.id]: value };
    setAnswers(updatedAnswers);

    if (currentStep < ONBOARDING_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsSubmitting(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw userError ?? new Error("Sessão não encontrada.");
        }

        console.log("[ONBOARDING] Finalizando onboarding.", {
          userId: user.id,
          answerCount: Object.keys(updatedAnswers).length,
        });

        const { data, error } = await supabase.functions.invoke(
          "complete-onboarding",
          {
            body: {
              userId: user.id,
              answers: updatedAnswers,
            },
          },
        );

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        console.log("[ONBOARDING] Onboarding concluído.", {
          userId: user.id,
          eventCount: data?.event_count,
          factCount: data?.fact_count,
        });

        router.replace("/(tabs)");
      } catch (error) {
        console.error("Erro ao salvar onboarding:", error);
        Alert.alert(
          "Não foi possível salvar agora",
          "Suas respostas continuam nesta tela. Tente finalizar novamente em instantes.",
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (isSubmitting) {
    return (
      <View style={styles.loadingContainer}>
        <RootineBackground variant="journal" />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Preparando seu habitat...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RootineBackground variant="journal" />
      <ProgressBar progress={(currentStep + 1) / ONBOARDING_QUESTIONS.length} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <DiagnosticCard
          question={ONBOARDING_QUESTIONS[currentStep]}
          onAnswer={handleAnswer}
        />
        <Text style={styles.counter}>
          {currentStep + 1} de {ONBOARDING_QUESTIONS.length}
        </Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 60 },
    content: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingTop: 32,
      paddingBottom: 40,
    },
    counter: {
      marginTop: 24,
      fontSize: 12,
      fontWeight: "800",
      color: theme.colors.textSubtle,
      letterSpacing: 0,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: theme.colors.text,
      fontWeight: "700",
    },
  });
