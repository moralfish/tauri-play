import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { usePlaylistStore } from "../stores/playlistStore";
import { usePlaybackStore } from "../stores/playbackStore";

interface SidebarProps {
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
    data: { type: "playlist", playlistId: playlist.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 ${
        isOver
          ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]/30"
          : isActive
            ? "bg-[var(--bg-active)]"
            : "hover:bg-[var(--bg-hover)]"
      }`}
      onClick={onClick}
    >
      <svg className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
      <span className="flex-1 truncate text-sm" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {playlist.is_source && (
          <span style={{ color: 'var(--text-muted)' }} className="mr-1 text-xs">S</span>
        )}
        {playlist.name}
      </span>
      {!playlist.is_source && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-xs transition-opacity duration-150"
          style={{ color: 'var(--text-muted)' }}
          title="Delete"
        >
          <svg className="w-3.5 h-3.5 hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Nav item component
function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
        active
          ? "bg-[var(--bg-active)]"
          : "hover:bg-[var(--bg-hover)]"
      }`}
      style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({ onViewChange, currentView }: SidebarProps) {
  const {
    playlists,
    activePlaylistId,
    fetchPlaylists,
    selectPlaylist,
    createPlaylist,
    deletePlaylist,
  } = usePlaylistStore();
  const toggleQueue = usePlaybackStore((s) => s.toggleQueue);
  const showQueue = usePlaybackStore((s) => s.showQueue);
  const queue = usePlaybackStore((s) => s.queue);
  const queueIndex = usePlaybackStore((s) => s.queueIndex);

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

  const upNextCount = queue.length - queueIndex - 1;
  const filteredPlaylists = playlists.filter(
    (p) => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full py-3">
      {/* Brand */}
      <div className="px-4 pb-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
          <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Tauri Play
        </span>
      </div>

      {/* Navigation */}
      <div className="px-3 space-y-0.5">
        <NavItem
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
            </svg>
          }
          label="Library"
          active={currentView === "library" && !activePlaylistId}
          onClick={() => { selectPlaylist(null); onViewChange("library"); }}
        />
        <NavItem
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          }
          label="Queue"
          active={showQueue}
          onClick={toggleQueue}
          badge={upNextCount > 0 ? upNextCount : undefined}
        />
        <NavItem
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          label="Settings"
          active={currentView === "settings"}
          onClick={() => onViewChange("settings")}
        />
      </div>

      {/* Divider */}
      <div className="mx-4 my-3" style={{ borderBottom: '1px solid var(--border)' }} />

      {/* Playlists header */}
      <div className="flex items-center px-4 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider flex-1" style={{ color: 'var(--text-muted)' }}>
          Playlists
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-muted)' }}
          title="New Playlist"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Create playlist input */}
      {showCreate && (
        <div className="px-3 pb-2 flex gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Playlist name"
            className="flex-1 h-9 rounded-xl px-3 text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            autoFocus
          />
          <button
            onClick={handleCreate}
            className="h-9 px-3 rounded-xl text-xs font-medium transition-colors duration-150"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            Add
          </button>
        </div>
      )}

      {/* Playlist search */}
      <div className="px-3 mb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search playlists..."
          className="w-full h-8 rounded-lg px-3 text-xs outline-none"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        />
      </div>

      {/* Playlist list */}
      <div className="flex-1 overflow-auto px-3 space-y-0.5">
        {filteredPlaylists.map((p) => (
          <DroppablePlaylistItem
            key={p.id}
            playlist={p}
            isActive={activePlaylistId === p.id}
            onClick={() => handleSelectPlaylist(p.id)}
            onDelete={() => deletePlaylist(p.id)}
          />
        ))}
        {filteredPlaylists.length === 0 && (
          <p className="text-xs px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            {searchQuery ? "No playlists found" : "No playlists yet"}
          </p>
        )}
      </div>
    </div>
  );
}
