import type { ReactNode } from "react";
import type { MediaItem } from "../../types";
import { artworkUrl } from "../../api/commands";
import { usePlaybackStore } from "../../stores/playbackStore";

interface SuggestionCardProps {
  title: string;
  subtitle?: string;
  items: MediaItem[];
  gradient: string; // CSS gradient string layered over the blurred artwork
  icon: ReactNode;
}

// A tall hero-ish card that pitches a curated mini-queue. Uses the first
// item's artwork as a huge blurred background and the gradient prop as a
// tinted overlay, so each suggestion has a distinct visual identity.
export default function SuggestionCard({
  title,
  subtitle,
  items,
  gradient,
  icon,
}: SuggestionCardProps) {
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const first = items[0];
  const bgUrl =
    first && first.artwork_hash ? artworkUrl(first.artwork_hash) : null;

  const handlePlay = () => {
    if (items.length === 0) return;
    void setQueue(items, 0);
  };

  const empty = items.length === 0;

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={empty}
      className="group relative overflow-hidden text-left flex flex-col justify-end transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        borderRadius: "var(--radius-card)",
        minHeight: 200,
        padding: 20,
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      {/* Blurred background layer */}
      {bgUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(40px) brightness(0.4)",
            transform: "scale(1.2)",
          }}
        />
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: gradient, opacity: bgUrl ? 0.6 : 0.85 }}
      />

      {/* Content */}
      <div className="relative flex flex-col gap-2 text-white">
        <div className="flex items-center gap-2">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.16)",
              backdropFilter: "blur(8px)",
            }}
          >
            {icon}
          </span>
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Smart suggestion
          </span>
        </div>
        <div className="text-2xl font-semibold leading-tight">{title}</div>
        {subtitle && (
          <div
            className="text-sm"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            {subtitle}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(8px)",
              borderRadius: "var(--radius-chip)",
              color: "white",
            }}
          >
            {empty
              ? "No matches yet"
              : `${items.length} ${items.length === 1 ? "track" : "tracks"}`}
          </span>
          {!empty && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{
                background: "white",
                color: "black",
                borderRadius: "var(--radius-chip)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
