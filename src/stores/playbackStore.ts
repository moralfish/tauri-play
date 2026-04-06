import { create } from "zustand";
import type { MediaItem } from "../types";
import * as api from "../api/commands";

interface PlaybackState {
  currentItem: MediaItem | null;
  streamUrl: string | null;
  isPlaying: boolean;
  queue: MediaItem[];
  queueIndex: number;
  currentTime: number;
  duration: number;
  waveformPeaks: number[];
  showQueue: boolean;
  volume: number;
  setVolume: (volume: number) => void;
  playItem: (item: MediaItem) => Promise<void>;
  setQueue: (items: MediaItem[], startIndex?: number) => Promise<void>;
  playNext: (item: MediaItem) => void;
  addToQueue: (item: MediaItem) => void;
  removeFromQueue: (index: number) => void;
  playFromQueue: (index: number) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  toggleQueue: () => void;
  clearQueue: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  currentItem: null,
  streamUrl: null,
  isPlaying: false,
  queue: [],
  queueIndex: -1,
  currentTime: 0,
  duration: 0,
  waveformPeaks: [],
  showQueue: false,
  volume: 1,

  playItem: async (item) => {
    try {
      const url = await api.play(item.id);
      set({
        currentItem: item,
        streamUrl: url,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
      });
      // Fetch waveform in background
      api
        .getWaveform(item.id)
        .then((peaks) => {
          if (get().currentItem?.id === item.id) {
            set({ waveformPeaks: peaks });
          }
        })
        .catch(() => set({ waveformPeaks: [] }));
    } catch (e) {
      console.error("Play failed:", e);
    }
  },

  setQueue: async (items, startIndex = 0) => {
    set({ queue: items, queueIndex: startIndex });
    if (items.length > 0 && startIndex < items.length) {
      await get().playItem(items[startIndex]);
    }
  },

  playNext: (item) => {
    const { queue, queueIndex } = get();
    const newQueue = [...queue];
    // Insert after current track
    const insertAt = queueIndex + 1;
    newQueue.splice(insertAt, 0, item);
    set({ queue: newQueue });
  },

  addToQueue: (item) => {
    const { queue } = get();
    set({ queue: [...queue, item] });
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    if (index === queueIndex) return; // Can't remove currently playing
    const newQueue = queue.filter((_, i) => i !== index);
    // Adjust queueIndex if needed
    const newIndex = index < queueIndex ? queueIndex - 1 : queueIndex;
    set({ queue: newQueue, queueIndex: newIndex });
  },

  playFromQueue: async (index) => {
    const { queue } = get();
    if (index >= 0 && index < queue.length) {
      set({ queueIndex: index });
      await get().playItem(queue[index]);
    }
  },

  next: async () => {
    const { queue, queueIndex } = get();
    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) {
      set({ queueIndex: nextIndex });
      await get().playItem(queue[nextIndex]);
    } else {
      set({ isPlaying: false });
    }
  },

  prev: async () => {
    const { queue, queueIndex } = get();
    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0) {
      set({ queueIndex: prevIndex });
      await get().playItem(queue[prevIndex]);
    }
  },

  togglePlay: () => {
    set((s) => ({ isPlaying: !s.isPlaying }));
  },

  setPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  setCurrentTime: (time) => {
    set({ currentTime: time });
  },

  setDuration: (duration) => {
    set({ duration });
  },

  toggleQueue: () => {
    set((s) => ({ showQueue: !s.showQueue }));
  },

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)) });
  },

  clearQueue: () => {
    set({
      queue: [],
      queueIndex: -1,
      currentItem: null,
      streamUrl: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      waveformPeaks: [],
    });
  },
}));
