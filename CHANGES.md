# Changelog

All notable changes to **Tauri Play** are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Each entry is grouped into the following categories:

- **Added** -- new features
- **Changed** -- changes to existing behaviour that are not bug fixes
- **Deprecated** -- features still present but slated for removal
- **Removed** -- features that have been deleted
- **Fixed** -- bug fixes
- **Security** -- vulnerabilities addressed

The version declared in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json` **must** match the latest released version in this
file. Bump all three on every release and add a new section here describing
what changed.

## [Unreleased]

## [0.2.0] - 2026-04-11

### Added
- **Background metadata hydration for Google Drive tracks.** After every
  background sync tick, the new `sync_gdrive_metadata` pass walks all gdrive
  rows whose `title`, `artist`, and `duration_secs` are still NULL, downloads
  each file to a throwaway temp path under `gdrive_meta_tmp/`, decodes tags
  via lofty on a blocking thread, upserts the enriched `MediaItem` plus any
  embedded artwork, then deletes the temp file. The cache_manager is
  intentionally untouched so background sync never competes with the
  play-driven LRU cache. Progress is streamed to the UI via `media-cached`
  events and a batched `library-updated` every 10 tracks.
- **Stable frontend library ordering.** A new `stableOrderRef` layer in
  `Library.tsx` freezes row positions by track id: previously-seen tracks
  keep their slot, newly-arrived tracks are appended in backend order, and
  deletions are honoured. Explicit sort-header clicks still resort on top of
  the stable view.
- **`get_gdrive_items_needing_metadata` SQL query** in `db/queries.rs`
  backing the metadata hydration pass.
- **Versioning section in `README.md`** documenting the SemVer 2.0.0 policy,
  pre-release / build-metadata suffix conventions, and the three files that
  hold the canonical version.
- **Expanded README Features section** to cover existing-but-undocumented
  capabilities: multi-row selection, bulk track removal with cascade
  cleanup, source filter (All / Local / Cloud), per-folder Drive scoping,
  and the separation between the LRU file cache and the metadata-only sync
  path.

### Changed
- **"Scan Google Drive" button** is now disabled when no Drive folders have
  been selected. Hovering shows the tooltip "Add at least one scan folder
  first" and the cursor changes to `not-allowed`.
- **Background sync loop** (`services/sync.rs`) now schedules a detached
  metadata-hydration task after each scan completes, so the next sync tick
  isn't blocked waiting on Drive downloads.

### Removed
- **Close-panel button on the Now Playing sidebar** (both collapsed strip
  and expanded header views) along with the now-unused `toggleRightPanel`
  selector inside `NowPlayingPanel.tsx`. The sidebar is now toggled
  exclusively from the main app chrome; the collapse/expand chevron remains.

### Fixed
- **Library rows no longer jump position when a Google Drive track's
  metadata is hydrated mid-listen.** Previously, the backend's
  `ORDER BY artist, album, track_number, name` clause meant that the moment
  a freshly-played gdrive track had its tags decoded, it would slide to a
  new spot in the list as soon as the next `library-updated` event fired.
  The new stable-ordering layer pins each row in place until the user
  explicitly reorders or the row is removed.

## [0.1.0] - Initial release

### Added
- Local media playback for MP3, FLAC, WAV, OGG, AAC, M4A, WMA, MP4, MKV,
  AVI, WebM, and MOV files.
- Google Drive streaming with OAuth 2.0 sign-in flow.
- Real-time waveform visualization with click-to-seek.
- Metadata read/write via lofty for ID3v2, Vorbis, and MP4 tags.
- Album artwork extraction with SHA-256 deduplication and HTTP caching.
- Playlist creation, drag-and-drop reordering, and M3U/M3U8 auto-detection.
- Queue management with Play Next, Add to Queue, Clear, and reorder.
- Customizable, reorderable library columns persisted across sessions.
- Track search and column-header sorting.
- Periodic background sync for configured local directories and Drive
  folders.
- Configurable LRU file cache for Google Drive downloads (default 2 GB).
- Volume control with mute toggle.
- Right-click context menus for play / queue / playlist / reload actions.
- Dark theme built with Tailwind CSS 4.
- SQLite database with WAL mode and `PRAGMA user_version` auto-migration.
- Local Axum streaming server on `127.0.0.1:9876` for HTTP Range requests
  and Drive proxy streaming.

[Unreleased]: https://example.invalid/compare/v0.2.0...HEAD
[0.2.0]: https://example.invalid/compare/v0.1.0...v0.2.0
[0.1.0]: https://example.invalid/releases/tag/v0.1.0
