import { memo } from "react";
import type { MediaItem } from "../../types";
import { artworkUrl } from "../../api/commands";

export type CardSize = "sm" | "md" | "lg";
export type CardLayout = "stacked" | "horizontal";

interface AlbumCardProps {
  item: MediaItem;
  size?: CardSize;
  layout?: CardLayout;
  onPlay?: (item: MediaItem) => void;
  onClick?: (item: MediaItem, e: React.MouseEvent) => void;
  onContextMenu?: (item: MediaItem, e: React.MouseEvent) => void;
  selected?: boolean;
  /** If true, the stacked card fills 100% of its parent width
   *  and keeps the artwork square via aspect-ratio. Used by the
   *  Library grid so cards stretch across the full panel width. */
  stretch?: boolean;
}

const SIZE_MAP: Record<CardSize, number> = {
  sm: 56,
  md: 140,
  lg: 180,
};

function AlbumCardInner({
  item,
  size = "md",
  layout = "stacked",
  onPlay,
  onClick,
  onContextMenu,
  selected = false,
  stretch = false,
}: AlbumCardProps) {
  const artPx = SIZE_MAP[size];
  const title = item.title || item.name || "Unknown";
  const artist = item.artist || "Unknown artist";
  const art = item.artwork_hash ? artworkUrl(item.artwork_hash) : null;

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) onClick(item, e);
  };

  const handleDoubleClick = () => {
    if (onPlay) onPlay(item);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) onContextMenu(item, e);
  };

  const handlePlayButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPlay) onPlay(item);
  };

  if (layout === "horizontal") {
    return (
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className="group flex items-center gap-3 w-full text-left p-2 transition-all duration-150"
        style={{
          background: selected ? "var(--accent-soft)" : "transparent",
          borderRadius: "var(--radius-card)",
          outline: selected ? "1px solid var(--accent)" : "1px solid transparent",
        }}
      >
        <div
          className="flex-shrink-0 overflow-hidden relative"
          style={{
            width: artPx,
            height: artPx,
            borderRadius: "var(--radius-control)",
            background: "var(--bg-elevated)",
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </div>
          <div
            className="text-xs truncate mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {artist}
          </div>
        </div>
        {onPlay && (
          <span
            onClick={handlePlayButton}
            role="button"
            tabIndex={0}
            className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full flex items-center justify-center transition-opacity duration-150 flex-shrink-0"
            style={{ background: "var(--accent)", color: "var(--accent-on-accent)" }}
            title="Play"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}
      </button>
    );
  }

  // Stacked: artwork on top, text below.
  //
  // `stretch` mode is used by the Library grid — the outer wrapper fills
  // its grid cell and the artwork becomes a square via `aspectRatio: 1`
  // instead of a fixed pixel height. This lets the grid span the full
  // panel width regardless of viewport size.
  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className="group cursor-pointer transition-transform duration-200"
      style={{
        width: stretch ? "100%" : artPx,
        outline: selected ? "2px solid var(--accent)" : "none",
        outlineOffset: 2,
        borderRadius: "var(--radius-card)",
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          width: stretch ? "100%" : artPx,
          ...(stretch
            ? { aspectRatio: "1 / 1" }
            : { height: artPx }),
          borderRadius: "var(--radius-card)",
          background: "var(--bg-elevated)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        }}
      >
        {art ? (
          <img
            src={art}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
          </div>
        )}
        {/* Hover play overlay */}
        {onPlay && (
          <div
            className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            style={{
              background:
                "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.5))",
            }}
          >
            <span
              onClick={handlePlayButton}
              role="button"
              tabIndex={0}
              className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform duration-150 hover:scale-110"
              style={{
                background: "var(--accent)",
                color: "var(--accent-on-accent)",
              }}
              title="Play"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <div
          className="text-[13px] font-medium truncate"
          style={{ color: "var(--text-primary)" }}
          title={title}
        >
          {title}
        </div>
        <div
          className="text-[11px] truncate mt-0.5"
          style={{ color: "var(--text-secondary)" }}
          title={artist}
        >
          {artist}
        </div>
      </div>
    </div>
  );
}

export const AlbumCard = memo(AlbumCardInner);
export default AlbumCard;
