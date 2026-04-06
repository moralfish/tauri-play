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
      <span className="text-zinc-500">{index + 1}</span>
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
      <span className="truncate">{item.title || item.name}</span>
    ),
  },
  {
    id: "artist",
    label: "Artist",
    defaultVisible: true,
    render: (item) => (
      <span className="truncate text-zinc-400">{item.artist || ""}</span>
    ),
  },
  {
    id: "album",
    label: "Album",
    defaultVisible: true,
    render: (item) => (
      <span className="truncate text-zinc-400">{item.album || ""}</span>
    ),
  },
  {
    id: "duration",
    label: "Time",
    defaultVisible: true,
    width: "w-16",
    render: (item) => (
      <span className="text-zinc-500 text-xs tabular-nums">
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
      <span
        className={`text-xs px-1.5 py-0.5 rounded ${
          item.kind === "Video"
            ? "bg-purple-900/50 text-purple-300"
            : "bg-blue-900/50 text-blue-300"
        }`}
      >
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
      <span className="truncate text-zinc-400 text-xs">
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
      <span className="text-zinc-400 text-xs">{item.year || ""}</span>
    ),
  },
  {
    id: "track_number",
    label: "Track #",
    defaultVisible: false,
    width: "w-14",
    render: (item) => (
      <span className="text-zinc-500 text-xs">{item.track_number || ""}</span>
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
        <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
          <span className="text-zinc-600 text-xs">
            {item.kind === "Video" ? "V" : "A"}
          </span>
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
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-700 rounded"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-zinc-600 hover:text-zinc-400 text-xs"
      >
        ⠿
      </span>
      <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={col.visible}
          onChange={onToggle}
          className="rounded bg-zinc-700 border-zinc-600 accent-blue-500"
        />
        <span className="text-zinc-300">{col.label}</span>
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
      className={`hover:bg-zinc-900 cursor-pointer group ${isDragging ? "opacity-40" : ""}`}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      {...attributes}
    >
      {columns.map((col, colIdx) => (
        <td
          key={col.id}
          className={`px-4 py-1.5 ${col.width ? col.width : "max-w-xs"}`}
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
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold">Library</h2>
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracks..."
            className="w-full bg-zinc-800 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <span className="text-xs text-zinc-500 mr-2">
          {sortedItems.length}{sortedItems.length !== items.length ? ` / ${items.length}` : ""} items
        </span>

        {/* Column picker */}
        <div className="relative">
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className="px-2 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            title="Configure columns"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
              />
            </svg>
          </button>
          {showColumnPicker && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowColumnPicker(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-2 px-1 min-w-[180px] z-50">
                <div className="text-xs text-zinc-500 uppercase tracking-wider px-2 pb-1 mb-1 border-b border-zinc-700">
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
          className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          Add Folder
        </button>
        <button
          onClick={scan}
          disabled={isScanning}
          className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
        >
          {isScanning ? "Scanning..." : "Scan"}
        </button>
      </div>

      {/* Media list */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <p className="text-sm">No media files found</p>
            <p className="text-xs mt-1">
              Add a folder and scan to get started
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-left">
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    className={`px-4 py-2 font-medium ${col.width || ""} ${
                      col.id !== "artwork" && col.id !== "index"
                        ? "cursor-pointer hover:text-zinc-200 select-none"
                        : ""
                    }`}
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
                          <span className="text-[10px]">
                            {sortDir === "asc" ? "▲" : "▼"}
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
