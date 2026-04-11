import { invoke } from "@tauri-apps/api/core";
import type {
  MediaItem,
  Playlist,
  WriteMetadata,
  CacheStats,
  GDriveStatus,
  GDriveFolder,
} from "../types";

// Library
export const scanLibrary = () => invoke<void>("scan_library");
export const getMediaItems = () => invoke<MediaItem[]>("get_media_items");
export const addDirectory = (path: string) => invoke("add_directory", { path });
export const removeDirectory = (id: string) =>
  invoke("remove_directory", { id });
export const getDirectories = () =>
  invoke<[string, string][]>("get_directories");

// Remove a specific set of tracks from the library. Returns the number of
// rows actually deleted.
export const deleteMediaItems = (ids: string[]) =>
  invoke<number>("delete_media_items", { ids });

// Nuke every track from the library (source config is preserved).
export const flushLibrary = () => invoke<number>("flush_library");

// Metadata write-back
export const writeMetadata = (mediaId: string, meta: WriteMetadata) =>
  invoke<MediaItem>("write_metadata", { mediaId, meta });

// Playback
export const play = (mediaId: string) => invoke<string>("play", { mediaId });
export const getWaveform = (mediaId: string) =>
  invoke<number[]>("get_waveform", { mediaId });

// Playlists
export const getPlaylists = () => invoke<Playlist[]>("get_playlists");
export const getPlaylistTracks = (playlistId: string) =>
  invoke<MediaItem[]>("get_playlist_tracks", { playlistId });
export const createPlaylist = (name: string) =>
  invoke<Playlist>("create_playlist", { name });
export const deletePlaylist = (id: string) =>
  invoke("delete_playlist", { id });
export const renamePlaylist = (id: string, newName: string) =>
  invoke("rename_playlist", { id, newName });
export const addTrackToPlaylist = (playlistId: string, mediaId: string) =>
  invoke("add_track_to_playlist", { playlistId, mediaId });
export const removeTrackFromPlaylist = (entryId: string) =>
  invoke("remove_track_from_playlist", { entryId });
export const reorderPlaylist = (
  playlistId: string,
  orderedMediaIds: string[]
) => invoke("reorder_playlist", { playlistId, orderedMediaIds });

// Cache
export const getCacheStats = () => invoke<CacheStats>("get_cache_stats");
export const clearCache = () => invoke("clear_cache");
export const setCacheMaxBytes = (maxBytes: number) =>
  invoke("set_cache_max_bytes", { maxBytes });
export const openCacheFolder = () => invoke("open_cache_folder");

// App state persistence
export const saveAppState = (key: string, value: string) =>
  invoke("save_app_state", { key, value });
export const getAppState = (key: string) =>
  invoke<string | null>("get_app_state", { key });

// Google Drive
export const connectGDrive = (clientId: string, clientSecret: string) =>
  invoke("connect_gdrive", { clientId, clientSecret });
export const disconnectGDrive = () => invoke("disconnect_gdrive");
export const getGDriveStatus = () =>
  invoke<GDriveStatus>("get_gdrive_status");
export const listGDriveFolders = (parentId?: string) =>
  invoke<GDriveFolder[]>("list_gdrive_folders", {
    parentId: parentId ?? null,
  });
export const addGDriveFolder = (folderId: string, folderName: string) =>
  invoke("add_gdrive_folder", { folderId, folderName });
export const removeGDriveFolder = (folderId: string) =>
  invoke<number>("remove_gdrive_folder", { folderId });
export const getGDriveFolders = () =>
  invoke<GDriveFolder[]>("get_gdrive_folders");

// Artwork URL helper
export const artworkUrl = (hash: string) =>
  `http://127.0.0.1:9876/artwork/${hash}`;
