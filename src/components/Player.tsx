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
    queue,
    queueIndex,
    showQueue,
    toggleQueue,
  } = usePlaybackStore();

  const isVideo = currentItem?.kind === "Video";

  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [isPlaying, streamUrl, isVideo, setPlaying]);

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
  const upNextCount = queue.length - queueIndex - 1;

  return (
    <div className="h-full flex items-center px-4 gap-4">
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

      {/* Artwork */}
      {currentItem?.artwork_hash && (
        <img
          src={artworkUrl(currentItem.artwork_hash)}
          alt="Album art"
          className="h-14 w-14 rounded object-cover flex-shrink-0"
        />
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => usePlaybackStore.getState().prev()}
          className="text-zinc-400 hover:text-white transition-colors"
          title="Previous"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>
        <button
          onClick={togglePlay}
          disabled={!currentItem}
          className="w-10 h-10 rounded-full bg-white text-zinc-950 flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={next}
          className="text-zinc-400 hover:text-white transition-colors"
          title="Next"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* Track info */}
      <div className="w-40 min-w-0 flex-shrink-0">
        {currentItem ? (
          <div>
            <div className="truncate text-sm font-medium">{displayTitle}</div>
            {displayArtist && (
              <div className="truncate text-xs text-zinc-400">
                {displayArtist}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-zinc-500">No track selected</span>
        )}
      </div>

      {/* Time + Waveform */}
      <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">
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
              className="w-full accent-white"
              onChange={(e) => handleSeek(Number(e.target.value) / 100)}
            />
          </div>
        )}
      </div>
      <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">
        {currentItem && duration > 0 ? formatTime(duration) : "0:00"}
      </span>

      {/* Queue toggle */}
      <button
        onClick={toggleQueue}
        className={`relative flex-shrink-0 p-1.5 rounded transition-colors ${
          showQueue
            ? "text-white bg-zinc-800"
            : "text-zinc-400 hover:text-white"
        }`}
        title={`Queue${upNextCount > 0 ? ` (${upNextCount} next)` : ""}`}
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
        {upNextCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {upNextCount > 9 ? "9+" : upNextCount}
          </span>
        )}
      </button>
    </div>
  );
}
