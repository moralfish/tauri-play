import { create } from "zustand";
import type { MediaItem, ScanResult } from "../types";
import * as api from "../api/commands";
import { listen } from "@tauri-apps/api/event";

interface LibraryState {
  items: MediaItem[];
  isScanning: boolean;
  lastScan: ScanResult | null;
  scan: () => Promise<void>;
  refresh: () => Promise<void>;
  initEventListeners: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  items: [],
  isScanning: false,
  lastScan: null,

  scan: async () => {
    set({ isScanning: true });
    try {
      const result = await api.scanLibrary();
      const items = await api.getMediaItems();
      set({ items, lastScan: result, isScanning: false });
    } catch (e) {
      console.error("Scan failed:", e);
      set({ isScanning: false });
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

  initEventListeners: () => {
    // Listen for background sync events
    listen("library-updated", () => {
      api.getMediaItems().then((items) => set({ items })).catch(console.error);
    });
    listen("sync-started", () => {
      set({ isScanning: true });
    });
    listen("sync-completed", () => {
      set({ isScanning: false });
    });
  },
}));
