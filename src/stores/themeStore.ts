import { create } from "zustand";
import { saveAppState, getAppState } from "../api/commands";

type ThemeChoice = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeStore {
  theme: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (t: ThemeChoice) => void;
  init: () => void;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolve(theme: ThemeChoice): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme) {
  if (resolved === "dark") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = resolved;
  }
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: (localStorage.getItem("theme") as ThemeChoice) || "system",
  resolved: resolve(
    (localStorage.getItem("theme") as ThemeChoice) || "system"
  ),

  setTheme: (t: ThemeChoice) => {
    const resolved = resolve(t);
    localStorage.setItem("theme", t);
    applyTheme(resolved);
    set({ theme: t, resolved });
    saveAppState("theme", t).catch(() => {});
  },

  init: () => {
    // Apply immediately from localStorage (sync, no flash)
    const cached = localStorage.getItem("theme") as ThemeChoice | null;
    const initial = cached || "system";
    applyTheme(resolve(initial));
    set({ theme: initial, resolved: resolve(initial) });

    // Then load from backend (authoritative)
    getAppState("theme").then((saved) => {
      if (saved && saved !== get().theme) {
        const t = saved as ThemeChoice;
        const resolved = resolve(t);
        localStorage.setItem("theme", t);
        applyTheme(resolved);
        set({ theme: t, resolved });
      }
    }).catch(() => {});

    // Listen for OS theme changes when in system mode
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      if (get().theme === "system") {
        const resolved = getSystemTheme();
        applyTheme(resolved);
        set({ resolved });
      }
    });
  },
}));
