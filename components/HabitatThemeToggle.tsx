import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";

export function HabitatThemeToggle() {
  const { mode, theme, toggleMode } = useRootineTheme();
  const styles = createStyles(theme);
  const isDark = mode === "dark";

  return (
    <Pressable
      accessibilityLabel={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      accessibilityRole="switch"
      accessibilityState={{ checked: isDark }}
      onPress={toggleMode}
      style={styles.track}
    >
      <View style={[styles.thumb, isDark && styles.thumbNight]}>
        <Svg width="20" height="20" viewBox="0 0 24 24">
          {isDark ? (
            <Path
              d="M17.8 15.9 C13.5 16.5 9.6 13.2 9.6 8.9 C9.6 7.2 10.2 5.6 11.2 4.3 C7.5 4.9 4.7 8 4.7 11.8 C4.7 16 8.1 19.4 12.3 19.4 C14.7 19.4 16.8 18.3 18.2 16.6 C18.4 16.3 18.2 15.8 17.8 15.9 Z"
              fill={theme.habitat.moon}
            />
          ) : (
            <Path
              d="M12 5.1 C15.1 5.1 17.6 7.6 17.6 10.7 C17.6 13.9 15.1 16.4 12 16.4 C8.9 16.4 6.4 13.9 6.4 10.7 C6.4 7.6 8.9 5.1 12 5.1 Z M12 1.6 L12 3.6 M12 17.9 L12 20.3 M4.7 3.8 L6.1 5.2 M18 17.1 L19.5 18.6 M2.7 10.7 L4.8 10.7 M19.2 10.7 L21.3 10.7 M4.8 17.6 L6.3 16.1 M17.8 5.2 L19.2 3.8"
              fill={theme.habitat.sun}
              stroke={theme.habitat.sun}
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          )}
        </Svg>
      </View>
    </Pressable>
  );
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    track: {
      width: 74,
      height: 38,
      borderRadius: 19,
      padding: 4,
      backgroundColor: theme.colors.transparentSurfaceStrong,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : theme.habitat.cloud,
      justifyContent: "center",
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    thumb: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceRaised,
      transform: [{ translateX: 0 }],
    },
    thumbNight: {
      transform: [{ translateX: 36 }],
      backgroundColor: theme.colors.surfaceMuted,
    },
  });

export default HabitatThemeToggle;
