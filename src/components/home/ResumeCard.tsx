import { usePlaybackStore } from "../../stores/playbackStore";
import { useLibraryStore } from "../../stores/libraryStore";
import { artworkUrl } from "../../api/commands";

// ResumeCard — the hero tile at the top of the Home screen. Shows whatever
// the user is currently playing (or the last thing they were playing in
// this session). Falls back to a "Start listening" call-to-action on cold
// start.
export default function ResumeCard() {
  const currentItem = usePlaybackStore((s) => s.currentItem);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const next = usePlaybackStore((s) => s.next);
  const prev = usePlaybackStore((s) => s.prev);
  const setQueue = usePlaybackStore((s) => s.setQueue);

  const libraryItems = useLibraryStore((s) => s.items);

  if (!currentItem) {
    // Cold start — no track to resume. Show a primary CTA that shuffles
    // the library so the user can get listening with one click.
    const handleStart = () => {
      if (libraryItems.length === 0) return;
      const shuffled = [...libraryItems].sort(() => Math.random() - 0.5);
      void setQueue(shuffled, 0);
    };
    return (
      <div
        className="relative flex items-center gap-5 overflow-hidden"
        style={{
          padding: 24,
          borderRadius: "var(--radius-card)",
          background:
            "linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))",
          border: "1px solid var(--border)",
          minHeight: 200,
        }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 120,
            height: 120,
            borderRadius: "var(--radius-card)",
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Welcome back
          </div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Start listening
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {libraryItems.length > 0
              ? `${libraryItems.length.toLocaleString()} tracks in your library`
              : "Your library is empty — add a folder from Settings."}
          </p>
          <button
            type="button"
            onClick={handleStart}
            disabled={libraryItems.length === 0}
            className="mt-4 inline-flex items-center gap-2 px-4 h-10 text-sm font-medium transition-all duration-150"
            style={{
              background:
                libraryItems.length === 0
                  ? "var(--bg-button-secondary)"
                  : "var(--accent)",
              color:
                libraryItems.length === 0
                  ? "var(--text-muted)"
                  : "var(--accent-on-accent)",
              borderRadius: "var(--radius-control)",
              cursor: libraryItems.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Shuffle Library
          </button>
        </div>
      </div>
    );
  }

  const title = currentItem.title || currentItem.name || "Unknown";
  const artist = currentItem.artist || "Unknown artist";
  const album = currentItem.album || "";
  const art = currentItem.artwork_hash
    ? artworkUrl(currentItem.artwork_hash)
    : null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${ss}`;
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{
        padding: 24,
        borderRadius: "var(--radius-card)",
        background:
          "linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))",
        border: "1px solid var(--border)",
        minHeight: 200,
      }}
    >
      {/* Subtle accent glow in the background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 50%, var(--accent-soft), transparent 70%)",
        }}
      />

      <div className="relative flex items-center gap-5">
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{
            width: 150,
            height: 150,
            borderRadius: "var(--radius-card)",
            background: "var(--bg-elevated)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          }}
        >
          {art ? (
            <img
              src={art}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ color: "var(--text-muted)" }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--accent)" }}
          >
            Now playing
          </div>
          <h1
            className="text-[22px] font-semibold truncate mt-1"
            style={{ color: "var(--text-primary)" }}
            title={title}
          >
            {title}
          </h1>
          <div
            className="text-sm truncate mt-0.5"
            style={{ color: "var(--text-secondary)" }}
            title={`${artist}${album ? ` · ${album}` : ""}`}
          >
            {artist}
            {album && ` · ${album}`}
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div
              className="relative h-1 overflow-hidden"
              style={{
                background: "var(--bg-active)",
                borderRadius: 999,
              }}
            >
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-300"
                style={{
                  width: `${progress}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
            <div
              className="flex justify-between mt-1.5 text-[11px] tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Inline transport */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              className="w-9 h-9 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              style={{
                borderRadius: "var(--radius-chip)",
                color: "var(--text-secondary)",
              }}
              title="Previous"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="w-11 h-11 flex items-center justify-center transition-all duration-150 hover:scale-105"
              style={{
                borderRadius: "var(--radius-chip)",
                background: "var(--accent)",
                color: "var(--accent-on-accent)",
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
              type="button"
              onClick={next}
              className="w-9 h-9 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              style={{
                borderRadius: "var(--radius-chip)",
                color: "var(--text-secondary)",
              }}
              title="Next"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
