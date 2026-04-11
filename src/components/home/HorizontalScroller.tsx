import { useRef, ReactNode } from "react";
import type { MediaItem } from "../../types";
import AlbumCard, { CardLayout, CardSize } from "./AlbumCard";

interface HorizontalScrollerProps {
  title: string;
  items: MediaItem[];
  onPlay?: (item: MediaItem, index: number, items: MediaItem[]) => void;
  onItemClick?: (item: MediaItem) => void;
  variant?: "cards" | "card-row"; // card-row = horizontal list rows
  size?: CardSize;
  rightAction?: ReactNode;
  emptyHint?: string;
}

// Generic horizontal scroller for Home sections. Title row on top, a
// scroll-snapped row of AlbumCards below, and chevron buttons on the right
// that scroll by one viewport width.
export default function HorizontalScroller({
  title,
  items,
  onPlay,
  onItemClick,
  variant = "cards",
  size = "md",
  rightAction,
  emptyHint = "No tracks yet — play something to populate this section.",
}: HorizontalScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = el.clientWidth * 0.85;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const layout: CardLayout = variant === "card-row" ? "horizontal" : "stacked";

  return (
    <section className="flex flex-col" style={{ gap: 12 }}>
      <div className="flex items-center px-1">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.12em] flex-1"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </h2>
        {rightAction}
        {items.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className="w-7 h-7 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              style={{
                borderRadius: "var(--radius-chip)",
                color: "var(--text-secondary)",
              }}
              title="Scroll left"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className="w-7 h-7 flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              style={{
                borderRadius: "var(--radius-chip)",
                color: "var(--text-secondary)",
              }}
              title="Scroll right"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div
          className="px-4 py-8 text-sm"
          style={{
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            borderRadius: "var(--radius-card)",
            border: "1px dashed var(--border)",
          }}
        >
          {emptyHint}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="flex overflow-x-auto pb-2 snap-x snap-mandatory"
          style={{
            gap: "var(--space-gutter)",
            // Hide scrollbar cross-browser while keeping wheel/drag working.
            scrollbarWidth: "thin",
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="snap-start flex-shrink-0"
              style={{
                width: variant === "card-row" ? "min(340px, 80vw)" : undefined,
              }}
            >
              <AlbumCard
                item={item}
                size={size}
                layout={layout}
                onPlay={
                  onPlay
                    ? (i) => onPlay(i, index, items)
                    : undefined
                }
                onClick={onItemClick ? () => onItemClick(item) : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
