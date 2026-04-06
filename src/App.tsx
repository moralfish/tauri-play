import { useState } from "react";
import Layout from "./components/Layout";
import PlaylistSidebar from "./components/PlaylistSidebar";
import Library from "./components/Library";
import PlaylistView from "./components/PlaylistView";
import Settings from "./components/Settings";
import Player from "./components/Player";

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
      sidebar={<PlaylistSidebar onViewChange={setView} currentView={view} />}
      content={renderContent()}
      player={<Player />}
    />
  );
}

export default App;
