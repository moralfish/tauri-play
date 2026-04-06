import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export interface MenuItem {
  label: string;
  action?: () => void;
  submenu?: MenuItem[];
  separator?: boolean;
  disabled?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
  visible: boolean;
}

interface ContextMenuContextType {
  showMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
  hideMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType>({
  showMenu: () => {},
  hideMenu: () => {},
});

export function useContextMenu() {
  return useContext(ContextMenuContext);
}

function SubMenu({ items, side }: { items: MenuItem[]; side: "left" | "right" }) {
  return (
    <div
      className={`absolute top-0 ${side === "right" ? "left-full" : "right-full"} ml-0.5 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] z-[10001]`}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 border-t border-zinc-700" />
        ) : (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled && item.action) item.action();
            }}
            disabled={item.disabled}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-default text-zinc-200 flex items-center justify-between"
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

function MenuItemRow({
  item,
  onClose,
  menuRect,
}: {
  item: MenuItem;
  onClose: () => void;
  menuRect: DOMRect | null;
}) {
  const [showSub, setShowSub] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  if (item.separator) {
    return <div className="my-1 border-t border-zinc-700" />;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.disabled) return;
    if (item.submenu) return; // submenu opens on hover
    if (item.action) {
      item.action();
      onClose();
    }
  };

  // Determine submenu side based on available space
  const side =
    menuRect && menuRect.right + 180 > window.innerWidth ? "left" : "right";

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => item.submenu && setShowSub(true)}
      onMouseLeave={() => setShowSub(false)}
    >
      <button
        onClick={handleClick}
        disabled={item.disabled}
        className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-default text-zinc-200 flex items-center justify-between gap-4"
      >
        <span>{item.label}</span>
        {item.submenu && (
          <span className="text-zinc-500 text-xs">&rsaquo;</span>
        )}
      </button>
      {item.submenu && showSub && (
        <SubMenu items={item.submenu} side={side} />
      )}
    </div>
  );
}

function ContextMenuOverlay({
  state,
  onClose,
}: {
  state: ContextMenuState;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setMenuRect(rect);

      // Adjust position if menu goes off-screen
      let x = state.x;
      let y = state.y;
      if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
      if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
      if (x < 0) x = 8;
      if (y < 0) y = 8;
      setPos({ x, y });
    }
  }, [state.x, state.y]);

  if (!state.visible || state.items.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[10000]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[200px]"
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {state.items.map((item, i) => (
          <MenuItemRow
            key={i}
            item={item}
            onClose={onClose}
            menuRect={menuRect}
          />
        ))}
      </div>
    </div>
  );
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    items: [],
    visible: false,
  });

  const showMenu = useCallback(
    (e: React.MouseEvent, items: MenuItem[]) => {
      e.preventDefault();
      e.stopPropagation();
      setState({ x: e.clientX, y: e.clientY, items, visible: true });
    },
    []
  );

  const hideMenu = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  // Disable default browser context menu globally
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideMenu();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [hideMenu]);

  return (
    <ContextMenuContext.Provider value={{ showMenu, hideMenu }}>
      {children}
      <ContextMenuOverlay state={state} onClose={hideMenu} />
    </ContextMenuContext.Provider>
  );
}
