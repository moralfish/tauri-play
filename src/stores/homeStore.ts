import { create } from "zustand";
import type { MediaItem } from "../types";
import * as api from "../api/commands";
import { listen } from "@tauri-apps/api/event";

// Each section fetches its own row; the Home screen fans them out in a
// single `Promise.all` on refresh so the whole view becomes visible in one
// paint. Sections are kept to ~12 items — enough to fill a scroller with
// overflow for two pages without dragging megabytes out of SQLite.
const SECTION_LIMIT = 12;

interface HomeState {
  recentlyPlayed: MediaItem[];
  mostPlayed: MediaItem[];
  recentlyAdded: MediaItem[];
  backInRotation: MediaItem[];
  favorites: MediaItem[];
  lateNight: MediaItem[];
  highEnergy: MediaItem[];
  favoriteIds: Set<string>;
  isLoading: boolean;
  lastRefreshedAt: number;
  refresh: () => Promise<void>;
  initEventListeners: () => void;
  // Optimistic: update the in-memory favorite id set without round-tripping.
  setFavorite: (mediaId: string, isFavorite: boolean) => void;
}

let listenersInitialized = false;

// Same debounce trick used by `libraryStore`: absorb bursts of
// `library-updated` / `media-cached` / `favorites-updated` events so rapid
// playback logging doesn't hammer SQLite for 7 different queries per track.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleRefresh = (refresh: () => Promise<void>) => {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, 1500);
};

export const useHomeStore = create<HomeState>((set, get) => ({
  recentlyPlayed: [],
  mostPlayed: [],
  recentlyAdded: [],
  backInRotation: [],
  favorites: [],
  lateNight: [],
  highEnergy: [],
  favoriteIds: new Set(),
  isLoading: false,
  lastRefreshedAt: 0,

  refresh: async () => {
    set({ isLoading: true });
    try {
      const [
        recentlyPlayed,
        mostPlayed,
        recentlyAdded,
        backInRotation,
        favorites,
        lateNight,
        highEnergy,
        favoriteIds,
      ] = await Promise.all([
        api.getRecentlyPlayed(SECTION_LIMIT),
        api.getMostPlayed(SECTION_LIMIT),
        api.getRecentlyAdded(SECTION_LIMIT),
        api.getBackInRotation(SECTION_LIMIT),
        api.getFavorites(SECTION_LIMIT),
        api.getLateNightTracks(SECTION_LIMIT),
        api.getHighEnergyTracks(SECTION_LIMIT),
        api.getFavoriteIds(),
      ]);
      set({
        recentlyPlayed,
        mostPlayed,
        recentlyAdded,
        backInRotation,
        favorites,
        lateNight,
        highEnergy,
        favoriteIds: new Set(favoriteIds),
        isLoading: false,
        lastRefreshedAt: Date.now(),
      });
    } catch (e) {
      console.error("Home refresh failed:", e);
      set({ isLoading: false });
    }
  },

  initEventListeners: () => {
    if (listenersInitialized) return;
    listenersInitialized = true;

    const { refresh } = get();
    // Kick off initial load once event listeners are armed.
    void refresh();

    // Library rescans + gdrive cache hydration both change what appears
    // in `Recently Added` and in the cover art we can show.
    void listen("library-updated", () => scheduleRefresh(get().refresh));
    void listen("media-cached", () => scheduleRefresh(get().refresh));
    // `favorites-updated` fires from `toggle_favorite` — keep the Favorites
    // row and the `favoriteIds` Set in sync for the heart button in Player.
    void listen<string>("favorites-updated", () =>
      scheduleRefresh(get().refresh),
    );
  },

  setFavorite: (mediaId, isFavorite) => {
    const next = new Set(get().favoriteIds);
    if (isFavorite) next.add(mediaId);
    else next.delete(mediaId);
    set({ favoriteIds: next });
  },
}));
