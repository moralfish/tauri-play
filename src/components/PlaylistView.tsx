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
      className={`cursor-pointer group transition-colors duration-150 ${isDragging ? "opacity-40" : ""}`}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      {...attributes}
    >
      <td className="px-3 py-3 w-8" style={{ borderRadius: '12px 0 0 12px' }}>
        <span
          {...listeners}
          className="cursor-grab active:cursor-grabbing transition-colors duration-150"
          style={{ color: 'var(--text-muted)' }}
          title="Drag to reorder"
        >
          <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </span>
      </td>
      <td className="px-3 py-3 w-8">
        <span style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
      </td>
      <td className="px-3 py-3 w-10">
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
      </td>
      <td className="px-3 py-3 truncate max-w-xs">
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {item.title || item.name}
        </span>
      </td>
      <td className="px-3 py-3 truncate max-w-xs" style={{ color: 'var(--text-secondary)' }}>
        {item.artist || ""}
      </td>
      <td className="px-3 py-3 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {formatDuration(item.duration_secs)}
      </td>
      <td className="px-3 py-3" style={{ borderRadius: '0 12px 12px 0' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <svg className="w-10 h-10" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
        </svg>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a playlist</p>
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
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {playlist.name}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {tracks.length} track{tracks.length !== 1 ? "s" : ""}
          </p>
        </div>
        {tracks.length > 0 && (
          <button
            onClick={() => setQueue(tracks, 0)}
            className="h-10 px-5 rounded-xl text-sm font-semibold transition-colors duration-150 flex items-center gap-2"
            style={{ background: 'var(--accent)', color: 'var(--accent-on-accent)' }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg className="w-10 h-10" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
            </svg>
            <div className="text-center">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No tracks in this playlist</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Drag tracks from the library to add them
              </p>
            </div>
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
              <table className="w-full text-sm" style={{ borderSpacing: '0 2px', borderCollapse: 'separate' }}>
                <thead className="sticky top-0 text-left" style={{ background: 'var(--bg-surface)' }}>
                  <tr>
                    <th className="px-3 py-2.5 text-xs font-normal w-8" style={{ color: 'var(--text-muted)' }}></th>
                    <th className="px-3 py-2.5 text-xs font-normal w-8" style={{ color: 'var(--text-muted)' }}>#</th>
                    <th className="px-3 py-2.5 text-xs font-normal w-10" style={{ color: 'var(--text-muted)' }}></th>
                    <th className="px-3 py-2.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>Title</th>
                    <th className="px-3 py-2.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>Artist</th>
                    <th className="px-3 py-2.5 text-xs font-normal w-16" style={{ color: 'var(--text-muted)' }}>Time</th>
                    <th className="px-3 py-2.5 text-xs font-normal w-16" style={{ color: 'var(--text-muted)' }}>Type</th>
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
