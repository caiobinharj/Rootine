import { useRootineTheme } from "@/constants/rootine-theme";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

interface ProgressBarProps {
  progress: number; // 0 a 1
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  const { T } = useRootineTheme();
  const animatedStyle = useAnimatedStyle(() => ({
    width: withSpring(`${progress * 100}%`),
  }));

  return (
    <View style={[styles.container, { backgroundColor: T.track }]}>
      <Animated.View
        style={[styles.fill, { backgroundColor: T.progressFill }, animatedStyle]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 6,
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 999 },
});
