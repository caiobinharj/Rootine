import TreeDisplay from "@/components/TreeDisplay";
import { Fonts } from "@/constants/theme";
import { getLevelFromXp } from "@/lib/domain/xp";
import { supabase } from "@/lib/supabase";
import { blobPath, grassTuft, ridgePath } from "@/lib/visual/organic";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

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

  // Tema: o sistema define o padrão; o botão sol/lua sobrepõe a escolha.
  const systemScheme = useColorScheme();
  const [manualTheme, setManualTheme] = useState<"day" | "night" | null>(null);
  const night = manualTheme ? manualTheme === "night" : systemScheme === "dark";
  const T = night ? THEMES.night : THEMES.day;

  const { width, height } = useWindowDimensions();
  const isWide = width >= 768;
  // Palco quadrado (viewBox 800x800): a árvore ocupa ~45-65% da altura útil.
  const stageSize = Math.round(
    Math.min(isWide ? 780 : width, Math.max(420, height * (isWide ? 0.72 : 0.56))),
  );

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
  const xpToNext = Math.max(0, levelInfo.xpNext - (xp || 0));

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
    <View style={[styles.container, { backgroundColor: T.sceneBase }]}>
      <HabitatBackdrop night={night} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.duration(700)}
          style={styles.header}
        >
          <View style={styles.eyebrowRow}>
            <View style={[styles.eyebrowRule, { backgroundColor: T.rule }]} />
            <Text style={[styles.eyebrow, { color: T.accent }]}>Habitat</Text>
            <View style={[styles.eyebrowRule, { backgroundColor: T.rule }]} />
          </View>
          <Text style={[styles.title, { color: T.ink }]}>A Árvore Ancestral</Text>
          <Text style={[styles.subtitle, { color: T.inkSoft }]}>
            Toque nas folhas numeradas para ouvir memórias criadas a partir da sua jornada.
          </Text>
        </Animated.View>

        {/* Palco da árvore — sem card: ela habita o cenário diretamente */}
        <Animated.View
          entering={FadeIn.delay(160).duration(900)}
          style={[styles.treeStage, { width: stageSize, height: stageSize }]}
        >
          <TreeDisplay
            onLeafPress={handleLeafPress}
            vitalityScore={vitalityScore}
            ambient={night ? "night" : "day"}
          />
          {loadingLeaves ? (
            <View style={[styles.loadingLeavesPill, { backgroundColor: T.pillBg, borderColor: T.panelBorder }]}>
              <ActivityIndicator color={T.spinner} size="small" />
              <Text style={[styles.loadingLeavesText, { color: T.spinner }]}>Atualizando folhas</Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Painel de progresso — vidro leve assentado sobre o chão da cena */}
        <Animated.View
          entering={FadeInUp.delay(260).duration(800)}
          style={[
            styles.progressPanel,
            GLASS_WEB,
            {
              backgroundColor: T.panelBg,
              borderColor: T.panelBorder,
              marginTop: -Math.round(stageSize * 0.1),
            },
          ]}
        >
          <View style={styles.levelHeader}>
            <View style={styles.levelHeaderText}>
              <Text style={[styles.panelEyebrow, { color: T.accent }]}>Progresso do habitat</Text>
              <View style={styles.levelRow}>
                <Text style={[styles.levelTitle, { color: T.ink }]}>
                  Nível {levelInfo.level}
                </Text>
                <Text style={[styles.milestoneText, { color: T.inkSoft }]}>
                  · {levelInfo.milestone}
                </Text>
              </View>
            </View>
            <View style={[styles.vitalityBadge, { backgroundColor: T.badgeBg, borderColor: T.badgeBorder }]}>
              <View style={[styles.vitalityDot, { backgroundColor: T.dot }]} />
              <Text style={[styles.vitalityBadgeText, { color: T.badgeText }]}>{vitalityLabel}</Text>
            </View>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: T.track }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: T.fill,
                  width: `${Math.round(levelInfo.progress * 100)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.progressMeta}>
            <Text style={[styles.progressValue, { color: T.ink }]}>{xp || 0} XP</Text>
            <Text style={[styles.progressText, { color: T.inkSoft }]}>
              faltam {xpToNext} XP para o próximo marco
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Alternância de tema — sol/lua, sempre visível no topo direito */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={night ? "Mudar para tema claro" : "Mudar para tema escuro"}
        onPress={() => setManualTheme(night ? "day" : "night")}
        activeOpacity={0.85}
        style={[
          styles.themeToggle,
          GLASS_WEB,
          {
            backgroundColor: T.pillBg,
            borderColor: T.panelBorder,
            top: Platform.OS === "web" ? 18 : 54,
          },
        ]}
      >
        {night ? <MoonIcon /> : <SunIcon />}
      </TouchableOpacity>

      <Modal visible={!!selectedLeaf} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={FadeInUp.springify().damping(18).mass(0.9)}
            style={[styles.modalCard, { backgroundColor: T.modalBg, borderColor: T.panelBorder }]}
          >
            <View style={styles.modalLabelRow}>
              <View style={[styles.modalLeafGlyph, { backgroundColor: T.dot }]} />
              <Text style={[styles.modalLabel, { color: T.accent }]}>Mensagem da árvore</Text>
            </View>
            <Text style={[styles.modalTitle, { color: T.ink }]}>{selectedLeaf?.title}</Text>
            <Text style={[styles.modalMessage, { color: T.inkSoft }]}>{selectedLeaf?.message}</Text>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: T.button }]}
              activeOpacity={0.86}
              onPress={() => setSelectedLeaf(null)}
            >
              <Text style={[styles.closeText, { color: T.buttonText }]}>Fechar</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

// =============================================================================
// ÍCONES DO TOGGLE DE TEMA
// =============================================================================

const SUN_RAYS = [
  "M12 2.4v3",
  "M12 18.6v3",
  "M2.4 12h3",
  "M18.6 12h3",
  "M5.1 5.1l2.1 2.1",
  "M16.8 16.8l2.1 2.1",
  "M18.9 5.1l-2.1 2.1",
  "M7.2 16.8l-2.1 2.1",
];

function SunIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="4.6" fill="#C98A4B" />
      {SUN_RAYS.map((d, i) => (
        <Path key={i} d={d} stroke="#C98A4B" strokeWidth={1.8} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

function MoonIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" fill="#E8E0C6" />
    </Svg>
  );
}

// =============================================================================
// CENÁRIO PICTÓRICO — céu → astro → floresta distante → névoa → campo → capim
// O SVG estica para preencher a janela (cumeadas e aguadas toleram distorção);
// sol, lua, estrelas e partículas vivem numa camada de Views com proporção
// fixa para nunca deformarem.
// =============================================================================

// Formas orgânicas pré-computadas (determinísticas).
const RIDGE_HILL_FAR = ridgePath(390, 424, 62, 6, 43, 844);
const RIDGE_FOREST_FAR = ridgePath(390, 452, 24, 20, 5, 844);
const RIDGE_MID = ridgePath(390, 548, 46, 9, 31, 844);
const GROUND_MAIN = ridgePath(390, 624, 32, 6, 47, 844);
const GROUND_NEAR = ridgePath(390, 750, 38, 7, 59, 844);

const CLOUDS = [
  blobPath(96, 88, 48, { squashY: 0.38, jitter: 0.24, bumps: 9, seed: 61 }),
  blobPath(300, 62, 40, { squashY: 0.4, jitter: 0.26, bumps: 9, seed: 67 }),
  blobPath(208, 128, 30, { squashY: 0.42, jitter: 0.26, bumps: 8, seed: 71 }),
];

const FG_TUFTS = [
  ...grassTuft(24, 846, 66, 6, 401),
  ...grassTuft(368, 846, 58, 5, 407),
  ...grassTuft(196, 848, 40, 4, 413),
  ...grassTuft(90, 850, 34, 3, 419),
  ...grassTuft(320, 852, 36, 3, 423),
];

function HabitatBackdrop({ night }: { night: boolean }) {
  const S = night ? SCENES.night : SCENES.day;
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={S.skyTop} />
            <Stop offset="0.52" stopColor={S.skyMid} />
            <Stop offset="1" stopColor={S.horizon} />
          </LinearGradient>
          <LinearGradient id="scene-ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={S.groundHi} />
            <Stop offset="1" stopColor={S.groundLo} />
          </LinearGradient>
          <RadialGradient id="scene-glow" cx="0.42" cy="0.4" r="0.64">
            <Stop offset="0" stopColor={S.glow} stopOpacity={S.glowOpacity} />
            <Stop offset="1" stopColor={S.glow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="scene-mist" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={S.mist} stopOpacity={S.mistOpacity} />
            <Stop offset="0.72" stopColor={S.mist} stopOpacity={S.mistOpacity * 0.55} />
            <Stop offset="1" stopColor={S.mist} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect width="390" height="844" fill="url(#scene-sky)" />

        {/* Luz ambiente — sol filtrado de dia, luar difuso à noite */}
        <Rect x="-40" y="-30" width="470" height="580" fill="url(#scene-glow)" />

        {/* Nuvens suaves — apenas de dia */}
        {night
          ? null
          : CLOUDS.map((d, i) => (
              <Path key={`cloud-${i}`} d={d} fill={S.cloud} opacity={0.42 - i * 0.08} />
            ))}

        {/* Colina distante e linha de floresta recortada (perspectiva atmosférica) */}
        <Path d={RIDGE_HILL_FAR} fill={S.ridgeHillFar} opacity={S.ridgeHillFarOpacity} />
        <Path d={RIDGE_FOREST_FAR} fill={S.ridgeForest} opacity={S.ridgeForestOpacity} />
        <Path d={RIDGE_MID} fill={S.ridgeMid} opacity={S.ridgeMidOpacity} />

        {/* Névoa da clareira — separa a árvore da floresta */}
        <Ellipse cx="195" cy="566" rx="272" ry="46" fill="url(#scene-mist)" />
        <Ellipse cx="118" cy="600" rx="190" ry="34" fill="url(#scene-mist)" opacity="0.7" />

        {/* Campo da clareira e relevo próximo */}
        <Path d={GROUND_MAIN} fill="url(#scene-ground)" />
        <Path d={GROUND_NEAR} fill={S.groundNear} opacity="0.92" />

        {/* Capim do primeiro plano */}
        {FG_TUFTS.map((d, i) => (
          <Path
            key={`fg-tuft-${i}`}
            d={d}
            stroke={S.grass}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
          />
        ))}
      </Svg>

      {/* Camada celeste com proporção fixa (círculos nunca deformam) */}
      <View style={StyleSheet.absoluteFill}>
        {night ? (
          <>
            <View style={styles.moonHaloOuter} />
            <View style={styles.moonHalo} />
            <View style={styles.moon} />
            {STARS.map((star, i) => (
              <View
                key={`star-${i}`}
                style={[
                  styles.star,
                  {
                    top: `${star.top}%`,
                    left: `${star.left}%`,
                    width: star.s,
                    height: star.s,
                    borderRadius: star.s,
                    opacity: star.o,
                  },
                ]}
              />
            ))}
            {FIREFLIES.map((fly, i) => (
              <View
                key={`fly-${i}`}
                style={[styles.firefly, { top: `${fly.top}%`, left: `${fly.left}%` }]}
              />
            ))}
          </>
        ) : (
          <>
            <View style={styles.sunHaloOuter} />
            <View style={styles.sunHalo} />
            <View style={styles.sun} />
            {POLLEN.map((mote, i) => (
              <View
                key={`pollen-${i}`}
                style={[
                  styles.pollen,
                  {
                    top: `${mote.top}%`,
                    left: `${mote.left}%`,
                    width: mote.s,
                    height: mote.s,
                    borderRadius: mote.s,
                    opacity: mote.o,
                  },
                ]}
              />
            ))}
          </>
        )}
      </View>
    </View>
  );
}

// Posições em % da janela — determinísticas para a cena ser estável entre renders.
const STARS = [
  { top: 5, left: 10, s: 2.5, o: 0.85 },
  { top: 9, left: 28, s: 1.5, o: 0.55 },
  { top: 4, left: 46, s: 2, o: 0.75 },
  { top: 12, left: 63, s: 1.5, o: 0.5 },
  { top: 7, left: 81, s: 2, o: 0.7 },
  { top: 16, left: 91, s: 1.5, o: 0.45 },
  { top: 18, left: 20, s: 1.5, o: 0.5 },
  { top: 22, left: 54, s: 2, o: 0.6 },
  { top: 15, left: 40, s: 1.2, o: 0.4 },
  { top: 25, left: 77, s: 1.4, o: 0.4 },
  { top: 3, left: 68, s: 1.3, o: 0.55 },
  { top: 21, left: 7, s: 1.8, o: 0.55 },
];

const FIREFLIES = [
  { top: 58, left: 14 },
  { top: 66, left: 80 },
  { top: 72, left: 28 },
  { top: 62, left: 62 },
  { top: 76, left: 86 },
  { top: 70, left: 6 },
];

const POLLEN = [
  { top: 20, left: 16, s: 4, o: 0.4 },
  { top: 14, left: 70, s: 3, o: 0.35 },
  { top: 30, left: 85, s: 3.5, o: 0.3 },
  { top: 36, left: 9, s: 3, o: 0.3 },
  { top: 26, left: 45, s: 2.5, o: 0.35 },
  { top: 44, left: 68, s: 3, o: 0.25 },
];

// =============================================================================
// TEMA — dia e noite são o mesmo lugar em horas diferentes
// =============================================================================

const SCENES = {
  day: {
    skyTop: "#F6EFDB",
    skyMid: "#E0E1C1",
    horizon: "#BCC79A",
    glow: "#FBF1D6",
    glowOpacity: 0.75,
    cloud: "#FFFDF3",
    ridgeHillFar: "#B8C49A",
    ridgeHillFarOpacity: 0.5,
    ridgeForest: "#9DAF7F",
    ridgeForestOpacity: 0.65,
    ridgeMid: "#89996B",
    ridgeMidOpacity: 0.85,
    groundHi: "#7F9163",
    groundLo: "#495436",
    groundNear: "#3E4A2E",
    grass: "#33402A",
    mist: "#FBF4E2",
    mistOpacity: 0.4,
  },
  night: {
    skyTop: "#141B27",
    skyMid: "#1E2A30",
    horizon: "#2C3B36",
    glow: "#C7D4C2",
    glowOpacity: 0.22,
    cloud: "#FFFFFF",
    ridgeHillFar: "#22302E",
    ridgeHillFarOpacity: 0.9,
    ridgeForest: "#1E2A26",
    ridgeForestOpacity: 0.95,
    ridgeMid: "#1A251D",
    ridgeMidOpacity: 0.95,
    groundHi: "#2A3724",
    groundLo: "#141C10",
    groundNear: "#0F150B",
    grass: "#0B100A",
    mist: "#A8C0A6",
    mistOpacity: 0.12,
  },
} as const;

const THEMES = {
  day: {
    sceneBase: "#F6EFDB",
    ink: "#37362B",
    inkSoft: "#6E6655",
    accent: "#B07D52",
    rule: "rgba(90, 70, 50, 0.32)",
    panelBg: "rgba(251, 246, 234, 0.6)",
    panelBorder: "rgba(90, 70, 50, 0.16)",
    track: "rgba(90, 70, 50, 0.14)",
    fill: "#6F7F5C",
    badgeBg: "rgba(157, 171, 133, 0.22)",
    badgeBorder: "rgba(111, 127, 92, 0.3)",
    badgeText: "#4B543C",
    dot: "#6F7F5C",
    pillBg: "rgba(251, 246, 234, 0.92)",
    spinner: "#6F7F5C",
    modalBg: "#FBF6EA",
    button: "#6F7F5C",
    buttonText: "#FBF6EA",
  },
  night: {
    sceneBase: "#141B27",
    ink: "#F0E9D6",
    inkSoft: "rgba(240, 233, 214, 0.74)",
    accent: "#D9A97C",
    rule: "rgba(240, 233, 214, 0.3)",
    panelBg: "rgba(15, 21, 15, 0.55)",
    panelBorder: "rgba(240, 233, 214, 0.16)",
    track: "rgba(240, 233, 214, 0.16)",
    fill: "#9DB87A",
    badgeBg: "rgba(157, 184, 122, 0.16)",
    badgeBorder: "rgba(157, 184, 122, 0.34)",
    badgeText: "#CFE0B0",
    dot: "#9DB87A",
    pillBg: "rgba(15, 21, 15, 0.85)",
    spinner: "#9DB87A",
    modalBg: "#1E2620",
    button: "#7E9A5C",
    buttonText: "#F6F2E4",
  },
} as const;

// Vidro real no web; nas plataformas nativas o rgba translúcido já basta.
const GLASS_WEB =
  Platform.OS === "web"
    ? ({ backdropFilter: "blur(18px) saturate(1.15)" } as any)
    : null;

const styles = StyleSheet.create({
  container: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  content: {
    flexGrow: 1,
    alignItems: "center",
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 56,
  },

  header: { alignItems: "center", paddingHorizontal: 8, maxWidth: 560 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrowRule: { width: 26, height: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 30,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
    maxWidth: 310,
  },

  treeStage: {
    marginTop: 2,
    alignSelf: "center",
  },
  loadingLeavesPill: {
    position: "absolute",
    right: 18,
    top: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  loadingLeavesText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },

  progressPanel: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
  },
  levelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  levelHeaderText: { flex: 1 },
  panelEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  levelRow: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 6, flexWrap: "wrap" },
  levelTitle: {
    fontFamily: Fonts.serif,
    fontSize: 21,
    fontWeight: "600",
  },
  milestoneText: {
    fontSize: 13.5,
    letterSpacing: 0.2,
  },
  vitalityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  vitalityDot: { width: 7, height: 7, borderRadius: 999 },
  vitalityBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 15,
  },
  progressFill: { height: "100%", borderRadius: 999 },
  progressMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 9,
  },
  progressValue: {
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  progressText: { fontSize: 12.5, lineHeight: 18 },

  themeToggle: {
    position: "absolute",
    right: 18,
    zIndex: 40,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1A1710",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

  // Céu — astros e partículas
  sun: {
    position: "absolute",
    top: "9%",
    left: "10%",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FBEFCB",
  },
  sunHalo: {
    position: "absolute",
    top: "9%",
    left: "10%",
    width: 54,
    height: 54,
    borderRadius: 54,
    transform: [{ scale: 2 }],
    backgroundColor: "rgba(251, 239, 203, 0.18)",
  },
  sunHaloOuter: {
    position: "absolute",
    top: "9%",
    left: "10%",
    width: 54,
    height: 54,
    borderRadius: 54,
    transform: [{ scale: 3.4 }],
    backgroundColor: "rgba(251, 239, 203, 0.08)",
  },
  moon: {
    position: "absolute",
    top: "8%",
    left: "10%",
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F1EAD4",
  },
  moonHalo: {
    position: "absolute",
    top: "8%",
    left: "10%",
    width: 58,
    height: 58,
    borderRadius: 60,
    transform: [{ scale: 1.9 }],
    backgroundColor: "rgba(241, 234, 212, 0.1)",
  },
  moonHaloOuter: {
    position: "absolute",
    top: "8%",
    left: "10%",
    width: 58,
    height: 58,
    borderRadius: 60,
    transform: [{ scale: 3 }],
    backgroundColor: "rgba(241, 234, 212, 0.05)",
  },
  star: {
    position: "absolute",
    backgroundColor: "#EFE9D2",
  },
  firefly: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#F6E7A8",
    shadowColor: "#F6E7A8",
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    opacity: 0.85,
  },
  pollen: {
    position: "absolute",
    backgroundColor: "#F6EFD8",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(20, 18, 12, 0.55)",
    justifyContent: "center",
    padding: 26,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    borderRadius: 32,
    padding: 28,
    borderWidth: 1,
    shadowColor: "#0E0C07",
    shadowOpacity: 0.3,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 22 },
    elevation: 12,
  },
  modalLabelRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 },
  modalLeafGlyph: {
    width: 10,
    height: 10,
    borderTopLeftRadius: 10,
    borderBottomRightRadius: 10,
    transform: [{ rotate: "45deg" }],
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  modalTitle: {
    fontFamily: Fonts.serif,
    fontSize: 27,
    fontWeight: "600",
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  modalMessage: { fontSize: 16.5, lineHeight: 27 },
  closeButton: {
    paddingVertical: 16,
    borderRadius: 18,
    marginTop: 26,
    alignItems: "center",
  },
  closeText: { fontWeight: "700", fontSize: 15, letterSpacing: 0.6 },
});
