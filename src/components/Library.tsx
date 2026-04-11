import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  memo,
  useLayoutEffect,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { usePlaylistStore } from "../stores/playlistStore";
import {
  addDirectory,
  artworkUrl,
  saveAppState,
  getAppState,
  deleteMediaItems,
} from "../api/commands";
import { open } from "@tauri-apps/plugin-dialog";
import { useContextMenu, type MenuItem } from "./ContextMenu";
import { useConfirm } from "./ConfirmDialog";
import LibraryGrid from "./LibraryGrid";
import type { MediaItem } from "../types";

type LibraryViewMode = "list" | "grid";

type PlayState = "idle" | "playing" | "paused";

interface RowCtx {
  playState: PlayState;
  isSelected: boolean;
}

// A tiny 3-bar EQ icon with CSS animation — drawn via SVG so it inherits
// currentColor. The bars animate only when playState === "playing".
function PlayingIndicator({ state }: { state: Exclude<PlayState, "idle"> }) {
  if (state === "paused") {
    return (
      <svg
        className="w-3 h-3"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: "var(--accent)" }}
      >
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    );
  }
  return (
    <span
      className="inline-flex items-end gap-[2px] h-3"
      style={{ color: "var(--accent)" }}
      aria-label="Playing"
    >
      <span
        className="w-[3px] rounded-sm"
        style={{
          background: "currentColor",
          animation: "lib-eq 0.9s ease-in-out infinite",
          height: "40%",
        }}
      />
      <span
        className="w-[3px] rounded-sm"
        style={{
          background: "currentColor",
          animation: "lib-eq 0.9s ease-in-out 0.15s infinite",
          height: "80%",
        }}
      />
      <span
        className="w-[3px] rounded-sm"
        style={{
          background: "currentColor",
          animation: "lib-eq 0.9s ease-in-out 0.3s infinite",
          height: "60%",
        }}
      />
    </span>
  );
}

// Column definitions
interface ColumnDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  width?: string;
  render: (item: MediaItem, index: number, ctx: RowCtx) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    id: "index",
    label: "#",
    defaultVisible: true,
    width: "w-8",
    render: (_item, index, ctx) => {
      if (ctx.playState !== "idle") {
        return (
          <div className="flex items-center justify-center h-4">
            <PlayingIndicator state={ctx.playState} />
          </div>
        );
      }
      return (
        <span style={{ color: "var(--text-muted)" }}>{index + 1}</span>
      );
    },
  },
  {
    id: "artwork",
    label: "Art",
    defaultVisible: true,
    width: "w-10",
    render: (item) => <ArtworkCell item={item} />,
  },
  {
    id: "title",
    label: "Title",
    defaultVisible: true,
    render: (item, _index, ctx) => (
      <span
        className="truncate font-medium"
        style={{
          color:
            ctx.playState !== "idle"
              ? "var(--accent)"
              : "var(--text-primary)",
        }}
      >
        {item.title || item.name}
      </span>
    ),
  },
  {
    id: "artist",
    label: "Artist",
    defaultVisible: true,
    render: (item) => (
      <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
        {item.artist || ""}
      </span>
    ),
  },
  {
    id: "album",
    label: "Album",
    defaultVisible: true,
    render: (item) => (
      <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
        {item.album || ""}
      </span>
    ),
  },
  {
    id: "duration",
    label: "Time",
    defaultVisible: true,
    width: "w-16",
    render: (item) => (
      <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {formatDuration(item.duration_secs)}
      </span>
    ),
  },
  {
    id: "kind",
    label: "Type",
    defaultVisible: true,
    width: "w-16",
    render: (item) => (
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {item.kind}
      </span>
    ),
  },
  {
    id: "genre",
    label: "Genre",
    defaultVisible: false,
    width: "w-24",
    render: (item) => (
      <span className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
        {item.genre || ""}
      </span>
    ),
  },
  {
    id: "year",
    label: "Year",
    defaultVisible: false,
    width: "w-14",
    render: (item) => (
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {item.year || ""}
      </span>
    ),
  },
  {
    id: "track_number",
    label: "Track #",
    defaultVisible: false,
    width: "w-14",
    render: (item) => (
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {item.track_number || ""}
      </span>
    ),
  },
];

interface ColumnState {
  id: string;
  visible: boolean;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Artwork cell with play overlay on hover.
// NOTE: This used to subscribe to the entire items array via
// useLibraryStore((s) => s.items), which meant every ArtworkCell re-rendered
// on every library change (e.g. during scans with hundreds of items, or
// gdrive cache hydration). We now read both stores lazily via getState()
// only when the play button is actually clicked — this component has zero
// store subscriptions and only re-renders when its item prop changes.
const ArtworkCell = memo(function ArtworkCell({ item }: { item: MediaItem }) {
  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const items = useLibraryStore.getState().items;
    const index = items.findIndex((i) => i.id === item.id);
    if (index >= 0) usePlaybackStore.getState().setQueue(items, index);
  };

  return (
    <div className="relative group/art w-8 h-8">
      {item.artwork_hash ? (
        <img
          src={artworkUrl(item.artwork_hash)}
          alt=""
          className="w-8 h-8 rounded object-cover"
        />
      ) : (
        <div
          className="w-8 h-8 rounded flex items-center justify-center"
          style={{ background: 'var(--bg-hover)' }}
        >
          <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {item.kind === "Video" ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
            )}
          </svg>
        </div>
      )}
      {/* Play overlay */}
      <button
        onClick={handlePlayClick}
        className="absolute inset-0 bg-black/60 rounded flex items-center justify-center opacity-0 group-hover/art:opacity-100 transition-opacity"
      >
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
      {/* Cloud badge for non-local sources */}
      {item.source_type !== "local" && (
        <div
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center pointer-events-none"
          style={{ background: 'var(--bg-app)' }}
          title="Cloud"
        >
          <svg
            className="w-2.5 h-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: 'var(--accent)' }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z"
            />
          </svg>
        </div>
      )}
    </div>
  );
});

// Sortable column item for the column picker
function SortableColumnItem({
  col,
  onToggle,
}: {
  col: ColumnState & { label: string };
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: col.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors duration-150"
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        &#x2807;
      </span>
      <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={col.visible}
          onChange={onToggle}
          className="rounded accent-[var(--accent)]"
          style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}
        />
        <span style={{ color: 'var(--text-secondary)' }}>{col.label}</span>
      </label>
    </div>
  );
}

// Draggable library row.
// Wrapped in React.memo so that scrolling / hovering unrelated rows doesn't
// re-render this one. The parent supplies stable (useCallback) handlers and
// a memoized columns array so the shallow prop compare actually hits.
const DraggableRow = memo(function DraggableRow({
  item,
  index,
  columns,
  rowHeight,
  playState,
  isSelected,
  onRowContextMenu,
  onRowClick,
  onRowDoubleClick,
}: {
  item: MediaItem;
  index: number;
  columns: ColumnDef[];
  rowHeight: number;
  playState: PlayState;
  isSelected: boolean;
  onRowContextMenu: (item: MediaItem, index: number, e: React.MouseEvent) => void;
  onRowClick: (item: MediaItem, index: number, e: React.MouseEvent) => void;
  onRowDoubleClick: (item: MediaItem, index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${item.id}`,
    data: {
      type: "media",
      mediaId: item.id,
      name: item.title || item.name,
    },
  });

  // Build the per-row render context. This is cheap and only re-created
  // when one of its inputs changes (memo already short-circuits that).
  const ctx: RowCtx = { playState, isSelected };

  // Selection wins over hover for background color; the currently playing
  // row gets a subtle accent tint even when not selected.
  const baseBackground = isSelected
    ? "var(--accent-soft)"
    : playState !== "idle"
      ? "var(--accent-soft)"
      : "transparent";

  return (
    <tr
      ref={setNodeRef}
      className={`cursor-pointer group transition-colors duration-150 ${isDragging ? "opacity-40" : ""}`}
      style={{ borderRadius: "12px", height: rowHeight, background: baseBackground }}
      onClick={(e) => onRowClick(item, index, e)}
      onContextMenu={(e) => onRowContextMenu(item, index, e)}
      onDoubleClick={() => onRowDoubleClick(item, index)}
      onMouseEnter={(e) => {
        if (!isSelected && playState === "idle") {
          e.currentTarget.style.background = "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBackground;
      }}
      {...attributes}
    >
      {columns.map((col, colIdx) => (
        <td
          key={col.id}
          className={`px-4 py-3 ${col.width ? col.width : "max-w-xs"}`}
          style={
            colIdx === 0
              ? { borderRadius: "12px 0 0 12px" }
              : colIdx === columns.length - 1
                ? { borderRadius: "0 12px 12px 0" }
                : undefined
          }
          {...(colIdx === 0 ? listeners : {})}
        >
          {col.render(item, index, ctx)}
        </td>
      ))}
    </tr>
  );
});

export default function Library() {
  // Narrow store subscriptions: only re-render when these specific slices
  // change. Subscribing to the whole store (via `useLibraryStore()`) would
  // re-render the whole library on every scan progress tick.
  const rawItems = useLibraryStore((s) => s.items);
  const isScanning = useLibraryStore((s) => s.isScanning);
  const scan = useLibraryStore((s) => s.scan);
  const refresh = useLibraryStore((s) => s.refresh);
  const metadataSync = useLibraryStore((s) => s.metadataSync);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const playNext = usePlaybackStore((s) => s.playNext);
  const addToQueue = usePlaybackStore((s) => s.addToQueue);
  // These two drive the per-row "is this the playing track?" indicator.
  // Narrow selectors so Library only re-renders when the current item or
  // the play/pause state actually changes — not on every timeupdate.
  const currentItemId = usePlaybackStore((s) => s.currentItem?.id ?? null);
  const isAudioPlaying = usePlaybackStore((s) => s.isPlaying);
  const playlists = usePlaylistStore((s) => s.playlists);
  const addTrack = usePlaylistStore((s) => s.addTrack);
  const { showMenu } = useContextMenu();
  const confirm = useConfirm();

  // Multi-row selection. Using a Set gives O(1) `has()` lookups per row;
  // we pass down a primitive `isSelected` bool to each DraggableRow so the
  // React.memo shallow compare actually skips unaffected rows.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Anchor index for shift-click range selection, relative to `sortedItems`.
  const lastClickedIndexRef = useRef<number | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  // Column configuration state
  const [columnState, setColumnState] = useState<ColumnState[]>(() =>
    ALL_COLUMNS.map((c) => ({ id: c.id, visible: c.defaultVisible }))
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [sourceFilter, setSourceFilter] = useState<"all" | "local" | "cloud">("all");
  // Library view mode — persisted via saveAppState so the user's last
  // choice sticks across restarts. Default is the classic table list.
  const [viewMode, setViewMode] = useState<LibraryViewMode>("list");

  useEffect(() => {
    getAppState("library_view_mode")
      .then((saved) => {
        if (saved === "grid" || saved === "list") setViewMode(saved);
      })
      .catch(() => {});
  }, []);

  const changeViewMode = useCallback((next: LibraryViewMode) => {
    setViewMode(next);
    saveAppState("library_view_mode", next).catch(() => {});
  }, []);

  // Load saved column config
  useEffect(() => {
    getAppState("library_columns")
      .then((saved) => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as ColumnState[];
            // Merge with all columns (in case new columns were added)
            const merged = parsed.filter((p) =>
              ALL_COLUMNS.some((c) => c.id === p.id)
            );
            // Add any new columns not in saved config
            for (const col of ALL_COLUMNS) {
              if (!merged.some((m) => m.id === col.id)) {
                merged.push({ id: col.id, visible: col.defaultVisible });
              }
            }
            setColumnState(merged);
          } catch {
            // ignore parse errors
          }
        }
      })
      .catch(() => {});
  }, []);

  // Save column config when it changes
  const saveColumns = useCallback(
    (cols: ColumnState[]) => {
      setColumnState(cols);
      saveAppState("library_columns", JSON.stringify(cols)).catch(() => {});
    },
    []
  );

  // Note: initial refresh + event listener setup is now performed once at
  // the App level (see App.tsx). We intentionally do NOT refetch when this
  // component mounts — that's what made tab-switching feel sluggish.

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await addDirectory(selected as string);
      await scan();
    }
  };

  // -----------------------------------------------------------------
  // Stable display order.
  //
  // The backend orders media_items by (artist, album, track_number, name),
  // which means a gdrive track whose artist/album gets hydrated *after*
  // playback starts will jump to a new spot in the list the next time the
  // library refetches (media-cached event). That's jarring — the row you
  // just clicked suddenly slides away.
  //
  // To avoid that, we freeze the frontend display order: once an item has
  // been seen, it keeps its position. New items are appended in whatever
  // order the backend sent them. Deletions are honoured. Metadata changes
  // (title, artist, album, artwork, etc.) are picked up in place without
  // any reordering. An explicit click on a sort header still re-sorts via
  // the sortedItems memo below.
  // -----------------------------------------------------------------
  const stableOrderRef = useRef<string[]>([]);
  const items = useMemo(() => {
    const byId = new Map(rawItems.map((i) => [i.id, i]));
    const result: MediaItem[] = [];
    const seen = new Set<string>();
    // Keep previously-known items in their previous positions.
    for (const id of stableOrderRef.current) {
      const it = byId.get(id);
      if (it) {
        result.push(it);
        seen.add(id);
      }
    }
    // Append newly-arrived items in the order the backend returned them.
    for (const it of rawItems) {
      if (!seen.has(it.id)) result.push(it);
    }
    stableOrderRef.current = result.map((i) => i.id);
    return result;
  }, [rawItems]);

  // Get visible columns in order. Memoized so the DraggableRow memo can
  // actually hit on its `columns` prop between renders that don't touch
  // the column configuration.
  const visibleColumns = useMemo(
    () =>
      columnState
        .filter((cs) => cs.visible)
        .map((cs) => ALL_COLUMNS.find((c) => c.id === cs.id)!)
        .filter(Boolean),
    [columnState],
  );

  // Filter items by source first. Memoized so scrolling / hovering / search
  // typing doesn't re-run this O(n) pass on thousands of rows.
  const sourceFilteredItems = useMemo(() => {
    if (sourceFilter === "all") return items;
    return items.filter((item) =>
      sourceFilter === "local"
        ? item.source_type === "local"
        : item.source_type !== "local",
    );
  }, [items, sourceFilter]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sourceFilteredItems;
    return sourceFilteredItems.filter((item) => {
      return (
        (item.title || "").toLowerCase().includes(q) ||
        (item.name || "").toLowerCase().includes(q) ||
        (item.artist || "").toLowerCase().includes(q) ||
        (item.album || "").toLowerCase().includes(q) ||
        (item.genre || "").toLowerCase().includes(q)
      );
    });
  }, [sourceFilteredItems, searchQuery]);

  const { localCount, cloudCount } = useMemo(() => {
    let lc = 0;
    for (const i of items) if (i.source_type === "local") lc++;
    return { localCount: lc, cloudCount: items.length - lc };
  }, [items]);

  // Sort items. Memoized for the same reason as filteredItems.
  const sortedItems = useMemo(() => {
    if (!sortCol) return filteredItems;
    const sorted = [...filteredItems];
    sorted.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortCol) {
        case "title":
          aVal = (a.title || a.name || "").toLowerCase();
          bVal = (b.title || b.name || "").toLowerCase();
          break;
        case "artist":
          aVal = (a.artist || "").toLowerCase();
          bVal = (b.artist || "").toLowerCase();
          break;
        case "album":
          aVal = (a.album || "").toLowerCase();
          bVal = (b.album || "").toLowerCase();
          break;
        case "duration":
          aVal = a.duration_secs || 0;
          bVal = b.duration_secs || 0;
          break;
        case "kind":
          aVal = a.kind;
          bVal = b.kind;
          break;
        case "genre":
          aVal = (a.genre || "").toLowerCase();
          bVal = (b.genre || "").toLowerCase();
          break;
        case "year":
          aVal = a.year || 0;
          bVal = b.year || 0;
          break;
        case "track_number":
          aVal = a.track_number || 0;
          bVal = b.track_number || 0;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredItems, sortCol, sortDir]);

  // Column reorder
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } })
  );

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columnState.findIndex((c) => c.id === active.id);
    const newIndex = columnState.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    saveColumns(arrayMove(columnState, oldIndex, newIndex));
  };

  const toggleColumn = (id: string) => {
    saveColumns(
      columnState.map((c) =>
        c.id === id ? { ...c, visible: !c.visible } : c
      )
    );
  };

  // Remove a specific list of ids from the library, with a confirmation
  // prompt. Used by both the row context menu ("Remove from Library") and
  // the Delete keyboard shortcut.
  const removeTracks = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const ok = await confirm({
        title:
          ids.length === 1
            ? "Remove track from library?"
            : `Remove ${ids.length} tracks from library?`,
        message:
          "This removes the tracks from the library database, any cached audio, and waveform data. The original files on disk or in Google Drive are not touched.",
        destructive: true,
        confirmLabel: "Remove",
      });
      if (!ok) return;
      try {
        await deleteMediaItems(ids);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        await refresh();
      } catch (e) {
        console.error("Failed to delete media items:", e);
      }
    },
    [confirm, refresh],
  );

  // Build context menu for a track.
  // Kept as a plain function so it picks up the latest items/playlists
  // at the moment the menu opens (no stale closure).
  const buildTrackMenu = (item: MediaItem, index: number): MenuItem[] => {
    const playlistItems = playlists
      .filter((p) => !p.is_source)
      .map((p) => ({
        label: p.name,
        action: () => addTrack(p.id, item.id),
      }));

    // If the user right-clicks a row that's part of the current selection,
    // the "Remove" action applies to the whole selection. Otherwise the
    // selection is replaced with just this row before we build the menu.
    const currentSelection = selectedIds.has(item.id)
      ? Array.from(selectedIds)
      : [item.id];
    const removeLabel =
      currentSelection.length > 1
        ? `Remove ${currentSelection.length} tracks from Library`
        : "Remove from Library";

    return [
      {
        label: "Play",
        action: () => setQueue(sortedItems, index),
      },
      {
        label: "Play Next",
        action: () => playNext(item),
      },
      {
        label: "Add to Queue",
        action: () => addToQueue(item),
      },
      { label: "", separator: true },
      ...(playlistItems.length > 0
        ? [{ label: "Add to Playlist", submenu: playlistItems }]
        : []),
      { label: "", separator: true },
      {
        label: removeLabel,
        action: () => {
          void removeTracks(currentSelection);
        },
      },
      { label: "", separator: true },
      {
        label: "Reload Library",
        action: () => refresh(),
      },
    ];
  };

  // Stable row callbacks. We keep the latest sortedItems in a ref so the
  // callbacks themselves never need a new identity, which lets the
  // React.memo wrapper on DraggableRow hit on every scroll/re-render.
  const sortedItemsRef = useRef(sortedItems);
  sortedItemsRef.current = sortedItems;

  const handleRowDoubleClick = useCallback(
    (_item: MediaItem, index: number) => {
      setQueue(sortedItemsRef.current, index);
    },
    [setQueue],
  );

  // Click-based selection:
  //   plain click → select just this one
  //   cmd/ctrl click → toggle this one in the set
  //   shift click → range-select from the last anchor (exclusive of clears)
  const handleRowClick = useCallback(
    (item: MediaItem, index: number, e: React.MouseEvent) => {
      const list = sortedItemsRef.current;
      if (e.shiftKey && lastClickedIndexRef.current != null) {
        const anchor = lastClickedIndexRef.current;
        const [lo, hi] =
          anchor < index ? [anchor, index] : [index, anchor];
        const next = new Set<string>();
        for (let i = lo; i <= hi && i < list.length; i++) {
          next.add(list[i].id);
        }
        setSelectedIds(next);
      } else if (e.metaKey || e.ctrlKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
        lastClickedIndexRef.current = index;
      } else {
        setSelectedIds(new Set([item.id]));
        lastClickedIndexRef.current = index;
      }
    },
    [],
  );

  const handleRowContextMenu = useCallback(
    (item: MediaItem, index: number, e: React.MouseEvent) => {
      // If right-clicking outside the current selection, replace it with
      // just this row so the menu's "Remove" reflects the user's intent.
      if (!selectedIds.has(item.id)) {
        setSelectedIds(new Set([item.id]));
        lastClickedIndexRef.current = index;
      }
      showMenu(e, buildTrackMenu(item, index));
    },
    // buildTrackMenu closes over latest sortedItems/playlists/selectedIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlists, showMenu, selectedIds],
  );

  // Delete / Backspace key removes the current selection (with confirm).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedIds.size === 0) return;
      e.preventDefault();
      void removeTracks(Array.from(selectedIds));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, removeTracks]);

  // Clicking in the empty area below the rows clears the selection.
  // Only fires when the click target is the scroll container itself —
  // row clicks bubble up but we ignore them here so selection isn't
  // immediately wiped after `handleRowClick` sets it.
  const handleListBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (selectedIds.size > 0) clearSelection();
  };

  const ROW_HEIGHT = 58;
  const OVERSCAN = 6;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // NOTE: depending on `viewMode` is critical. When the user flips
  // grid → list, the old `<div ref={scrollRef}>` is unmounted and a
  // fresh DOM element is mounted for the list view. React reassigns
  // `scrollRef.current` automatically, but the ResizeObserver we set
  // up the first time is still bound to the *old* (now-detached)
  // element, so `viewportHeight` would freeze at its grid-mode value
  // and the virtualizer would render a short slice, leaving the
  // classic empty band at the bottom of the list. Re-running this
  // effect on view switches tears down the old observer and binds a
  // fresh one to the live scroll container.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    // Scroll position from a previous mount of this container
    // no longer means anything in the new view — reset both the
    // DOM scroll and the React mirror so virtualizer math starts
    // from the top.
    el.scrollTop = 0;
    setScrollTop(0);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode]);

  // rAF-throttled scroll handler — a raw scroll handler on a 10k-row list
  // can fire 100+ events per second and cause jank.
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

  // Reset scroll when the visible list completely changes (e.g. search,
  // source filter) so we don't render an empty slice high up in a short list.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [searchQuery, sourceFilter, sortCol, sortDir]);

  const totalRows = sortedItems.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const topPad = startIdx * ROW_HEIGHT;
  const bottomPad = (totalRows - endIdx) * ROW_HEIGHT;
  const visibleSlice = sortedItems.slice(startIdx, endIdx);

  // General (non-track) context menu
  const handleGeneralContextMenu = (e: React.MouseEvent) => {
    showMenu(e, [
      {
        label: "Reload Library",
        action: () => refresh(),
      },
      {
        label: "Scan for New Files",
        action: () => scan(),
      },
    ]);
  };

  return (
    <div
      className="flex flex-col h-full"
      onContextMenu={handleGeneralContextMenu}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        {/* Left: title */}
        <div className="flex-shrink-0">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Library</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {sortedItems.length}{sortedItems.length !== items.length ? ` / ${items.length}` : ""} tracks
          </p>
          {metadataSync && metadataSync.total > 0 && (
            <div
              className="mt-1 flex items-center gap-2 text-[10px] tabular-nums"
              style={{ color: 'var(--accent)' }}
              title="Fetching titles, artists, and artwork for cloud tracks in the background"
            >
              {!metadataSync.finished && (
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: 'var(--accent)' }}
                />
              )}
              <span>
                {metadataSync.finished
                  ? `Metadata synced (${metadataSync.total})`
                  : `Syncing metadata ${metadataSync.done}/${metadataSync.total}`}
              </span>
            </div>
          )}
        </div>

        {/* View mode toggle (List / Grid) */}
        <div
          className="flex items-center gap-0.5 p-0.5 flex-shrink-0"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <button
            onClick={() => changeViewMode("list")}
            className="h-8 w-9 flex items-center justify-center transition-colors duration-150"
            style={{
              background: viewMode === "list" ? 'var(--accent)' : 'transparent',
              color: viewMode === "list" ? 'var(--accent-on-accent)' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-control)',
            }}
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={() => changeViewMode("grid")}
            className="h-8 w-9 flex items-center justify-center transition-colors duration-150"
            style={{
              background: viewMode === "grid" ? 'var(--accent)' : 'transparent',
              color: viewMode === "grid" ? 'var(--accent-on-accent)' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-control)',
            }}
            title="Grid view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z" />
            </svg>
          </button>
        </div>

        {/* Source filter (All / Local / Cloud) */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-xl flex-shrink-0"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
        >
          {([
            { id: "all", label: "All", count: items.length },
            { id: "local", label: "Local", count: localCount },
            { id: "cloud", label: "Cloud", count: cloudCount },
          ] as const).map((opt) => {
            const active = sourceFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSourceFilter(opt.id)}
                className="h-8 px-3 rounded-lg text-xs font-medium transition-colors duration-150 flex items-center gap-1.5"
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-on-accent)' : 'var(--text-secondary)',
                }}
              >
                <span>{opt.label}</span>
                <span
                  className="text-[10px] tabular-nums"
                  style={{ opacity: active ? 0.8 : 0.6 }}
                >
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Center: search */}
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracks..."
            className="w-full h-10 rounded-xl pl-10 pr-8 text-sm outline-none transition-colors duration-150"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Column picker button */}
          <div className="relative">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-colors duration-150"
              style={{
                background: 'var(--bg-button-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
              title="Configure columns"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>
            {showColumnPicker && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowColumnPicker(false)}
                />
                <div
                  className="absolute right-0 top-full mt-2 rounded-xl shadow-xl py-2 px-1 min-w-[200px] z-50"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    className="text-[11px] uppercase tracking-wider px-2 pb-1.5 mb-1"
                    style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
                  >
                    Columns
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleColumnDragEnd}
                  >
                    <SortableContext
                      items={columnState.map((c) => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {columnState.map((cs) => {
                        const def = ALL_COLUMNS.find((c) => c.id === cs.id);
                        if (!def) return null;
                        return (
                          <SortableColumnItem
                            key={cs.id}
                            col={{ ...cs, label: def.label }}
                            onToggle={() => toggleColumn(cs.id)}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleAddFolder}
            className="h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150"
            style={{
              background: 'var(--bg-button-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            Add Folder
          </button>
          <button
            onClick={scan}
            disabled={isScanning}
            className="h-10 px-4 rounded-xl text-sm font-semibold transition-colors duration-150 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-on-accent)' }}
          >
            {isScanning ? "Scanning..." : "Scan"}
          </button>
        </div>
      </div>

      {/* Media content — either the virtualized list or the virtualized grid */}
      {viewMode === "grid" && items.length > 0 ? (
        <LibraryGrid
          items={sortedItems}
          selectedIds={selectedIds}
          onRowClick={handleRowClick}
          onRowContextMenu={handleRowContextMenu}
          onPlay={(_it, index) => setQueue(sortedItems, index)}
        />
      ) : (
      // `min-h-0` is the critical piece here — without it, a `flex-1`
      // scroll container inside a `flex flex-col h-full` parent will
      // refuse to shrink below its content height, leaving the last few
      // rows cut off (or producing a tall empty band at the bottom when
      // the library has a small number of rows).
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={handleListBackgroundClick}
        className="flex-1 min-h-0 overflow-auto"
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg className="w-12 h-12" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No media files found</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Add a folder and scan to get started
              </p>
            </div>
          </div>
        ) : (
          // Rows keep their 2px vertical gap via `border-spacing` so the
          // rounded "pill" row look stays intact. Flicker is killed
          // further down by giving each sticky `<th>` its own opaque
          // background + `z-index: 2`, so rows scrolling underneath
          // never leak through the header during scroll.
          <table className="w-full text-sm" style={{ borderSpacing: '0 2px', borderCollapse: 'separate' }}>
            <thead
              className="sticky top-0 text-left"
              style={{
                background: 'var(--bg-surface)',
                zIndex: 2,
              }}
            >
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    className={`px-4 py-2.5 text-xs font-normal ${col.width || ""} ${
                      col.id !== "artwork" && col.id !== "index"
                        ? "cursor-pointer select-none"
                        : ""
                    }`}
                    style={{
                      color: 'var(--text-muted)',
                      background: 'var(--bg-surface)',
                      // Thin bottom divider so the header has a clear
                      // edge even when a row scrolls up against it.
                      boxShadow: 'inset 0 -1px 0 var(--border)',
                    }}
                    onClick={() => {
                      if (col.id === "artwork") return;
                      if (sortCol === col.id) {
                        setSortDir(sortDir === "asc" ? "desc" : "asc");
                      } else {
                        setSortCol(col.id);
                        setSortDir("asc");
                      }
                    }}
                  >
                    {col.id === "artwork" ? "" : (
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sortCol === col.id && (
                          <span className="text-[10px]" style={{ color: 'var(--accent)' }}>
                            {sortDir === "asc" ? "\u25B2" : "\u25BC"}
                          </span>
                        )}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Top spacer to push the visible slice down to its correct
                  scroll offset. Using a single tall row is cheaper than
                  absolute positioning inside a <table>. */}
              {topPad > 0 && (
                <tr style={{ height: topPad }} aria-hidden>
                  <td colSpan={visibleColumns.length} style={{ padding: 0 }} />
                </tr>
              )}
              {visibleSlice.map((item, i) => {
                const index = startIdx + i;
                const playState: PlayState =
                  currentItemId === item.id
                    ? isAudioPlaying
                      ? "playing"
                      : "paused"
                    : "idle";
                const isSelected = selectedIds.has(item.id);
                return (
                  <DraggableRow
                    key={item.id}
                    item={item}
                    index={index}
                    columns={visibleColumns}
                    rowHeight={ROW_HEIGHT}
                    playState={playState}
                    isSelected={isSelected}
                    onRowContextMenu={handleRowContextMenu}
                    onRowClick={handleRowClick}
                    onRowDoubleClick={handleRowDoubleClick}
                  />
                );
              })}
              {bottomPad > 0 && (
                <tr style={{ height: bottomPad }} aria-hidden>
                  <td colSpan={visibleColumns.length} style={{ padding: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}
