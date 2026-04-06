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
    // If credentials already stored, just sign in
    if (gdriveStatus?.has_credentials) {
      setConnecting(true);
      setConnectError(null);
      try {
        // Re-use existing credentials — backend will use stored ones
        // We call connect with empty strings to signal "use stored"
        await connectGDrive("", "");
        await loadGDriveStatus();
      } catch (e) {
        setConnectError(String(e));
      } finally {
        setConnecting(false);
      }
    } else {
      // Need credentials first
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

  return (
    <div
      className="flex flex-col h-full overflow-auto"
      onContextMenu={handleContextMenu}
    >
      <div className="p-6 max-w-2xl mx-auto w-full space-y-8">
        <h2 className="text-xl font-semibold">Settings</h2>

        {/* Local Sources */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Local Sources
          </h3>
          <div className="bg-zinc-900 rounded-lg p-4 space-y-2">
            {directories.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No directories configured
              </p>
            ) : (
              directories.map(([id, path]) => (
                <div
                  key={id}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-zinc-800 group"
                >
                  <span className="text-sm truncate flex-1 text-zinc-300">
                    {path}
                  </span>
                  <button
                    onClick={() => handleRemoveDirectory(id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-zinc-500 hover:text-red-400 transition-opacity ml-2"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAddDirectory}
                className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
              >
                Add Folder
              </button>
              <button
                onClick={handleRescan}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
              >
                {loading ? "Scanning..." : "Rescan All"}
              </button>
            </div>
          </div>
        </section>

        {/* Google Drive */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Google Drive
          </h3>
          <div className="bg-zinc-900 rounded-lg p-4 space-y-4">
            {gdriveStatus?.connected ? (
              <>
                {/* Connected state */}
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-zinc-300">
                    Connected to Google Drive
                  </span>
                  <button
                    onClick={handleDisconnectGDrive}
                    className="ml-auto px-3 py-1 text-xs text-red-400 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Selected folders */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">
                      Scan Folders
                    </span>
                    <button
                      onClick={() => {
                        setBrowseStack([]);
                        handleBrowseFolders();
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Browse Folders
                    </button>
                  </div>

                  {gdriveFolders.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No folders selected. All audio/video files in your Drive
                      will be scanned.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {gdriveFolders.map((folder) => (
                        <div
                          key={folder.id}
                          className="flex items-center justify-between py-1 px-2 rounded hover:bg-zinc-800 group"
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className="w-4 h-4 text-zinc-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                            <span className="text-sm text-zinc-300">
                              {folder.name}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveGDriveFolder(folder.id)}
                            className="opacity-0 group-hover:opacity-100 text-xs text-zinc-500 hover:text-red-400 transition-opacity"
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
                  <div className="border border-zinc-700 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-b border-zinc-700">
                      <button
                        onClick={handleGoBack}
                        disabled={browseStack.length === 0}
                        className="text-xs text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        &larr; Back
                      </button>
                      <span className="text-xs text-zinc-500 truncate flex-1">
                        {browseStack.length === 0
                          ? "My Drive"
                          : browseStack.map((s) => s.name).join(" / ")}
                      </span>
                      <button
                        onClick={() => setShowFolderBrowser(false)}
                        className="text-xs text-zinc-500 hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-60 overflow-auto">
                      {browsingLoading ? (
                        <div className="px-3 py-4 text-center text-xs text-zinc-500">
                          Loading folders...
                        </div>
                      ) : browseFolders.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-zinc-500">
                          No subfolders found
                        </div>
                      ) : (
                        browseFolders.map((folder) => (
                          <div
                            key={folder.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 group"
                          >
                            <svg
                              className="w-4 h-4 text-zinc-500 flex-shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                            <button
                              onClick={() => handleEnterFolder(folder)}
                              className="text-sm text-zinc-300 hover:text-white truncate flex-1 text-left"
                            >
                              {folder.name}
                            </button>
                            {isFolderSelected(folder.id) ? (
                              <span className="text-xs text-green-400 flex-shrink-0">
                                Added
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAddGDriveFolder(folder)}
                                className="opacity-0 group-hover:opacity-100 text-xs text-blue-400 hover:text-blue-300 transition-opacity flex-shrink-0"
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
                  className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
                >
                  {loading ? "Scanning..." : "Scan Google Drive"}
                </button>
              </>
            ) : (
              <>
                {/* Not connected — Sign in button */}
                <div className="space-y-3">
                  <button
                    onClick={handleSignInGDrive}
                    disabled={connecting}
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-zinc-100 text-zinc-900 rounded-lg transition-colors disabled:opacity-50 font-medium text-sm"
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
                    <p className="text-xs text-red-400">{connectError}</p>
                  )}

                  {/* Credential setup - shown when needed or toggled */}
                  {!gdriveStatus?.has_credentials && !showCredentialSetup && (
                    <button
                      onClick={() => setShowCredentialSetup(true)}
                      className="text-xs text-zinc-500 hover:text-zinc-400"
                    >
                      First time? Set up OAuth credentials
                    </button>
                  )}

                  {showCredentialSetup && (
                    <div className="border border-zinc-700 rounded-lg p-3 space-y-3">
                      <p className="text-xs text-zinc-400">
                        Create a Google Cloud project with OAuth 2.0 credentials
                        (Desktop type). Add{" "}
                        <code className="text-zinc-300 bg-zinc-800 px-1 rounded">
                          http://127.0.0.1:1421
                        </code>{" "}
                        as an authorized redirect URI.
                      </p>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">
                          Client ID
                        </label>
                        <input
                          type="text"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="xxxxx.apps.googleusercontent.com"
                          className="w-full bg-zinc-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-600 text-zinc-300 placeholder-zinc-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">
                          Client Secret
                        </label>
                        <input
                          type="password"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          placeholder="GOCSPX-..."
                          className="w-full bg-zinc-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-600 text-zinc-300 placeholder-zinc-600"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleConnectWithCredentials}
                          disabled={connecting}
                          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
                        >
                          {connecting ? "Connecting..." : "Save & Connect"}
                        </button>
                        <button
                          onClick={() => setShowCredentialSetup(false)}
                          className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300"
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
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Background Sync
          </h3>
          <div className="bg-zinc-900 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Auto-sync enabled</span>
              <div className="text-xs text-zinc-500">Every 5 minutes</div>
            </div>
            <p className="text-xs text-zinc-500">
              The app periodically checks for new or changed files in your
              configured directories and Google Drive folders.
            </p>
          </div>
        </section>

        {/* Cache */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Cache
          </h3>
          <div className="bg-zinc-900 rounded-lg p-4 space-y-3">
            {cacheStats ? (
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-sm text-zinc-300">
                    {formatBytes(cacheStats.total_bytes)}
                  </div>
                  <div className="text-xs text-zinc-500">Total size</div>
                </div>
                <div>
                  <div className="text-sm text-zinc-300">
                    {cacheStats.item_count}
                  </div>
                  <div className="text-xs text-zinc-500">Cached files</div>
                </div>
                <div>
                  <div className="text-sm text-zinc-300">2 GB</div>
                  <div className="text-xs text-zinc-500">Max size</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Loading cache info...</p>
            )}
            <button
              onClick={handleClearCache}
              disabled={loading}
              className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50 text-red-400"
            >
              {loading ? "Clearing..." : "Clear Cache"}
            </button>
          </div>
        </section>

        {/* About */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            About
          </h3>
          <div className="bg-zinc-900 rounded-lg p-4">
            <div className="text-sm text-zinc-300">Tauri Play</div>
            <div className="text-xs text-zinc-500 mt-1">
              Built with Tauri 2 + React + Rust
            </div>
            <div className="text-xs text-zinc-500">Version 0.1.0</div>
          </div>
        </section>
      </div>
    </div>
  );
}
