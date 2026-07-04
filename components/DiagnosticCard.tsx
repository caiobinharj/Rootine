import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  softShadow,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import React from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";

const { width } = Dimensions.get("window");

interface DiagnosticCardProps {
  question: {
    id: string;
    label: string;
    options: readonly { label: string; value: string }[];
  };
  onAnswer: (value: string) => void;
}

export const DiagnosticCard = ({ question, onAnswer }: DiagnosticCardProps) => {
  const { night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

  return (
    <Animated.View
      entering={FadeInRight}
      exiting={FadeOutLeft}
      style={styles.card}
    >
      <Text style={styles.typeLabel}>Diagnóstico inicial</Text>
      <Text style={styles.questionText}>{question.label}</Text>

      <View style={styles.optionsContainer}>
        {question.options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={styles.optionButton}
            onPress={() => onAnswer(opt.value)}
            activeOpacity={0.82}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
};

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    card: {
      width: width * 0.9,
      maxWidth: 460,
      backgroundColor: T.card,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: T.cardBorder,
      padding: 32,
      ...softShadow(T),
    },
    typeLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: T.accent,
      marginBottom: 10,
      letterSpacing: 2.4,
      textTransform: "uppercase",
    },
    questionText: {
      fontFamily: Fonts.serif,
      fontSize: 23,
      fontWeight: "600",
      color: T.ink,
      marginBottom: 24,
      lineHeight: 31,
      letterSpacing: 0.2,
    },
    optionsContainer: { gap: 12 },
    optionButton: {
      padding: 17,
      borderRadius: 16,
      backgroundColor: T.inputBg,
      borderWidth: 1,
      borderColor: T.inputBorder,
      alignItems: "center",
    },
    optionText: { fontSize: 14.5, fontWeight: "600", color: T.ink },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
