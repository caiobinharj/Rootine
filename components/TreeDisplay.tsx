import { getLevelFromXp } from "@/lib/domain/xp";
import { blobPath, grassTuft, pseudoRandom } from "@/lib/visual/organic";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TreeDisplayProps {
  onLeafPress?: (index: number) => void;
  vitalityScore?: number;
  previewXp?: number;
  /** Ajuste puramente visual de ambiente — não interfere na progressão. */
  ambient?: "day" | "night";
}

// =============================================================================
// FOLHAGEM PICTÓRICA
// Cada massa de copa é pintada em 5 "aguadas" sobrepostas (silhueta escura →
// meio-tom → luz → brilho) com contorno irregular, mais "pinceladas" de folhas
// soltas na borda. Puramente apresentacional — herda a animação de crescimento
// do grupo que a contém.
// =============================================================================

function Foliage({
  cx,
  cy,
  r,
  palette,
  seed = 1,
}: {
  cx: number;
  cy: number;
  r: number;
  palette: Record<string, string>;
  seed?: number;
}) {
  const art = useMemo(() => {
    const layers = [
      {
        key: "base",
        d: blobPath(cx, cy + r * 0.05, r, { bumps: 11, jitter: 0.2, squashY: 0.88, seed }),
      },
      {
        key: "under",
        d: blobPath(cx + r * 0.16, cy + r * 0.32, r * 0.6, {
          bumps: 9,
          jitter: 0.26,
          squashY: 0.66,
          seed: seed + 41,
        }),
      },
      {
        key: "mid",
        d: blobPath(cx - r * 0.08, cy - r * 0.08, r * 0.84, {
          bumps: 10,
          jitter: 0.22,
          squashY: 0.9,
          seed: seed + 7,
        }),
      },
      {
        key: "soft",
        d: blobPath(cx - r * 0.16, cy - r * 0.2, r * 0.58, {
          bumps: 9,
          jitter: 0.24,
          squashY: 0.88,
          seed: seed + 13,
        }),
      },
      {
        key: "glint",
        d: blobPath(cx - r * 0.24, cy - r * 0.34, r * 0.32, {
          bumps: 8,
          jitter: 0.28,
          squashY: 0.85,
          seed: seed + 29,
        }),
      },
    ];
    const dabs = Array.from({ length: 10 }, (_, i) => {
      const angle = pseudoRandom(seed * 31 + i) * Math.PI * 2;
      const dist = r * (0.88 + pseudoRandom(seed * 17 + i) * 0.2);
      const size = r * (0.05 + pseudoRandom(seed * 53 + i) * 0.045);
      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist * 0.88,
        rx: size * 1.6,
        ry: size,
        rot: Math.round(pseudoRandom(seed * 71 + i) * 180 - 90),
        light: i % 3 === 0,
      };
    });
    return { layers, dabs };
  }, [cx, cy, r, seed]);

  const fillFor = (key: string) =>
    key === "base"
      ? palette.leafDeep
      : key === "under"
        ? palette.leafDeep
        : key === "mid"
          ? "url(#leaf-deep)"
          : key === "soft"
            ? "url(#leaf-soft)"
            : palette.leafLight;

  return (
    <G>
      {art.layers.map((layer) => (
        <Path
          key={layer.key}
          d={layer.d}
          fill={fillFor(layer.key)}
          opacity={layer.key === "under" ? 0.62 : layer.key === "glint" ? 0.85 : 1}
        />
      ))}
      {art.dabs.map((dab, i) => (
        <Ellipse
          key={`dab-${i}`}
          cx={dab.x}
          cy={dab.y}
          rx={dab.rx}
          ry={dab.ry}
          transform={`rotate(${dab.rot} ${dab.x.toFixed(1)} ${dab.y.toFixed(1)})`}
          fill={dab.light ? palette.leafLight : palette.leaf}
          opacity={0.9}
        />
      ))}
    </G>
  );
}

// -----------------------------------------------------------------------------
// Arte estática pré-computada (determinística) — copas distantes, clareira,
// capim e as "memórias de luz" da aura ancestral.
// -----------------------------------------------------------------------------

const BG_LEFT_CANOPY = [
  blobPath(120, 452, 116, { seed: 101, jitter: 0.22, squashY: 0.9, bumps: 10 }),
  blobPath(84, 412, 72, { seed: 107, jitter: 0.24, squashY: 0.88, bumps: 9 }),
  blobPath(162, 404, 68, { seed: 113, jitter: 0.24, squashY: 0.88, bumps: 9 }),
];

const BG_RIGHT_CANOPY = [
  blobPath(680, 398, 130, { seed: 131, jitter: 0.22, squashY: 0.9, bumps: 10 }),
  blobPath(624, 350, 84, { seed: 137, jitter: 0.24, squashY: 0.88, bumps: 9 }),
  blobPath(738, 354, 84, { seed: 139, jitter: 0.24, squashY: 0.88, bumps: 9 }),
];

const CLEARING_MOSS = [
  blobPath(308, 692, 64, { squashY: 0.3, seed: 201, jitter: 0.3, bumps: 9 }),
  blobPath(506, 700, 80, { squashY: 0.26, seed: 207, jitter: 0.26, bumps: 9 }),
  blobPath(400, 728, 122, { squashY: 0.22, seed: 213, jitter: 0.2, bumps: 10 }),
];

const BASE_TUFTS = [
  ...grassTuft(296, 708, 38, 5, 301),
  ...grassTuft(492, 712, 34, 4, 307),
  ...grassTuft(398, 718, 28, 4, 313),
  ...grassTuft(560, 704, 26, 3, 317),
  ...grassTuft(248, 700, 24, 3, 323),
];

const AURA_MOTES = [
  { x: 300, y: 118, r: 5 },
  { x: 522, y: 88, r: 4 },
  { x: 424, y: 38, r: 5.5 },
  { x: 228, y: 244, r: 4 },
  { x: 604, y: 176, r: 4.5 },
  { x: 356, y: 292, r: 3.5 },
  { x: 662, y: 300, r: 4 },
  { x: 140, y: 218, r: 3.5 },
];

export default function TreeDisplay({
  onLeafPress,
  vitalityScore = 50,
  previewXp,
  ambient = "day",
}: TreeDisplayProps) {
  const night = ambient === "night";
  const progress = useSharedValue(0);
  const xp = useEcoStore((state: { xp: number }) => state.xp);
  const displayXp = previewXp ?? xp;
  const levelProgress = getLevelFromXp(displayXp);
  const structuralProgress = levelProgress.level >= 12
    ? 1
    : Math.min(1, Math.max(0.02, (levelProgress.level + levelProgress.progress) / 12));
  const normalizedScore = Math.max(0, Math.min(100, vitalityScore));
  const mood = normalizedScore >= 70 ? "thriving" : normalizedScore >= 35 ? "growing" : "withered";
  const palette = TREE_PALETTES[mood];

  // XP define porte por nível; pontuação define beleza/saúde.
  useEffect(() => {
    progress.value = withTiming(structuralProgress, { duration: 1500 });
  }, [structuralProgress, progress]);

  // =========================================================================
  // INTERPOLAÇÕES NATIVAS PURAS
  // Não usamos arrays de "transform". Injetamos propriedades diretas do SVG.
  // =========================================================================

  // 1. CHÃO E TRONCO (Usando 'scale' e 'translateY' como props diretas)
  const risingTreeProps = useAnimatedProps(
    () =>
      ({
        translateY: interpolate(
          progress.value,
          [0, 0.6],
          [700, 0],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  const liveGroundProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0, 0.2],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 400,
        originY: 700,
      }) as any,
  );

  const bgCanopyLeftProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.15, 0.3],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 120,
        originY: 520,
      }) as any,
  );

  const bgCanopyRightProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.15, 0.3],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 680,
        originY: 480,
      }) as any,
  );

  // 2. GALHOS
  const topBranchProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.25, 0.35],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 403,
        originY: 200,
      }) as any,
  );

  const midBranchProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.45, 0.55],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 407,
        originY: 300,
      }) as any,
  );

  const lowBranchProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.6, 0.7],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 393,
        originY: 400,
      }) as any,
  );

  // 3. FOLHAS (A Mágica: Animamos os raios 'rx' e 'ry' em vez de usar transforms!)
  const topLeaf1Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 85],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 60],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const topLeaf2Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 80],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 55],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const topLeaf3Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 115],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 80],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  const midLeaf1Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 95],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 65],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const midLeaf2Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 65],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 45],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  const lowLeaf1Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 90],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 60],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const lowLeaf2Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 80],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 55],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const lowLeaf3Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 70],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 45],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  // 4. FRUTOS (Animamos o raio 'r' diretamente)
  const topFruit1Props = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 14],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const topFruit2Props = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 20],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const midFruitProps = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 18],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const lowFruitProps = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 16],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  // 5. AURA ANCESTRAL (aditiva — surge apenas nos níveis mais altos)
  const auraProps = useAnimatedProps(
    () =>
      ({
        opacity: interpolate(
          progress.value,
          [0.82, 1],
          [0, night ? 0.8 : 0.55],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  return (
    <View style={styles.container}>
      <Svg
        viewBox="0 0 800 800"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <ClipPath id="ground-clip">
            <Rect x="0" y="0" width="800" height="700" />
          </ClipPath>
          {/* Tronco com volume — luz lateral quente sobre a casca */}
          <LinearGradient id="trunk-grad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={palette.trunkDark} />
            <Stop offset="0.5" stopColor={palette.trunk} />
            <Stop offset="1" stopColor={palette.trunkDark} />
          </LinearGradient>
          {/* Folhagem volumétrica — luz vinda do alto à esquerda */}
          <RadialGradient id="leaf-soft" cx="0.38" cy="0.3" r="0.78">
            <Stop offset="0" stopColor={palette.leafLight} />
            <Stop offset="1" stopColor={palette.leaf} />
          </RadialGradient>
          <RadialGradient id="leaf-deep" cx="0.4" cy="0.32" r="0.8">
            <Stop offset="0" stopColor={palette.leaf} />
            <Stop offset="1" stopColor={palette.leafDeep} />
          </RadialGradient>
          {/* Frutos translúcidos, como contas de âmbar */}
          <RadialGradient id="fruit-grad" cx="0.35" cy="0.3" r="0.82">
            <Stop offset="0" stopColor={palette.fruitLight} />
            <Stop offset="1" stopColor={palette.fruit} />
          </RadialGradient>
          <RadialGradient id="ground-grad" cx="0.5" cy="0.32" r="0.85">
            <Stop offset="0" stopColor={palette.earthAliveLight} />
            <Stop offset="1" stopColor={palette.earthAlive} />
          </RadialGradient>
          <RadialGradient id="canopy-grad" cx="0.4" cy="0.32" r="0.88">
            <Stop offset="0" stopColor={palette.bgTreeLeafLight} />
            <Stop offset="1" stopColor={palette.bgTreeLeaf} />
          </RadialGradient>
          {/* Luz difusa dourada filtrando-se pela copa */}
          <RadialGradient id="canopy-haze" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={palette.haze} stopOpacity="0.6" />
            <Stop offset="1" stopColor={palette.haze} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="leaf-orb" cx="0.36" cy="0.3" r="0.85">
            <Stop offset="0" stopColor={palette.orbLight} />
            <Stop offset="1" stopColor={palette.orbDark} />
          </RadialGradient>
        </Defs>

        {/* Halo de luz quente atrás da copa — à noite vira aura mágica */}
        <Circle cx="400" cy="250" r="370" fill="url(#canopy-haze)" opacity={night ? 1 : 0.9} />

        {/* CENÁRIO DE FUNDO — copas distantes pictóricas; silhuetas à noite */}
        <G id="bg-trees" opacity={night ? 0.5 : 0.92}>
          <Path
            fill={palette.bgTreeTrunk}
            d="M 110 700 C 113 640 115 578 117 508 L 129 508 C 128 578 128 640 131 700 Z"
          />
          <AnimatedG animatedProps={bgCanopyLeftProps}>
            {BG_LEFT_CANOPY.map((d, i) => (
              <Path key={`bgl-${i}`} d={d} fill="url(#canopy-grad)" />
            ))}
          </AnimatedG>

          <Path
            fill={palette.bgTreeTrunk}
            d="M 670 700 C 673 632 675 556 677 468 L 691 468 C 690 556 690 632 693 700 Z"
          />
          <AnimatedG animatedProps={bgCanopyRightProps}>
            {BG_RIGHT_CANOPY.map((d, i) => (
              <Path key={`bgr-${i}`} d={d} fill="url(#canopy-grad)" />
            ))}
          </AnimatedG>
        </G>

        {/* CHÃO */}
        <Ellipse cx="400" cy="700" rx="350" ry="80" fill={palette.earthDead} />
        <AnimatedEllipse
          cx="400"
          cy="700"
          rx="350"
          ry="80"
          fill="url(#ground-grad)"
          animatedProps={liveGroundProps}
        />
        {/* Sombra de contato — assenta a árvore no solo */}
        <Ellipse cx="400" cy="706" rx="262" ry="36" fill={palette.shadow} opacity="0.22" />

        {/* ÁRVORE PRINCIPAL */}
        <G clipPath="url(#ground-clip)">
          <AnimatedG animatedProps={risingTreeProps}>
            {/* ===== RAÍZES-CONTRAFORTE — flancos largos abraçando o solo ===== */}
            <Path
              fill={palette.trunkDark}
              d="M 322 700 C 302 672 272 652 234 640 C 266 658 292 676 310 700 Z"
            />
            <Path
              fill={palette.trunkDark}
              d="M 506 700 C 528 670 560 650 600 638 C 566 656 540 676 522 700 Z"
            />
            <Path
              fill={palette.trunk}
              d="M 342 700 C 332 682 316 668 294 658 C 312 672 326 686 334 700 Z"
            />
            <Path
              fill={palette.trunk}
              d="M 482 700 C 494 680 510 666 534 656 C 514 670 500 684 492 700 Z"
            />
            <Path
              fill={palette.trunk}
              d="M 392 700 C 390 690 386 682 380 676 C 388 684 391 692 392 700 Z"
            />

            {/* Corpo lenhoso — curvas assimétricas em S, base alargada */}
            <Path
              fill="url(#trunk-grad)"
              d="M 318 700
                 C 330 648 344 606 352 556
                 C 360 506 352 458 364 410
                 C 372 372 378 334 386 296
                 C 391 264 396 232 404 200
                 L 436 202
                 C 440 234 446 266 452 300
                 C 460 340 456 382 466 424
                 C 474 470 468 520 480 566
                 C 488 612 498 656 510 700
                 C 470 696 434 694 400 694
                 C 368 694 344 696 318 700 Z"
            />
            {/* Faixa de luz quente no flanco esquerdo */}
            <Path
              fill={palette.trunkLight}
              opacity="0.38"
              d="M 348 690 C 344 600 354 500 364 400 C 372 330 380 268 392 208 C 386 280 380 360 384 460 C 386 560 376 630 380 690 C 369 693 357 693 348 690 Z"
            />
            {/* Meia-sombra no flanco direito */}
            <Path
              fill={palette.trunkDark}
              opacity="0.32"
              d="M 470 690 C 476 600 462 500 458 410 C 452 340 446 280 436 220 C 446 292 452 372 452 462 C 454 556 466 620 466 690 Z"
            />
            {/* Veios da casca e o nó (olho) da árvore */}
            <Path
              d="M 372 660 C 380 540 372 430 388 310"
              stroke={palette.trunkDark}
              strokeWidth="3"
              fill="none"
              opacity="0.22"
              strokeLinecap="round"
            />
            <Path
              d="M 428 660 C 420 540 432 430 420 320"
              stroke={palette.trunkDark}
              strokeWidth="2.5"
              fill="none"
              opacity="0.18"
              strokeLinecap="round"
            />
            <Path
              d="M 400 690 C 398 600 402 520 400 470"
              stroke={palette.trunkDark}
              strokeWidth="2"
              fill="none"
              opacity="0.12"
              strokeLinecap="round"
            />
            <Ellipse cx="396" cy="402" rx="13" ry="19" fill={palette.trunkDark} opacity="0.5" />
            <Ellipse cx="396" cy="402" rx="6" ry="10" fill={palette.trunkLight} opacity="0.45" />

            {/* === COPA SUPERIOR === */}
            <AnimatedG animatedProps={topBranchProps}>
              {/* Galhos lenhosos afinando a partir do tronco */}
              <Path
                fill={palette.branch}
                d="M 402 236 C 366 216 330 200 292 190 C 276 186 262 184 250 184 C 264 192 280 200 300 210 C 336 226 370 240 404 252 Z"
              />
              <Path
                fill={palette.branch}
                d="M 404 220 C 442 200 482 176 516 148 C 530 136 542 126 552 118 C 540 132 526 148 508 164 C 474 194 440 214 410 232 Z"
              />

              {/* Massas de folhagem pictóricas — copa principal e lóbulos laterais */}
              <Foliage cx={400} cy={150} r={170} palette={palette} seed={1} />
              <Foliage cx={240} cy={165} r={118} palette={palette} seed={5} />
              <Foliage cx={555} cy={120} r={128} palette={palette} seed={9} />

              {/* Lóbulos que desabrocham (animação de crescimento preservada) */}
              <AnimatedEllipse cx="322" cy="118" opacity={0.88} fill="url(#leaf-soft)" animatedProps={topLeaf1Props} />
              <AnimatedEllipse cx="476" cy="112" opacity={0.88} fill="url(#leaf-deep)" animatedProps={topLeaf2Props} />
              <AnimatedEllipse cx="400" cy="74" opacity={0.88} fill="url(#leaf-soft)" animatedProps={topLeaf3Props} />

              <AnimatedCircle cx="312" cy="196" fill="url(#fruit-grad)" animatedProps={topFruit1Props} />
              <AnimatedCircle cx="452" cy="190" fill="url(#fruit-grad)" animatedProps={topFruit2Props} />

              <G onPress={() => onLeafPress?.(0)}>
                <Circle cx="246" cy="150" r="40" fill={palette.orbGlow} opacity="0.2" />
                <Circle cx="246" cy="150" r="30" fill={palette.orbGlow} opacity="0.34" />
                <Circle cx="246" cy="150" r="22" fill="url(#leaf-orb)" stroke={palette.orbStroke} strokeWidth="3" />
                <Circle cx="239" cy="142" r="6" fill="#FFFFFF" opacity="0.5" />
                <SvgText x="246" y="155" fill="#FFFFFF" fontSize="15" fontWeight="bold" textAnchor="middle">
                  I
                </SvgText>
              </G>
              <G onPress={() => onLeafPress?.(1)}>
                <Circle cx="532" cy="96" r="40" fill={palette.orbGlow} opacity="0.2" />
                <Circle cx="532" cy="96" r="30" fill={palette.orbGlow} opacity="0.34" />
                <Circle cx="532" cy="96" r="22" fill="url(#leaf-orb)" stroke={palette.orbStroke} strokeWidth="3" />
                <Circle cx="525" cy="88" r="6" fill="#FFFFFF" opacity="0.5" />
                <SvgText x="532" y="101" fill="#FFFFFF" fontSize="15" fontWeight="bold" textAnchor="middle">
                  II
                </SvgText>
              </G>
            </AnimatedG>

            {/* === RAMO DIREITO === */}
            <AnimatedG animatedProps={midBranchProps}>
              <Path
                fill={palette.branch}
                d="M 412 320 C 462 304 514 280 560 246 C 576 234 590 224 602 218 C 590 230 576 244 556 260 C 512 294 464 316 418 332 Z"
              />

              <Foliage cx={660} cy={205} r={120} palette={palette} seed={17} />

              <AnimatedEllipse cx="616" cy="162" opacity={0.88} fill="url(#leaf-soft)" animatedProps={midLeaf1Props} />
              <AnimatedEllipse cx="692" cy="214" opacity={0.88} fill="url(#leaf-deep)" animatedProps={midLeaf2Props} />

              <AnimatedCircle cx="600" cy="214" fill="url(#fruit-grad)" animatedProps={midFruitProps} />

              <G onPress={() => onLeafPress?.(2)}>
                <Circle cx="656" cy="190" r="42" fill={palette.orbGlow} opacity="0.2" />
                <Circle cx="656" cy="190" r="31" fill={palette.orbGlow} opacity="0.34" />
                <Circle cx="656" cy="190" r="23" fill="url(#leaf-orb)" stroke={palette.orbStroke} strokeWidth="3" />
                <Circle cx="648" cy="182" r="6.5" fill="#FFFFFF" opacity="0.5" />
                <SvgText x="656" y="195" fill="#FFFFFF" fontSize="14" fontWeight="bold" textAnchor="middle">
                  III
                </SvgText>
              </G>
            </AnimatedG>

            {/* === RAMO ESQUERDO BAIXO === */}
            <AnimatedG animatedProps={lowBranchProps}>
              <Path
                fill={palette.branch}
                d="M 394 420 C 342 408 288 390 240 362 C 222 352 206 344 194 340 C 206 350 222 362 244 376 C 292 402 342 418 390 430 Z"
              />
              <Path
                fill={palette.branch}
                d="M 378 424 C 344 420 312 424 282 436 C 312 426 344 422 378 428 Z"
              />

              <Foliage cx={160} cy={325} r={126} palette={palette} seed={21} />
              <Foliage cx={278} cy={408} r={94} palette={palette} seed={27} />

              <AnimatedEllipse cx="118" cy="300" opacity={0.88} fill="url(#leaf-soft)" animatedProps={lowLeaf1Props} />
              <AnimatedEllipse cx="256" cy="400" opacity={0.88} fill="url(#leaf-deep)" animatedProps={lowLeaf2Props} />
              <AnimatedEllipse cx="92" cy="356" opacity={0.88} fill="url(#leaf-soft)" animatedProps={lowLeaf3Props} />

              <AnimatedCircle cx="150" cy="344" fill="url(#fruit-grad)" animatedProps={lowFruitProps} />

              <G onPress={() => onLeafPress?.(3)}>
                <Circle cx="158" cy="322" r="42" fill={palette.orbGlow} opacity="0.2" />
                <Circle cx="158" cy="322" r="31" fill={palette.orbGlow} opacity="0.34" />
                <Circle cx="158" cy="322" r="23" fill="url(#leaf-orb)" stroke={palette.orbStroke} strokeWidth="3" />
                <Circle cx="150" cy="314" r="6.5" fill="#FFFFFF" opacity="0.5" />
                <SvgText x="158" y="327" fill="#FFFFFF" fontSize="14" fontWeight="bold" textAnchor="middle">
                  IV
                </SvgText>
              </G>
            </AnimatedG>
          </AnimatedG>
        </G>

        {/* AURA ANCESTRAL — memórias de luz que surgem nos níveis altos */}
        <AnimatedG animatedProps={auraProps}>
          {AURA_MOTES.map((mote, i) => (
            <G key={`mote-${i}`}>
              <Circle cx={mote.x} cy={mote.y} r={mote.r * 2.6} fill={palette.orbGlow} opacity={0.18} />
              <Circle cx={mote.x} cy={mote.y} r={mote.r} fill={palette.fruitLight} opacity={0.9} />
            </G>
          ))}
        </AnimatedG>

        {/* CLAREIRA — musgo, pedras e capim em frente ao tronco */}
        <Path d={CLEARING_MOSS[0]} fill={palette.earthAliveLight} opacity="0.35" />
        <Path d={CLEARING_MOSS[1]} fill={palette.earthAlive} opacity="0.32" />
        <Path d={CLEARING_MOSS[2]} fill={palette.earthAlive} opacity="0.18" />
        <Ellipse cx="562" cy="714" rx="16" ry="9" fill={palette.trunkDark} opacity="0.35" />
        <Ellipse cx="556" cy="710" rx="7" ry="4" fill={palette.trunkLight} opacity="0.3" />
        <Ellipse cx="260" cy="720" rx="11" ry="7" fill={palette.trunkDark} opacity="0.3" />
        {BASE_TUFTS.map((d, i) => (
          <Path
            key={`tuft-${i}`}
            d={d}
            stroke={palette.leafDeep}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            opacity="0.62"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
});

const TREE_PALETTES = {
  // EM RECUPERAÇÃO — tons de ocre, areia e cáqui poeirento, sóbrios
  withered: {
    trunkLight: "#7A6450",
    trunk: "#5C4A3A",
    trunkDark: "#41342A",
    branch: "#6B5746",
    leafLight: "#CEC8A0",
    leaf: "#A7A578",
    leafDark: "#8C8A63",
    leafDeep: "#6F6E4E",
    fruit: "#B08453",
    fruitLight: "#D8B27C",
    earthDead: "#6B5746",
    earthAlive: "#9C9A6F",
    earthAliveLight: "#C0BD90",
    bgTreeTrunk: "#7A6450",
    bgTreeLeaf: "#AEAE85",
    bgTreeLeafLight: "#CAC9A0",
    orbLight: "#ECE5CB",
    orbDark: "#A99C73",
    orbStroke: "#FBF6EA",
    orbGlow: "#D8C79B",
    haze: "#F3E9CF",
    shadow: "#3A2E22",
  },
  // EM CRESCIMENTO — sálvia, musgo e casca quente: o estado acolhedor padrão
  growing: {
    trunkLight: "#7A5F47",
    trunk: "#5B4636",
    trunkDark: "#41311F",
    branch: "#6B533D",
    leafLight: "#C8DCA0",
    leaf: "#8FA86B",
    leafDark: "#5F7544",
    leafDeep: "#4A5E34",
    fruit: "#C56B3E",
    fruitLight: "#E89F60",
    earthDead: "#7A6450",
    earthAlive: "#8BA86A",
    earthAliveLight: "#BAD193",
    bgTreeTrunk: "#8A6F55",
    bgTreeLeaf: "#9DBE74",
    bgTreeLeafLight: "#C4DB9E",
    orbLight: "#E1ECBE",
    orbDark: "#6E8C49",
    orbStroke: "#FBF6EA",
    orbGlow: "#AECB7E",
    haze: "#FAF1D6",
    shadow: "#3A2E1F",
  },
  // ALTA VITALIDADE — verdes joia exuberantes e frutos de âmbar dourado
  thriving: {
    trunkLight: "#6E5238",
    trunk: "#503B2B",
    trunkDark: "#382617",
    branch: "#5E4631",
    leafLight: "#C4E390",
    leaf: "#7BA348",
    leafDark: "#4C7A2E",
    leafDeep: "#356021",
    fruit: "#E1A23E",
    fruitLight: "#F8D680",
    earthDead: "#6E5238",
    earthAlive: "#7FAE5A",
    earthAliveLight: "#B3DF8A",
    bgTreeTrunk: "#7E624A",
    bgTreeLeaf: "#86B85A",
    bgTreeLeafLight: "#B9DE8A",
    orbLight: "#FCE8AC",
    orbDark: "#5C8A33",
    orbStroke: "#FFFDF2",
    orbGlow: "#EBCD78",
    haze: "#FFF4D4",
    shadow: "#33260F",
  },
} as const;
