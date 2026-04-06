import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { usePlaylistStore } from "../stores/playlistStore";

interface PlaylistSidebarProps {
  onViewChange: (view: "library" | "playlist" | "settings") => void;
  currentView: "library" | "playlist" | "settings";
}

function DroppablePlaylistItem({
  playlist,
  isActive,
  onClick,
  onDelete,
}: {
  playlist: { id: string; name: string; is_source: boolean };
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `playlist-drop-${playlist.id}`,
    data: {
      type: "playlist",
      playlistId: playlist.id,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`group flex items-center px-4 py-2 text-sm cursor-pointer transition-colors ${
        isOver
          ? "bg-blue-900/40 ring-1 ring-blue-500/50"
          : isActive
            ? "bg-zinc-900 text-white"
            : "text-zinc-400 hover:bg-zinc-900"
      }`}
      onClick={onClick}
    >
      <span className="flex-1 truncate">
        {playlist.is_source && (
          <span className="text-zinc-600 mr-1" title="Source playlist">
            S
          </span>
        )}
        {playlist.name}
      </span>
      {!playlist.is_source && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-xs transition-opacity"
          title="Delete"
        >
          x
        </button>
      )}
    </div>
  );
}

export default function PlaylistSidebar({
  onViewChange,
  currentView,
}: PlaylistSidebarProps) {
  const {
    playlists,
    activePlaylistId,
    fetchPlaylists,
    selectPlaylist,
    createPlaylist,
    deletePlaylist,
  } = usePlaylistStore();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const handleCreate = async () => {
    if (newName.trim()) {
      await createPlaylist(newName.trim());
      setNewName("");
      setShowCreate(false);
    }
  };

  const handleSelectPlaylist = async (id: string) => {
    await selectPlaylist(id);
    onViewChange("playlist");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Library link */}
      <button
        onClick={() => {
          selectPlaylist(null);
          onViewChange("library");
        }}
        className={`px-4 py-3 text-left text-sm font-medium hover:bg-zinc-900 transition-colors ${
          currentView === "library"
            ? "bg-zinc-900 text-white"
            : "text-zinc-400"
        }`}
      >
        Library
      </button>

      <div className="border-t border-zinc-800 mt-1" />

      {/* Playlists header */}
      <div className="flex items-center px-4 py-2">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex-1">
          Playlists
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-zinc-500 hover:text-white text-lg leading-none"
          title="New Playlist"
        >
          +
        </button>
      </div>

      {/* Search playlists */}
      <div className="px-4 pb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search playlists..."
          className="w-full bg-zinc-800 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-500"
        />
      </div>

      {/* Create playlist input */}
      {showCreate && (
        <div className="px-4 pb-2 flex gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Playlist name"
            className="flex-1 bg-zinc-800 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-zinc-600"
            autoFocus
          />
          <button
            onClick={handleCreate}
            className="text-xs bg-zinc-700 px-2 rounded hover:bg-zinc-600"
          >
            Add
          </button>
        </div>
      )}

      {/* Playlist list */}
      <div className="flex-1 overflow-auto">
        {playlists
          .filter((p) => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((p) => (
          <DroppablePlaylistItem
            key={p.id}
            playlist={p}
            isActive={activePlaylistId === p.id}
            onClick={() => handleSelectPlaylist(p.id)}
            onDelete={() => deletePlaylist(p.id)}
          />
        ))}
      </div>

      {/* Settings button */}
      <div className="border-t border-zinc-800">
        <button
          onClick={() => onViewChange("settings")}
          className={`w-full px-4 py-3 text-left text-sm flex items-center gap-2 hover:bg-zinc-900 transition-colors ${
            currentView === "settings" ? "bg-zinc-900 text-white" : "text-zinc-400"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}
