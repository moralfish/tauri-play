import { usePlaybackStore } from "../stores/playbackStore";
import { artworkUrl } from "../api/commands";
import Waveform from "./Waveform";

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function NowPlayingPanel() {
  const {
    currentItem,
    isPlaying,
    queue,
    queueIndex,
    playFromQueue,
    removeFromQueue,
    clearQueue,
    waveformPeaks,
    currentTime,
    duration,
    showQueue,
  } = usePlaybackStore();

  const progress = duration > 0 ? currentTime / duration : 0;
  const upNext = queue.slice(queueIndex + 1, queueIndex + 6);
  const upNextTotal = queue.length - queueIndex - 1;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Now Playing Section */}
      {currentItem ? (
        <div className="p-4 space-y-4">
          {/* Large Artwork */}
          <div
            className="aspect-square rounded-[18px] overflow-hidden"
            style={{ background: "var(--bg-active)" }}
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

          {/* Track Info */}
          <div>
            <h3
              className="text-base font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
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

          {/* Mini Waveform */}
          {waveformPeaks.length > 0 && (
            <div
              className="h-12 rounded-xl overflow-hidden p-2"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
              }}
            >
              <Waveform
                peaks={waveformPeaks}
                progress={progress}
                onSeek={() => {}}
              />
            </div>
          )}

          {/* Now playing indicator */}
          <div className="flex items-center gap-2">
            {isPlaying && (
              <div className="flex items-center gap-0.5">
                <span
                  className="w-0.5 h-3 rounded-full animate-pulse"
                  style={{ background: "var(--accent)" }}
                />
                <span
                  className="w-0.5 h-4 rounded-full animate-pulse"
                  style={{
                    background: "var(--accent)",
                    animationDelay: "0.15s",
                  }}
                />
                <span
                  className="w-0.5 h-2.5 rounded-full animate-pulse"
                  style={{
                    background: "var(--accent)",
                    animationDelay: "0.3s",
                  }}
                />
              </div>
            )}
            <span
              className="text-[11px] font-medium"
              style={{
                color: isPlaying ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {isPlaying ? "Now Playing" : "Paused"}
            </span>
          </div>

          {/* Metadata Card */}
          <div
            className="rounded-[14px] p-3 space-y-2"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Details
            </p>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
              {currentItem.album && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>Album</span>
                  <span
                    className="truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {currentItem.album}
                  </span>
                </>
              )}
              {currentItem.genre && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>Genre</span>
                  <span
                    className="truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {currentItem.genre}
                  </span>
                </>
              )}
              {currentItem.year && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>Year</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {currentItem.year}
                  </span>
                </>
              )}
              {currentItem.duration_secs && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>Duration</span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatDuration(currentItem.duration_secs)}
                  </span>
                </>
              )}
              <span style={{ color: "var(--text-muted)" }}>Source</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {currentItem.source_type === "gdrive"
                  ? "Google Drive"
                  : "Local"}
              </span>
              <span style={{ color: "var(--text-muted)" }}>Type</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {currentItem.kind}
              </span>
            </div>
          </div>
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

      {/* Queue Section */}
      {showQueue && upNextTotal > 0 && (
        <div className="p-4 pt-0">
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Next Up{" "}
              <span style={{ color: "var(--text-muted)" }}>
                ({upNextTotal})
              </span>
            </p>
            <button
              onClick={clearQueue}
              className="text-[11px] transition-colors duration-150"
              style={{ color: "var(--text-muted)" }}
            >
              Clear
            </button>
          </div>
          <div className="space-y-0.5">
            {upNext.map((item, i) => {
              const actualIndex = queueIndex + 1 + i;
              return (
                <div
                  key={`${item.id}-${actualIndex}`}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer group transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                  onDoubleClick={() => playFromQueue(actualIndex)}
                >
                  {item.artwork_hash ? (
                    <img
                      src={artworkUrl(item.artwork_hash)}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--bg-active)" }}
                    >
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.kind === "Video" ? "V" : "A"}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.title || item.name}
                    </div>
                    {item.artist && (
                      <div
                        className="text-[11px] truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.artist}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[11px] tabular-nums flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatDuration(item.duration_secs)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromQueue(actualIndex);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center transition-opacity duration-150 flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <svg
                      className="w-3.5 h-3.5 hover:text-red-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
            {upNextTotal > 5 && (
              <p
                className="text-[11px] px-2.5 py-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                +{upNextTotal - 5} more tracks
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
