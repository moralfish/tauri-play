import { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import Library from "./components/Library";
import PlaylistView from "./components/PlaylistView";
import Settings from "./components/Settings";
import Player from "./components/Player";
import NowPlayingPanel from "./components/NowPlayingPanel";
import { useThemeStore } from "./stores/themeStore";
import { usePlaybackStore } from "./stores/playbackStore";

type View = "library" | "playlist" | "settings";

function App() {
  const [view, setView] = useState<View>("library");

  useEffect(() => {
    useThemeStore.getState().init();
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

  const renderContent = () => {
    switch (view) {
      case "library":
        return <Library />;
      case "playlist":
        return <PlaylistView />;
      case "settings":
        return <Settings />;
    }
  };

  return (
    <Layout
      sidebar={<Sidebar onViewChange={setView} currentView={view} />}
      content={renderContent()}
      player={<Player />}
      rightPanel={<NowPlayingPanel />}
    />
  );
}

export default App;
