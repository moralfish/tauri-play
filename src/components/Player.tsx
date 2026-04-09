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
    <div className="flex flex-col px-5 py-2.5 gap-1.5">
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

      {/* Row 1: Track info | Controls | Actions */}
      <div className="flex items-center gap-4">
        {/* Left: Track info + favorite */}
        <div className="flex items-center gap-3 w-[240px] flex-shrink-0">
          {currentItem?.artwork_hash ? (
            <img
              src={artworkUrl(currentItem.artwork_hash)}
              alt=""
              className="h-11 w-11 rounded-lg object-cover flex-shrink-0"
            />
          ) : currentItem ? (
            <div
              className="h-11 w-11 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--bg-active)" }}
            >
              <svg className="w-5 h-5" style={{ color: "var(--text-muted)" }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {currentItem ? (
              <>
                <div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {displayTitle}
                </div>
                {displayArtist && (
                  <div className="truncate text-xs" style={{ color: "var(--accent)" }}>
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
          {/* Favorite button */}
          {currentItem && (
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-150"
              style={{ color: "var(--text-muted)" }}
              title="Favorite"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </button>
          )}
        </div>

        {/* Center: Playback controls */}
        <div className="flex-1 flex items-center justify-center gap-4">
          {/* Shuffle */}
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
            title="Shuffle"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
            </svg>
          </button>

          {/* Previous */}
          <button
            onClick={() => usePlaybackStore.getState().prev()}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{ color: "var(--text-secondary)" }}
            title="Previous"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>

          {/* Play/Pause - large button */}
          <button
            onClick={togglePlay}
            disabled={!currentItem}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-30"
            style={{ background: "var(--player-button-bg)", color: "var(--text-primary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--player-button-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--player-button-bg)'; }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Next */}
          <button
            onClick={next}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{ color: "var(--text-secondary)" }}
            title="Next"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* Repeat */}
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
            title="Repeat"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
            </svg>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 w-[240px] flex-shrink-0 justify-end">
          {/* Lyrics placeholder */}
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
            title="Lyrics"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
            </svg>
          </button>

          {/* Queue toggle */}
          <button
            onClick={toggleQueue}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{
              color: showQueue ? "var(--accent)" : "var(--text-muted)",
            }}
            title="Queue"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          {/* Volume */}
          <button
            onClick={() => setVolume(volume === 0 ? 1 : 0)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
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

          {/* Fullscreen placeholder */}
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
            title="Fullscreen"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Row 2: Progress bar */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] tabular-nums w-10 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          {currentItem ? formatTime(currentTime) : "0:00"}
        </span>
        <div className="flex-1 h-8 min-w-0">
          {waveformPeaks.length > 0 && currentItem ? (
            <Waveform peaks={waveformPeaks} progress={progress} onSeek={handleSeek} />
          ) : (
            <div className="h-full flex items-center">
              <div className="w-full h-1 rounded-full relative cursor-pointer" style={{ background: 'var(--bg-active)' }} onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                handleSeek((e.clientX - rect.left) / rect.width);
              }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${progress * 100}%`, background: 'var(--text-secondary)' }}
                />
              </div>
            </div>
          )}
        </div>
        <span className="text-[11px] tabular-nums w-10 flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          {currentItem && duration > 0 ? formatTime(duration) : "0:00"}
        </span>
      </div>
    </div>
  );
}
