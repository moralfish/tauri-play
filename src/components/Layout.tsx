import { ReactNode, useState } from "react";
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { usePlaylistStore } from "../stores/playlistStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { ContextMenuProvider } from "./ContextMenu";

interface LayoutProps {
  sidebar: ReactNode;
  content: ReactNode;
  player: ReactNode;
  rightPanel: ReactNode;
}

export default function Layout({ sidebar, content, player, rightPanel }: LayoutProps) {
  const [draggedItemName, setDraggedItemName] = useState<string | null>(null);
  const { addTrack } = usePlaylistStore();
  const showQueue = usePlaybackStore((s) => s.showQueue);
  const currentItem = usePlaybackStore((s) => s.currentItem);
  const showRightPanel = usePlaybackStore((s) => s.showRightPanel);
  const leftCollapsed = usePlaybackStore((s) => s.leftSidebarCollapsed);
  const rightCollapsed = usePlaybackStore((s) => s.rightSidebarCollapsed);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "media") {
      setDraggedItemName(data.name || "Track");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedItemName(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current;
    const overData = over.data.current;
    if (activeData?.type === "media" && overData?.type === "playlist") {
      addTrack(overData.playlistId, activeData.mediaId);
    }
  };

  const rightPanelVisible = showRightPanel && (showQueue || !!currentItem);

  return (
    <ContextMenuProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="h-screen flex flex-col select-none" style={{ background: 'var(--bg-app)' }}>
          {/* Main area */}
          <div className="flex flex-1 min-h-0 p-2 gap-2">
            {/* Left Sidebar — collapsible */}
            <aside
              className="flex-shrink-0 flex flex-col overflow-hidden"
              style={{
                width: leftCollapsed ? 60 : 270,
                transition: 'width 0.2s ease',
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-panel)',
              }}
            >
              {sidebar}
            </aside>

            {/* Content */}
            <main
              className="flex-1 min-w-0 overflow-hidden flex flex-col"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-panel)',
              }}
            >
              {content}
            </main>

            {/* Right panel — collapsible */}
            {rightPanelVisible && (
              <aside
                className="flex-shrink-0 overflow-hidden flex flex-col"
                style={{
                  width: rightCollapsed ? 60 : 340,
                  transition: 'width 0.2s ease',
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-panel)',
                  boxShadow: '0 10px 30px var(--shadow-panel)',
                }}
              >
                {rightPanel}
              </aside>
            )}
          </div>

          {/* Floating player dock */}
          <div className="px-2 pb-2">
            <footer
              className="overflow-hidden"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-panel)',
                boxShadow: '0 -4px 30px var(--shadow-player)',
              }}
            >
              {player}
            </footer>
          </div>
        </div>

        <DragOverlay>
          {draggedItemName ? (
            <div
              className="text-sm px-3 py-1.5 shadow-lg"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-control)',
                color: 'var(--text-primary)',
              }}
            >
              {draggedItemName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </ContextMenuProvider>
  );
}
