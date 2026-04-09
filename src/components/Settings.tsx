import { useEffect, useState, useCallback } from "react";
import {
  getDirectories,
  removeDirectory,
  addDirectory,
  getCacheStats,
  clearCache,
  scanLibrary,
  connectGDrive,
  disconnectGDrive,
  getGDriveStatus,
  listGDriveFolders,
  addGDriveFolder,
  removeGDriveFolder,
  getGDriveFolders,
} from "../api/commands";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useContextMenu } from "./ContextMenu";
import { useLibraryStore } from "../stores/libraryStore";
import { useThemeStore } from "../stores/themeStore";
import type { CacheStats, GDriveStatus, GDriveFolder } from "../types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface BrowseFolder {
  id: string;
  name: string;
}

function AppearanceSelector() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const options: { value: "system" | "light" | "dark"; label: string; icon: React.ReactNode }[] = [
    {
      value: "system",
      label: "System",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        </svg>
      ),
    },
    {
      value: "light",
      label: "Light",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Dark",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium transition-all duration-150"
          style={{
            background: theme === opt.value ? 'var(--accent-soft)' : 'var(--bg-button-secondary)',
            border: theme === opt.value ? '1px solid var(--accent)' : '1px solid var(--border)',
            color: theme === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const [directories, setDirectories] = useState<[string, string][]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const { showMenu } = useContextMenu();
  const refresh = useLibraryStore((s) => s.refresh);

  // GDrive state
  const [gdriveStatus, setGDriveStatus] = useState<GDriveStatus | null>(null);
  const [gdriveFolders, setGDriveFolders] = useState<GDriveFolder[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Credential setup (hidden after first save)
  const [showCredentialSetup, setShowCredentialSetup] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  // Folder browser state
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [browseFolders, setBrowseFolders] = useState<BrowseFolder[]>([]);
  const [browseStack, setBrowseStack] = useState<
    { id: string; name: string }[]
  >([]);
  const [browsingLoading, setBrowsingLoading] = useState(false);

  const loadDirectories = async () => {
    try {
      const dirs = await getDirectories();
      setDirectories(dirs);
    } catch (e) {
      console.error("Failed to load directories:", e);
    }
  };

  const loadCacheStats = async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (e) {
      console.error("Failed to load cache stats:", e);
    }
  };

  const loadGDriveStatus = useCallback(async () => {
    try {
      const status = await getGDriveStatus();
      setGDriveStatus(status);
      if (status.connected) {
        const folders = await getGDriveFolders();
        setGDriveFolders(folders);
      }
    } catch (e) {
      console.error("Failed to load GDrive status:", e);
    }
  }, []);

  useEffect(() => {
    loadDirectories();
    loadCacheStats();
    loadGDriveStatus();
  }, [loadGDriveStatus]);

  // Listen for GDrive connection event from backend
  useEffect(() => {
    const unlisten = listen("gdrive-connected", () => {
      loadGDriveStatus();
      setConnecting(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadGDriveStatus]);

  const handleAddDirectory = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await addDirectory(selected as string);
      await loadDirectories();
    }
  };

  const handleRemoveDirectory = async (id: string) => {
    await removeDirectory(id);
    await loadDirectories();
  };

  const handleClearCache = async () => {
    setLoading(true);
    try {
      await clearCache();
      await loadCacheStats();
    } finally {
      setLoading(false);
    }
  };

  const handleRescan = async () => {
    setLoading(true);
    try {
      await scanLibrary();
    } finally {
      setLoading(false);
    }
  };

  // GDrive handlers
  const handleSignInGDrive = async () => {
    if (gdriveStatus?.has_credentials) {
      setConnecting(true);
      setConnectError(null);
      try {
        await connectGDrive("", "");
        await loadGDriveStatus();
      } catch (e) {
        setConnectError(String(e));
        await loadGDriveStatus();
      } finally {
        setConnecting(false);
      }
    } else {
      setShowCredentialSetup(true);
    }
  };

  const handleConnectWithCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setConnectError("Both Client ID and Client Secret are required");
      return;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      await connectGDrive(clientId.trim(), clientSecret.trim());
      await loadGDriveStatus();
      setClientId("");
      setClientSecret("");
      setShowCredentialSetup(false);
    } catch (e) {
      setConnectError(String(e));
      // Refresh status from DB — creds may have been saved before the error
      await loadGDriveStatus();
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectGDrive = async () => {
    try {
      await disconnectGDrive();
      setGDriveStatus({ connected: false, has_credentials: false });
      setGDriveFolders([]);
      setShowFolderBrowser(false);
    } catch (e) {
      console.error("Failed to disconnect:", e);
    }
  };

  const handleBrowseFolders = async (parentId?: string) => {
    setBrowsingLoading(true);
    try {
      const folders = await listGDriveFolders(parentId);
      setBrowseFolders(folders);
      setShowFolderBrowser(true);
    } catch (e) {
      console.error("Failed to list folders:", e);
    } finally {
      setBrowsingLoading(false);
    }
  };

  const handleEnterFolder = async (folder: BrowseFolder) => {
    setBrowseStack((prev) => [...prev, folder]);
    await handleBrowseFolders(folder.id);
  };

  const handleGoBack = async () => {
    const newStack = browseStack.slice(0, -1);
    setBrowseStack(newStack);
    const parentId =
      newStack.length > 0 ? newStack[newStack.length - 1].id : undefined;
    await handleBrowseFolders(parentId);
  };

  const handleAddGDriveFolder = async (folder: BrowseFolder) => {
    try {
      await addGDriveFolder(folder.id, folder.name);
      const folders = await getGDriveFolders();
      setGDriveFolders(folders);
    } catch (e) {
      console.error("Failed to add folder:", e);
    }
  };

  const handleRemoveGDriveFolder = async (folderId: string) => {
    try {
      await removeGDriveFolder(folderId);
      const folders = await getGDriveFolders();
      setGDriveFolders(folders);
    } catch (e) {
      console.error("Failed to remove folder:", e);
    }
  };

  const isFolderSelected = (folderId: string) =>
    gdriveFolders.some((f) => f.id === folderId);

  const handleContextMenu = (e: React.MouseEvent) => {
    showMenu(e, [
      { label: "Reload Library", action: () => refresh() },
    ]);
  };

  // Shared styles
  const cardStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: '18px',
  };

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div
      className="flex flex-col h-full overflow-auto"
      onContextMenu={handleContextMenu}
    >
      <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Manage sources, storage, and integrations</p>
        </div>

        {/* Appearance */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
            Appearance
          </h3>
          <div className="p-4" style={cardStyle}>
            <AppearanceSelector />
          </div>
        </section>

        {/* Local Sources */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
            Local Sources
          </h3>
          <div className="p-4 space-y-2" style={cardStyle}>
            {directories.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No directories configured
              </p>
            ) : (
              directories.map(([id, path]) => (
                <div
                  key={id}
                  className="flex items-center justify-between py-2 px-3 rounded-xl group transition-colors duration-150"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                    <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                      {path}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveDirectory(id)}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded-lg transition-all duration-150"
                    style={{ color: 'rgba(248,113,113,0.8)' }}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAddDirectory}
                className="h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150"
                style={{
                  background: 'var(--bg-button-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                Add Folder
              </button>
              <button
                onClick={handleRescan}
                disabled={loading}
                className="h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150 disabled:opacity-50"
                style={{
                  background: 'var(--bg-button-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {loading ? "Scanning..." : "Rescan All"}
              </button>
            </div>
          </div>
        </section>

        {/* Google Drive */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
            Google Drive
          </h3>
          <div className="p-4 space-y-4" style={cardStyle}>
            {gdriveStatus?.connected ? (
              <>
                {/* Connected state */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#4ade80' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Connected to Google Drive
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => {
                        handleDisconnectGDrive().then(() => {
                          setShowCredentialSetup(true);
                        });
                      }}
                      className="h-8 px-3 text-xs rounded-xl transition-colors duration-150"
                      style={{
                        background: 'var(--bg-button-secondary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Reset Credentials
                    </button>
                    <button
                      onClick={handleDisconnectGDrive}
                      className="h-8 px-3 text-xs rounded-xl transition-colors duration-150"
                      style={{
                        background: 'rgba(248,113,113,0.1)',
                        border: '1px solid rgba(248,113,113,0.2)',
                        color: 'rgba(248,113,113,0.8)',
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                {/* Selected folders */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Scan Folders
                    </span>
                    <button
                      onClick={() => {
                        setBrowseStack([]);
                        handleBrowseFolders();
                      }}
                      className="text-xs font-medium transition-colors duration-150"
                      style={{ color: 'var(--accent)' }}
                    >
                      Browse Folders
                    </button>
                  </div>

                  {gdriveFolders.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No folders selected. All audio/video files in your Drive
                      will be scanned.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {gdriveFolders.map((folder) => (
                        <div
                          key={folder.id}
                          className="flex items-center justify-between py-1.5 px-3 rounded-xl group transition-colors duration-150"
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className="w-4 h-4"
                              style={{ color: 'var(--text-muted)' }}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {folder.name}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveGDriveFolder(folder.id)}
                            className="opacity-0 group-hover:opacity-100 text-xs transition-opacity"
                            style={{ color: 'rgba(248,113,113,0.8)' }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Folder browser */}
                {showFolderBrowser && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div
                      className="flex items-center gap-2 px-3 py-2"
                      style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}
                    >
                      <button
                        onClick={handleGoBack}
                        disabled={browseStack.length === 0}
                        className="text-xs transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        &larr; Back
                      </button>
                      <span className="text-xs truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                        {browseStack.length === 0
                          ? "My Drive"
                          : browseStack.map((s) => s.name).join(" / ")}
                      </span>
                      <button
                        onClick={() => setShowFolderBrowser(false)}
                        className="text-xs transition-colors duration-150"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-60 overflow-auto">
                      {browsingLoading ? (
                        <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                          Loading folders...
                        </div>
                      ) : browseFolders.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                          No subfolders found
                        </div>
                      ) : (
                        browseFolders.map((folder) => (
                          <div
                            key={folder.id}
                            className="flex items-center gap-2 px-3 py-2 group transition-colors duration-150"
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <svg
                              className="w-4 h-4 flex-shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                            <button
                              onClick={() => handleEnterFolder(folder)}
                              className="text-sm truncate flex-1 text-left transition-colors duration-150"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {folder.name}
                            </button>
                            {isFolderSelected(folder.id) ? (
                              <span className="text-xs flex-shrink-0" style={{ color: '#4ade80' }}>
                                Added
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAddGDriveFolder(folder)}
                                className="opacity-0 group-hover:opacity-100 text-xs transition-opacity flex-shrink-0"
                                style={{ color: 'var(--accent)' }}
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleRescan}
                  disabled={loading}
                  className="h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150 disabled:opacity-50"
                  style={{
                    background: 'var(--bg-button-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {loading ? "Scanning..." : "Scan Google Drive"}
                </button>
              </>
            ) : (
              <>
                {/* Not connected -- Sign in button */}
                <div className="space-y-3">
                  <button
                    onClick={handleSignInGDrive}
                    disabled={connecting}
                    className="w-full flex items-center justify-center gap-3 h-11 px-4 rounded-xl transition-colors duration-150 disabled:opacity-50 font-medium text-sm"
                    style={{ background: '#fff', color: '#1a1a1a' }}
                  >
                    {connecting ? (
                      <>
                        <svg
                          className="w-4 h-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="opacity-25"
                          />
                          <path
                            d="M4 12a8 8 0 018-8"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                        Waiting for Google Sign-In...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                          />
                          <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                          />
                        </svg>
                        Sign in with Google
                      </>
                    )}
                  </button>

                  {connectError && (
                    <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
                      <p className="text-xs" style={{ color: 'rgba(248,113,113,0.9)' }}>{connectError}</p>
                      {gdriveStatus?.has_credentials && (
                        <button
                          onClick={async () => {
                            await handleDisconnectGDrive();
                            setConnectError(null);
                            setShowCredentialSetup(true);
                          }}
                          className="text-xs font-medium transition-colors duration-150"
                          style={{ color: 'var(--accent)' }}
                        >
                          Reset credentials &amp; enter new ones
                        </button>
                      )}
                    </div>
                  )}

                  {/* Credential setup - shown when needed or toggled */}
                  {!gdriveStatus?.has_credentials && !showCredentialSetup && (
                    <button
                      onClick={() => setShowCredentialSetup(true)}
                      className="text-xs transition-colors duration-150"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      First time? Set up OAuth credentials
                    </button>
                  )}

                  {gdriveStatus?.has_credentials && !showCredentialSetup && !connectError && (
                    <button
                      onClick={() => setShowCredentialSetup(true)}
                      className="text-xs transition-colors duration-150"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Change OAuth credentials
                    </button>
                  )}

                  {showCredentialSetup && (
                    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                      <div className="space-y-2">
                        <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Setup Instructions:</p>
                        <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: 'var(--text-muted)' }}>
                          <li>
                            Open the{" "}
                            <a
                              href="https://console.cloud.google.com/projectcreate"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent)' }}
                            >
                              Google Cloud Console
                            </a>{" "}
                            and create a new project (or select an existing one)
                          </li>
                          <li>
                            Go to{" "}
                            <a
                              href="https://console.cloud.google.com/apis/credentials"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent)' }}
                            >
                              APIs &amp; Services &rarr; Credentials
                            </a>
                          </li>
                          <li>
                            Click <strong style={{ color: 'var(--text-secondary)' }}>+ Create Credentials</strong> &rarr; <strong style={{ color: 'var(--text-secondary)' }}>OAuth client ID</strong>
                          </li>
                          <li>
                            If prompted, configure the{" "}
                            <a
                              href="https://console.cloud.google.com/apis/credentials/consent"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent)' }}
                            >
                              OAuth consent screen
                            </a>{" "}
                            first (External, add your email as test user)
                          </li>
                          <li>
                            Select <strong style={{ color: 'var(--text-secondary)' }}>Web application</strong> as the type
                          </li>
                          <li>
                            Under <strong style={{ color: 'var(--text-secondary)' }}>Authorized redirect URIs</strong>, add:{" "}
                            <code
                              className="px-1.5 py-0.5 rounded-md text-xs select-all"
                              style={{ background: 'var(--bg-button-secondary)', color: 'var(--text-secondary)' }}
                            >
                              http://127.0.0.1:1421
                            </code>
                          </li>
                          <li>
                            Enable the{" "}
                            <a
                              href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent)' }}
                            >
                              Google Drive API
                            </a>
                          </li>
                          <li>Copy the <strong style={{ color: 'var(--text-secondary)' }}>Client ID</strong> and <strong style={{ color: 'var(--text-secondary)' }}>Client Secret</strong> below</li>
                        </ol>
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                          Client ID
                        </label>
                        <input
                          type="text"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="xxxxx.apps.googleusercontent.com"
                          className="w-full h-11 rounded-xl px-3 text-sm outline-none transition-colors duration-150"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                          Client Secret
                        </label>
                        <input
                          type="password"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          placeholder="GOCSPX-..."
                          className="w-full h-11 rounded-xl px-3 text-sm outline-none transition-colors duration-150"
                          style={inputStyle}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleConnectWithCredentials}
                          disabled={connecting}
                          className="h-10 px-4 rounded-xl text-sm font-semibold transition-colors duration-150 disabled:opacity-50"
                          style={{ background: 'var(--accent)', color: 'var(--accent-on-accent)' }}
                        >
                          {connecting ? "Connecting..." : "Save & Connect"}
                        </button>
                        <button
                          onClick={() => setShowCredentialSetup(false)}
                          className="h-10 px-4 rounded-xl text-sm transition-colors duration-150"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Sync */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
            Background Sync
          </h3>
          <div className="p-4 space-y-3" style={cardStyle}>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Auto-sync enabled</span>
              <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                Every 5 minutes
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              The app periodically checks for new or changed files in your
              configured directories and Google Drive folders.
            </p>
          </div>
        </section>

        {/* Cache */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
            Cache
          </h3>
          <div className="p-4 space-y-3" style={cardStyle}>
            {cacheStats ? (
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatBytes(cacheStats.total_bytes)}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total size</div>
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {cacheStats.item_count}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Cached files</div>
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>2 GB</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Max size</div>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading cache info...</p>
            )}
            <button
              onClick={handleClearCache}
              disabled={loading}
              className="h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150 disabled:opacity-50"
              style={{
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.2)',
                color: 'rgba(248,113,113,0.8)',
              }}
            >
              {loading ? "Clearing..." : "Clear Cache"}
            </button>
          </div>
        </section>

        {/* About */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
            About
          </h3>
          <div className="p-4" style={cardStyle}>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tauri Play</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Built with Tauri 2 + React + Rust
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Version 0.1.0</div>
          </div>
        </section>
      </div>
    </div>
  );
}
