import { usePlaybackStore } from "../stores/playbackStore";
import { artworkUrl } from "../api/commands";
import Waveform from "./Waveform";

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// NowPlayingPanel:
//   - Top card: large artwork + title + artist + inline transport row
//   - Secondary card: "Next Up" as a horizontally-scrolled strip of small
//     artwork tiles. Click to jump to that queue position.
//   - The verbose metadata "Details" 2-col grid was removed — it lives on
//     a modal dialog the user opens from a "more" stub.

export default function NowPlayingPanel() {
  const currentItem = usePlaybackStore((s) => s.currentItem);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const queue = usePlaybackStore((s) => s.queue);
  const queueIndex = usePlaybackStore((s) => s.queueIndex);
  const playFromQueue = usePlaybackStore((s) => s.playFromQueue);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const next = usePlaybackStore((s) => s.next);
  const prev = usePlaybackStore((s) => s.prev);
  const clearQueue = usePlaybackStore((s) => s.clearQueue);
  const waveformPeaks = usePlaybackStore((s) => s.waveformPeaks);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);

  const collapsed = usePlaybackStore((s) => s.rightSidebarCollapsed);
  const toggleCollapse = usePlaybackStore((s) => s.toggleRightSidebar);

  const upNext = queue.slice(queueIndex + 1);
  const progress = duration > 0 ? currentTime / duration : 0;

  const handleSeek = (fraction: number) => {
    // Best-effort seek — the actual audio element lives in Player.tsx.
    // We just set the store's currentTime and let Player's sync effects
    // align the media element on the next tick.
    usePlaybackStore.getState().setCurrentTime(fraction * duration);
  };

  // Collapsed: narrow strip with artwork only
  if (collapsed) {
    return (
      <div className="flex flex-col h-full items-center py-3 gap-2">
        <button
          onClick={toggleCollapse}
          className="w-10 h-10 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{
            color: "var(--text-muted)",
            borderRadius: "var(--radius-control)",
          }}
          title="Expand panel"
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {currentItem && (
          <>
            <div
              className="w-10 h-10 overflow-hidden flex-shrink-0"
              style={{
                background: "var(--bg-active)",
                borderRadius: "var(--radius-control)",
              }}
            >
              {currentItem.artwork_hash ? (
                <img
                  src={artworkUrl(currentItem.artwork_hash)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5"
                    style={{ color: "var(--text-muted)" }}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}
            </div>
            {isPlaying && (
              <div className="flex items-center gap-0.5">
                <span
                  className="w-0.5 h-3 rounded-full animate-pulse"
                  style={{ background: "var(--accent)" }}
                />
                <span
                  className="w-0.5 h-4 rounded-full animate-pulse"
                  style={{ background: "var(--accent)", animationDelay: "0.15s" }}
                />
                <span
                  className="w-0.5 h-2.5 rounded-full animate-pulse"
                  style={{ background: "var(--accent)", animationDelay: "0.3s" }}
                />
              </div>
            )}
          </>
        )}
        <div className="flex-1" />
      </div>
    );
  }

  // Expanded: simplified panel
  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--text-muted)" }}
        >
          Now Playing
        </span>
        <button
          onClick={toggleCollapse}
          className="w-7 h-7 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{
            color: "var(--text-muted)",
            borderRadius: "var(--radius-control)",
          }}
          title="Collapse panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Top card — artwork + track info + inline transport */}
      {currentItem ? (
        <div className="px-4 pb-4 flex flex-col gap-4">
          <div
            className="flex flex-col items-center gap-3 p-4"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
            }}
          >
            <div
              className="w-full aspect-square overflow-hidden"
              style={{
                background: "var(--bg-active)",
                borderRadius: "var(--radius-card)",
                maxWidth: 250,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
              }}
            >
              {currentItem.artwork_hash ? (
                <img
                  src={artworkUrl(currentItem.artwork_hash)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg
                    className="w-16 h-16"
                    style={{ color: "var(--text-muted)" }}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Track text */}
            <div className="w-full min-w-0 text-center">
              <h3
                className="text-base font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
                title={currentItem.title || currentItem.name}
              >
                {currentItem.title || currentItem.name}
              </h3>
              {currentItem.artist && (
                <p
                  className="text-sm truncate mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {currentItem.artist}
                </p>
              )}
              {currentItem.album && (
                <p
                  className="text-xs truncate mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {currentItem.album}
                </p>
              )}
            </div>

            {/* Compact waveform strip — mirrors the big one in the
                bottom transport bar but smaller so it fits neatly in
                the panel. Click-to-seek works here too. */}
            {waveformPeaks.length > 0 && (
              <div className="w-full" style={{ height: 28 }}>
                <Waveform
                  peaks={waveformPeaks}
                  progress={progress}
                  onSeek={handleSeek}
                />
              </div>
            )}

            {/* Inline transport row */}
            <div className="flex items-center gap-2">
              <button
                onClick={prev}
                className="w-9 h-9 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                style={{
                  color: "var(--text-secondary)",
                  borderRadius: "var(--radius-chip)",
                }}
                title="Previous"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                </svg>
              </button>
              <button
                onClick={togglePlay}
                className="w-11 h-11 flex items-center justify-center transition-all duration-150 hover:scale-105"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-on-accent)",
                  borderRadius: "var(--radius-chip)",
                }}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                onClick={next}
                className="w-9 h-9 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                style={{
                  color: "var(--text-secondary)",
                  borderRadius: "var(--radius-chip)",
                }}
                title="Next"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Details card — two-column metadata grid. Mirrors the
              "DETAILS" section from the v0.2 panel, now scoped to
              the fields that always render cleanly. */}
          <div
            className="p-4"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
            }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2.5"
              style={{ color: "var(--text-muted)" }}
            >
              Details
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {currentItem.album && (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Album</dt>
                  <dd
                    className="truncate text-right"
                    style={{ color: "var(--text-primary)" }}
                    title={currentItem.album}
                  >
                    {currentItem.album}
                  </dd>
                </>
              )}
              {currentItem.year && (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Year</dt>
                  <dd
                    className="text-right tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {currentItem.year}
                  </dd>
                </>
              )}
              {currentItem.genre && (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Genre</dt>
                  <dd
                    className="truncate text-right"
                    style={{ color: "var(--text-primary)" }}
                    title={currentItem.genre}
                  >
                    {currentItem.genre}
                  </dd>
                </>
              )}
              {currentItem.track_number != null && (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Track</dt>
                  <dd
                    className="text-right tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {currentItem.track_number}
                  </dd>
                </>
              )}
              {currentItem.duration_secs != null && (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Duration</dt>
                  <dd
                    className="text-right tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatDuration(currentItem.duration_secs)}
                  </dd>
                </>
              )}
              <dt style={{ color: "var(--text-muted)" }}>Source</dt>
              <dd
                className="text-right capitalize"
                style={{ color: "var(--text-primary)" }}
              >
                {currentItem.source_type === "gdrive"
                  ? "Google Drive"
                  : currentItem.source_type}
              </dd>
              <dt style={{ color: "var(--text-muted)" }}>Type</dt>
              <dd
                className="text-right"
                style={{ color: "var(--text-primary)" }}
              >
                {currentItem.kind}
              </dd>
              {currentItem.file_size != null && (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Size</dt>
                  <dd
                    className="text-right tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatBytes(currentItem.file_size)}
                  </dd>
                </>
              )}
              {currentItem.play_count != null && currentItem.play_count > 0 && (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Plays</dt>
                  <dd
                    className="text-right tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {currentItem.play_count}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Secondary card — Next Up strip */}
          {upNext.length > 0 && (
            <div
              className="p-4"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
              }}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Next up
                  <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                    ({upNext.length})
                  </span>
                </span>
                <button
                  onClick={clearQueue}
                  className="text-[11px] transition-colors duration-150 hover:text-[var(--text-secondary)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear
                </button>
              </div>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "thin" }}
              >
                {upNext.slice(0, 8).map((item, i) => {
                  const actualIndex = queueIndex + 1 + i;
                  return (
                    <button
                      key={`${item.id}-${actualIndex}`}
                      onClick={() => playFromQueue(actualIndex)}
                      className="flex-shrink-0 flex flex-col items-start gap-1.5 p-1 transition-all duration-150 hover:bg-[var(--bg-hover)]"
                      style={{
                        width: 72,
                        borderRadius: "var(--radius-control)",
                      }}
                      title={`${item.title || item.name} — ${item.artist || ""}`}
                    >
                      <div
                        className="w-full overflow-hidden"
                        style={{
                          height: 64,
                          background: "var(--bg-active)",
                          borderRadius: "var(--radius-control)",
                        }}
                      >
                        {item.artwork_hash ? (
                          <img
                            src={artworkUrl(item.artwork_hash)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span
                              className="text-[10px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {item.kind === "Video" ? "V" : "A"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div
                        className="text-[10px] truncate w-full text-left leading-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.title || item.name}
                      </div>
                      <div
                        className="text-[9px] tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatDuration(item.duration_secs)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <svg
              className="w-12 h-12 mx-auto mb-3"
              style={{ color: "var(--text-muted)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
              />
            </svg>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Select a track to play
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
