import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { RootineThemeMode } from "@/constants/rootine-theme";

interface RootineThemeState {
  mode: RootineThemeMode;
  setMode: (mode: RootineThemeMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "rootine-theme-v1";
const canUseClientStorage = typeof window !== "undefined";

function isThemeMode(value: unknown): value is RootineThemeMode {
  return value === "light" || value === "dark";
}

function persistMode(mode: RootineThemeMode) {
  if (!canUseClientStorage) return;

  AsyncStorage.setItem(STORAGE_KEY, mode).catch((error) => {
    console.error("[THEME] Erro ao persistir tema:", error);
  });
}

export const useRootineThemeStore = create<RootineThemeState>()((set, get) => ({
  mode: "light",
  setMode: (mode) => {
    set({ mode });
    persistMode(mode);
  },
  toggleMode: () => {
    const nextMode = get().mode === "light" ? "dark" : "light";
    set({ mode: nextMode });
    persistMode(nextMode);
  },
}));

if (canUseClientStorage) {
  AsyncStorage.getItem(STORAGE_KEY)
    .then((storedMode) => {
      if (isThemeMode(storedMode)) {
        useRootineThemeStore.setState({ mode: storedMode });
      }
    })
    .catch((error) => {
      console.error("[THEME] Erro ao carregar tema:", error);
    });
}
