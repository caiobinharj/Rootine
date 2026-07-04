import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";

interface BatchCountdownProps {
  expiresAt: string; // ISO string
  onExpired: () => void;
}

export const BatchCountdown = ({ expiresAt, onExpired }: BatchCountdownProps) => {
  const { theme } = useRootineTheme();
  const styles = createStyles(theme);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const target = new Date(expiresAt).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("00:00:00");
        onExpired();
        return false;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`,
      );
      return true;
    };

    // Roda imediatamente para evitar "flash" de 00:00:00
    tick();

    const interval = setInterval(() => {
      const shouldContinue = tick();
      if (!shouldContinue) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  return (
    <View style={styles.badge}>
      <View style={styles.iconMark} />
      <Text style={styles.text}>{timeLeft}</Text>
    </View>
  );
};

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.warningSoft,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      gap: 7,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    iconMark: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: theme.colors.warning,
      borderWidth: 2,
      borderColor: theme.colors.surfaceRaised,
    },
    text: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.colors.accentStrong,
      fontVariant: ["tabular-nums"],
    },
  });
