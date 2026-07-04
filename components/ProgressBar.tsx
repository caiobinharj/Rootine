import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";

interface ProgressBarProps {
  progress: number; // 0 a 1
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  const { theme } = useRootineTheme();
  const styles = createStyles(theme);
  const animatedStyle = useAnimatedStyle(() => ({
    width: withSpring(`${progress * 100}%`),
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.fill, animatedStyle]} />
    </View>
  );
};

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: {
      height: 7,
      backgroundColor: theme.colors.transparentInk,
      width: "100%",
      borderRadius: 999,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
    },
  });
