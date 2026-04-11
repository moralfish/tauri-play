import { useLibraryStore } from "../stores/libraryStore";

export default function ScanProgressModal() {
  const isScanning = useLibraryStore((s) => s.isScanning);
  const progress = useLibraryStore((s) => s.scanProgress);
  const recentFiles = useLibraryStore((s) => s.scanRecentFiles);
  const dismissed = useLibraryStore((s) => s.scanModalDismissed);
  const error = useLibraryStore((s) => s.scanError);
  const dismissModal = useLibraryStore((s) => s.dismissScanModal);
  const clearError = useLibraryStore((s) => s.clearScanError);

  // Error toast takes priority
  if (error) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.45)" }}
      >
        <div
          className="rounded-2xl p-6 w-[420px] max-w-[90vw]"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "0 20px 60px var(--shadow-panel)",
          }}
        >
          <div
            className="text-base font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Scan failed
          </div>
          <div
            className="text-sm mb-5 break-words"
            style={{ color: "var(--text-secondary)" }}
          >
            {error}
          </div>
          <div className="flex justify-end">
            <button
              onClick={clearError}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                background: "var(--accent)",
                color: "var(--accent-on-accent)",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isScanning || dismissed || !progress) return null;

  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="rounded-2xl p-6 w-[460px] max-w-[90vw]"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 60px var(--shadow-panel)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "var(--accent-soft)" }}
          >
            <svg
              className="animate-spin"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Scanning library
            </div>
            <div
              className="text-xs uppercase tracking-wide"
              style={{ color: "var(--text-secondary)" }}
            >
              {progress.stage}
            </div>
          </div>
        </div>

        <div
          className="text-sm mb-3 truncate"
          style={{ color: "var(--text-secondary)" }}
          title={progress.message}
        >
          {progress.message}
        </div>

        <div
          className="h-2 rounded-full overflow-hidden mb-2"
          style={{ background: "var(--bg-input)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: percent !== null ? `${percent}%` : "30%",
              background: "var(--accent)",
              ...(percent === null
                ? { animation: "scan-indeterminate 1.4s ease-in-out infinite" }
                : {}),
            }}
          />
        </div>

        <div
          className="flex items-center justify-between text-xs mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          <span>
            {progress.total > 0
              ? `${progress.current} / ${progress.total}`
              : "Working..."}
          </span>
          {percent !== null && <span>{percent}%</span>}
        </div>

        {/* Recent files log */}
        <div
          className="rounded-lg p-2 mb-5 h-[120px] overflow-hidden font-mono text-[11px] flex flex-col-reverse gap-0.5"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          {recentFiles.length === 0 ? (
            <div
              className="italic text-center self-center mx-auto"
              style={{ color: "var(--text-muted)" }}
            >
              Waiting for files...
            </div>
          ) : (
            recentFiles
              .slice()
              .reverse()
              .map((file, idx) => {
                const isNewest = idx === recentFiles.length - 1;
                return (
                  <div
                    key={`${file}-${idx}`}
                    className="truncate px-1 min-w-0 w-full"
                    style={{
                      color: isNewest
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                      opacity: isNewest ? 1 : 0.55,
                    }}
                    title={file}
                  >
                    {isNewest ? "› " : "  "}
                    {file}
                  </div>
                );
              })
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={dismissModal}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--bg-button-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            Run in Background
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scan-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
