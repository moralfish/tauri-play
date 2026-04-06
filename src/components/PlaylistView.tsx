import { useState } from "react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePlaylistStore } from "../stores/playlistStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { artworkUrl } from "../api/commands";
import { useContextMenu, type MenuItem } from "./ContextMenu";
import { useLibraryStore } from "../stores/libraryStore";
import type { MediaItem } from "../types";

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SortableTrackRow({
  item,
  index,
  onDoubleClick,
  onContextMenu,
}: {
  item: MediaItem;
  index: number;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-zinc-900 cursor-pointer group ${isDragging ? "opacity-40 bg-zinc-800" : ""}`}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      {...attributes}
    >
      <td className="px-4 py-1.5 text-zinc-500 w-8">
        <span
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400"
          title="Drag to reorder"
        >
          ⠿
        </span>
      </td>
      <td className="px-4 py-1.5 text-zinc-500">{index + 1}</td>
      <td className="px-4 py-1.5">
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
      </td>
      <td className="px-4 py-1.5 truncate max-w-xs">
        {item.title || item.name}
      </td>
      <td className="px-4 py-1.5 truncate max-w-xs text-zinc-400">
        {item.artist || ""}
      </td>
      <td className="px-4 py-1.5 text-zinc-500 text-xs tabular-nums">
        {formatDuration(item.duration_secs)}
      </td>
      <td className="px-4 py-1.5">
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            item.kind === "Video"
              ? "bg-purple-900/50 text-purple-300"
              : "bg-blue-900/50 text-blue-300"
          }`}
        >
          {item.kind}
        </span>
      </td>
    </tr>
  );
}

export default function PlaylistView() {
  const { playlists, activePlaylistId, activePlaylistTracks, reorderTracks, addTrack } =
    usePlaylistStore();
  const { setQueue, playNext, addToQueue } = usePlaybackStore();
  const { showMenu } = useContextMenu();
  const refresh = useLibraryStore((s) => s.refresh);
  const [localTracks, setLocalTracks] = useState<MediaItem[] | null>(null);

  const playlist = playlists.find((p) => p.id === activePlaylistId);
  const tracks = localTracks ?? activePlaylistTracks;

  // Reset local state when playlist changes
  if (localTracks && localTracks !== activePlaylistTracks) {
    // Check if the tracks are actually from a different playlist load
    const localIds = localTracks.map((t) => t.id).join(",");
    const storeIds = activePlaylistTracks.map((t) => t.id).join(",");
    if (localIds !== storeIds && localTracks.length !== activePlaylistTracks.length) {
      setLocalTracks(null);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Select a playlist
      </div>
    );
  }

  const handlePlay = (index: number) => {
    setQueue(tracks, index);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tracks.findIndex((t) => t.id === active.id);
    const newIndex = tracks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tracks, oldIndex, newIndex);
    setLocalTracks(reordered);
    reorderTracks(
      activePlaylistId!,
      reordered.map((t) => t.id)
    );
  };

  const buildTrackMenu = (item: MediaItem, index: number): MenuItem[] => {
    const playlistItems = playlists
      .filter((p) => !p.is_source && p.id !== activePlaylistId)
      .map((p) => ({
        label: p.name,
        action: () => addTrack(p.id, item.id),
      }));

    return [
      { label: "Play", action: () => setQueue(tracks, index) },
      { label: "Play Next", action: () => playNext(item) },
      { label: "Add to Queue", action: () => addToQueue(item) },
      { label: "", separator: true },
      ...(playlistItems.length > 0
        ? [{ label: "Add to Playlist", submenu: playlistItems }]
        : []),
      { label: "", separator: true },
      { label: "Reload Library", action: () => refresh() },
    ];
  };

  const handleGeneralContextMenu = (e: React.MouseEvent) => {
    showMenu(e, [{ label: "Reload Library", action: () => refresh() }]);
  };

  return (
    <div className="flex flex-col h-full" onContextMenu={handleGeneralContextMenu}>
      <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold flex-1">{playlist.name}</h2>
        <span className="text-xs text-zinc-500">
          {tracks.length} tracks
        </span>
        {tracks.length > 0 && (
          <button
            onClick={() => setQueue(tracks, 0)}
            className="px-3 py-1.5 text-sm bg-white text-zinc-950 rounded hover:bg-zinc-200 transition-colors"
          >
            Play All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {tracks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            No tracks in this playlist
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tracks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium w-8"></th>
                    <th className="px-4 py-2 font-medium w-8">#</th>
                    <th className="px-4 py-2 font-medium w-10"></th>
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-4 py-2 font-medium">Artist</th>
                    <th className="px-4 py-2 font-medium w-16">Time</th>
                    <th className="px-4 py-2 font-medium w-16">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((item, index) => (
                    <SortableTrackRow
                      key={item.id}
                      item={item}
                      index={index}
                      onDoubleClick={() => handlePlay(index)}
                      onContextMenu={(e) => showMenu(e, buildTrackMenu(item, index))}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
