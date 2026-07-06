import React, { useCallback } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";

interface SwipeFlashcardProps {
  question: string;
  category?: string | null;
  signalType?: string | null;
  onSwipe: (answer: boolean | null) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  water: "Água",
  energy: "Energia",
  waste: "Resíduos",
  transport: "Transporte",
  food: "Alimentação",
  consumption: "Consumo",
};

const SIGNAL_LABELS: Record<string, string> = {
  habit: "Hábito",
  capability: "Capacidade",
  constraint: "Restrição",
  preference: "Preferência",
  interest: "Interesse",
};

export const SwipeFlashcard = ({
  question,
  category,
  signalType,
  onSwipe,
}: SwipeFlashcardProps) => {
  const { theme } = useRootineTheme();
  const styles = createStyles(theme);
  const { width, height } = useWindowDimensions();
  const horizontalRange = Math.max(width, 320);
  const swipeThreshold = Math.min(120, Math.max(84, horizontalRange * 0.28));
  const dismissX = horizontalRange + 120;
  const dismissY = Math.max(height, 600);
  const categoryColor =
    theme.categories[String(category ?? "") as keyof typeof theme.categories] ??
    theme.categories.default;
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  const handleSwipe = useCallback(
    (answer: boolean | null) => {
      onSwipe(answer);
    },
    [onSwipe],
  );

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationX > swipeThreshold) {
        // Swipe DIREITA → true (SIM)
        translateX.value = withTiming(dismissX, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(true);
        });
      } else if (event.translationX < -swipeThreshold) {
        // Swipe ESQUERDA → false (NÃO)
        translateX.value = withTiming(-dismissX, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(false);
        });
      } else if (event.translationY < -swipeThreshold) {
        // Swipe CIMA → null (PULAR)
        translateY.value = withTiming(-dismissY, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(null);
        });
      } else {
        // Volta ao centro (não passou do threshold)
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(translateX.value, [-horizontalRange, 0, horizontalRange], [-15, 0, 15])}deg`,
      },
    ],
    opacity: cardOpacity.value,
  }));

  // Overlay verde (SIM) — aparece ao arrastar para direita
  const yesOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, swipeThreshold], [0, 1], "clamp"),
  }));

  // Overlay vermelho (NÃO) — aparece ao arrastar para esquerda
  const noOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -swipeThreshold], [0, 1], "clamp"),
  }));

  // Overlay cinza (PULAR) — aparece ao arrastar para cima
  const skipOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, -swipeThreshold], [0, 1], "clamp"),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.View style={[styles.overlay, styles.yesOverlay, yesOverlayStyle]}>
          <View style={[styles.overlayMark, styles.yesMark]} />
          <Text style={styles.yesOverlayText}>SIM</Text>
        </Animated.View>

        <Animated.View style={[styles.overlay, styles.noOverlay, noOverlayStyle]}>
          <View style={[styles.overlayMark, styles.noMark]} />
          <Text style={styles.noOverlayText}>NÃO</Text>
        </Animated.View>

        <Animated.View style={[styles.overlay, styles.skipOverlay, skipOverlayStyle]}>
          <View style={[styles.overlayMark, styles.skipMark]} />
          <Text style={styles.skipOverlayText}>PULAR</Text>
        </Animated.View>

        <View style={styles.metaRow}>
          <Text style={[styles.typeLabel, { color: categoryColor }]}>
            {CATEGORY_LABELS[String(category ?? "")] ?? "Aventura"}
          </Text>
          {signalType ? (
            <Text style={styles.signalLabel}>
              {SIGNAL_LABELS[String(signalType)] ?? signalType}
            </Text>
          ) : null}
        </View>
        <Text style={styles.questionText}>{question}</Text>

        <View style={styles.hints}>
          <Text style={styles.hintText}>← NÃO</Text>
          <Text style={styles.hintText}>PULAR ↑</Text>
          <Text style={styles.hintText}>SIM →</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    card: {
      width: "100%",
      maxWidth: 420,
      minHeight: 300,
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 24,
      paddingVertical: 28,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      flexShrink: 1,
      elevation: 6,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
    yesOverlay: {
      backgroundColor: theme.colors.successSoft,
    },
    noOverlay: {
      backgroundColor: theme.colors.dangerSoft,
    },
    skipOverlay: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    overlayMark: {
      width: 36,
      height: 12,
      borderRadius: 999,
      marginBottom: 10,
    },
    yesMark: {
      backgroundColor: theme.colors.success,
    },
    noMark: {
      backgroundColor: theme.colors.danger,
    },
    skipMark: {
      backgroundColor: theme.colors.textSubtle,
    },
    yesOverlayText: {
      color: theme.colors.success,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0,
    },
    noOverlayText: {
      color: theme.colors.danger,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0,
    },
    skipOverlayText: {
      color: theme.colors.textMuted,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0,
    },
    metaRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      marginBottom: 16,
      flexWrap: "wrap",
      justifyContent: "center",
    },
    typeLabel: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
      textTransform: "uppercase",
    },
    signalLabel: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: 999,
      color: theme.colors.primaryStrong,
      fontSize: 11,
      fontWeight: "800",
      paddingHorizontal: 9,
      paddingVertical: 5,
      overflow: "hidden",
    },
    questionText: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.text,
      textAlign: "center",
      lineHeight: 30,
      marginBottom: 24,
      width: "100%",
      flexShrink: 1,
    },
    hints: {
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      gap: 8,
      flexWrap: "wrap",
    },
    hintText: {
      fontSize: 10,
      color: theme.colors.textSubtle,
      fontWeight: "700",
      letterSpacing: 0,
    },
  });
