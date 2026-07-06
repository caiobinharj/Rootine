import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import { getLevelFromXp } from "@/lib/domain/xp";
import { almondLeafPath, organicBlobPath, seededUnit } from "@/lib/organic-paths";
import { useEcoStore } from "@/store/useEcoStore";
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

interface HabitatTreeProps {
  onLeafPress?: (index: number) => void;
  vitalityScore?: number;
  previewXp?: number;
}

type CanopyTone = "deep" | "mid" | "light" | "dry";

type Branch = {
  d: string;
  width: number;
  minLevel: number;
  opacity: number;
};

type CanopyCluster = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  seed: number;
  minLevel: number;
  tone: CanopyTone;
  layer: "back" | "mid" | "front";
};

type SmallLeaf = {
  x: number;
  y: number;
  size: number;
  rotation: number;
  minLevel: number;
  tone: CanopyTone;
  seed: number;
};

type MarkerLeaf = {
  label: string;
  x: number;
  y: number;
  rotation: number;
  seed: number;
};

const MEMORY_LEAVES: MarkerLeaf[] = [
  { label: "I", x: 132, y: 253, rotation: -23, seed: 31.4 },
  { label: "II", x: 291, y: 210, rotation: 18, seed: 32.2 },
  { label: "III", x: 324, y: 354, rotation: 12, seed: 33.9 },
  { label: "IV", x: 111, y: 414, rotation: -14, seed: 34.6 },
];

const EARLY_MEMORY_LEAVES: MarkerLeaf[] = [
  { label: "I", x: 165, y: 692, rotation: -42, seed: 41.4 },
  { label: "II", x: 250, y: 681, rotation: 38, seed: 42.2 },
  { label: "III", x: 282, y: 728, rotation: 18, seed: 43.9 },
  { label: "IV", x: 132, y: 730, rotation: -22, seed: 44.6 },
];

const SAPLING_LEAVES: SmallLeaf[] = [
  { x: 196, y: 672, size: 48, rotation: -50, minLevel: 0.82, tone: "mid", seed: 70.1 },
  { x: 234, y: 664, size: 52, rotation: 42, minLevel: 0.9, tone: "light", seed: 70.8 },
  { x: 214, y: 618, size: 42, rotation: 8, minLevel: 1.45, tone: "light", seed: 71.3 },
  { x: 180, y: 608, size: 39, rotation: -64, minLevel: 1.7, tone: "mid", seed: 72.7 },
  { x: 252, y: 598, size: 40, rotation: 58, minLevel: 1.82, tone: "mid", seed: 73.2 },
  { x: 196, y: 548, size: 42, rotation: -28, minLevel: 2.35, tone: "light", seed: 74.9 },
  { x: 238, y: 536, size: 46, rotation: 30, minLevel: 2.48, tone: "mid", seed: 75.6 },
  { x: 162, y: 510, size: 39, rotation: -68, minLevel: 3.25, tone: "mid", seed: 76.4 },
  { x: 272, y: 496, size: 41, rotation: 66, minLevel: 3.3, tone: "light", seed: 77.1 },
  { x: 210, y: 474, size: 45, rotation: -6, minLevel: 3.35, tone: "light", seed: 78.3 },
  { x: 141, y: 552, size: 34, rotation: -82, minLevel: 3.65, tone: "deep", seed: 79.1 },
  { x: 297, y: 532, size: 36, rotation: 80, minLevel: 3.72, tone: "mid", seed: 79.8 },
  { x: 186, y: 450, size: 36, rotation: -30, minLevel: 3.9, tone: "light", seed: 80.2 },
  { x: 246, y: 438, size: 38, rotation: 36, minLevel: 3.95, tone: "mid", seed: 80.9 },
];

const STRUCTURAL_BRANCHES: Branch[] = [
  { d: "M207 604 C181 585 159 563 139 536", width: 11, minLevel: 4.55, opacity: 0.66 },
  { d: "M222 588 C248 558 274 534 308 513", width: 12, minLevel: 4.68, opacity: 0.68 },
  { d: "M211 514 C174 475 132 436 79 388", width: 20, minLevel: 4.92, opacity: 0.84 },
  { d: "M220 449 C261 402 302 361 363 325", width: 19, minLevel: 5.08, opacity: 0.84 },
  { d: "M204 390 C164 350 129 312 88 260", width: 17, minLevel: 5.42, opacity: 0.76 },
  { d: "M224 374 C248 314 284 254 339 201", width: 17, minLevel: 5.62, opacity: 0.78 },
  { d: "M210 312 C195 262 178 218 142 182", width: 12, minLevel: 6.2, opacity: 0.66 },
  { d: "M228 293 C250 232 266 181 300 132", width: 12, minLevel: 6.35, opacity: 0.66 },
  { d: "M199 566 C165 548 126 517 92 476", width: 14, minLevel: 7.1, opacity: 0.58 },
  { d: "M237 548 C269 516 309 481 356 456", width: 14, minLevel: 7.35, opacity: 0.58 },
  { d: "M202 650 C164 640 122 647 84 674", width: 10, minLevel: 8.55, opacity: 0.46 },
  { d: "M245 650 C290 636 334 642 374 672", width: 10, minLevel: 8.75, opacity: 0.46 },
];

const CANOPY_CLUSTERS: CanopyCluster[] = [
  { cx: 185, cy: 438, rx: 84, ry: 60, seed: 1.12, minLevel: 4.35, tone: "mid", layer: "back" },
  { cx: 254, cy: 424, rx: 88, ry: 62, seed: 2.41, minLevel: 4.45, tone: "mid", layer: "back" },
  { cx: 207, cy: 359, rx: 96, ry: 68, seed: 3.18, minLevel: 4.65, tone: "light", layer: "mid" },
  { cx: 128, cy: 399, rx: 82, ry: 64, seed: 5.34, minLevel: 4.88, tone: "deep", layer: "mid" },
  { cx: 304, cy: 382, rx: 86, ry: 68, seed: 7.71, minLevel: 4.95, tone: "deep", layer: "mid" },
  { cx: 166, cy: 283, rx: 106, ry: 78, seed: 8.86, minLevel: 5.15, tone: "deep", layer: "back" },
  { cx: 258, cy: 268, rx: 116, ry: 82, seed: 9.14, minLevel: 5.25, tone: "mid", layer: "back" },
  { cx: 205, cy: 196, rx: 100, ry: 80, seed: 10.28, minLevel: 5.42, tone: "mid", layer: "back" },
  { cx: 102, cy: 333, rx: 94, ry: 86, seed: 11.5, minLevel: 5.55, tone: "deep", layer: "mid" },
  { cx: 286, cy: 378, rx: 100, ry: 80, seed: 12.63, minLevel: 5.62, tone: "mid", layer: "mid" },
  { cx: 151, cy: 420, rx: 104, ry: 78, seed: 13.7, minLevel: 5.7, tone: "deep", layer: "front" },
  { cx: 244, cy: 320, rx: 108, ry: 80, seed: 14.92, minLevel: 5.78, tone: "light", layer: "front" },
  { cx: 303, cy: 177, rx: 88, ry: 68, seed: 15.15, minLevel: 6.05, tone: "light", layer: "front" },
  { cx: 127, cy: 205, rx: 86, ry: 70, seed: 16.46, minLevel: 6.12, tone: "mid", layer: "front" },
  { cx: 225, cy: 116, rx: 92, ry: 62, seed: 17.53, minLevel: 6.22, tone: "light", layer: "front" },
  { cx: 64, cy: 314, rx: 78, ry: 72, seed: 18.12, minLevel: 6.55, tone: "mid", layer: "mid" },
  { cx: 354, cy: 301, rx: 78, ry: 68, seed: 19.68, minLevel: 6.65, tone: "light", layer: "front" },
  { cx: 86, cy: 478, rx: 76, ry: 58, seed: 20.44, minLevel: 7.05, tone: "deep", layer: "front" },
  { cx: 338, cy: 454, rx: 84, ry: 62, seed: 21.35, minLevel: 7.2, tone: "mid", layer: "front" },
  { cx: 214, cy: 78, rx: 82, ry: 50, seed: 22.18, minLevel: 7.35, tone: "light", layer: "front" },
  { cx: 327, cy: 214, rx: 82, ry: 64, seed: 23.34, minLevel: 8.2, tone: "mid", layer: "front" },
  { cx: 312, cy: 365, rx: 70, ry: 58, seed: 24.68, minLevel: 8.55, tone: "light", layer: "front" },
  { cx: 260, cy: 464, rx: 100, ry: 74, seed: 25.44, minLevel: 9.25, tone: "deep", layer: "mid" },
  { cx: 94, cy: 430, rx: 72, ry: 58, seed: 26.35, minLevel: 10.05, tone: "dry", layer: "front" },
  { cx: 213, cy: 237, rx: 86, ry: 66, seed: 27.18, minLevel: 10.55, tone: "dry", layer: "front" },
];

const BARK_STROKES = [
  "M217 720 C208 661 222 603 209 548 C197 497 204 447 219 395",
  "M242 716 C235 676 244 635 236 596 C229 560 237 523 252 489",
  "M191 686 C182 641 188 601 178 561 C169 524 174 485 188 446",
  "M229 472 C240 438 240 405 252 370",
  "M185 430 C174 392 178 361 170 326",
  "M223 340 C217 300 204 267 185 238",
] as const;

const ROOT_PATHS = [
  "M199 718 C166 714 132 728 105 752",
  "M225 720 C260 708 300 721 333 750",
  "M209 730 C194 743 172 752 142 759",
  "M235 733 C254 744 279 752 309 759",
] as const;

const BLOSSOMS = [
  { x: 171, y: 382, size: 13, seed: 40.1, minLevel: 7.55 },
  { x: 239, y: 348, size: 12, seed: 40.7, minLevel: 7.62 },
  { x: 302, y: 391, size: 13, seed: 41.5, minLevel: 7.68 },
  { x: 128, y: 323, size: 11, seed: 42.2, minLevel: 7.74 },
  { x: 214, y: 243, size: 12, seed: 43.6, minLevel: 7.8 },
  { x: 280, y: 198, size: 10, seed: 44.9, minLevel: 7.85 },
  { x: 103, y: 423, size: 11, seed: 45.8, minLevel: 7.9 },
  { x: 333, y: 289, size: 10, seed: 46.1, minLevel: 7.95 },
  { x: 74, y: 354, size: 10, seed: 46.8, minLevel: 8.05 },
  { x: 358, y: 338, size: 11, seed: 47.2, minLevel: 8.12 },
  { x: 205, y: 124, size: 10, seed: 47.4, minLevel: 8.22 },
  { x: 156, y: 205, size: 11, seed: 48.1, minLevel: 8.32 },
  { x: 247, y: 454, size: 12, seed: 48.6, minLevel: 8.46 },
  { x: 97, y: 484, size: 10, seed: 49.2, minLevel: 8.58 },
  { x: 317, y: 472, size: 10, seed: 49.7, minLevel: 8.72 },
  { x: 186, y: 156, size: 10, seed: 49.95, minLevel: 10.6 },
] as const;

const FRUITS = [
  { x: 174, y: 395, size: 12, seed: 50.1, minLevel: 8.62 },
  { x: 302, y: 372, size: 13, seed: 50.8, minLevel: 8.72 },
  { x: 244, y: 315, size: 11, seed: 51.3, minLevel: 8.8 },
  { x: 123, y: 448, size: 12, seed: 52.1, minLevel: 8.88 },
  { x: 280, y: 224, size: 10, seed: 53.5, minLevel: 8.96 },
  { x: 338, y: 312, size: 10, seed: 54.2, minLevel: 9.12 },
  { x: 95, y: 377, size: 11, seed: 54.6, minLevel: 9.24 },
  { x: 205, y: 461, size: 13, seed: 54.9, minLevel: 10.35 },
] as const;

const LEAF_SPRIGS = Array.from({ length: 184 }, (_, index) => {
  const cluster = CANOPY_CLUSTERS[index % CANOPY_CLUSTERS.length];
  const angle = seededUnit(cluster.seed, index + 7) * Math.PI * 2;
  const distance = Math.sqrt(seededUnit(cluster.seed, index + 21)) * 0.88;

  return {
    x: cluster.cx + Math.cos(angle) * cluster.rx * distance,
    y: cluster.cy + Math.sin(angle) * cluster.ry * distance,
    size: 8 + seededUnit(cluster.seed, index + 32) * 10,
    rotation: -70 + seededUnit(cluster.seed, index + 44) * 140,
    minLevel: Math.min(12, cluster.minLevel + seededUnit(cluster.seed, index + 58) * 0.62),
    tone: cluster.tone,
    seed: cluster.seed,
  };
});

export default function HabitatTree({
  onLeafPress,
  vitalityScore = 50,
  previewXp,
}: HabitatTreeProps) {
  const { theme } = useRootineTheme();
  const xp = useEcoStore((state: { xp: number }) => state.xp);
  const displayXp = previewXp ?? xp;
  const levelProgress = getLevelFromXp(displayXp);
  const visualLevel = Math.min(12, levelProgress.level + levelProgress.progress);
  const normalizedScore = Math.max(0, Math.min(100, vitalityScore));
  const palette = buildTreePalette(theme, normalizedScore);
  const isDark = theme.mode === "dark";
  const healthOpacity = 0.68 + (normalizedScore / 100) * 0.3;
  const matureOpacity = unlock(visualLevel, 4.28, 0.48);
  const saplingOpacity = 1 - unlock(visualLevel, 4.42, 0.42);
  const youngTreeScale = unlock(visualLevel, 4.58, 0.34);
  const openCrownScale = unlock(visualLevel, 5.55, 1.35);
  const ecosystemScale = unlock(visualLevel, 8.5, 2.4);
  const matureScale = 0.84 + youngTreeScale * 0.1 + openCrownScale * 0.1 + ecosystemScale * 0.04;
  const treeTransform = `translate(${210 * (1 - matureScale)} ${742 * (1 - matureScale)}) scale(${matureScale})`;

  return (
    <View style={styles.container}>
      <Svg
        viewBox="0 0 420 760"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMax meet"
        style={styles.svg}
      >
        <Defs>
          <LinearGradient id="rootine-trunk" x1="0" y1="0.08" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.trunkLight} />
            <Stop offset="0.36" stopColor={palette.trunkBase} />
            <Stop offset="0.72" stopColor={palette.trunkShade} />
            <Stop offset="1" stopColor={palette.barkMark} />
          </LinearGradient>
          <LinearGradient id="rootine-branch-shadow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.trunkBase} />
            <Stop offset="1" stopColor={palette.trunkShade} />
          </LinearGradient>
          <RadialGradient id="rootine-leaf-marker-glow" cx="50%" cy="50%" r="58%">
            <Stop offset="0" stopColor={palette.leafMarkerStroke} stopOpacity={isDark ? 0.56 : 0.42} />
            <Stop offset="0.55" stopColor={palette.leafMarker} stopOpacity={isDark ? 0.28 : 0.18} />
            <Stop offset="1" stopColor={palette.leafMarker} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {saplingOpacity > 0 ? (
          <G opacity={saplingOpacity}>
            <SaplingTree
              isDark={isDark}
              onLeafPress={onLeafPress}
              palette={palette}
              visualLevel={visualLevel}
            />
          </G>
        ) : null}

        {matureOpacity > 0 ? (
          <G opacity={matureOpacity} transform={treeTransform}>
            <MaturingTree
              healthOpacity={healthOpacity}
              isDark={isDark}
              onLeafPress={onLeafPress}
              palette={palette}
              visualLevel={visualLevel}
            />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

function SaplingTree({
  isDark,
  onLeafPress,
  palette,
  visualLevel,
}: {
  isDark: boolean;
  onLeafPress?: (index: number) => void;
  palette: ReturnType<typeof buildTreePalette>;
  visualLevel: number;
}) {
  const sprout = unlock(visualLevel, 0.7, 0.26);
  const newLeaves = unlock(visualLevel, 1.42, 0.3);
  const sturdy = unlock(visualLevel, 2.38, 0.34);
  const firstBranches = unlock(visualLevel, 3.18, 0.42);
  const stemHeight = 24 + sprout * 88 + newLeaves * 68 + sturdy * 88 + firstBranches * 74;
  const baseY = 736;
  const topY = baseY - stemHeight;
  const stemWidth = 4.5 + sprout * 5 + sturdy * 4.5 + firstBranches * 3.5;

  return (
    <G>
      <Path
        d={organicBlobPath(210, 738, 92, 18, 81.1, 12, 0.42)}
        fill={palette.groundShadow}
        opacity={isDark ? 0.48 : 0.24}
      />
      <Path
        d={organicBlobPath(210, 730, 18, 10, 80.4, 9, 0.36)}
        fill={palette.trunkLight}
        opacity={0.86 - sprout * 0.28}
      />
      <Path
        d="M194 735 C181 728 166 730 151 738 M226 736 C245 728 264 730 283 739"
        fill="none"
        stroke={palette.trunkShade}
        strokeLinecap="round"
        strokeWidth="4.6"
        opacity={0.32 + sturdy * 0.22}
      />
      <G opacity={sprout}>
        <Path
          d={`M211 ${baseY} C ${199 - sturdy * 5} ${baseY - stemHeight * 0.34} ${211 + firstBranches * 8} ${baseY - stemHeight * 0.72} ${222 + firstBranches * 6} ${topY}`}
          fill="none"
          stroke={palette.trunkShade}
          strokeLinecap="round"
          strokeWidth={stemWidth}
          opacity="0.88"
        />
        <Path
          d={`M214 ${baseY - 4} C ${207} ${baseY - stemHeight * 0.34} ${216} ${baseY - stemHeight * 0.7} ${226 + firstBranches * 4} ${topY + 5}`}
          fill="none"
          stroke={palette.trunkLight}
          strokeLinecap="round"
          strokeWidth={Math.max(2, stemWidth * 0.28)}
          opacity="0.38"
        />
      </G>
      <G opacity={firstBranches}>
        <Path
          d={`M211 ${baseY - stemHeight * 0.52} C 186 ${baseY - stemHeight * 0.64} 169 ${baseY - stemHeight * 0.72} 151 ${baseY - stemHeight * 0.84}`}
          fill="none"
          stroke={palette.trunkShade}
          strokeLinecap="round"
          strokeWidth="8"
          opacity="0.72"
        />
        <Path
          d={`M219 ${baseY - stemHeight * 0.58} C 244 ${baseY - stemHeight * 0.72} 271 ${baseY - stemHeight * 0.78} 297 ${baseY - stemHeight * 0.9}`}
          fill="none"
          stroke={palette.trunkShade}
          strokeLinecap="round"
          strokeWidth="8"
          opacity="0.72"
        />
      </G>

      <G>
        {SAPLING_LEAVES.map((leaf) => {
          const visible = unlock(visualLevel, leaf.minLevel - 0.15, 0.32);
          if (visible <= 0) return null;

          return (
            <Path
              key={leaf.seed}
              d={almondLeafPath(leaf.x, leaf.y, leaf.size)}
              fill={leafColor(leaf.tone, palette)}
              opacity={(0.34 + visible * 0.52) * (0.82 + firstBranches * 0.12)}
              transform={`rotate(${leaf.rotation} ${leaf.x} ${leaf.y})`}
            />
          );
        })}
      </G>

      <G opacity={sturdy}>
        <Path
          d={organicBlobPath(214, baseY - stemHeight * 0.42, 32, 20, 84.5, 10, 0.3)}
          fill={palette.canopyMist}
          opacity="0.34"
        />
      </G>

      <MemoryMarkers
        isDark={isDark}
        leaves={EARLY_MEMORY_LEAVES}
        onLeafPress={onLeafPress}
        palette={palette}
        scale={visualLevel < 1 ? 0.78 : 0.9}
      />
    </G>
  );
}

function MaturingTree({
  healthOpacity,
  isDark,
  onLeafPress,
  palette,
  visualLevel,
}: {
  healthOpacity: number;
  isDark: boolean;
  onLeafPress?: (index: number) => void;
  palette: ReturnType<typeof buildTreePalette>;
  visualLevel: number;
}) {
  const roots = unlock(visualLevel, 4.75, 0.6);
  const openCrown = unlock(visualLevel, 5.45, 1);
  const canopyMist = unlock(visualLevel, 5.85, 0.65);
  const flowers = unlock(visualLevel, 7.58, 0.42);
  const fruits = unlock(visualLevel, 8.62, 0.46);
  const ecosystem = unlock(visualLevel, 9.6, 0.9);
  const reference = unlock(visualLevel, 11.1, 0.55);

  return (
    <G>
      <Path
        d="M61 736 C116 699 174 692 216 707 C255 689 317 704 369 739 C294 756 128 758 61 736 Z"
        fill={palette.groundShadow}
        opacity={isDark ? 0.46 : 0.24}
      />

      <G opacity={roots}>
        {ROOT_PATHS.map((path) => (
          <Path
            key={path}
            d={path}
            fill="none"
            stroke={palette.trunkShade}
            strokeLinecap="round"
            strokeWidth="11"
            opacity="0.58"
          />
        ))}
      </G>

      <G opacity={0.78 + openCrown * 0.14}>
        {CANOPY_CLUSTERS.filter((cluster) => cluster.layer === "back").map((cluster) => (
          <CanopyBlob
            key={`${cluster.seed}-${cluster.layer}`}
            cluster={cluster}
            palette={palette}
            visualLevel={visualLevel}
            healthOpacity={healthOpacity}
          />
        ))}
      </G>

      <G>
        {STRUCTURAL_BRANCHES.map((branch) => {
              const visible = unlock(visualLevel, branch.minLevel, 0.48);
          if (visible <= 0) return null;

          return (
            <G key={branch.d} opacity={branch.opacity * visible}>
              <Path
                d={branch.d}
                fill="none"
                stroke={palette.branchUnderside}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={branch.width + 7}
                opacity="0.34"
              />
              <Path
                d={branch.d}
                fill="none"
                stroke="url(#rootine-branch-shadow)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={branch.width}
              />
              <Path
                d={branch.d}
                fill="none"
                stroke={palette.trunkLight}
                strokeLinecap="round"
                strokeWidth={Math.max(2.2, branch.width * 0.18)}
                opacity="0.36"
              />
            </G>
          );
        })}
      </G>

      <G>
        <Path
          d="M176 744 C168 678 170 622 158 563 C145 500 156 446 181 388 C196 352 190 305 166 245 C196 268 213 306 217 352 C232 291 259 227 318 161 C300 224 272 284 265 350 C257 425 267 502 274 568 C282 638 296 696 303 744 Z"
          fill="url(#rootine-trunk)"
        />
        <Path
          d="M208 744 C207 678 218 622 207 562 C197 508 204 449 225 386 C236 352 235 306 224 263 C245 311 251 357 244 404 C236 458 245 518 252 576 C260 638 275 694 284 744 Z"
          fill={palette.trunkShade}
          opacity="0.42"
        />
        <Path
          d="M188 741 C179 671 184 615 175 562 C166 509 174 458 193 409"
          fill="none"
          stroke={palette.trunkLight}
          strokeLinecap="round"
          strokeWidth="8"
          opacity="0.32"
        />
        {BARK_STROKES.map((path, index) => (
          <Path
            key={path}
            d={path}
            fill="none"
            stroke={index % 2 === 0 ? palette.barkMark : palette.trunkLight}
            strokeLinecap="round"
            strokeWidth={index % 2 === 0 ? 4.4 : 2.6}
            opacity={index % 2 === 0 ? 0.36 : 0.2}
          />
        ))}
        <Path
          d={organicBlobPath(205, 721, 40, 15, 62.4, 10, 0.34)}
          fill={palette.barkMoss}
          opacity={0.34 + ecosystem * 0.22}
        />
        <Path
          d={organicBlobPath(263, 704, 28, 11, 63.8, 9, 0.4)}
          fill={palette.barkMoss}
          opacity={0.2 + ecosystem * 0.24}
        />
      </G>

      <G opacity={0.9 + unlock(visualLevel, 6.4, 1.8) * 0.08}>
        {CANOPY_CLUSTERS.filter((cluster) => cluster.layer !== "back").map((cluster) => (
          <CanopyBlob
            key={`${cluster.seed}-${cluster.layer}`}
            cluster={cluster}
            palette={palette}
            visualLevel={visualLevel}
            healthOpacity={healthOpacity}
          />
        ))}
      </G>

      <G opacity={0.9}>
        {LEAF_SPRIGS.map((leaf, index) => {
              const visible = unlock(visualLevel, leaf.minLevel, 0.44);
          if (visible <= 0) return null;

          return (
            <Path
              key={`${leaf.seed}-${index}`}
              d={almondLeafPath(leaf.x, leaf.y, leaf.size)}
              fill={leafColor(leaf.tone, palette)}
              opacity={(0.28 + visible * 0.64) * healthOpacity}
              transform={`rotate(${leaf.rotation} ${leaf.x} ${leaf.y})`}
            />
          );
        })}
      </G>

      <G opacity={palette.stressed ? 0.42 : 0.12}>
        <Path d={organicBlobPath(184, 212, 44, 28, 71.2, 10, 0.36)} fill={palette.canopyDry} />
        <Path d={organicBlobPath(122, 394, 38, 24, 72.4, 10, 0.34)} fill={palette.canopyDry} />
        <Path d={organicBlobPath(284, 447, 42, 24, 73.9, 10, 0.32)} fill={palette.canopyDry} />
      </G>

      <G opacity={canopyMist * (0.38 + reference * 0.28)}>
        <Path
          d="M81 486 C128 462 179 469 206 501 C242 468 308 466 351 501 C310 518 250 522 207 511 C164 526 111 516 81 486 Z"
          fill={palette.canopyMist}
        />
      </G>

      <G opacity={flowers}>
        {BLOSSOMS.map((blossom, index) => {
          const visible = unlock(visualLevel, blossom.minLevel, 0.35);
          if (visible <= 0) return null;

          return (
            <Flower
              key={blossom.seed}
              color={index % 3 === 0 ? palette.blossom : index % 3 === 1 ? palette.flower : palette.flowerAlt}
              opacity={visible * (0.58 + (1 - fruits) * 0.2)}
              seed={blossom.seed}
              size={blossom.size}
              x={blossom.x}
              y={blossom.y}
            />
          );
        })}
      </G>

      <G opacity={fruits}>
        {FRUITS.map((fruit) => {
          const visible = unlock(visualLevel, fruit.minLevel, 0.35);
          if (visible <= 0) return null;

          return (
            <Path
              key={fruit.seed}
              d={organicBlobPath(fruit.x, fruit.y, fruit.size * 0.78, fruit.size, fruit.seed, 8, 0.28)}
              fill={visible > 0.72 ? palette.fruit : palette.fruitDeep}
              opacity={visible * 0.88}
            />
          );
        })}
      </G>

      <MemoryMarkers
        isDark={isDark}
        leaves={MEMORY_LEAVES}
        onLeafPress={onLeafPress}
        palette={palette}
        scale={1}
      />
    </G>
  );
}

function CanopyBlob({
  cluster,
  palette,
  visualLevel,
  healthOpacity,
}: {
  cluster: CanopyCluster;
  palette: ReturnType<typeof buildTreePalette>;
  visualLevel: number;
  healthOpacity: number;
}) {
  const visible = unlock(visualLevel, cluster.minLevel, 0.5);
  if (visible <= 0) return null;

  const openCrown = unlock(visualLevel, 5.35, 1.15);
  const habitatCrown = unlock(visualLevel, 6.7, 1.4);
  const elderCrown = unlock(visualLevel, 9.2, 2.2);
  const widthGrowth = 1 + openCrown * 0.07 + habitatCrown * 0.04 + elderCrown * 0.02;
  const heightGrowth = 1 + openCrown * 0.03 + habitatCrown * 0.04 + elderCrown * 0.02;
  const cx = 210 + (cluster.cx - 210) * widthGrowth;
  const cy = 410 + (cluster.cy - 410) * heightGrowth;
  const fill = leafColor(cluster.tone, palette);
  const opacity =
    cluster.tone === "dry"
      ? visible * (palette.stressed ? 0.42 : 0.14)
      : (0.34 + visible * 0.62) * healthOpacity;

  return (
    <Path
      d={organicBlobPath(
        cx,
        cy,
        cluster.rx * widthGrowth,
        cluster.ry * heightGrowth,
        cluster.seed,
        13,
        0.3,
      )}
      fill={fill}
      opacity={opacity}
    />
  );
}

function MemoryMarkers({
  isDark,
  leaves,
  onLeafPress,
  palette,
  scale,
}: {
  isDark: boolean;
  leaves: MarkerLeaf[];
  onLeafPress?: (index: number) => void;
  palette: ReturnType<typeof buildTreePalette>;
  scale: number;
}) {
  return (
    <G>
      {leaves.map((leaf, index) => (
        <G key={leaf.label} onPress={() => onLeafPress?.(index)}>
          <Path
            d={organicBlobPath(leaf.x, leaf.y, 34 * scale, 28 * scale, leaf.seed, 9, 0.28)}
            fill={palette.leafMarker}
            opacity="0.02"
          />
          <Path
            d={organicBlobPath(leaf.x, leaf.y, 28 * scale, 22 * scale, leaf.seed + 1, 9, 0.24)}
            fill="url(#rootine-leaf-marker-glow)"
            opacity={isDark ? 0.92 : 0.58}
          />
          <Path
            d={almondLeafPath(leaf.x, leaf.y, 31 * scale)}
            fill={palette.leafMarker}
            stroke={palette.leafMarkerStroke}
            strokeWidth={2.1 * scale}
            opacity="0.9"
            transform={`rotate(${leaf.rotation} ${leaf.x} ${leaf.y})`}
          />
          <SvgText
            x={leaf.x}
            y={leaf.y + 4 * scale}
            fill={palette.leafMarkerText}
            fontSize={(leaf.label.length > 1 ? 9 : 10) * scale}
            fontWeight="800"
            opacity="0.76"
            textAnchor="middle"
          >
            {leaf.label}
          </SvgText>
        </G>
      ))}
    </G>
  );
}

function Flower({
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
      {Array.from({ length: 5 }, (_, index) => {
        const rotation = index * 72 + seededUnit(seed, index) * 18;
        return (
          <Path
            key={`${seed}-${index}`}
            d={almondLeafPath(x, y - size * 0.36, size)}
            fill={color}
            opacity={0.78 + seededUnit(seed, index + 9) * 0.18}
            transform={`rotate(${rotation} ${x} ${y})`}
          />
        );
      })}
      <Path
        d={organicBlobPath(x, y, size * 0.24, size * 0.2, seed + 2, 7, 0.22)}
        fill={color}
        opacity="0.72"
      />
    </G>
  );
}

function unlock(visualLevel: number, startLevel: number, span = 0.5) {
  const raw = Math.max(0, Math.min(1, (visualLevel - startLevel) / span));
  return raw * raw * (3 - 2 * raw);
}

function leafColor(tone: CanopyTone, palette: ReturnType<typeof buildTreePalette>) {
  switch (tone) {
    case "deep":
      return palette.canopyDeep;
    case "light":
      return palette.canopyLight;
    case "dry":
      return palette.canopyDry;
    case "mid":
    default:
      return palette.canopyMid;
  }
}

function buildTreePalette(theme: RootineTheme, vitalityScore: number) {
  const habitat = theme.habitat;
  const stressed = vitalityScore < 35;
  const thriving = vitalityScore >= 70;

  return {
    stressed,
    trunkBase: habitat.trunkBase,
    trunkShade: habitat.trunkShade,
    trunkLight: habitat.trunkLight,
    branchUnderside: theme.mode === "dark" ? habitat.forestShadow : habitat.barkMark,
    barkMark: habitat.barkMark,
    barkMoss: habitat.barkMoss,
    groundShadow: habitat.forestShadow,
    canopyDeep: habitat.canopyDeep,
    canopyMid: stressed ? habitat.forestDeep : habitat.canopyMid,
    canopyLight: thriving ? habitat.canopyLight : habitat.grassLight,
    canopyDry: habitat.canopyDry,
    canopyMist: habitat.canopyMist,
    blossom: habitat.blossom,
    flower: habitat.flower,
    flowerAlt: habitat.flowerAlt,
    fruit: habitat.fruit,
    fruitDeep: habitat.fruitDeep,
    leafMarker: habitat.leafMarker,
    leafMarkerStroke: habitat.leafMarkerStroke,
    leafMarkerText: habitat.leafMarkerText,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 520,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  svg: {
    overflow: "visible",
  },
});
