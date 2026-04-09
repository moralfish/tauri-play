import { useEffect, useState, useCallback } from "react";
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
import { addDirectory, artworkUrl, saveAppState, getAppState } from "../api/commands";
import { open } from "@tauri-apps/plugin-dialog";
import { useContextMenu, type MenuItem } from "./ContextMenu";
import type { MediaItem } from "../types";

// Column definitions
interface ColumnDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  width?: string;
  render: (item: MediaItem, index: number) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    id: "index",
    label: "#",
    defaultVisible: true,
    width: "w-8",
    render: (_item, index) => (
      <span style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
    ),
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
    render: (item) => (
      <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
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

// Artwork cell with play overlay on hover
function ArtworkCell({ item }: { item: MediaItem }) {
  const { setQueue } = usePlaybackStore();
  const items = useLibraryStore((s) => s.items);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const index = items.findIndex((i) => i.id === item.id);
    if (index >= 0) setQueue(items, index);
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
    </div>
  );
}

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

// Draggable library row
function DraggableRow({
  item,
  index,
  columns,
  onContextMenu,
  onDoubleClick,
}: {
  item: MediaItem;
  index: number;
  columns: ColumnDef[];
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${item.id}`,
    data: {
      type: "media",
      mediaId: item.id,
      name: item.title || item.name,
    },
  });

  return (
    <tr
      ref={setNodeRef}
      className={`cursor-pointer group transition-colors duration-150 ${isDragging ? "opacity-40" : ""}`}
      style={{ borderRadius: '12px' }}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      {...attributes}
    >
      {columns.map((col, colIdx) => (
        <td
          key={col.id}
          className={`px-4 py-3 ${col.width ? col.width : "max-w-xs"}`}
          style={colIdx === 0 ? { borderRadius: '12px 0 0 12px' } : colIdx === columns.length - 1 ? { borderRadius: '0 12px 12px 0' } : undefined}
          {...(colIdx === 0 ? listeners : {})}
        >
          {col.render(item, index)}
        </td>
      ))}
    </tr>
  );
}

export default function Library() {
  const { items, isScanning, scan, refresh, initEventListeners } =
    useLibraryStore();
  const { setQueue, playNext, addToQueue } = usePlaybackStore();
  const { playlists, addTrack } = usePlaylistStore();
  const { showMenu } = useContextMenu();

  // Column configuration state
  const [columnState, setColumnState] = useState<ColumnState[]>(() =>
    ALL_COLUMNS.map((c) => ({ id: c.id, visible: c.defaultVisible }))
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  useEffect(() => {
    refresh();
    initEventListeners();
  }, [refresh, initEventListeners]);

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await addDirectory(selected as string);
      await scan();
    }
  };

  // Get visible columns in order
  const visibleColumns = columnState
    .filter((cs) => cs.visible)
    .map((cs) => ALL_COLUMNS.find((c) => c.id === cs.id)!)
    .filter(Boolean);

  // Filter items by search
  const filteredItems = searchQuery.trim()
    ? items.filter((item) => {
        const q = searchQuery.toLowerCase();
        return (
          (item.title || "").toLowerCase().includes(q) ||
          (item.name || "").toLowerCase().includes(q) ||
          (item.artist || "").toLowerCase().includes(q) ||
          (item.album || "").toLowerCase().includes(q) ||
          (item.genre || "").toLowerCase().includes(q)
        );
      })
    : items;

  // Sort items
  const sortedItems = sortCol
    ? [...filteredItems].sort((a, b) => {
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
          case "index":
            aVal = filteredItems.indexOf(a);
            bVal = filteredItems.indexOf(b);
            break;
          default:
            return 0;
        }
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      })
    : filteredItems;

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

  // Build context menu for a track
  const buildTrackMenu = (item: MediaItem, index: number): MenuItem[] => {
    const playlistItems = playlists
      .filter((p) => !p.is_source)
      .map((p) => ({
        label: p.name,
        action: () => addTrack(p.id, item.id),
      }));

    return [
      {
        label: "Play",
        action: () => setQueue(items, index),
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
        label: "Reload Library",
        action: () => refresh(),
      },
    ];
  };

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

      {/* Media list */}
      <div className="flex-1 overflow-auto">
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
          <table className="w-full text-sm" style={{ borderSpacing: '0 2px', borderCollapse: 'separate' }}>
            <thead className="sticky top-0 text-left" style={{ background: 'var(--bg-surface)' }}>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    className={`px-4 py-2.5 text-xs font-normal ${col.width || ""} ${
                      col.id !== "artwork" && col.id !== "index"
                        ? "cursor-pointer select-none"
                        : ""
                    }`}
                    style={{ color: 'var(--text-muted)' }}
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
              {sortedItems.map((item, index) => (
                <DraggableRow
                  key={item.id}
                  item={item}
                  index={index}
                  columns={visibleColumns}
                  onContextMenu={(e) =>
                    showMenu(e, buildTrackMenu(item, index))
                  }
                  onDoubleClick={() => setQueue(sortedItems, index)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
