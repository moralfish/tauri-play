import { create } from "zustand";
import type { MediaItem, ScanResult, ScanProgress } from "../types";
import * as api from "../api/commands";
import { listen } from "@tauri-apps/api/event";

const RECENT_FILES_LIMIT = 8;

interface LibraryState {
  items: MediaItem[];
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

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
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
      set({ items });
    } catch (e) {
      console.error("Refresh failed:", e);
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
      api.getMediaItems().then((items) => set({ items })).catch(console.error);
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
      api.getMediaItems().then((items) => set({ items })).catch(console.error);
    });
    listen<string>("scan-error", (e) => {
      set({
        isScanning: false,
        scanProgress: null,
        scanRecentFiles: [],
        scanError: e.payload,
      });
    });
  },
}));
