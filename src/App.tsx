import { useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import Library from "./components/Library";
import PlaylistView from "./components/PlaylistView";
import Settings from "./components/Settings";
import Player from "./components/Player";
import NowPlayingPanel from "./components/NowPlayingPanel";

type View = "library" | "playlist" | "settings";

function App() {
  const [view, setView] = useState<View>("library");

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
