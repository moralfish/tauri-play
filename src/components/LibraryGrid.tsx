import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MediaItem } from "../types";
import AlbumCard from "./home/AlbumCard";

// Virtualized card-grid view for the library. Grid cells are laid out in
// fixed-size rows so the same arithmetic that drives the list-view
// virtualizer in `Library.tsx` still works:
//
//   totalRows  = ceil(items.length / columnsPerRow)
//   rowHeight  = CARD_H + GAP  (stacked AlbumCard size=lg is 180px + text)
//
// We compute `columnsPerRow` from the live container width using a
// ResizeObserver so resizing the window reflows cleanly. At 9k+ items
// this keeps DOM nodes bounded to roughly `visibleRows * columns`, which
// is the whole reason the list view was virtualized in the first place.

interface LibraryGridProps {
  items: MediaItem[];
  selectedIds: Set<string>;
  onRowClick: (item: MediaItem, index: number, e: React.MouseEvent) => void;
  onRowContextMenu: (item: MediaItem, index: number, e: React.MouseEvent) => void;
  onPlay: (item: MediaItem, index: number) => void;
  /** id of the track currently loaded in the playback store, or null.
   *  Used together with `isAudioPlaying` so the matching grid card can
   *  render the accent outline + EQ badge that mirror the list view. */
  currentItemId: string | null;
  isAudioPlaying: boolean;
}

const CARD_WIDTH = 180; // minimum AlbumCard size=lg artwork width
const CARD_TEXT = 48; // rough title+artist block
const ROW_GAP = 24;
const COL_GAP = 20;
const H_PADDING = 48; // 24px horizontal padding on each side of the scroll area
const OVERSCAN_ROWS = 2;

export default function LibraryGrid({
  items,
  selectedIds,
  onRowClick,
  onRowContextMenu,
  onPlay,
  currentItemId,
  isAudioPlaying,
}: LibraryGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [scrollTop, setScrollTop] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    setViewportWidth(el.clientWidth);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
        setViewportWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rAF-throttled scroll handler — same pattern as the list virtualizer.
  const scrollRaf = useRef<number | null>(null);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (scrollRaf.current != null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      setScrollTop(target.scrollTop);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    };
  }, []);

  // Derive columns from container width. We use the MINIMUM card width as
  // the floor — the grid cells then stretch via `1fr` so the row always
  // fills the full viewport, never leaving a gap on the right.
  const columnsPerRow = useMemo(() => {
    const usable = Math.max(0, viewportWidth - H_PADDING);
    const count = Math.max(
      1,
      Math.floor((usable + COL_GAP) / (CARD_WIDTH + COL_GAP)),
    );
    return count;
  }, [viewportWidth]);

  // Real card width after 1fr stretching: usable width split across
  // `columnsPerRow` columns minus inter-column gaps. Artwork is square
  // via `aspectRatio: 1` in stretch mode so card height = card width +
  // text + row gap. CELL_HEIGHT must follow this or virtualization
  // starts clipping rows at the wrong scroll offset.
  const actualCardWidth = useMemo(() => {
    const usable = Math.max(0, viewportWidth - H_PADDING);
    const totalGaps = (columnsPerRow - 1) * COL_GAP;
    const w = (usable - totalGaps) / Math.max(columnsPerRow, 1);
    return Math.max(CARD_WIDTH, w);
  }, [viewportWidth, columnsPerRow]);

  const cellHeight = actualCardWidth + CARD_TEXT + ROW_GAP;

  const totalRows = Math.ceil(items.length / columnsPerRow);
  const startRow = Math.max(0, Math.floor(scrollTop / cellHeight) - OVERSCAN_ROWS);
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / cellHeight) + OVERSCAN_ROWS,
  );

  const startItem = startRow * columnsPerRow;
  const endItem = Math.min(items.length, endRow * columnsPerRow);
  const topPad = startRow * cellHeight;
  const bottomPad = (totalRows - endRow) * cellHeight;
  const visibleSlice = items.slice(startItem, endItem);

  if (items.length === 0) {
    return (
      <div
        ref={scrollRef}
        className="flex-1 flex flex-col items-center justify-center gap-3"
        style={{ color: "var(--text-muted)" }}
      >
        <svg
          className="w-12 h-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"
          />
        </svg>
        <div className="text-center">
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            No media files found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-auto"
      style={{ padding: "24px" }}
    >
      {topPad > 0 && <div style={{ height: topPad }} aria-hidden />}
      <div
        style={{
          display: "grid",
          // Fixed column count derived from the viewport, but each column
          // is a `1fr` track so cards stretch to fill the row. This keeps
          // virtualization math stable (we still know exactly how many
          // items fit per row) AND makes the grid span the full width of
          // the library panel instead of hugging the left edge.
          gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
          columnGap: COL_GAP,
          rowGap: ROW_GAP,
        }}
      >
        {visibleSlice.map((item, i) => {
          const index = startItem + i;
          const playState =
            currentItemId === item.id
              ? isAudioPlaying
                ? "playing"
                : "paused"
              : "idle";
          return (
            <AlbumCard
              key={item.id}
              item={item}
              size="lg"
              layout="stacked"
              stretch
              selected={selectedIds.has(item.id)}
              playState={playState}
              onClick={(it, e) => onRowClick(it, index, e)}
              onContextMenu={(it, e) => onRowContextMenu(it, index, e)}
              onPlay={(it) => {
                // Double-click on the card body, or direct play button
                // click → forwards to the library's queue/play path.
                onPlay(it, index);
              }}
            />
          );
        })}
      </div>
      {bottomPad > 0 && <div style={{ height: bottomPad }} aria-hidden />}
    </div>
  );
}
