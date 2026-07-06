import { getRootineTheme } from "@/constants/rootine-theme";
import { useRootineThemeStore } from "@/store/useRootineThemeStore";

export function useRootineTheme() {
  const mode = useRootineThemeStore((state) => state.mode);
  const setMode = useRootineThemeStore((state) => state.setMode);
  const toggleMode = useRootineThemeStore((state) => state.toggleMode);
  const theme = getRootineTheme(mode);

  return {
    mode,
    theme,
    colors: theme.colors,
    habitat: theme.habitat,
    categories: theme.categories,
    setMode,
    toggleMode,
  };
}
