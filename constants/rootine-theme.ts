/**
 * Design system "Naturalismo Sofisticado e Orgânico" do Rootine.
 * Fonte única dos tokens usados por todas as abas — a aba Habitat define a
 * direção de arte (parchment, sálvia, musgo, terracota) e as demais herdam.
 *
 * Padrão de uso nas telas:
 *   const { T, night } = useRootineTheme();
 *   const styles = night ? STYLES.night : STYLES.day; // STYLES pré-computado
 */
import { Platform, useColorScheme } from "react-native";

export const ROOTINE_THEMES = {
  day: {
    bg: "#F6EFDB",
    ink: "#37362B",
    inkSoft: "#6E6655",
    inkFaint: "#988D76",
    accent: "#B07D52",
    rule: "rgba(90, 70, 50, 0.32)",
    card: "#FBF6EA",
    cardBorder: "rgba(90, 70, 50, 0.14)",
    glass: "rgba(251, 246, 234, 0.66)",
    glassStrong: "rgba(251, 246, 234, 0.92)",
    moss: "#6F7F5C",
    mossDeep: "#4B543C",
    onMoss: "#FBF6EA",
    progressFill: "#6F7F5C",
    chipBg: "rgba(157, 171, 133, 0.2)",
    chipBorder: "rgba(111, 127, 92, 0.28)",
    chipText: "#4B543C",
    track: "rgba(90, 70, 50, 0.12)",
    inputBg: "rgba(90, 70, 50, 0.06)",
    inputBorder: "rgba(90, 70, 50, 0.12)",
    placeholder: "#A79C82",
    claySoft: "rgba(176, 125, 82, 0.14)",
    danger: "#A9553F",
    dangerSoft: "rgba(169, 85, 63, 0.12)",
    warn: "#9A7434",
    warnSoft: "rgba(154, 116, 52, 0.12)",
    shadow: "#5A4632",
    overlay: "rgba(20, 18, 12, 0.55)",
  },
  night: {
    bg: "#141B27",
    ink: "#F0E9D6",
    inkSoft: "rgba(240, 233, 214, 0.74)",
    inkFaint: "rgba(240, 233, 214, 0.5)",
    accent: "#D9A97C",
    rule: "rgba(240, 233, 214, 0.3)",
    card: "#1C2520",
    cardBorder: "rgba(240, 233, 214, 0.14)",
    glass: "rgba(15, 21, 15, 0.6)",
    glassStrong: "rgba(15, 21, 15, 0.9)",
    moss: "#7E9A5C",
    mossDeep: "#9DB87A",
    onMoss: "#F6F2E4",
    progressFill: "#9DB87A",
    chipBg: "rgba(157, 184, 122, 0.16)",
    chipBorder: "rgba(157, 184, 122, 0.34)",
    chipText: "#CFE0B0",
    track: "rgba(240, 233, 214, 0.16)",
    inputBg: "rgba(240, 233, 214, 0.08)",
    inputBorder: "rgba(240, 233, 214, 0.16)",
    placeholder: "rgba(240, 233, 214, 0.45)",
    claySoft: "rgba(217, 169, 124, 0.14)",
    danger: "#D08A70",
    dangerSoft: "rgba(208, 138, 112, 0.14)",
    warn: "#D4AC6B",
    warnSoft: "rgba(212, 172, 107, 0.14)",
    shadow: "#050705",
    overlay: "rgba(5, 8, 6, 0.62)",
  },
} as const;

export type RootineTheme = { [K in keyof (typeof ROOTINE_THEMES)["day"]]: string };

export function useRootineTheme(): { T: RootineTheme; night: boolean } {
  const scheme = useColorScheme();
  const night = scheme === "dark";
  return { T: night ? ROOTINE_THEMES.night : ROOTINE_THEMES.day, night };
}

/** Vidro real no web; nas plataformas nativas o rgba translúcido já basta. */
export const GLASS_WEB =
  Platform.OS === "web"
    ? ({ backdropFilter: "blur(18px) saturate(1.15)" } as any)
    : null;

/** Sombra tingida padrão dos cards (quente de dia, profunda à noite). */
export const softShadow = (T: RootineTheme) =>
  ({
    shadowColor: T.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  }) as const;
