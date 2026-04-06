export type MediaKind = "Audio" | "Video";

export interface MediaItem {
  id: string;
  source_id: string;
  source_type: "local" | "gdrive";
  external_id: string;
  name: string;
  mime_type: string;
  kind: MediaKind;
  // Metadata
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  duration_secs: number | null;
  year: number | null;
  genre: string | null;
  artwork_hash: string | null;
  file_size: number | null;
  last_modified: number | null;
}

export interface Playlist {
  id: string;
  name: string;
  is_source: boolean;
}

export interface PlaylistEntry {
  id: string;
  playlist_id: string;
  media_id: string;
  position: number;
}

export interface ScanResult {
  items_found: number;
  playlists_found: number;
}

export interface WriteMetadata {
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  track_number?: number;
  year?: number;
  genre?: string;
}

export interface CacheStats {
  total_bytes: number;
  item_count: number;
}

export interface GDriveStatus {
  connected: boolean;
  has_credentials: boolean;
}

export interface GDriveFolder {
  id: string;
  name: string;
}
