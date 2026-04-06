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
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold">Queue</h3>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="text-zinc-500 hover:text-red-400 text-xs"
              title="Clear queue"
            >
              Clear
            </button>
          )}
          <button
            onClick={toggleQueue}
            className="text-zinc-500 hover:text-white text-xs"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Now Playing */}
        {currentItem && (
          <div className="px-4 py-3 border-b border-zinc-800/50">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
              Now Playing
            </div>
            <div className="flex items-center gap-3">
              {currentItem.artwork_hash ? (
                <img
                  src={artworkUrl(currentItem.artwork_hash)}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <span className="text-zinc-600 text-xs">
                    {currentItem.kind === "Video" ? "V" : "A"}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {currentItem.title || currentItem.name}
                </div>
                {currentItem.artist && (
                  <div className="text-xs text-zinc-400 truncate">
                    {currentItem.artist}
                  </div>
                )}
              </div>
              <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">
                {formatDuration(currentItem.duration_secs)}
              </span>
            </div>
          </div>
        )}

        {/* Up Next */}
        <div className="px-4 py-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Next Up
            {upNext.length > 0 && (
              <span className="ml-1 text-zinc-600">({upNext.length})</span>
            )}
          </div>
          {upNext.length === 0 ? (
            <p className="text-xs text-zinc-600 py-2">Nothing in queue</p>
          ) : (
            <div className="space-y-0.5">
              {upNext.map((item, i) => {
                const actualIndex = queueIndex + 1 + i;
                return (
                  <div
                    key={`${item.id}-${actualIndex}`}
                    className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-zinc-900 group cursor-pointer"
                    onDoubleClick={() => playFromQueue(actualIndex)}
                  >
                    <span className="text-xs text-zinc-600 w-5 text-right flex-shrink-0">
                      {i + 1}
                    </span>
                    {item.artwork_hash ? (
                      <img
                        src={artworkUrl(item.artwork_hash)}
                        alt=""
                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-zinc-600 text-[10px]">
                          {item.kind === "Video" ? "V" : "A"}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">
                        {item.title || item.name}
                      </div>
                      {item.artist && (
                        <div className="text-xs text-zinc-500 truncate">
                          {item.artist}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-zinc-600 tabular-nums flex-shrink-0">
                      {formatDuration(item.duration_secs)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(actualIndex);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-xs transition-opacity flex-shrink-0"
                      title="Remove from queue"
                    >
                      &times;
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800/50">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
              Previously Played
            </div>
            <div className="space-y-0.5">
              {history.map((item, i) => (
                <div
                  key={`${item.id}-hist-${i}`}
                  className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-zinc-900 cursor-pointer opacity-50 hover:opacity-75"
                  onDoubleClick={() => playFromQueue(i)}
                >
                  <span className="text-xs text-zinc-600 w-5 text-right flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">
                      {item.title || item.name}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-600 tabular-nums flex-shrink-0">
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
