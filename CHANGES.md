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

## [0.3.0] - 2026-04-11

### Added
- **Home screen** is now the app's default landing view. It stitches
  together a "Now Playing / Resume" hero card, a Recently Played scroller,
  Quick Actions (Shuffle, Play All, Open Queue, Recently Added), a
  "Library Highlights — Back in Rotation" row, Most Played, Recently
  Added, Favorites, and a two-up "Smart Suggestions" card band for Late
  Night Tracks and High Energy Session. Every section refreshes from one
  `Promise.all` fan-out and subscribes to `library-updated` /
  `media-cached` / `favorites-updated` so new plays, new files, and heart
  toggles land live without a second round-trip.
- **Play history, play counters, and favorites** are persistent. Schema
  migration **v4** adds a `play_history` table (indexed by `played_at`
  and `media_id`), a `favorites` table, and a `play_count` column on
  `media_items`. The `play()` command writes a `play_history` row and
  bumps the counter in a single transaction, best-effort, so playback
  never blocks on a bookkeeping failure.
- **Smart Suggestions run on simple heuristics.** "Late Night Tracks"
  selects rows whose `play_history.played_at` falls between 22:00 and
  05:00 local time, ordered by night-play frequency. "High Energy
  Session" filters on `genre` (house / techno / trance / dnb /
  electronic / rock / punk / metal) and shuffles.
- **Favorites with a working heart.** Clicking the heart in the transport
  bar toggles `favorites(media_id)` via the new `toggle_favorite` command,
  emits a `favorites-updated` event so Home refreshes, and updates the
  in-memory `favoriteIds: Set<string>` on the home store optimistically
  for instant visual feedback.
- **Library grid view.** The Library now has a list / grid toggle next
  to the source filter. Grid mode renders the same items as
  180-px stacked album cards, reusing the `AlbumCard` primitive that
  Home uses, wrapped in a width-aware virtualized grid that bounds the
  DOM to the visible row slice (essential at 9k+ tracks). The mode is
  persisted via `saveAppState("library_view_mode")`. Click-to-select,
  shift/cmd multi-select, right-click context menu, and
  drag-to-playlist all continue to work across both modes.
- **Design token system.** `--radius-panel` (20px), `--radius-card`
  (14px), `--radius-control` (10px), `--radius-chip` (999px),
  `--space-section` (32px), and `--space-gutter` (20px) are now the
  single source of truth for rounding and rhythm across every surface.
- **9 new Tauri commands** (`get_recently_played`, `get_most_played`,
  `get_recently_added`, `get_back_in_rotation`, `get_late_night_tracks`,
  `get_high_energy_tracks`, `get_favorites`, `get_favorite_ids`,
  `toggle_favorite`) with matching TypeScript bindings in
  `src/api/commands.ts`.

### Changed
- **Transport bar rebalanced into a true three-zone grid**
  (`minmax(240,280) / 1fr / minmax(240,320)`). The play-pause button is
  now the accent-colored hero control at 48 px, prev/next/shuffle/repeat
  round up to 36 px, and the old double-row waveform bar has been
  replaced with a thin 3-px progress strip pinned to the bottom edge of
  the player frame. Hovering the strip shows a lightweight time tooltip;
  clicking anywhere seeks.
- **Right Now-Playing panel simplified.** The verbose two-column
  "Details" metadata grid has been removed (it's moved to a forthcoming
  more-modal, reachable via a stub button in the panel header). The
  compact panel now carries a large artwork card + title/artist + inline
  prev/play/next row, plus a "Next Up" strip of small 64-px queue tiles
  that jump to their queue index on click.
- **Layout radii migrated to tokens.** `Layout.tsx`'s three zones and
  the floating player dock read `--radius-panel` instead of hard-coded
  `rounded-[20px]`. Theming a radius once now visually rotates the
  whole shell.
- `MediaItem` on both the Rust side (`src-tauri/src/models/media_item.rs`)
  and the TypeScript side (`src/types/index.ts`) gained three new
  derived fields — `play_count`, `last_played_at`, `is_favorite` — that
  are computed in SQL via `LEFT JOIN`s on `play_history` and `favorites`.

### Database
- **Migration v4**: adds `play_history`, `favorites`, `play_count`, and
  the two supporting indexes on `play_history`. Guarded by the same
  `pragma_table_info` existence check that `migrate_v3` uses, so
  repeated runs are idempotent.

## [0.2.3] - 2026-04-11

### Added
- **Warm orange accent (`#D4842A`)** replaces the previous blue across
  both dark and light themes, along with matching `--accent-soft`,
  `--bg-active`, and waveform tints so the whole UI (selection rings,
  active tab, progress bar, volume slider, playing indicator) carries a
  single cohesive accent.
- **Non-modal metadata-sync indicator** in the Library header. While
  Google Drive metadata hydration is running after a scan, a small
  pulsing dot and `"Syncing metadata 234/9651"` counter sit under the
  "Library" title so the user has a live signal that background work is
  still in flight (and that the bare-filename rows are not a broken
  final state).

### Changed
- **Post-scan Google Drive metadata hydration is now parallelized.**
  `gdrive_cache::sync_gdrive_metadata_inner` was a plain sequential
  loop: for a 9k+ track library it would download one file at a time to
  a temp path, extract tags, delete, and repeat -- easily hours of wall
  time before the library showed real titles and artwork. It now uses
  `tokio::task::JoinSet` gated by a `Semaphore` with
  `METADATA_SYNC_CONCURRENCY = 4` so up to four workers download and
  extract in parallel, and emits a new `metadata-sync-progress` event
  with `{done, total, finished}` shape that the frontend consumes.
- **`hydrate_one_metadata` now reuses the LRU file cache** when a track
  has already been played (and therefore already lives on disk), so the
  metadata pass doesn't re-download bytes the user already paid for.

### Fixed
- **Now Playing sidebar and bottom player kept showing the stale
  filename-only stub after a Drive track's metadata finished
  hydrating.** `playbackStore.playItem` takes a one-time copy of the
  `MediaItem` at play time. When a background pass later updated that
  row in the database, the library list refreshed but the playback
  store's `currentItem` (and the items inside its `queue`) still
  pointed at the pre-hydration snapshot, so the sidebar art, title, and
  artist never updated until the user clicked play again. The debounced
  refetch inside `libraryStore.scheduleLibraryRefetch` now reconciles
  `playbackStore.currentItem` and `playbackStore.queue` against the
  fresh snapshot by id, so newly-synced metadata lands in the Now
  Playing panel and player bar immediately.

## [0.2.2] - 2026-04-11

### Fixed
- **Scan progress modal truncated filenames mid-character with no
  ellipsis.** The recent-files log inside `ScanProgressModal.tsx` is a
  `flex flex-col-reverse` container, and its children carried only the
  Tailwind `truncate` utility. Flex items default to `min-width: auto`,
  which let long filenames push each row wider than the parent; the
  parent's `overflow-hidden` then clipped the text mid-character without
  ever rendering the ellipsis. Added `min-w-0 w-full` to each row so
  `truncate` actually works inside the flex column.
- **Library view did not reflect freshly-discovered tracks during a
  Google Drive scan -- the user had to wait for the scan to complete or
  restart the app.** `commands::library::run_scan` was streaming upserts
  into the database via `db.lock()` per item, but never emitted any
  `library-updated` events until `scan-completed` fired at the very end.
  The on-item callback now throttle-emits `library-updated` (at most one
  per 750 ms or every 50 imported items) so the frontend's debounced
  refetch can pick up the new rows incrementally while the scan is still
  in progress.
- **Google Drive metadata and artwork were not synced after a
  user-initiated scan; tracks had to be played individually before their
  real titles, artists, and album art appeared.** The 5-minute periodic
  background sync was the only path that triggered
  `gdrive_cache::sync_gdrive_metadata`, so a user who clicked "Scan"
  would see bare filenames until either they played each track (which
  hydrated metadata one at a time via `ensure_cached_in_background`) or
  the next 5-minute sync tick caught up. `commands::library::scan_library`
  now kicks off `sync_gdrive_metadata` immediately after a successful
  `run_scan`, sharing the existing in-flight dedup set so it's safe to
  run concurrently with the periodic sync.

## [0.2.1] - 2026-04-11

### Fixed
- **Multi-minute main-thread hang during background sync.** macOS hang
  reports at v0.1.0 / v0.2.0 showed `tauri_media_player_lib::commands::library::save_app_state`
  blocked for 219+ seconds inside `pthread_mutex_lock`, while a
  `tokio-rt-worker` thread held `state.db` for the entire duration of a
  Google Drive walk inside `services::sync::sync_all → services::library::scan_all → GDriveProvider::scan_streaming`.
  The frontend hung whenever it tried to call any DB-touching IPC command
  (e.g. `save_app_state` for column-config persistence) while the
  background sync was scanning Drive. Fixed by refactoring
  `services::library::scan_all` to take `&Arc<Mutex<Connection>>` and
  acquire the mutex **per upsert** via `provider.scan_streaming`, instead
  of pre-locking and passing in a `&Connection`. This matches what the
  user-initiated `commands::library::run_scan` path has always done.
  `services::sync::sync_all` no longer locks `state.db` itself before
  calling `scan_all`.

### Removed
- **`MediaProvider::scan() -> Vec<MediaItem>` convenience wrapper**, the
  non-streaming form that buffered an entire provider walk into memory and
  was the only API that allowed the caller to hold a long-lived DB lock
  across the scan. The trait now exposes `scan_streaming` only. The doc
  comment on `scan_streaming` explicitly calls out the prior hang as the
  reason this helper was removed, to discourage future re-introduction.

### Changed
- `services::library::scan_all` now logs and skips individual upsert
  errors instead of aborting the entire sync, and uses `log::warn!` /
  `log::error!` for failure reporting consistent with the rest of the
  background services.

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

[Unreleased]: https://example.invalid/compare/v0.2.3...HEAD
[0.2.3]: https://example.invalid/compare/v0.2.2...v0.2.3
[0.2.2]: https://example.invalid/compare/v0.2.1...v0.2.2
[0.2.1]: https://example.invalid/compare/v0.2.0...v0.2.1
[0.2.0]: https://example.invalid/compare/v0.1.0...v0.2.0
[0.1.0]: https://example.invalid/releases/tag/v0.1.0
