import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { useRootineTheme } from "@/hooks/useRootineTheme";

interface RootineBackgroundProps {
  variant?: "trail" | "adventure" | "journal" | "community";
}

export function RootineBackground({ variant = "trail" }: RootineBackgroundProps) {
  const { theme } = useRootineTheme();
  const colors = theme.colors;
  const top = variant === "community" ? colors.infoSoft : colors.background;
  const hill = variant === "adventure" ? colors.accentSoft : colors.primarySoft;
  const line = variant === "journal" ? colors.accent : colors.primary;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 840" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`rootine-bg-${variant}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.55" stopColor={colors.background} />
            <Stop offset="1" stopColor={colors.backgroundAlt} />
          </LinearGradient>
        </Defs>
        <Rect width="390" height="840" fill={`url(#rootine-bg-${variant})`} />
        <Path
          d="M0 168 C52 128 103 153 156 118 C217 78 289 104 390 54 L390 0 L0 0 Z"
          fill={colors.transparentInk}
          opacity="0.42"
        />
        <Path
          d="M-20 724 C70 660 137 704 210 656 C282 609 326 625 410 572 L410 840 L-20 840 Z"
          fill={hill}
          opacity={theme.mode === "dark" ? 0.24 : 0.5}
        />
        <Path
          d="M22 238 C44 218 61 217 74 234 C55 236 43 250 36 272 C33 259 27 248 22 238 Z"
          fill={line}
          opacity="0.18"
        />
        <Path
          d="M318 199 C342 176 365 181 378 207 C350 201 337 215 328 239 C326 224 322 211 318 199 Z"
          fill={line}
          opacity="0.14"
        />
        <Path
          d="M22 796 C83 758 146 781 207 748 C274 712 330 725 394 690"
          fill="none"
          stroke={line}
          strokeLinecap="round"
          strokeWidth="2"
          opacity="0.2"
        />
      </Svg>
    </View>
  );
}
