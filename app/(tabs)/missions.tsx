import { useFocusEffect } from "expo-router";
import MissionCard from "@/components/MissionCard";
import { RootineBackground } from "@/components/RootineBackground";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function MissionsScreen() {
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { missions, fetchPendingMissions, loading } = useEcoStore();

  const loadMissions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await fetchPendingMissions(user.id);
  }, [fetchPendingMissions]);

  // Re-fetch sempre que a aba ganhar foco
  useFocusEffect(
    useCallback(() => {
      loadMissions();
    }, [loadMissions])
  );

  if (loading && missions.length === 0) {
    return (
      <View style={styles.centered}>
        <RootineBackground variant="trail" />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>
          O Guardião está preparando suas missões personalizadas...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RootineBackground variant="trail" />
      <Text style={styles.title}>Missions</Text>
      <FlatList
        data={missions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MissionCard
            missionId={item.id}
            title={item.title}
            description={item.description}
            category={item.ai_justification?.category || "general"}
            justification={item.ai_justification?.reason || ""}
            expiresAt={item.expires_at}
            xp={item.xp_reward ?? (item.mission_type === "specialized" ? 25 : 10)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Nenhuma missão ativa. Complete seu lote diário para gerar novas.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 20,
      paddingTop: 60,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.background,
    },
    loadingText: { marginTop: 10, color: theme.colors.textMuted },
    title: {
      fontSize: 28,
      fontWeight: "800",
      color: theme.colors.primaryStrong,
      marginBottom: 20,
    },
    emptyContainer: { marginTop: 100, alignItems: "center" },
    emptyText: { color: theme.colors.textSubtle, fontSize: 16, textAlign: "center" },
    listPadding: { paddingBottom: 40 },
  });
