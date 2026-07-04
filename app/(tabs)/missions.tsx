import MissionCard from "@/components/MissionCard";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { Fonts } from "@/constants/theme";
import {
  ROOTINE_THEMES,
  useRootineTheme,
  type RootineTheme,
} from "@/constants/rootine-theme";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function MissionsScreen() {
  const { missions, fetchPendingMissions, loading } = useEcoStore();
  const { T, night } = useRootineTheme();
  const styles = night ? STYLES.night : STYLES.day;

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
        <SceneBackdrop night={night} />
        <ActivityIndicator size="large" color={T.moss} />
        <Text style={styles.loadingText}>
          O Guardião está preparando suas missões personalizadas...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SceneBackdrop night={night} />
      <Text style={styles.eyebrow}>Protocolos do dia</Text>
      <Text style={styles.title}>Missões</Text>
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
              Nenhuma missão ativa. Complete seu lote diário para gerar novas! 🌳
            </Text>
          </View>
        }
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
}

const makeStyles = (T: RootineTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: T.bg,
      paddingHorizontal: 20,
      paddingTop: 60,
    },
    centered: {
      flex: 1,
      backgroundColor: T.bg,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 30,
    },
    loadingText: { marginTop: 12, color: T.inkSoft, textAlign: "center", lineHeight: 21 },
    eyebrow: {
      color: T.accent,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2.6,
      textTransform: "uppercase",
    },
    title: {
      fontFamily: Fonts.serif,
      fontSize: 30,
      fontWeight: "600",
      color: T.ink,
      marginTop: 6,
      marginBottom: 16,
      letterSpacing: 0.2,
    },
    emptyContainer: { marginTop: 100, alignItems: "center" },
    emptyText: { color: T.inkFaint, fontSize: 15, textAlign: "center", lineHeight: 23 },
    listPadding: { paddingBottom: 40 },
  });

const STYLES = {
  day: makeStyles(ROOTINE_THEMES.day),
  night: makeStyles(ROOTINE_THEMES.night),
};
