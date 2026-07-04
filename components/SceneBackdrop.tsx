import { grassTuft, ridgePath } from "@/lib/visual/organic";
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * Cenário de fundo discreto compartilhado pelas abas de conteúdo — a mesma
 * paisagem do Habitat, em intensidade reduzida para não competir com cards
 * e texto. Estica junto com a janela; formas toleram distorção.
 */

const RIDGE_FAR = ridgePath(390, 300, 44, 7, 91, 844);
const RIDGE_MID = ridgePath(390, 470, 42, 10, 97, 844);
const GROUND = ridgePath(390, 716, 30, 6, 103, 844);

const TUFTS = [
  ...grassTuft(28, 848, 46, 4, 501),
  ...grassTuft(362, 848, 40, 3, 507),
  ...grassTuft(180, 850, 30, 3, 513),
];

const POLLEN = [
  { cx: 60, cy: 150, r: 3 },
  { cx: 320, cy: 110, r: 2.5 },
  { cx: 210, cy: 210, r: 2 },
  { cx: 120, cy: 90, r: 2 },
];

const STARS = [
  { cx: 40, cy: 60, r: 1.6, o: 0.7 },
  { cx: 120, cy: 34, r: 1.2, o: 0.5 },
  { cx: 205, cy: 80, r: 1.8, o: 0.65 },
  { cx: 286, cy: 44, r: 1.2, o: 0.45 },
  { cx: 348, cy: 96, r: 1.6, o: 0.6 },
  { cx: 78, cy: 140, r: 1.1, o: 0.4 },
  { cx: 255, cy: 150, r: 1.3, o: 0.45 },
  { cx: 330, cy: 190, r: 1.1, o: 0.35 },
];

const SCENES = {
  day: {
    skyTop: "#F7F0DD",
    skyMid: "#EDEACC",
    horizon: "#D6DAB4",
    glow: "#FBF1D6",
    glowOpacity: 0.55,
    ridgeFar: "#AEBB90",
    ridgeFarOpacity: 0.3,
    ridgeMid: "#93A374",
    ridgeMidOpacity: 0.32,
    groundHi: "#8B9B6E",
    groundLo: "#5C6845",
    groundOpacity: 0.55,
    grass: "#4A573A",
    mote: "#F6EFD8",
  },
  night: {
    skyTop: "#141B27",
    skyMid: "#1B2530",
    horizon: "#243430",
    glow: "#C7D4C2",
    glowOpacity: 0.1,
    ridgeFar: "#233029",
    ridgeFarOpacity: 0.85,
    ridgeMid: "#1D2921",
    ridgeMidOpacity: 0.9,
    groundHi: "#202B1B",
    groundLo: "#121A0E",
    groundOpacity: 0.9,
    grass: "#0C110B",
    mote: "#EFE9D2",
  },
} as const;

export function SceneBackdrop({ night }: { night: boolean }) {
  const S = night ? SCENES.night : SCENES.day;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="rtbg-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={S.skyTop} />
            <Stop offset="0.55" stopColor={S.skyMid} />
            <Stop offset="1" stopColor={S.horizon} />
          </LinearGradient>
          <LinearGradient id="rtbg-ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={S.groundHi} />
            <Stop offset="1" stopColor={S.groundLo} />
          </LinearGradient>
          <RadialGradient id="rtbg-glow" cx="0.4" cy="0.32" r="0.66">
            <Stop offset="0" stopColor={S.glow} stopOpacity={S.glowOpacity} />
            <Stop offset="1" stopColor={S.glow} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect width="390" height="844" fill="url(#rtbg-sky)" />
        <Rect x="-40" y="-30" width="470" height="520" fill="url(#rtbg-glow)" />

        <Path d={RIDGE_FAR} fill={S.ridgeFar} opacity={S.ridgeFarOpacity} />
        <Path d={RIDGE_MID} fill={S.ridgeMid} opacity={S.ridgeMidOpacity} />
        <Path d={GROUND} fill="url(#rtbg-ground)" opacity={S.groundOpacity} />

        {night
          ? STARS.map((star, i) => (
              <Circle
                key={`star-${i}`}
                cx={star.cx}
                cy={star.cy}
                r={star.r}
                fill={S.mote}
                opacity={star.o}
              />
            ))
          : POLLEN.map((mote, i) => (
              <Circle
                key={`mote-${i}`}
                cx={mote.cx}
                cy={mote.cy}
                r={mote.r}
                fill={S.mote}
                opacity={0.35}
              />
            ))}

        {TUFTS.map((d, i) => (
          <Path
            key={`tuft-${i}`}
            d={d}
            stroke={S.grass}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            opacity="0.4"
          />
        ))}
      </Svg>
    </View>
  );
}
