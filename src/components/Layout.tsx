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
import QueueView from "./QueueView";

interface LayoutProps {
  sidebar: ReactNode;
  content: ReactNode;
  player: ReactNode;
}

export default function Layout({ sidebar, content, player }: LayoutProps) {
  const [draggedItemName, setDraggedItemName] = useState<string | null>(null);
  const { addTrack } = usePlaylistStore();
  const showQueue = usePlaybackStore((s) => s.showQueue);

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

  return (
    <ContextMenuProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 select-none">
          <div className="flex flex-1 min-h-0">
            <aside className="w-64 border-r border-zinc-800 flex flex-col flex-shrink-0">
              {sidebar}
            </aside>
            <main className="flex-1 overflow-auto min-w-0">{content}</main>
            {/* Queue panel */}
            {showQueue && (
              <aside className="w-80 flex-shrink-0">
                <QueueView />
              </aside>
            )}
          </div>
          <footer className="h-20 border-t border-zinc-800 flex-shrink-0">
            {player}
          </footer>
        </div>
        <DragOverlay>
          {draggedItemName ? (
            <div className="bg-zinc-800 text-white text-sm px-3 py-1.5 rounded shadow-lg border border-zinc-700">
              {draggedItemName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </ContextMenuProvider>
  );
}
