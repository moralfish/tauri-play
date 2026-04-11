import type { ReactNode } from "react";
import type { MediaItem } from "../../types";
import { usePlaybackStore } from "../../stores/playbackStore";
import { useLibraryStore } from "../../stores/libraryStore";

interface QuickActionProps {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
}

function ActionChip({ label, onClick, icon, disabled }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-4 h-10 text-sm font-medium transition-all duration-150 disabled:opacity-40"
      style={{
        background: "var(--bg-button-secondary)",
        borderRadius: "var(--radius-chip)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--bg-button-secondary)";
      }}
    >
      <span style={{ color: "var(--accent)" }}>{icon}</span>
      {label}
    </button>
  );
}

interface QuickActionsProps {
  onOpenRecentlyAdded?: () => void;
}

export default function QuickActions({ onOpenRecentlyAdded }: QuickActionsProps) {
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const toggleQueue = usePlaybackStore((s) => s.toggleQueue);
  const items = useLibraryStore((s) => s.items);

  const shuffleAll = () => {
    if (items.length === 0) return;
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    void setQueue(shuffled as MediaItem[], 0);
  };

  const playAll = () => {
    if (items.length === 0) return;
    void setQueue(items as MediaItem[], 0);
  };

  const disabled = items.length === 0;

  return (
    <div className="flex flex-wrap gap-2">
      <ActionChip
        label="Shuffle library"
        onClick={shuffleAll}
        disabled={disabled}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        }
      />
      <ActionChip
        label="Play all"
        onClick={playAll}
        disabled={disabled}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        }
      />
      <ActionChip
        label="Open queue"
        onClick={toggleQueue}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        }
      />
      {onOpenRecentlyAdded && (
        <ActionChip
          label="Recently added"
          onClick={onOpenRecentlyAdded}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      )}
    </div>
  );
}
