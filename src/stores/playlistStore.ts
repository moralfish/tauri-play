import { create } from "zustand";
import type { MediaItem, Playlist } from "../types";
import * as api from "../api/commands";

interface PlaylistState {
  playlists: Playlist[];
  activePlaylistId: string | null;
  activePlaylistTracks: MediaItem[];
  fetchPlaylists: () => Promise<void>;
  selectPlaylist: (id: string | null) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, newName: string) => Promise<void>;
  addTrack: (playlistId: string, mediaId: string) => Promise<void>;
  removeTrack: (entryId: string) => Promise<void>;
  reorderTracks: (playlistId: string, orderedMediaIds: string[]) => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: [],
  activePlaylistId: null,
  activePlaylistTracks: [],

  fetchPlaylists: async () => {
    const playlists = await api.getPlaylists();
    set({ playlists });
  },

  selectPlaylist: async (id) => {
    if (id === null) {
      set({ activePlaylistId: null, activePlaylistTracks: [] });
      return;
    }
    const tracks = await api.getPlaylistTracks(id);
    set({ activePlaylistId: id, activePlaylistTracks: tracks });
  },

  createPlaylist: async (name) => {
    await api.createPlaylist(name);
    await get().fetchPlaylists();
  },

  deletePlaylist: async (id) => {
    await api.deletePlaylist(id);
    const state = get();
    if (state.activePlaylistId === id) {
      set({ activePlaylistId: null, activePlaylistTracks: [] });
    }
    await state.fetchPlaylists();
  },

  renamePlaylist: async (id, newName) => {
    await api.renamePlaylist(id, newName);
    await get().fetchPlaylists();
  },

  addTrack: async (playlistId, mediaId) => {
    await api.addTrackToPlaylist(playlistId, mediaId);
    const state = get();
    if (state.activePlaylistId === playlistId) {
      await state.selectPlaylist(playlistId);
    }
  },

  removeTrack: async (entryId) => {
    await api.removeTrackFromPlaylist(entryId);
    const state = get();
    if (state.activePlaylistId) {
      await state.selectPlaylist(state.activePlaylistId);
    }
  },

  reorderTracks: async (playlistId, orderedMediaIds) => {
    await api.reorderPlaylist(playlistId, orderedMediaIds);
    const state = get();
    if (state.activePlaylistId === playlistId) {
      await state.selectPlaylist(playlistId);
    }
  },
}));
