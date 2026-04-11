import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ------------------------------------------------------------------
// A tiny promise-based confirm dialog. Any component can call
//   const confirm = useConfirm();
//   if (await confirm({ title, message, destructive: true })) { ... }
// The caller awaits a boolean — no callback juggling, no modal state.
// ------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Protect against double-resolve if the user spams Enter.
  const resolvedRef = useRef(false);

  const confirm = useCallback<Confirm>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolvedRef.current = false;
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (!pending || resolvedRef.current) return;
    resolvedRef.current = true;
    pending.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => handleClose(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleClose(false);
            if (e.key === "Enter") handleClose(true);
          }}
          tabIndex={-1}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-base font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {pending.title}
            </h3>
            <div
              className="text-sm mb-5"
              style={{ color: "var(--text-secondary)" }}
            >
              {pending.message}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleClose(false)}
                className="h-9 px-4 rounded-xl text-sm font-medium transition-colors duration-150"
                style={{
                  background: "var(--bg-button-secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                autoFocus
                onClick={() => handleClose(true)}
                className="h-9 px-4 rounded-xl text-sm font-semibold transition-colors duration-150"
                style={
                  pending.destructive
                    ? {
                        background: "#DC2626",
                        color: "#fff",
                        border: "1px solid #B91C1C",
                      }
                    : {
                        background: "var(--accent)",
                        color: "var(--accent-on-accent)",
                        border: "1px solid var(--accent)",
                      }
                }
              >
                {pending.confirmLabel ??
                  (pending.destructive ? "Delete" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
