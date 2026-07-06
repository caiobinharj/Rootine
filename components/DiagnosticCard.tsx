import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";

import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";

interface DiagnosticCardProps {
  question: {
    id: string;
    label: string;
    options: readonly { label: string; value: string }[];
  };
  onAnswer: (value: string) => void;
}

export const DiagnosticCard = ({ question, onAnswer }: DiagnosticCardProps) => {
  const { theme } = useRootineTheme();
  const styles = createStyles(theme);

  return (
    <Animated.View
      entering={FadeInRight}
      exiting={FadeOutLeft}
      style={styles.card}
    >
      <Text style={styles.typeLabel}>DIAGNÓSTICO INICIAL</Text>
      <Text style={styles.questionText}>{question.label}</Text>

      <View style={styles.optionsContainer}>
        {question.options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={styles.optionButton}
            onPress={() => onAnswer(opt.value)}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
};

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    card: {
      width: "100%",
      maxWidth: 440,
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 24,
      paddingVertical: 28,
      elevation: 4,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    typeLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: theme.colors.accent,
      marginBottom: 8,
      letterSpacing: 0,
    },
    questionText: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.text,
      marginBottom: 24,
      lineHeight: 28,
      flexShrink: 1,
    },
    optionsContainer: { gap: 12 },
    optionButton: {
      paddingHorizontal: 14,
      paddingVertical: 16,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
    },
    optionText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text,
      lineHeight: 20,
      textAlign: "center",
    },
  });
