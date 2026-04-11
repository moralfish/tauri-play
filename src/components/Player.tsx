import { useRef, useEffect } from "react";
import { usePlaybackStore } from "../stores/playbackStore";
import { artworkUrl } from "../api/commands";
import Waveform from "./Waveform";

// Horizontal single-row transport bar. Layout (left → right):
//
//   [artwork+title/artist] [prev] [play] [next] [0:19] [-- waveform --]
//   [4:37] [volume] [right-panel toggle]
//
// The waveform is a flex-1 element that absorbs whatever horizontal
// space the controls don't claim, so it always runs edge-to-edge.
// A thin 3px progress strip is absolute-positioned along the very
// bottom edge of the player frame as a secondary visual spine.
export default function Player() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    currentItem,
    streamUrl,
    isPlaying,
    togglePlay,
    next,
    setPlaying,
    setCurrentTime,
    setDuration,
    currentTime,
    duration,
    volume,
    setVolume,
  } = usePlaybackStore();

  const waveformPeaks = usePlaybackStore((s) => s.waveformPeaks);
  const toggleRightSidebar = usePlaybackStore((s) => s.toggleRightSidebar);

  const isVideo = currentItem?.kind === "Video";

  // Sync play/pause state with media element
  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;

    if (!isPlaying) {
      el.pause();
      return;
    }

    const tryPlay = () => {
      el.play().catch(() => setPlaying(false));
    };

    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      tryPlay();
    } else {
      el.addEventListener("canplay", tryPlay, { once: true });
      return () => el.removeEventListener("canplay", tryPlay);
    }
  }, [isPlaying, streamUrl, isVideo, setPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const handleTimeUpdate = () => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (el.duration && !isNaN(el.duration)) {
      setDuration(el.duration);
    }
  };

  const handleSeek = (fraction: number) => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (el && el.duration) {
      el.currentTime = fraction * el.duration;
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayTitle = currentItem?.title || currentItem?.name;
  const displayArtist = currentItem?.artist;

  return (
    <div className="relative flex items-center gap-4 px-5 py-3">
      {/* Hidden media elements */}
      <audio
        ref={audioRef}
        src={!isVideo && streamUrl ? streamUrl : undefined}
        onEnded={next}
        onTimeUpdate={handleTimeUpdate}
        preload="auto"
      />
      {isVideo && streamUrl && (
        <video
          ref={videoRef}
          src={streamUrl}
          onEnded={next}
          onTimeUpdate={handleTimeUpdate}
          className="h-16"
          style={{ borderRadius: "var(--radius-control)" }}
          preload="auto"
        />
      )}

      {/* Artwork + title/artist — fixed minimum width so the
          waveform always has room to breathe on narrow windows. */}
      <div
        className="flex items-center gap-3 flex-shrink-0 min-w-0"
        style={{ width: 220 }}
      >
        {currentItem?.artwork_hash ? (
          <img
            src={artworkUrl(currentItem.artwork_hash)}
            alt=""
            className="h-11 w-11 object-cover flex-shrink-0"
            style={{ borderRadius: "var(--radius-control)" }}
          />
        ) : currentItem ? (
          <div
            className="h-11 w-11 flex items-center justify-center flex-shrink-0"
            style={{
              background: "var(--bg-active)",
              borderRadius: "var(--radius-control)",
            }}
          >
            <svg
              className="w-5 h-5"
              style={{ color: "var(--text-muted)" }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {currentItem ? (
            <>
              <div
                className="truncate text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
                title={displayTitle || ""}
              >
                {displayTitle}
              </div>
              {displayArtist && (
                <div
                  className="truncate text-xs mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                  title={displayArtist}
                >
                  {displayArtist}
                </div>
              )}
            </>
          ) : (
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              No track selected
            </span>
          )}
        </div>
      </div>

      {/* Transport cluster — prev / play / next, no shuffle/repeat */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => usePlaybackStore.getState().prev()}
          className="w-9 h-9 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{
            color: "var(--text-secondary)",
            borderRadius: "var(--radius-chip)",
          }}
          title="Previous"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>
        <button
          onClick={togglePlay}
          disabled={!currentItem}
          className="w-11 h-11 flex items-center justify-center transition-all duration-150 disabled:opacity-30 hover:scale-105"
          style={{
            background: "var(--accent)",
            color: "var(--accent-on-accent)",
            borderRadius: "var(--radius-chip)",
            boxShadow: currentItem ? "0 2px 12px var(--accent-soft)" : "none",
          }}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
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
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* Current time */}
      <div
        className="flex-shrink-0 text-[11px] tabular-nums"
        style={{ color: "var(--text-muted)", minWidth: 36, textAlign: "right" }}
      >
        {currentItem ? formatTime(currentTime) : "0:00"}
      </div>

      {/* Waveform — grows to fill the remaining horizontal space.
          When there are no peaks yet, the container still holds
          the width so the layout doesn't jitter as a track loads. */}
      <div className="flex-1 min-w-0" style={{ height: 36 }}>
        {waveformPeaks.length > 0 ? (
          <Waveform
            peaks={waveformPeaks}
            progress={progress}
            onSeek={handleSeek}
          />
        ) : (
          <div
            className="w-full h-full flex items-center"
            onClick={(e) => {
              // Click-to-seek fallback when there are no peaks.
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width),
              );
              handleSeek(frac);
            }}
          >
            <div
              className="w-full relative cursor-pointer"
              style={{
                height: 3,
                background: "var(--bg-active)",
                borderRadius: "var(--radius-chip)",
              }}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${progress * 100}%`,
                  background: "var(--accent)",
                  borderRadius: "var(--radius-chip)",
                  transition: "width 0.1s linear",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Total time */}
      <div
        className="flex-shrink-0 text-[11px] tabular-nums"
        style={{ color: "var(--text-muted)", minWidth: 36 }}
      >
        {currentItem && duration > 0 ? formatTime(duration) : "0:00"}
      </div>

      {/* Volume + right-panel toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setVolume(volume === 0 ? 1 : 0)}
          className="w-9 h-9 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{
            color: "var(--text-muted)",
            borderRadius: "var(--radius-chip)",
          }}
          title={volume === 0 ? "Unmute" : "Mute"}
        >
          {volume === 0 ? (
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className="w-20 accent-[var(--accent)] h-1 cursor-pointer"
          title={`Volume: ${Math.round(volume * 100)}%`}
        />

        {/* Right-panel toggle — the hamburger on the far right of
            image 1's reference. Collapses / expands the Now Playing
            side panel instead of toggling a separate queue overlay. */}
        <button
          onClick={toggleRightSidebar}
          className="w-9 h-9 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{
            color: "var(--text-muted)",
            borderRadius: "var(--radius-chip)",
          }}
          title="Toggle Now Playing panel"
        >
          <svg
            className="w-[18px] h-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>
      </div>

      {/* Bottom-edge progress strip — thin 3px accent line running
          the full width of the player frame. Flush with the Layout
          corner radius so it visually wraps the entire dock. */}
      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-none"
        style={{ height: 3 }}
      >
        <div
          className="w-full h-full relative"
          style={{
            background: "var(--bg-active)",
            borderBottomLeftRadius: "var(--radius-panel)",
            borderBottomRightRadius: "var(--radius-panel)",
          }}
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${progress * 100}%`,
              background: "var(--accent)",
              borderBottomLeftRadius: "var(--radius-panel)",
              transition: "width 0.1s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}
