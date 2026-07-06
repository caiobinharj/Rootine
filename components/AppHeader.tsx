import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";

interface AppHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  variant?: "default" | "scene";
  compact?: boolean;
}

export function AppHeader({
  eyebrow,
  title,
  subtitle,
  action,
  variant = "default",
  compact = false,
}: AppHeaderProps) {
  const { theme } = useRootineTheme();
  const styles = createStyles(theme, compact, Boolean(action));
  const isScene = variant === "scene";

  return (
    <View style={[styles.header, isScene && styles.sceneHeader, compact && styles.compactHeader]}>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, isScene && styles.sceneEyebrow]}>{eyebrow}</Text>
        <Text style={[styles.title, isScene && styles.sceneTitle]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, isScene && styles.sceneSubtitle]}>{subtitle}</Text>
        ) : null}
        <Svg width="128" height="18" viewBox="0 0 128 18" style={styles.vine}>
          <Path
            d="M2 12 C19 2 34 19 50 8 C67 -3 78 17 95 7 C108 -1 117 6 126 3"
            fill="none"
            stroke={isScene ? theme.habitat.headerOrnament : theme.colors.accent}
            strokeLinecap="round"
            strokeWidth="2"
            opacity={isScene ? 0.82 : 0.42}
          />
          <Path
            d="M39 10 C35 7 34 4 37 1 C43 3 43 8 39 10 Z M83 9 C80 5 81 1 86 0 C91 4 89 8 83 9 Z"
            fill={isScene ? theme.habitat.headerOrnament : theme.colors.primary}
            opacity={isScene ? 0.9 : 0.5}
          />
        </Svg>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const createStyles = (theme: RootineTheme, compact: boolean, hasAction: boolean) =>
  StyleSheet.create({
    header: {
      width: "100%",
      paddingTop: 58,
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.transparentSurface,
      overflow: "hidden",
    },
    sceneHeader: {
      backgroundColor: "transparent",
      borderBottomColor: "transparent",
      paddingBottom: 6,
    },
    compactHeader: {
      paddingBottom: 12,
    },
    copy: {
      flex: 1,
      paddingRight: hasAction ? 74 : 0,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0,
      textTransform: "uppercase",
    },
    sceneEyebrow: {
      color: theme.habitat.headerAccent,
      textShadowColor: theme.mode === "dark" ? theme.colors.shadow : theme.habitat.cloud,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    title: {
      color: theme.colors.text,
      fontSize: compact ? 24 : 29,
      fontWeight: "800",
      marginTop: 4,
      lineHeight: compact ? 29 : 34,
    },
    sceneTitle: {
      color: theme.mode === "dark" ? theme.colors.text : theme.colors.primaryStrong,
      textShadowColor: theme.mode === "dark" ? theme.colors.shadow : theme.habitat.cloud,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 8,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 7,
      maxWidth: 560,
    },
    sceneSubtitle: {
      color: theme.mode === "dark" ? theme.colors.textMuted : theme.colors.primaryStrong,
      textShadowColor: theme.mode === "dark" ? theme.colors.shadow : theme.habitat.cloud,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 8,
    },
    vine: {
      marginTop: 8,
    },
    action: {
      position: "absolute",
      right: 20,
      top: 58,
    },
  });
