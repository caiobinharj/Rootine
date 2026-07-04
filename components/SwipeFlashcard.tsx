import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  softShadow,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import React, { useCallback } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = 120;

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
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const { night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

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
      if (event.translationX > SWIPE_THRESHOLD) {
        // Swipe DIREITA → true (SIM)
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(true);
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        // Swipe ESQUERDA → false (NÃO)
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(false);
        });
      } else if (event.translationY < -SWIPE_THRESHOLD) {
        // Swipe CIMA → null (PULAR)
        translateY.value = withTiming(-600, { duration: 300 });
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
        rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-15, 0, 15])}deg`,
      },
    ],
    opacity: cardOpacity.value,
  }));

  // Overlay musgo (SIM) — aparece ao arrastar para direita
  const yesOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], "clamp"),
  }));

  // Overlay terracota (NÃO) — aparece ao arrastar para esquerda
  const noOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1], "clamp"),
  }));

  // Overlay areia (PULAR) — aparece ao arrastar para cima
  const skipOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, -SWIPE_THRESHOLD], [0, 1], "clamp"),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        {/* Overlay SIM (Direita) */}
        <Animated.View style={[styles.overlay, styles.yesOverlay, yesOverlayStyle]}>
          <Text style={styles.overlayGlyph}>❧</Text>
          <Text style={styles.yesOverlayText}>Sim</Text>
        </Animated.View>

        {/* Overlay NÃO (Esquerda) */}
        <Animated.View style={[styles.overlay, styles.noOverlay, noOverlayStyle]}>
          <Text style={styles.overlayGlyph}>✕</Text>
          <Text style={styles.noOverlayText}>Não</Text>
        </Animated.View>

        {/* Overlay PULAR (Cima) */}
        <Animated.View style={[styles.overlay, styles.skipOverlay, skipOverlayStyle]}>
          <Text style={styles.overlayGlyph}>↟</Text>
          <Text style={styles.skipOverlayText}>Pular</Text>
        </Animated.View>

        <View style={styles.metaRow}>
          <Text style={styles.typeLabel}>
            {CATEGORY_LABELS[String(category ?? "")] ?? "Aventura"}
          </Text>
          {signalType ? (
            <View style={styles.signalChip}>
              <Text style={styles.signalChipText}>
                {SIGNAL_LABELS[String(signalType)] ?? signalType}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.questionText}>{question}</Text>

        <View style={styles.hints}>
          <Text style={styles.hintText}>← Não</Text>
          <Text style={styles.hintText}>Pular ↑</Text>
          <Text style={styles.hintText}>Sim →</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    card: {
      width: SCREEN_WIDTH * 0.9,
      maxWidth: 460,
      minHeight: 300,
      backgroundColor: T.card,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: T.cardBorder,
      padding: 32,
      justifyContent: "center",
      alignItems: "center",
      ...softShadow(T),
    },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 28,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
    yesOverlay: {
      backgroundColor: "rgba(143, 168, 107, 0.88)",
    },
    noOverlay: {
      backgroundColor: "rgba(176, 106, 82, 0.88)",
    },
    skipOverlay: {
      backgroundColor: "rgba(232, 220, 194, 0.92)",
    },
    overlayGlyph: {
      fontSize: 42,
      color: "rgba(255, 253, 244, 0.9)",
    },
    yesOverlayText: {
      fontFamily: Fonts.serif,
      fontSize: 26,
      fontWeight: "600",
      marginTop: 6,
      letterSpacing: 1,
      color: "#FFFDF4",
    },
    noOverlayText: {
      fontFamily: Fonts.serif,
      fontSize: 26,
      fontWeight: "600",
      marginTop: 6,
      letterSpacing: 1,
      color: "#FFFDF4",
    },
    skipOverlayText: {
      fontFamily: Fonts.serif,
      fontSize: 26,
      fontWeight: "600",
      marginTop: 6,
      letterSpacing: 1,
      color: "#5A4632",
    },
    metaRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      marginBottom: 16,
    },
    typeLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: T.accent,
      letterSpacing: 2.2,
      textTransform: "uppercase",
    },
    signalChip: {
      backgroundColor: T.chipBg,
      borderWidth: 1,
      borderColor: T.chipBorder,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    signalChipText: {
      color: T.chipText,
      fontSize: 11,
      fontWeight: "700",
    },
    questionText: {
      fontFamily: Fonts.serif,
      fontSize: 23,
      fontWeight: "600",
      color: T.ink,
      textAlign: "center",
      lineHeight: 32,
      marginBottom: 24,
      letterSpacing: 0.2,
    },
    hints: {
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: T.cardBorder,
    },
    hintText: {
      fontSize: 11,
      color: T.inkFaint,
      fontWeight: "600",
      letterSpacing: 0.5,
    },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
