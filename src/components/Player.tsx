import { useRef, useEffect } from "react";
import { usePlaybackStore } from "../stores/playbackStore";
import { artworkUrl } from "../api/commands";
import Waveform from "./Waveform";

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
    waveformPeaks,
    showQueue,
    toggleQueue,
    volume,
    setVolume,
  } = usePlaybackStore();

  const isVideo = currentItem?.kind === "Video";

  // Sync play/pause state with media element
  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;

    if (!isPlaying) {
      el.pause();
      return;
    }

    // When isPlaying is true, we need to wait for the element to be ready
    const tryPlay = () => {
      el.play().catch(() => setPlaying(false));
    };

    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      tryPlay();
    } else {
      // Source may still be loading — wait for canplay
      el.addEventListener("canplay", tryPlay, { once: true });
      return () => el.removeEventListener("canplay", tryPlay);
    }
  }, [isPlaying, streamUrl, isVideo, setPlaying]);

  // Sync volume to media element
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
    <div className="h-[72px] flex items-center px-5 gap-4">
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
          className="h-16 rounded"
          preload="auto"
        />
      )}

      {/* Left: Track info */}
      <div className="flex items-center gap-3 w-[220px] flex-shrink-0">
        {currentItem?.artwork_hash ? (
          <img
            src={artworkUrl(currentItem.artwork_hash)}
            alt=""
            className="h-12 w-12 rounded-xl object-cover flex-shrink-0"
          />
        ) : currentItem ? (
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--bg-active)" }}
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
        <div className="min-w-0">
          {currentItem ? (
            <>
              <div
                className="truncate text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {displayTitle}
              </div>
              {displayArtist && (
                <div
                  className="truncate text-xs"
                  style={{ color: "var(--text-secondary)" }}
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

      {/* Center: Controls */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <button
          onClick={() => usePlaybackStore.getState().prev()}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-secondary)" }}
          title="Previous"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>
        <button
          onClick={togglePlay}
          disabled={!currentItem}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#000" }}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={next}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-secondary)" }}
          title="Next"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* Timeline */}
      <span
        className="text-[11px] tabular-nums flex-shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        {currentItem ? formatTime(currentTime) : "0:00"}
      </span>
      <div className="flex-1 h-10 min-w-0">
        {waveformPeaks.length > 0 && currentItem ? (
          <Waveform
            peaks={waveformPeaks}
            progress={progress}
            onSeek={handleSeek}
          />
        ) : (
          <div className="h-full flex items-center">
            <input
              type="range"
              min={0}
              max={100}
              value={progress * 100}
              className="w-full accent-[var(--accent)] h-1 cursor-pointer"
              onChange={(e) => handleSeek(Number(e.target.value) / 100)}
            />
          </div>
        )}
      </div>
      <span
        className="text-[11px] tabular-nums flex-shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        {currentItem && duration > 0 ? formatTime(duration) : "0:00"}
      </span>

      {/* Right: Volume + Queue */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setVolume(volume === 0 ? 1 : 0)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title={volume === 0 ? "Unmute" : "Mute"}
          >
            {volume === 0 ? (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : volume < 0.5 ? (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
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
        </div>
        <button
          onClick={toggleQueue}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 ${
            showQueue ? "" : "hover:bg-[var(--bg-hover)]"
          }`}
          style={{
            background: showQueue ? "var(--accent-soft)" : "transparent",
            color: showQueue ? "var(--accent)" : "var(--text-muted)",
          }}
          title="Queue"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
