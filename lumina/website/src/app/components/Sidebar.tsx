import {
  LayoutDashboard, Settings, Plus,
  ChevronLeft, ChevronRight, CircleDot, LogOut,
  Pencil, FolderOpen,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import type { GeneratedFile } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";

type ViewMode = "studio" | "files";

interface SidebarProps {
  user: User | null;
  view: ViewMode;
  setView: (view: ViewMode) => void;
  collapsed: boolean;
  setCollapsed: (val: boolean | ((prev: boolean) => boolean)) => void;
  files: GeneratedFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onNewReport: () => void;
  onRequireAuth: () => boolean;
  onSignOut: () => void;
}

export function Sidebar({
  user, view, setView, collapsed, setCollapsed,
  files, activeFileId, onSelectFile,
  onNewReport, onRequireAuth, onSignOut,
}: SidebarProps) {
  const isLoggedOut = !user;
  const displayName = user?.email ?? "Guest";
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "?";

  return (
    <aside className={`ll-sidebar ${collapsed ? "collapsed" : ""}`}>
      <button
        className="ll-sidebar-collapse-btn"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Logo Area */}
      <div style={{ padding: "8px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: collapsed ? "center" : "flex-start" }}>
          <img src="/lumina-symbol-final.svg" alt="Lumina Icon" style={{ flexShrink: 0, width: "64px", height: "auto", objectFit: "contain" }} />
          {!collapsed && (
            <img src="/lumina-text-alt.svg" alt="Lumina" style={{ height: "36px", width: "auto", objectFit: "contain", transform: "translateY(1px)" }} />
          )}
        </div>
      </div>

      {/* Auth / User Card */}
      <div className="ll-sidebar-section" style={{ padding: collapsed ? "14px 10px" : "14px 16px" }}>
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: collapsed ? "center" : "flex-start" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--emerald)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
              {initials}
            </div>
            {!collapsed && (
              <>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#F5EEDB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4, color: "var(--tan-muted)" }}>
                    <CircleDot size={10} color="#FFB347" /> Signed in
                  </div>
                </div>
                <button onClick={onSignOut} className="ll-icon-btn" style={{ color: "var(--tan-muted)" }}>
                  <LogOut size={15} />
                </button>
              </>
            )}
          </div>
        ) : collapsed ? (
          <button className="ll-icon-btn" style={{ margin: "0 auto", color: "var(--cream)" }} onClick={() => onRequireAuth()}>
            <CircleDot size={16} />
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, color: "var(--tan-muted)" }}>You&apos;re browsing as a guest.</div>
            <button className="ll-signin-btn" onClick={() => onRequireAuth()}>Log in / Sign up</button>
          </div>
        )}
      </div>

      {/* New Report Button */}
      <div style={{ padding: collapsed ? "0 10px 14px" : "0 16px 14px" }}>
        <button
          className="ll-btn-amber"
          style={{ width: "100%" }}
          onClick={() => { if (onRequireAuth()) onNewReport(); }}
        >
          <Plus size={16} />
          {!collapsed && "New report"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="ll-sidebar-section" style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          className={`ll-navitem ${view === "studio" ? "active" : ""}`}
          onClick={() => { if (onRequireAuth()) setView("studio"); }}
        >
          <Pencil size={16} />
          <span className="ll-navitem-label">Studio</span>
        </div>
        <div
          className={`ll-navitem ${view === "files" ? "active" : ""} ${isLoggedOut ? "disabled" : ""}`}
          onClick={() => { if (onRequireAuth()) setView("files"); }}
        >
          <LayoutDashboard size={16} />
          <span className="ll-navitem-label">Files</span>
        </div>
      </nav>

      {/* Recent Files */}
      {!collapsed && (
        <div className="ll-sidebar-section" style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--tan-muted)", padding: "6px 10px", textTransform: "uppercase" }}>
            Recent Files
          </div>
          {user ? (
            files.length === 0 ? (
              <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--tan-muted)", lineHeight: 1.5 }}>
                No files yet. Generate a report to get started.
              </div>
            ) : (
              files.slice(0, 12).map((f) => {
                const name = f.conversation_title && f.conversation_title !== "WhatsApp"
                  ? f.conversation_title
                  : f.storage_path.split("/").pop()?.replace(/\.zip$/, "") ?? "Report";
                const isWhatsapp = f.conversation_title === "WhatsApp";

                return (
                  <div
                    key={f.id}
                    className={`ll-convo ${f.id === activeFileId ? "active" : ""}`}
                    onClick={() => onSelectFile(f.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <FolderOpen size={12} color={f.id === activeFileId ? "var(--amber)" : "var(--tan-muted)"} style={{ flexShrink: 0 }} />
                      <div className="ll-convo-title">{name}</div>
                      {isWhatsapp && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 999,
                          background: "rgba(4,98,65,0.2)", color: "var(--emerald)",
                          flexShrink: 0, textTransform: "uppercase", letterSpacing: ".04em",
                        }}>
                          WA
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--tan-muted)", paddingLeft: 18 }}>
                      {formatRelativeTime(f.created_at)}
                    </div>
                  </div>
                );
              })
            )
          ) : (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--tan-muted)", lineHeight: 1.5 }}>
              Log in to see your recent files.
            </div>
          )}
        </div>
      )}
      {collapsed && <div style={{ flex: 1 }} />}

      {/* Settings Footer */}
      <div className="ll-sidebar-section" style={{ padding: collapsed ? "12px 10px" : "12px 16px", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
        <div className="ll-navitem" style={{ padding: "6px 8px" }}>
          <Settings size={16} />
          <span className="ll-navitem-label">Settings</span>
        </div>
      </div>
    </aside>
  );
}