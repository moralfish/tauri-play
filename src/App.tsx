import { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import Library from "./components/Library";
import PlaylistView from "./components/PlaylistView";
import Settings from "./components/Settings";
import Player from "./components/Player";
import NowPlayingPanel from "./components/NowPlayingPanel";
import ScanProgressModal from "./components/ScanProgressModal";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { useThemeStore } from "./stores/themeStore";
import { usePlaybackStore } from "./stores/playbackStore";
import { useLibraryStore } from "./stores/libraryStore";

type View = "library" | "playlist" | "settings";

function StartupSpinner() {
  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ background: "var(--bg-app)" }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{
            border: "3px solid var(--border)",
            borderTopColor: "var(--accent)",
          }}
        />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Loading library…
        </p>
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("library");
  const isLoading = useLibraryStore((s) => s.isLoading);
  const itemCount = useLibraryStore((s) => s.items.length);

  // Init theme once on mount.
  useEffect(() => {
    useThemeStore.getState().init();
  }, []);

  // Hoist initial library load + event listener setup to App level so the
  // tab views never have to refetch on mount. This is what eliminates the
  // visible latency when switching between Library and Settings.
  useEffect(() => {
    const lib = useLibraryStore.getState();
    lib.initEventListeners();
    lib.refresh();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input/textarea
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const pb = usePlaybackStore.getState();

    switch (e.code) {
      case "Space":
        e.preventDefault();
        pb.togglePlay();
        break;
      case "ArrowRight":
        if (e.shiftKey) {
          // Shift+Right: next track
          pb.next();
        }
        break;
      case "ArrowLeft":
        if (e.shiftKey) {
          // Shift+Left: previous track
          pb.prev();
        }
        break;
      case "ArrowUp":
        if (e.shiftKey) {
          // Shift+Up: volume up
          e.preventDefault();
          pb.setVolume(pb.volume + 0.05);
        }
        break;
      case "ArrowDown":
        if (e.shiftKey) {
          // Shift+Down: volume down
          e.preventDefault();
          pb.setVolume(pb.volume - 0.05);
        }
        break;
      case "KeyM":
        // M: mute/unmute
        pb.setVolume(pb.volume === 0 ? 1 : 0);
        break;
      case "KeyQ":
        // Q: toggle queue
        pb.toggleQueue();
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Show a full-screen spinner only on the very first load, before the
  // backend has had a chance to return any items. Once items are in the
  // store we render the real UI even if isLoading flips again later (scans).
  if (isLoading && itemCount === 0) {
    return <StartupSpinner />;
  }

  // Keep-alive routing: all three views stay mounted and we just toggle
  // their visibility. Switching tabs becomes free (no unmount, no refetch,
  // no re-running of useEffects, scroll position preserved).
  const content = (
    <>
      <div
        className="h-full w-full"
        style={{ display: view === "library" ? "flex" : "none", flexDirection: "column" }}
      >
        <Library />
      </div>
      <div
        className="h-full w-full"
        style={{ display: view === "playlist" ? "flex" : "none", flexDirection: "column" }}
      >
        <PlaylistView />
      </div>
      <div
        className="h-full w-full"
        style={{ display: view === "settings" ? "flex" : "none", flexDirection: "column" }}
      >
        <Settings />
      </div>
    </>
  );

  return (
    <ConfirmProvider>
      <Layout
        sidebar={<Sidebar onViewChange={setView} currentView={view} />}
        content={content}
        player={<Player />}
        rightPanel={<NowPlayingPanel />}
      />
      <ScanProgressModal />
    </ConfirmProvider>
  );
}

export default App;
