import { create } from "zustand";
import type { MediaItem, ScanResult, ScanProgress } from "../types";
import * as api from "../api/commands";
import { listen } from "@tauri-apps/api/event";
import { usePlaybackStore } from "./playbackStore";

const RECENT_FILES_LIMIT = 8;

interface LibraryState {
  items: MediaItem[];
  isLoading: boolean;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  scanRecentFiles: string[];
  scanModalDismissed: boolean;
  scanError: string | null;
  lastScan: ScanResult | null;
  scan: () => Promise<void>;
  refresh: () => Promise<void>;
  initEventListeners: () => void;
  dismissScanModal: () => void;
  showScanModal: () => void;
  clearScanError: () => void;
}

let listenersInitialized = false;

// Debounce burst refetches so a flood of library-updated events (e.g. when
// gdrive cache hydration finishes for dozens of tracks in a row, or a scan
// emits progress after every file) collapses into a single getMediaItems()
// round-trip. Holding this at ~250ms feels instantaneous to a user but
// absorbs hundreds of rapid updates.
let refetchTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleLibraryRefetch = (set: (s: Partial<LibraryState>) => void) => {
  if (refetchTimer) return;
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    api
      .getMediaItems()
      .then((items) => set({ items, isLoading: false }))
      .catch(console.error);
  }, 250);
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  isLoading: true,
  isScanning: false,
  scanProgress: null,
  scanRecentFiles: [],
  scanModalDismissed: false,
  scanError: null,
  lastScan: null,

  scan: async () => {
    if (get().isScanning) return;
    set({
      isScanning: true,
      scanProgress: {
        stage: "starting",
        message: "Starting scan...",
        current: 0,
        total: 0,
        currentFile: null,
      },
      scanRecentFiles: [],
      scanModalDismissed: false,
      scanError: null,
    });
    try {
      // Returns immediately — backend runs in spawn_blocking and emits events
      await api.scanLibrary();
    } catch (e) {
      console.error("Scan failed to start:", e);
      set({ isScanning: false, scanError: String(e) });
    }
  },

  refresh: async () => {
    try {
      const items = await api.getMediaItems();
      set({ items, isLoading: false });
    } catch (e) {
      console.error("Refresh failed:", e);
      set({ isLoading: false });
    }
  },

  dismissScanModal: () => set({ scanModalDismissed: true }),
  showScanModal: () => set({ scanModalDismissed: false }),
  clearScanError: () => set({ scanError: null }),

  initEventListeners: () => {
    if (listenersInitialized) return;
    listenersInitialized = true;

    // Background sync events (existing)
    listen("library-updated", () => {
      scheduleLibraryRefetch(set);
    });
    listen("sync-started", () => {
      // Background sync — don't show the modal, just mark scanning
      set({ isScanning: true });
    });
    listen("sync-completed", () => {
      set({ isScanning: false, scanProgress: null });
    });

    // User-initiated scan events
    listen<ScanProgress>("scan-progress", (e) => {
      const payload = e.payload;
      set((state) => {
        let recent = state.scanRecentFiles;
        if (payload.currentFile && payload.currentFile !== recent[0]) {
          recent = [payload.currentFile, ...recent].slice(0, RECENT_FILES_LIMIT);
        }
        return {
          scanProgress: payload,
          scanRecentFiles: recent,
          isScanning: true,
        };
      });
    });
    listen<ScanResult>("scan-completed", (e) => {
      set({
        isScanning: false,
        scanProgress: null,
        scanRecentFiles: [],
        lastScan: e.payload,
      });
      scheduleLibraryRefetch(set);
    });
    listen<string>("scan-error", (e) => {
      set({
        isScanning: false,
        scanProgress: null,
        scanRecentFiles: [],
        scanError: e.payload,
      });
    });

    // A cloud track just finished hydrating into the local cache —
    // trigger a debounced library refresh so the row picks up the new
    // title/artist/artwork, and reload the waveform if the newly cached
    // track is the one currently playing. We rely on the debouncer to
    // collapse bursts (a sync can cache dozens of tracks in seconds).
    listen<string>("media-cached", (e) => {
      const mediaId = e.payload;
      scheduleLibraryRefetch(set);
      const playback = usePlaybackStore.getState();
      if (playback.currentItem?.id === mediaId) {
        api
          .getWaveform(mediaId)
          .then((peaks) => {
            const current = usePlaybackStore.getState().currentItem;
            if (current?.id === mediaId) {
              usePlaybackStore.setState({ waveformPeaks: peaks });
            }
          })
          .catch(() => {});
      }
    });
  },
}));
