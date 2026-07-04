import { AppHeader } from "@/components/AppHeader";
import { RootineBackground } from "@/components/RootineBackground";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function ExploreScreen() {
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <RootineBackground variant="journal" />
      <AppHeader
        eyebrow="Rootine"
        title="Área reservada"
        subtitle="Esta rota de apoio fica fora da navegação principal."
        compact
      />
      <View style={styles.panel}>
        <Text style={styles.panelText}>Sem assets de template Expo/React em uso.</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    panel: {
      margin: 20,
      padding: 18,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceRaised,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    panelText: {
      color: theme.colors.textMuted,
      fontWeight: "700",
      lineHeight: 20,
    },
  });
