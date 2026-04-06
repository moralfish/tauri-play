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

  const showRightPanel = showQueue || !!currentItem;

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
            {/* Sidebar */}
            <aside
              className="w-[270px] flex-shrink-0 flex flex-col rounded-[20px] overflow-hidden"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}
            >
              {sidebar}
            </aside>

            {/* Content */}
            <main
              className="flex-1 min-w-0 rounded-[20px] overflow-hidden flex flex-col"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              {content}
            </main>

            {/* Right panel */}
            {showRightPanel && (
              <aside
                className="w-[340px] flex-shrink-0 rounded-[20px] overflow-hidden flex flex-col"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                }}
              >
                {rightPanel}
              </aside>
            )}
          </div>

          {/* Floating player dock */}
          <div className="px-2 pb-2">
            <footer
              className="rounded-[20px] overflow-hidden"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                boxShadow: '0 -4px 30px rgba(0,0,0,0.3)',
              }}
            >
              {player}
            </footer>
          </div>
        </div>

        <DragOverlay>
          {draggedItemName ? (
            <div
              className="text-sm px-3 py-1.5 rounded-xl shadow-lg"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
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
