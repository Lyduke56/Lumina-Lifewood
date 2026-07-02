import {
  MessageSquare, LayoutDashboard, Settings, Plus,
  ChevronLeft, ChevronRight, CircleDot, LogOut
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import type { Conversation } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";

type ViewMode = "chats" | "dashboard";

interface SidebarProps {
  user: User | null;
  view: ViewMode;
  setView: (view: ViewMode) => void;
  collapsed: boolean;
  setCollapsed: (val: boolean | ((prev: boolean) => boolean)) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRequireAuth: () => boolean;
  onSignOut: () => void;
}

export function Sidebar({
  user, view, setView, collapsed, setCollapsed,
  conversations, activeConversationId, onSelectConversation,
  onNewChat, onRequireAuth, onSignOut
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
            <div style={{ fontSize: 12.5, color: "var(--tan-muted)" }}>You're browsing as a guest.</div>
            <button className="ll-signin-btn" onClick={() => onRequireAuth()}>Log in / Sign up</button>
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <div style={{ padding: collapsed ? "0 10px 14px" : "0 16px 14px" }}>
        <button
          className="ll-btn-amber"
          style={{ width: "100%" }}
          onClick={() => { if (onRequireAuth()) onNewChat(); }}
        >
          <Plus size={16} />
          {!collapsed && "New chat"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="ll-sidebar-section" style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        <div className={`ll-navitem ${view === "chats" ? "active" : ""}`} onClick={() => { if (onRequireAuth()) setView("chats"); }}>
          <MessageSquare size={16} />
          <span className="ll-navitem-label">Chats</span>
        </div>
        <div className={`ll-navitem ${view === "dashboard" ? "active" : ""} ${isLoggedOut ? "disabled" : ""}`} onClick={() => { if (onRequireAuth()) setView("dashboard"); }}>
          <LayoutDashboard size={16} />
          <span className="ll-navitem-label">Dashboard</span>
        </div>
      </nav>

      {/* History — real conversations, no channel distinction (WhatsApp deferred, no such column yet) */}
      {!collapsed && (
        <div className="ll-sidebar-section" style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--tan-muted)", padding: "6px 10px", textTransform: "uppercase" }}>Recent</div>
          {user ? (
            conversations.length === 0 ? (
              <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--tan-muted)", lineHeight: 1.5 }}>
                No conversations yet. Start one with "New chat."
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`ll-convo ${c.id === activeConversationId ? "active" : ""}`}
                  onClick={() => onSelectConversation(c.id)}
                >
                  <div className="ll-convo-title">{c.title ?? "New conversation"}</div>
                  <div style={{ fontSize: 11, color: "var(--tan-muted)" }}>
                    {formatRelativeTime(c.created_at)}
                  </div>
                </div>
              ))
            )
          ) : (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--tan-muted)", lineHeight: 1.5 }}>Log in to see your conversation history.</div>
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