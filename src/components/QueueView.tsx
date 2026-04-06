import { usePlaybackStore } from "../stores/playbackStore";
import { artworkUrl } from "../api/commands";

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function QueueView() {
  const {
    queue,
    queueIndex,
    currentItem,
    playFromQueue,
    removeFromQueue,
    toggleQueue,
    clearQueue,
  } = usePlaybackStore();

  const upNext = queue.slice(queueIndex + 1);
  const history = queue.slice(0, queueIndex);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Queue
        </h3>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="text-xs transition-colors duration-150 hover:text-red-400"
              style={{ color: "var(--text-muted)" }}
              title="Clear queue"
            >
              Clear
            </button>
          )}
          <button
            onClick={toggleQueue}
            className="text-xs transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Now Playing */}
        {currentItem && (
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Now Playing
            </div>
            <div className="flex items-center gap-3">
              {currentItem.artwork_hash ? (
                <img
                  src={artworkUrl(currentItem.artwork_hash)}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--bg-active)" }}
                >
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {currentItem.kind === "Video" ? "V" : "A"}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {currentItem.title || currentItem.name}
                </div>
                {currentItem.artist && (
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {currentItem.artist}
                  </div>
                )}
              </div>
              <span
                className="text-xs tabular-nums flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                {formatDuration(currentItem.duration_secs)}
              </span>
            </div>
          </div>
        )}

        {/* Up Next */}
        <div className="px-4 py-3">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Next Up
            {upNext.length > 0 && (
              <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                ({upNext.length})
              </span>
            )}
          </div>
          {upNext.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>
              Nothing in queue
            </p>
          ) : (
            <div className="space-y-0.5">
              {upNext.map((item, i) => {
                const actualIndex = queueIndex + 1 + i;
                return (
                  <div
                    key={`${item.id}-${actualIndex}`}
                    className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl hover:bg-[var(--bg-hover)] group cursor-pointer transition-colors duration-150"
                    onDoubleClick={() => playFromQueue(actualIndex)}
                  >
                    <span
                      className="text-xs w-5 text-right flex-shrink-0 tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {i + 1}
                    </span>
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
                      title="Remove from queue"
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
            </div>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div
            className="px-4 py-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Previously Played
            </div>
            <div className="space-y-0.5">
              {history.map((item, i) => (
                <div
                  key={`${item.id}-hist-${i}`}
                  className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl hover:bg-[var(--bg-hover)] cursor-pointer opacity-50 hover:opacity-75 transition-all duration-150"
                  onDoubleClick={() => playFromQueue(i)}
                >
                  <span
                    className="text-xs w-5 text-right flex-shrink-0 tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.title || item.name}
                    </div>
                  </div>
                  <span
                    className="text-[11px] tabular-nums flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatDuration(item.duration_secs)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
