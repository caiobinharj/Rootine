import TreeDisplay from "@/components/TreeDisplay";
import { getLevelFromXp } from "@/lib/domain/xp";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface HabitatLeaf {
  id?: string;
  position: number;
  title: string;
  message: string;
}

const FALLBACK_LEAVES: HabitatLeaf[] = [
  {
    position: 1,
    title: "Raiz da Jornada",
    message: "Jovem guardião, tuas escolhas já tocaram o solo. Cada resposta tua alimenta as raízes deste bosque interior.",
  },
  {
    position: 2,
    title: "Folha da Memória",
    message: "Recordo tuas missões como inscrições antigas: pequenas ações, quando repetidas, tornam-se linhagem.",
  },
  {
    position: 3,
    title: "Vento do Perfil",
    message: "Teu contexto é terreno sagrado. Nenhum conselho deve exigir de ti o que tua realidade não permite sustentar.",
  },
  {
    position: 4,
    title: "Copa do Amanhã",
    message: "Segue com constância, não com pressa. Florestas antigas nasceram de gestos quase invisíveis.",
  },
];

export default function HabitatScreen() {
  const { xp, impactTotals, fetchProfile } = useEcoStore();
  const [leaves, setLeaves] = useState<HabitatLeaf[]>(FALLBACK_LEAVES);
  const [selectedLeaf, setSelectedLeaf] = useState<HabitatLeaf | null>(null);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const levelInfo = getLevelFromXp(xp || 0);

  const impactPulse = Math.min(
    45,
    (impactTotals.water_l || 0) * 0.08 +
      (impactTotals.co2_kg || 0) * 8 +
      (impactTotals.waste_g || 0) * 0.015 +
      (impactTotals.energy_kwh || 0) * 10,
  );
  const vitalityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (xp > 0 ? 20 : 8) +
          levelInfo.progress * 35 +
          impactPulse,
      ),
    ),
  );
  const vitalityLabel =
    vitalityScore >= 70
      ? "alta"
      : vitalityScore >= 35
        ? "em crescimento"
        : "em recuperação";

  const loadLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await fetchProfile(user.id);
      console.log("[HABITAT] Perfil do Habitat carregado:", {
        userId: user.id,
      });

      const { data, error } = await supabase.functions.invoke("habitat-leaves", {
        body: { userId: user.id },
      });

      if (error) throw error;
      if (data?.leaves?.length) {
        setLeaves(data.leaves);
      }
    } catch (error) {
      console.error("[HABITAT] Erro ao carregar folhas:", error);
      setLeaves(FALLBACK_LEAVES);
    } finally {
      setLoadingLeaves(false);
    }
  }, [fetchProfile]);

  useFocusEffect(
    useCallback(() => {
      loadLeaves();
    }, [loadLeaves]),
  );

  const handleLeafPress = (index: number) => {
    setSelectedLeaf(leaves[index] || FALLBACK_LEAVES[index]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Habitat</Text>
        <Text style={styles.title}>A Árvore Ancestral</Text>
        <Text style={styles.subtitle}>
          Toque em uma das quatro folhas para ouvir uma memória criada a partir da sua jornada.
        </Text>
      </View>

      <View style={styles.treeContainer}>
        <TreeDisplay
          onLeafPress={handleLeafPress}
          vitalityScore={vitalityScore}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.xpText}>
          Nível {levelInfo.level} · {levelInfo.milestone}
        </Text>
        <Text style={styles.progressText}>
          {xp || 0} XP · {Math.round(levelInfo.progress * 100)}% até o próximo marco
        </Text>
        <Text style={styles.vitalityText}>
          Vitalidade atual: {vitalityLabel}
        </Text>
        {loadingLeaves ? <ActivityIndicator color="#2E7D32" /> : null}
      </View>

      <Modal visible={!!selectedLeaf} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalLabel}>Mensagem da árvore</Text>
            <Text style={styles.modalTitle}>{selectedLeaf?.title}</Text>
            <Text style={styles.modalMessage}>{selectedLeaf?.message}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedLeaf(null)}
            >
              <Text style={styles.closeText}>Ouvir o bosque</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  header: { paddingTop: 58, paddingHorizontal: 24, alignItems: "center" },
  eyebrow: {
    fontSize: 12,
    color: "#2E7D32",
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: { fontSize: 28, fontWeight: "bold", color: "#1B5E20", marginTop: 6 },
  subtitle: {
    color: "#546E7A",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  treeContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  footer: {
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 18,
    paddingHorizontal: 20,
  },
  xpText: { color: "#2E7D32", fontWeight: "bold" },
  progressText: { color: "#455A64", marginTop: 4, fontWeight: "700" },
  vitalityText: { color: "#607D8B", marginTop: 4, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 24,
    elevation: 8,
  },
  modalLabel: {
    color: "#7B1FA2",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 24, fontWeight: "bold", color: "#1B5E20", marginBottom: 12 },
  modalMessage: { fontSize: 16, color: "#455A64", lineHeight: 24 },
  closeButton: {
    backgroundColor: "#2E7D32",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 22,
    alignItems: "center",
  },
  closeText: { color: "#FFF", fontWeight: "bold" },
});
