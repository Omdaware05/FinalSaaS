import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";

// ---------------------------------------------------------------------------
// Toasts (minimal, no library)
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(
  () => undefined
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  return {
    success: (text: string) => push("success", text),
    error: (text: string) => push("error", text),
  };
}

// ---------------------------------------------------------------------------
// Layout: sidebar + topbar
// ---------------------------------------------------------------------------

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/agents", label: "Agents", end: false },
  { to: "/contacts", label: "Contacts", end: false },
  { to: "/calls", label: "Calls", end: false },
  { to: "/campaigns", label: "Campaigns", end: false },
  { to: "/leads", label: "Leads", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">FinalSaaS</div>
        <div className="brand-sub">AI Voice Calling</div>
        <nav>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <span className="topbar-user">{user?.email ?? ""}</span>
          <button className="btn btn-ghost" onClick={logout}>
            Logout
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Badge({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  let cls = "badge badge-neutral";
  if (["active", "granted", "completed", "ready", "interested", "qualified"].includes(v))
    cls = "badge badge-green";
  else if (["do_not_call", "denied", "failed", "not_interested"].includes(v))
    cls = "badge badge-red";
  else if (
    ["queued", "initiating", "ringing", "in_progress", "pending", "synthesized", "busy", "callback_requested"].includes(v)
  )
    cls = "badge badge-amber";
  return <span className={cls}>{value || "—"}</span>;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const ACTIVE_CALL_STATUSES = ["queued", "initiating", "ringing", "in_progress"];
