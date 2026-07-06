import React from "react";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import { grassBladePath, organicBlobPath, seededUnit } from "@/lib/organic-paths";
import { AppHeader } from "./AppHeader";
import { HabitatThemeToggle } from "./HabitatThemeToggle";
import HabitatTree from "./HabitatTree";

interface HabitatSceneProps {
  onLeafPress: (index: number) => void;
  vitalityScore: number;
  vitalityLabel: string;
  loadingLeaves: boolean;
  visualLevel: number;
  previewXp?: number;
}

type DistantTree = {
  x: number;
  base: number;
  height: number;
  width: number;
  lean: number;
  seed: number;
};

const DISTANT_TREES: DistantTree[] = Array.from({ length: 34 }, (_, index) => {
  const seed = 40 + index * 1.73;
  return {
    x: -24 + index * 13 + seededUnit(seed, 1) * 10,
    base: 528 + seededUnit(seed, 2) * 48,
    height: 132 + seededUnit(seed, 3) * 172,
    width: 9 + seededUnit(seed, 4) * 18,
    lean: -14 + seededUnit(seed, 5) * 28,
    seed,
  };
});

const GRASS_BLADES = Array.from({ length: 160 }, (_, index) => {
  const seed = 82 + index * 2.21;
  return {
    x: -16 + seededUnit(seed, 1) * 424,
    y: 746 + seededUnit(seed, 2) * 20,
    height: 28 + seededUnit(seed, 3) * 92,
    bend: -26 + seededUnit(seed, 4) * 52,
    width: 2.4 + seededUnit(seed, 5) * 4.5,
    seed,
  };
});

const FERN_FRONDS = Array.from({ length: 28 }, (_, index) => {
  const seed = 130 + index * 3.4;
  return {
    x: 10 + seededUnit(seed, 1) * 370,
    y: 712 + seededUnit(seed, 2) * 36,
    height: 40 + seededUnit(seed, 3) * 54,
    lean: -34 + seededUnit(seed, 4) * 68,
    seed,
  };
});

const FIREFLIES = [
  { x: 58, y: 458, r: 6, seed: 3.2, opacity: 0.72 },
  { x: 92, y: 526, r: 4, seed: 4.8, opacity: 0.48 },
  { x: 318, y: 436, r: 5, seed: 5.9, opacity: 0.64 },
  { x: 351, y: 556, r: 4, seed: 6.6, opacity: 0.44 },
  { x: 246, y: 486, r: 3, seed: 7.4, opacity: 0.36 },
  { x: 138, y: 612, r: 4, seed: 8.2, opacity: 0.42 },
  { x: 64, y: 622, r: 3, seed: 8.9, opacity: 0.36 },
  { x: 178, y: 514, r: 4, seed: 9.6, opacity: 0.5 },
  { x: 216, y: 392, r: 3, seed: 10.2, opacity: 0.4 },
  { x: 296, y: 604, r: 5, seed: 10.8, opacity: 0.46 },
  { x: 372, y: 486, r: 3, seed: 11.3, opacity: 0.34 },
  { x: 122, y: 426, r: 3, seed: 12.1, opacity: 0.38 },
  { x: 268, y: 552, r: 4, seed: 12.7, opacity: 0.44 },
  { x: 36, y: 548, r: 3, seed: 13.4, opacity: 0.3 },
] as const;

const SKY_SPARKS = Array.from({ length: 46 }, (_, index) => {
  const seed = 250 + index * 1.8;
  return {
    x: 18 + seededUnit(seed, 1) * 354,
    y: 38 + seededUnit(seed, 2) * 210,
    size: 0.8 + seededUnit(seed, 3) * 1.7,
    opacity: 0.16 + seededUnit(seed, 4) * 0.58,
    seed,
  };
});

const GROUND_BLOOMS = Array.from({ length: 36 }, (_, index) => {
  const seed = 310 + index * 2.6;
  return {
    x: 18 + seededUnit(seed, 1) * 354,
    y: 678 + seededUnit(seed, 2) * 64,
    size: 4 + seededUnit(seed, 3) * 5,
    seed,
    minLevel: index < 18 ? 6.62 : index < 30 ? 9.45 : 10.8,
  };
});

export function HabitatScene({
  onLeafPress,
  vitalityScore,
  vitalityLabel,
  loadingLeaves,
  visualLevel,
  previewXp,
}: HabitatSceneProps) {
  const { height } = useWindowDimensions();
  const { theme } = useRootineTheme();
  const styles = createStyles(theme);
  const sceneHeight = Math.max(640, Math.round(height * 0.82));

  return (
    <View style={[styles.scene, { minHeight: sceneHeight }]}>
      <HabitatPainterlyBackdrop visualLevel={visualLevel} />
      <AppHeader
        eyebrow="Habitat"
        title="A Árvore Ancestral"
        variant="scene"
        action={<HabitatThemeToggle />}
      />

      <View style={styles.treeStage}>
        <HabitatTree
          onLeafPress={onLeafPress}
          previewXp={previewXp}
          vitalityScore={vitalityScore}
        />
      </View>

      <HabitatForeground visualLevel={visualLevel} />

      <View style={styles.sceneFooter}>
        <Text style={styles.vitalityText}>Vitalidade {vitalityLabel}</Text>
        <Text style={styles.sceneHint}>Toque nas folhas luminosas para abrir memórias criadas a partir de sua jornada.</Text>
      </View>

      {loadingLeaves ? (
        <View style={styles.loadingLeavesPill}>
          <ActivityIndicator color={theme.colors.primaryStrong} size="small" />
          <Text style={styles.loadingLeavesText}>Atualizando folhas</Text>
        </View>
      ) : null}
    </View>
  );
}

function HabitatPainterlyBackdrop({ visualLevel }: { visualLevel: number }) {
  const { theme } = useRootineTheme();
  const habitat = theme.habitat;
  const isDark = theme.mode === "dark";

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 760" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="habitat-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={habitat.skyTop} />
            <Stop offset="0.48" stopColor={habitat.skyMid} />
            <Stop offset="1" stopColor={habitat.skyLow} />
          </LinearGradient>
          <LinearGradient id="habitat-ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={habitat.midHill} />
            <Stop offset="0.64" stopColor={habitat.nearGround} />
            <Stop offset="1" stopColor={habitat.foreground} />
          </LinearGradient>
          <RadialGradient id="habitat-solar-glow" cx="82%" cy="15%" r="42%">
            <Stop offset="0" stopColor={habitat.warmGlow} stopOpacity={isDark ? 0.1 : 0.46} />
            <Stop offset="0.48" stopColor={habitat.warmGlow} stopOpacity={isDark ? 0.04 : 0.2} />
            <Stop offset="1" stopColor={habitat.warmGlow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="habitat-moon-glow" cx="82%" cy="12%" r="32%">
            <Stop offset="0" stopColor={habitat.coolGlow} stopOpacity="0.34" />
            <Stop offset="0.55" stopColor={habitat.coolGlow} stopOpacity="0.12" />
            <Stop offset="1" stopColor={habitat.coolGlow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="habitat-firefly-glow" cx="50%" cy="50%" r="64%">
            <Stop offset="0" stopColor={habitat.firefly} stopOpacity="0.72" />
            <Stop offset="0.42" stopColor={habitat.firefly} stopOpacity="0.2" />
            <Stop offset="1" stopColor={habitat.firefly} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect width="390" height="760" fill="url(#habitat-sky)" />
        <Rect width="390" height="760" fill={isDark ? "url(#habitat-moon-glow)" : "url(#habitat-solar-glow)"} />

        {isDark ? (
          <NightSky />
        ) : (
          <G>
            <Path
              d={organicBlobPath(324, 86, 28, 27, 11.4, 12, 0.14)}
              fill={habitat.sun}
              opacity="0.78"
            />
            <Path
              d="M52 144 C111 111 166 128 220 102 C276 76 323 94 382 62"
              fill="none"
              stroke={habitat.cloud}
              strokeLinecap="round"
              strokeWidth="22"
              opacity="0.24"
            />
          </G>
        )}

        <Path
          d="M-16 315 C42 260 106 283 157 237 C220 179 278 205 406 138 L406 760 L-16 760 Z"
          fill={habitat.farHill}
          opacity={isDark ? 0.38 : 0.54}
        />
        <DistantForestLayer visualLevel={visualLevel} />
        <Path
          d="M-18 432 C52 355 126 393 198 338 C270 283 321 299 412 239 L412 760 L-18 760 Z"
          fill={habitat.midHill}
          opacity={isDark ? 0.64 : 0.72}
        />
        <Path
          d="M0 563 C64 500 119 530 184 481 C251 430 308 446 390 392 L390 760 L0 760 Z"
          fill="url(#habitat-ground)"
        />

        <UnderstoryLayer visualLevel={visualLevel} />

        <Path
          d="M0 696 C72 666 134 689 191 662 C249 633 319 641 390 605 L390 760 L0 760 Z"
          fill={habitat.foreground}
          opacity={isDark ? 0.94 : 0.88}
        />
        <Path
          d="M-12 626 C45 604 99 616 154 591 C225 557 292 584 402 527"
          fill="none"
          stroke={habitat.mist}
          strokeLinecap="round"
          strokeWidth="18"
          opacity={isDark ? 0.42 : 0.62}
        />
        <Path
          d="M0 710 C65 684 130 704 190 677 C251 649 317 656 390 628"
          fill="none"
          stroke={habitat.canopyMist}
          strokeLinecap="round"
          strokeWidth="12"
          opacity={isDark ? 0.3 : 0.48}
        />
        <Rect width="390" height="760" fill={habitat.vignette} />
      </Svg>
    </View>
  );
}

function DistantForestLayer({ visualLevel }: { visualLevel: number }) {
  const { theme } = useRootineTheme();
  const habitat = theme.habitat;
  const isDark = theme.mode === "dark";
  const grove = unlock(visualLevel, 6.8, 1);
  const reference = unlock(visualLevel, 10.8, 0.8);

  return (
    <G opacity={isDark ? 0.48 + grove * 0.18 : 0.54 + grove * 0.22}>
      {DISTANT_TREES.map((tree, index) => {
        const visible = index < 16 ? 1 : unlock(visualLevel, 6.75 + (index % 7) * 0.16, 0.62);
        return (
          <G key={tree.seed}>
            <Path
              d={distantTrunkPath(tree)}
              fill={habitat.forestShadow}
              opacity={(isDark ? 0.46 : 0.28) * visible}
            />
            <Path
              d={organicBlobPath(
                tree.x + tree.lean * 0.42,
                tree.base - tree.height + 32,
                tree.width * 2.1,
                tree.height * 0.23,
                tree.seed,
                10,
                0.34,
              )}
              fill={indexTreeColor(tree.seed, habitat)}
              opacity={(isDark ? 0.32 + reference * 0.12 : 0.44 + reference * 0.16) * visible}
            />
          </G>
        );
      })}
    </G>
  );
}

function UnderstoryLayer({ visualLevel }: { visualLevel: number }) {
  const { theme } = useRootineTheme();
  const habitat = theme.habitat;
  const isDark = theme.mode === "dark";
  const habitatAlive = unlock(visualLevel, 6.62, 0.42);
  const ecosystem = unlock(visualLevel, 9.45, 0.75);

  return (
    <G>
      <Path
        d={organicBlobPath(68, 629, 70, 33, 91.4, 13, 0.42)}
        fill={habitat.forestDeep}
        opacity={isDark ? 0.48 + habitatAlive * 0.16 : 0.42 + habitatAlive * 0.18}
      />
      <Path
        d={organicBlobPath(321, 613, 78, 36, 92.8, 13, 0.38)}
        fill={habitat.forestDeep}
        opacity={isDark ? 0.46 + habitatAlive * 0.18 : 0.38 + habitatAlive * 0.18}
      />
      <Path
        d={organicBlobPath(196, 655, 98, 28, 94.3, 13, 0.36)}
        fill={habitat.grass}
        opacity={isDark ? 0.36 + ecosystem * 0.18 : 0.32 + ecosystem * 0.2}
      />
      {FERN_FRONDS.slice(0, 17).map((fern) => (
        <Fern
          key={fern.seed}
          fern={fern}
          opacity={(isDark ? 0.34 : 0.44) + habitatAlive * 0.16 + ecosystem * 0.08}
        />
      ))}
      <G opacity={habitatAlive}>
        <Path
          d={organicBlobPath(44, 675, 42, 18, 106.7, 12, 0.42)}
          fill={habitat.fern}
          opacity={isDark ? 0.42 : 0.52}
        />
        <Path
          d={organicBlobPath(348, 665, 48, 20, 107.9, 12, 0.38)}
          fill={habitat.grassLight}
          opacity={isDark ? 0.26 : 0.34}
        />
        <Path
          d={organicBlobPath(190, 685, 74, 18, 108.4, 13, 0.4)}
          fill={habitat.grassLight}
          opacity={isDark ? 0.2 : 0.28}
        />
        <Path
          d={organicBlobPath(248, 640, 54, 24, 108.9, 13, 0.38)}
          fill={habitat.forestDeep}
          opacity={isDark ? 0.28 : 0.24}
        />
      </G>
      <G opacity={ecosystem}>
        <Path
          d={organicBlobPath(110, 693, 58, 22, 109.2, 13, 0.4)}
          fill={habitat.fern}
          opacity={isDark ? 0.44 : 0.54}
        />
        <Path
          d={organicBlobPath(278, 688, 64, 24, 110.6, 13, 0.36)}
          fill={habitat.forestDeep}
          opacity={isDark ? 0.5 : 0.42}
        />
        <Path
          d={organicBlobPath(37, 711, 70, 24, 111.9, 13, 0.38)}
          fill={habitat.grass}
          opacity={isDark ? 0.48 : 0.38}
        />
        <Path
          d={organicBlobPath(352, 716, 74, 26, 112.8, 13, 0.36)}
          fill={habitat.fern}
          opacity={isDark ? 0.44 : 0.48}
        />
      </G>
      {theme.mode === "dark" ? <FireflyLayer visualLevel={visualLevel} /> : null}
    </G>
  );
}

function HabitatForeground({ visualLevel }: { visualLevel: number }) {
  const { theme } = useRootineTheme();
  const habitat = theme.habitat;
  const isDark = theme.mode === "dark";
  const habitatAlive = unlock(visualLevel, 6.62, 0.42);
  const ecosystem = unlock(visualLevel, 9.45, 0.75);
  const reference = unlock(visualLevel, 10.8, 0.75);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 760" preserveAspectRatio="none">
        <G opacity={isDark ? 0.5 + habitatAlive * 0.18 + ecosystem * 0.12 : 0.64 + habitatAlive * 0.2 + ecosystem * 0.1}>
          {GRASS_BLADES.map((blade, index) => (
            <Path
              key={blade.seed}
              d={grassBladePath(blade.x, blade.y, blade.height, blade.bend, blade.width)}
              fill={index % 3 === 0 ? habitat.grassLight : habitat.grass}
              opacity={0.24 + seededUnit(blade.seed, 7) * 0.52}
            />
          ))}
        </G>
        <G opacity={(isDark ? 0.4 : 0.5) + ecosystem * 0.18}>
          {FERN_FRONDS.slice(17).map((fern) => (
            <Fern key={fern.seed} fern={fern} opacity={0.7} />
          ))}
        </G>
        <G opacity={habitatAlive}>
          {GROUND_BLOOMS.map((bloom, index) => {
            const visible = unlock(visualLevel, bloom.minLevel, 0.55);
            if (visible <= 0) return null;

            return (
              <GroundBloom
                key={bloom.seed}
                color={index % 3 === 0 ? habitat.blossom : index % 3 === 1 ? habitat.flower : habitat.flowerAlt}
                opacity={visible * (0.52 + reference * 0.22)}
                seed={bloom.seed}
                size={bloom.size}
                x={bloom.x}
                y={bloom.y}
              />
            );
          })}
        </G>
        <Path
          d="M0 742 C83 718 139 742 201 719 C268 694 327 715 390 696 L390 760 L0 760 Z"
          fill={habitat.foreground}
          opacity={isDark ? 0.76 : 0.5}
        />
      </Svg>
    </View>
  );
}

function NightSky() {
  const { theme } = useRootineTheme();
  const habitat = theme.habitat;

  return (
    <G>
      <Path
        d={organicBlobPath(324, 86, 24, 24, 12.9, 12, 0.1)}
        fill={habitat.moon}
        opacity="0.94"
      />
      <Path
        d={organicBlobPath(335, 76, 24, 24, 14.1, 12, 0.1)}
        fill={habitat.skyTop}
        opacity="0.82"
      />
      {SKY_SPARKS.map((spark) => (
        <Path
          key={spark.seed}
          d={organicBlobPath(spark.x, spark.y, spark.size, spark.size * 0.76, spark.seed, 7, 0.42)}
          fill={habitat.skySpark}
          opacity={spark.opacity}
        />
      ))}
    </G>
  );
}

function FireflyLayer({ visualLevel }: { visualLevel: number }) {
  const { theme } = useRootineTheme();
  const habitat = theme.habitat;
  const habitatAlive = unlock(visualLevel, 6.62, 0.42);
  const ecosystem = unlock(visualLevel, 9.45, 0.75);

  return (
    <G>
      {FIREFLIES.map((firefly) => (
        <G key={firefly.seed} opacity={firefly.opacity * (0.42 + habitatAlive * 0.38 + ecosystem * 0.2)}>
          <Path
            d={organicBlobPath(firefly.x, firefly.y, firefly.r * 5.2, firefly.r * 4.2, firefly.seed, 9, 0.36)}
            fill="url(#habitat-firefly-glow)"
          />
          <Path
            d={organicBlobPath(firefly.x, firefly.y, firefly.r * 0.86, firefly.r * 0.68, firefly.seed + 1, 7, 0.28)}
            fill={habitat.firefly}
          />
        </G>
      ))}
    </G>
  );
}

function GroundBloom({
  color,
  opacity,
  seed,
  size,
  x,
  y,
}: {
  color: string;
  opacity: number;
  seed: number;
  size: number;
  x: number;
  y: number;
}) {
  return (
    <G opacity={opacity}>
      <Path d={organicBlobPath(x, y, size * 1.8, size * 0.8, seed, 7, 0.42)} fill={color} opacity="0.42" />
      <Path d={organicBlobPath(x - size * 0.9, y + size * 0.2, size, size * 0.55, seed + 1, 7, 0.34)} fill={color} opacity="0.72" />
      <Path d={organicBlobPath(x + size * 0.9, y - size * 0.1, size, size * 0.55, seed + 2, 7, 0.34)} fill={color} opacity="0.68" />
    </G>
  );
}

function Fern({
  fern,
  opacity,
}: {
  fern: (typeof FERN_FRONDS)[number];
  opacity: number;
}) {
  const { theme } = useRootineTheme();
  const habitat = theme.habitat;
  const tipX = fern.x + fern.lean;
  const tipY = fern.y - fern.height;

  return (
    <G opacity={opacity}>
      <Path
        d={`M ${fern.x} ${fern.y} C ${fern.x + fern.lean * 0.1} ${fern.y - fern.height * 0.42} ${fern.x + fern.lean * 0.62} ${fern.y - fern.height * 0.74} ${tipX} ${tipY}`}
        fill="none"
        stroke={habitat.fern}
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      {Array.from({ length: 7 }, (_, index) => {
        const t = (index + 1) / 8;
        const x = fern.x + fern.lean * (t * t);
        const y = fern.y - fern.height * t;
        const side = index % 2 === 0 ? -1 : 1;
        const size = 9 + seededUnit(fern.seed, index + 8) * 9;

        return (
          <Path
            key={`${fern.seed}-${index}`}
            d={grassBladePath(x, y + 4, size, side * (8 + size * 0.36), 2.6)}
            fill={index % 3 === 0 ? habitat.grassLight : habitat.fern}
            opacity="0.7"
          />
        );
      })}
    </G>
  );
}

function distantTrunkPath(tree: DistantTree) {
  const topX = tree.x + tree.lean;
  const topY = tree.base - tree.height;
  const baseWidth = tree.width * 0.52;
  const topWidth = tree.width * 0.18;

  return [
    `M ${tree.x - baseWidth} ${tree.base}`,
    `C ${tree.x - baseWidth * 0.7} ${tree.base - tree.height * 0.36} ${topX - topWidth * 1.8} ${tree.base - tree.height * 0.72} ${topX - topWidth} ${topY}`,
    `C ${topX + topWidth * 1.2} ${topY + tree.height * 0.22} ${tree.x + baseWidth * 0.78} ${tree.base - tree.height * 0.28} ${tree.x + baseWidth} ${tree.base}`,
    "Z",
  ].join(" ");
}

function indexTreeColor(seed: number, habitat: RootineTheme["habitat"]) {
  const value = seededUnit(seed, 11);
  if (value > 0.66) return habitat.forestHaze;
  if (value > 0.33) return habitat.forestDeep;
  return habitat.forestShadow;
}

function unlock(visualLevel: number, startLevel: number, span = 0.5) {
  const raw = Math.max(0, Math.min(1, (visualLevel - startLevel) / span));
  return raw * raw * (3 - 2 * raw);
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    scene: {
      width: "100%",
      overflow: "hidden",
      backgroundColor: theme.habitat.skyLow,
    },
    treeStage: {
      position: "absolute",
      left: -20,
      right: -20,
      top: 112,
      bottom: -8,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    sceneFooter: {
      position: "absolute",
      left: 20,
      right: 20,
      bottom: 18,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 8,
      backgroundColor: theme.habitat.sceneInfoSurface,
      borderWidth: 1,
      borderColor: theme.habitat.sceneInfoBorder,
    },
    vitalityText: {
      color: theme.habitat.sceneInfoText,
      fontSize: 13,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0,
    },
    sceneHint: {
      color: theme.habitat.sceneInfoTextMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
      fontWeight: "600",
    },
    loadingLeavesPill: {
      position: "absolute",
      right: 20,
      top: 154,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.transparentSurfaceStrong,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    loadingLeavesText: {
      color: theme.colors.primaryStrong,
      fontSize: 12,
      fontWeight: "800",
    },
  });
