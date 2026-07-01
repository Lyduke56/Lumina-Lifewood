"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "./AuthModal";
import SignOutModal from "./SignOutModal";

import {
  MessageSquare,
  LayoutDashboard,
  Settings,
  Plus,
  Paperclip,
  Send,
  FileSpreadsheet,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Globe,
  Sparkles,
  CircleDot,
  LogOut,
  FolderOpen,
  Clock,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const revenueData = [
  { region: "APAC", revenue: 482, growth: 34 },
  { region: "EMEA", revenue: 356, growth: 12 },
  { region: "NA", revenue: 610, growth: 8 },
  { region: "LATAM", revenue: 198, growth: 21 },
];

const history = [
  { id: 1, title: "Q3 regional revenue breakdown", time: "10:42 AM", channel: "web", active: true },
  { id: 2, title: "\u201cshow me last month too\u201d", time: "9:15 AM", channel: "whatsapp", active: false },
  { id: 3, title: "Inventory turnover — warehouse B", time: "Yesterday", channel: "web", active: false },
  { id: 4, title: "Marketing spend vs. conversions", time: "Yesterday", channel: "whatsapp", active: false },
  { id: 5, title: "Headcount by department.xlsx", time: "Mon", channel: "web", active: false },
];

// Mock data for the Dashboard's two master lists.
// Swap for real Supabase queries once conversations/generated_files are wired up.
const allConversations = [
  { id: 1, title: "Q3 regional revenue breakdown", messages: 14, channel: "web", updated: "10:42 AM today" },
  { id: 2, title: "Inventory turnover — warehouse B", messages: 6, channel: "web", updated: "Yesterday" },
  { id: 3, title: "Marketing spend vs. conversions", messages: 9, channel: "whatsapp", updated: "Yesterday" },
  { id: 4, title: "Headcount by department.xlsx", messages: 3, channel: "web", updated: "Monday" },
  { id: 5, title: "APAC shipping delays Q2", messages: 21, channel: "whatsapp", updated: "Last week" },
  { id: 6, title: "Warehouse capacity planning", messages: 11, channel: "web", updated: "Last week" },
];

const allFiles = [
  { id: 1, name: "Regional Revenue.pbip", conversation: "Q3 regional revenue breakdown", created: "10:44 AM today", status: "ready" },
  { id: 2, name: "Warehouse B Turnover.pbip", conversation: "Inventory turnover — warehouse B", created: "Yesterday", status: "ready" },
  { id: 3, name: "Conversion Funnel.pbip", conversation: "Marketing spend vs. conversions", created: "Yesterday", status: "ready" },
  { id: 4, name: "Headcount Overview.pbip", conversation: "Headcount by department.xlsx", created: "Monday", status: "ready" },
  { id: 5, name: "Shipping Delay Analysis.pbip", conversation: "APAC shipping delays Q2", created: "Last week", status: "failed" },
];

type ViewMode = "chats" | "dashboard";

export default function App() {
  const [activeTab, setActiveTab] = useState("viz");
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<ViewMode>("chats");

  function requireAuth() {
    if (!user) {
      setAuthOpen(true);
      return false;
    }
    return true;
  }

  function handleSend() {
    if (!requireAuth()) return;
  }

  function handleUploadClick() {
    if (!requireAuth()) return;
  }

  function handleComposerFocus() {
    requireAuth();
  }

  function goToView(next: ViewMode) {
    if (!requireAuth()) return;
    setView(next);
  }

  const isLoggedOut = !user;
  const displayName = user?.email ?? "Guest";
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "?";

  return (
    <div className="ll-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        .ll-root {
          --cream: #F5EEDB;
          --white: #FFFFFF;
          --offwhite: #F9F7F7;
          --forest: #133020;
          --forest-soft: #1B4030;
          --emerald: #046241;
          --emerald-dark: #034D34;
          --emerald-tint: #E7F0EA;
          --amber: #FFB347;
          --amber-light: #FFC370;
          --amber-safe: #A65A12;
          --tan-muted: #C9C2AC;
          --line: rgba(19,48,32,0.10);

          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
          background: var(--cream);
          color: var(--forest);
          height: 100vh;
          width: 100%;
          display: flex;
          overflow: hidden;
        }
        .ll-root *:focus-visible {
          outline: 2px solid var(--emerald);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .ll-root * { animation: none !important; transition: none !important; }
        }
        .ll-brand-font { font-family: 'Fraunces', serif; }
        .ll-mono { font-family: 'JetBrains Mono', monospace; }

        /* ---- Sidebar ---- */
        .ll-sidebar {
          width: 272px;
          flex-shrink: 0;
          background: var(--forest);
          color: var(--cream);
          display: flex;
          flex-direction: column;
          height: 100%;
          transition: width 0.18s ease;
          position: relative;
        }
        .ll-sidebar.collapsed { width: 72px; }

        .ll-sidebar-collapse-btn {
          position: absolute; top: 18px; right: -12px; z-index: 5;
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--emerald); color: var(--white);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: 2px solid var(--forest);
        }
        .ll-sidebar-collapse-btn:hover { background: var(--emerald-dark); }

        .ll-sidebar-muted { color: var(--tan-muted); }
        .ll-sidebar-section { border-top: 1px solid rgba(245,238,219,0.10); }

        .ll-navitem {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 8px;
          font-size: 13.5px; font-weight: 500;
          color: var(--tan-muted);
          cursor: pointer;
          white-space: nowrap;
        }
        .ll-navitem:hover { background: rgba(245,238,219,0.06); color: var(--cream); }
        .ll-navitem.active { background: rgba(245,238,219,0.10); color: var(--cream); }
        .ll-navitem.disabled { opacity: 0.45; cursor: not-allowed; }
        .ll-sidebar.collapsed .ll-navitem { justify-content: center; padding: 10px; }
        .ll-sidebar.collapsed .ll-navitem-label { display: none; }

        .ll-convo {
          display: flex; flex-direction: column; gap: 3px;
          padding: 8px 10px; border-radius: 8px; cursor: pointer;
        }
        .ll-convo:hover { background: rgba(245,238,219,0.06); }
        .ll-convo.active { background: rgba(255,179,71,0.12); }
        .ll-convo-title {
          font-size: 13px; color: var(--cream); font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .ll-btn-amber {
          background: var(--amber); color: var(--forest);
          font-weight: 600; font-size: 13.5px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 9px 12px; border-radius: 10px; cursor: pointer; border: none;
          white-space: nowrap;
        }
        .ll-btn-amber:hover { background: var(--amber-light); }

        .ll-signin-btn {
          background: transparent; color: var(--cream);
          font-weight: 600; font-size: 12.5px; border: 1px solid rgba(245,238,219,0.3);
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 7px 10px; border-radius: 8px; cursor: pointer; width: 100%;
        }
        .ll-signin-btn:hover { background: rgba(245,238,219,0.08); }

        /* ---- Center chat column ---- */
        .ll-chat { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--offwhite); position: relative; }
        .ll-chat-header {
          height: 56px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px; border-bottom: 1px solid var(--line); background: var(--white);
        }
        .ll-badge-sync {
          display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500;
          color: var(--emerald); background: var(--emerald-tint);
          padding: 4px 10px; border-radius: 999px;
        }
        .ll-msg-user {
          align-self: flex-end; max-width: 70%; background: var(--emerald); color: var(--white);
          padding: 10px 14px; border-radius: 14px 14px 4px 14px; font-size: 14px; line-height: 1.5;
        }
        .ll-msg-assistant {
          align-self: flex-start; max-width: 78%; background: var(--white); border: 1px solid var(--line);
          color: var(--forest); padding: 12px 16px; border-radius: 4px 14px 14px 14px; font-size: 14px; line-height: 1.6;
        }
        .ll-chan-tag {
          display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500;
          color: var(--amber-safe); margin-bottom: 4px;
        }
        .ll-gen-card {
          border: 1px dashed rgba(4,98,65,0.35); background: var(--emerald-tint);
          border-radius: 10px; padding: 10px 12px; margin-top: 10px;
          display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--emerald-dark); font-weight: 500;
        }
        .ll-pulse-bars { display: flex; align-items: flex-end; gap: 3px; height: 16px; }
        .ll-pulse-bars span {
          width: 3px; background: var(--emerald); border-radius: 2px;
          animation: llbar 1s ease-in-out infinite;
        }
        .ll-pulse-bars span:nth-child(1) { height: 6px; animation-delay: 0s; }
        .ll-pulse-bars span:nth-child(2) { height: 14px; animation-delay: 0.15s; }
        .ll-pulse-bars span:nth-child(3) { height: 9px; animation-delay: 0.3s; }
        .ll-pulse-bars span:nth-child(4) { height: 16px; animation-delay: 0.45s; }
        @keyframes llbar { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1); } }

        .ll-empty-state {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px; padding: 40px; text-align: center;
        }
        .ll-empty-state h3 { margin: 0; font-size: 16px; color: var(--forest); }
        .ll-empty-state p { margin: 0; font-size: 13px; color: rgba(19,48,32,0.55); max-width: 320px; line-height: 1.5; }

        .ll-composer {
          border-top: 1px solid var(--line); background: var(--white); padding: 12px 20px 16px;
        }
        .ll-composer-box {
          display: flex; align-items: center; gap: 8px;
          border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; background: var(--offwhite);
        }
        .ll-icon-btn {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 8px; color: var(--forest);
          cursor: pointer; flex-shrink: 0;
        }
        .ll-icon-btn:hover { background: var(--line); }
        .ll-send-btn {
          width: 32px; height: 32px; border-radius: 8px; background: var(--emerald); color: var(--white);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer; border: none;
        }
        .ll-send-btn:hover { background: var(--emerald-dark); }

        table.ll-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        table.ll-table th {
          text-align: left; font-weight: 600; color: rgba(19,48,32,0.6); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.03em; padding: 8px 10px; border-bottom: 1px solid var(--line);
          position: sticky; top: 0; background: var(--white);
        }
        table.ll-table td { padding: 9px 10px; border-bottom: 1px solid var(--line); }
        table.ll-table tr:hover td { background: var(--offwhite); }

        /* ---- Right preview panel (Chats view) ---- */
        .ll-tab {
          font-size: 13px; font-weight: 500;
          padding: 8px 4px; margin-right: 16px; cursor: pointer;
          display: flex; align-items: center; gap: 6px;
        }
        .ll-export-btn:hover { border-color: var(--emerald); }

        .ll-status-badge {
          display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;
          padding: 2px 8px; border-radius: 999px;
        }
        .ll-status-badge.ready { background: var(--emerald-tint); color: var(--emerald-dark); }
        .ll-status-badge.failed { background: #FBEAE9; color: #B3261E; }

        /* ---- Dashboard split view ---- */
        .ll-dashboard { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--offwhite); height: 100%; }
        .ll-dashboard-header {
          height: 56px; flex-shrink: 0; display: flex; align-items: center;
          padding: 0 24px; border-bottom: 1px solid var(--line); background: var(--white);
        }
        .ll-dashboard-half { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .ll-dashboard-divider { height: 1px; background: var(--line); flex-shrink: 0; }
        .ll-dashboard-panel-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 24px 10px; flex-shrink: 0;
        }
        .ll-dashboard-panel-title {
          display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--forest);
        }
        .ll-dashboard-count {
          font-size: 11px; font-weight: 600; color: rgba(19,48,32,0.5); background: var(--line);
          padding: 1px 8px; border-radius: 999px;
        }
        .ll-dashboard-scroll { flex: 1; overflow-y: auto; padding: 0 24px 16px; }

        .ll-scrollbar::-webkit-scrollbar { width: 6px; }
        .ll-scrollbar::-webkit-scrollbar-thumb { background: rgba(19,48,32,0.15); border-radius: 4px; }
      `}</style>

      {/* ============ LEFT: dashboard / auth / history ============ */}
      <aside className={`ll-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <button
          className="ll-sidebar-collapse-btn"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div style={{ padding: "18px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <rect width="24" height="24" rx="6" fill="#FFB347" />
              <path d="M5 15L10 9L14 13L19 7" stroke="#133020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!sidebarCollapsed && (
              <span className="ll-brand-font" style={{ fontSize: 18, fontWeight: 600, color: "#F5EEDB" }}>
                lumina
              </span>
            )}
          </div>
        </div>

        {/* auth / user card */}
        <div className="ll-sidebar-section" style={{ padding: sidebarCollapsed ? "14px 10px" : "14px 16px" }}>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
              <div
                style={{
                  width: 34, height: 34, borderRadius: "50%", background: "var(--emerald)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 600, color: "#fff", flexShrink: 0,
                }}
              >
                {initials}
              </div>
              {!sidebarCollapsed && (
                <>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#F5EEDB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName}
                    </div>
                    <div style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4, color: "var(--tan-muted)" }}>
                      <CircleDot size={10} color="#FFB347" />
                      Signed in
                    </div>
                  </div>
                  <button
                    onClick={() => setSignOutOpen(true)}
                    className="ll-icon-btn"
                    style={{ color: "var(--tan-muted)" }}
                    aria-label="Sign out"
                    title="Sign out"
                  >
                    <LogOut size={15} />
                  </button>
                </>
              )}
            </div>
          ) : sidebarCollapsed ? (
            <button
              className="ll-icon-btn"
              style={{ margin: "0 auto", color: "var(--cream)" }}
              onClick={() => setAuthOpen(true)}
              aria-label="Log in"
              title="Log in"
            >
              <CircleDot size={16} />
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: "var(--tan-muted)" }}>
                You're browsing as a guest.
              </div>
              <button className="ll-signin-btn" onClick={() => setAuthOpen(true)}>
                Log in / Sign up
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: sidebarCollapsed ? "0 10px 14px" : "0 16px 14px" }}>
          <button
            className="ll-btn-amber"
            style={{ width: "100%" }}
            onClick={() => requireAuth()}
            title="New chat"
          >
            <Plus size={16} />
            {!sidebarCollapsed && "New chat"}
          </button>
        </div>

        <nav className="ll-sidebar-section" style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            className={`ll-navitem ${view === "chats" ? "active" : ""}`}
            onClick={() => goToView("chats")}
            title="Chats"
          >
            <MessageSquare size={16} />
            <span className="ll-navitem-label">Chats</span>
          </div>
          <div
            className={`ll-navitem ${view === "dashboard" ? "active" : ""} ${isLoggedOut ? "disabled" : ""}`}
            onClick={() => goToView("dashboard")}
            title="Dashboard"
          >
            <LayoutDashboard size={16} />
            <span className="ll-navitem-label">Dashboard</span>
          </div>
        </nav>

        {/* conversation history — hidden while collapsed, no room to stay legible */}
        {!sidebarCollapsed && (
          <div className="ll-sidebar-section" style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--tan-muted)", padding: "6px 10px", textTransform: "uppercase" }}>
              Recent
            </div>
            {user ? (
              history.map((h) => (
                <div key={h.id} className={`ll-convo ${h.active ? "active" : ""}`}>
                  <div className="ll-convo-title">{h.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--tan-muted)" }}>
                    {h.channel === "whatsapp" ? <Smartphone size={11} color="#FFC370" /> : <Globe size={11} />}
                    {h.time}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--tan-muted)", lineHeight: 1.5 }}>
                Log in to see your conversation history.
              </div>
            )}
          </div>
        )}
        {sidebarCollapsed && <div style={{ flex: 1 }} />}

        <div
          className="ll-sidebar-section"
          style={{
            padding: sidebarCollapsed ? "12px 10px" : "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: sidebarCollapsed ? "center" : "space-between",
          }}
        >
          <div className="ll-navitem" style={{ padding: "6px 8px" }} title="Settings">
            <Settings size={16} />
            <span className="ll-navitem-label">Settings</span>
          </div>
          {user && !sidebarCollapsed && (
            <span className="ll-sidebar-muted" style={{ fontSize: 11 }}>
              412 msgs synced
            </span>
          )}
        </div>
      </aside>

      {/* ============ MAIN: chats view ============ */}
      {view === "chats" && (
        <>
          <main className="ll-chat">
            <div className="ll-chat-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FileSpreadsheet size={16} color="var(--emerald)" />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {user ? "Q3 regional revenue breakdown" : "New conversation"}
                </span>
              </div>
              {user && (
                <div className="ll-badge-sync">
                  <CircleDot size={9} /> Synced across web & WhatsApp
                </div>
              )}
            </div>

            {user ? (
              <div className="ll-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div className="ll-msg-user">Q3_Sales_Report.xlsx — can you break this down by region?</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div className="ll-msg-assistant">
                    Parsed 1,842 rows across 4 sheets. Building your regional revenue visualization now.
                    <div className="ll-gen-card">
                      <div className="ll-pulse-bars">
                        <span></span><span></span><span></span><span></span>
                      </div>
                      Assigning charts to layout zones → compiling preview
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div className="ll-msg-assistant">
                    Here's what stands out: <strong>APAC revenue grew 34% QoQ</strong>, outpacing every other
                    region, while NA still leads in absolute revenue. I've assigned this to a KPI zone and a
                    trend zone — want me to compile the Power BI project now, or break APAC down by product
                    line first?
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span className="ll-chan-tag">
                    <Smartphone size={11} /> sent from WhatsApp
                  </span>
                  <div className="ll-msg-user">show me last month too</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div className="ll-msg-assistant">
                    Added August alongside September — the preview panel now shows both months side by side.
                  </div>
                </div>
              </div>
            ) : (
              <div className="ll-empty-state">
                <Sparkles size={28} color="var(--emerald)" />
                <h3 className="ll-brand-font">Upload a plan to get started</h3>
                <p>
                  Log in and drop in an Excel production plan — Lumina will parse it,
                  reason about the right charts, and generate a Power BI project you
                  can preview and download.
                </p>
              </div>
            )}

            <div className="ll-composer">
              <div className="ll-composer-box">
                <div className="ll-icon-btn" onClick={handleUploadClick}>
                  <Paperclip size={16} />
                </div>
                <input
                  type="text"
                  placeholder={user ? "Ask about your data, or drop in an Excel file…" : "Log in to start chatting…"}
                  onFocus={handleComposerFocus}
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--forest)" }}
                />
                <button className="ll-send-btn" onClick={handleSend}>
                  <Send size={15} />
                </button>
              </div>
            </div>
          </main>

          {/* right preview panel — only shown in Chats view */}
          <aside className="ll-preview" style={{ width: 420, flexShrink: 0, background: "var(--white)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: "14px 18px 0", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user ? "Regional Revenue.pbip" : "No file yet"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.55)" }}>
                    {user ? "Updated just now" : "Upload a plan to see a preview"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 4, marginTop: 12, borderBottom: "1px solid var(--line)" }}>
                <div
                  className="ll-tab"
                  style={activeTab === "viz" ? { color: "var(--forest)", borderBottom: "2px solid var(--emerald)" } : { color: "rgba(19,48,32,0.55)", borderBottom: "2px solid transparent" }}
                  onClick={() => setActiveTab("viz")}
                >
                  Visualization
                </div>
                <div
                  className="ll-tab"
                  style={activeTab === "export" ? { color: "var(--forest)", borderBottom: "2px solid var(--emerald)" } : { color: "rgba(19,48,32,0.55)", borderBottom: "2px solid transparent" }}
                  onClick={() => setActiveTab("export")}
                >
                  Export
                </div>
              </div>
            </div>

            <div className="ll-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
              {!user ? (
                <div className="ll-empty-state" style={{ padding: "24px 8px" }}>
                  <p>Nothing to preview yet. Log in and upload a plan to see charts here.</p>
                </div>
              ) : activeTab === "viz" ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>Revenue & QoQ growth by region</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, color: "var(--amber-safe)", fontWeight: 500 }}>
                      Combo chart <ChevronDown size={12} />
                    </span>
                  </div>
                  <div style={{ background: "var(--offwhite)", borderRadius: 12, padding: "12px 8px 4px", border: "1px solid var(--line)" }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={revenueData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.08)" vertical={false} />
                        <XAxis dataKey="region" tick={{ fontSize: 11, fill: "#133020" }} axisLine={{ stroke: "rgba(19,48,32,0.15)" }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#133020" }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(19,48,32,0.12)" }}
                          labelStyle={{ fontWeight: 600, color: "#133020" }}
                        />
                        <Bar dataKey="revenue" fill="#046241" radius={[4, 4, 0, 0]} barSize={28} />
                        <Line type="monotone" dataKey="growth" stroke="#A65A12" strokeWidth={2} dot={{ r: 3, fill: "#A65A12" }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Download or open</div>
                  <button className="ll-export-btn" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--offwhite)", fontSize: 13, fontWeight: 500, color: "var(--forest)", cursor: "pointer", marginBottom: 8 }}>
                    Download Power BI project (.pbip) <Download size={14} />
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ============ MAIN: dashboard view — split masterlists, no preview panel ============ */}
      {view === "dashboard" && (
        <div className="ll-dashboard">
          <div className="ll-dashboard-header">
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Dashboard</span>
          </div>

          {!user ? (
            <div className="ll-empty-state">
              <LayoutDashboard size={28} color="var(--emerald)" />
              <h3 className="ll-brand-font">Log in to see your dashboard</h3>
              <p>Every conversation and generated Power BI file will show up here once you're signed in.</p>
            </div>
          ) : (
            <>
              {/* top half — conversations masterlist */}
              <div className="ll-dashboard-half">
                <div className="ll-dashboard-panel-header">
                  <div className="ll-dashboard-panel-title">
                    <MessageSquare size={15} color="var(--emerald)" />
                    Conversations
                  </div>
                  <span className="ll-dashboard-count">{allConversations.length}</span>
                </div>
                <div className="ll-scrollbar ll-dashboard-scroll">
                  <table className="ll-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Channel</th>
                        <th>Messages</th>
                        <th>Last updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allConversations.map((c) => (
                        <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setView("chats")}>
                          <td style={{ fontWeight: 500 }}>{c.title}</td>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(19,48,32,0.6)" }}>
                              {c.channel === "whatsapp" ? <Smartphone size={12} color="var(--amber-safe)" /> : <Globe size={12} />}
                              {c.channel === "whatsapp" ? "WhatsApp" : "Web"}
                            </span>
                          </td>
                          <td className="ll-mono" style={{ color: "rgba(19,48,32,0.6)" }}>{c.messages}</td>
                          <td style={{ color: "rgba(19,48,32,0.55)" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <Clock size={11} /> {c.updated}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="ll-dashboard-divider" />

              {/* bottom half — generated files masterlist */}
              <div className="ll-dashboard-half">
                <div className="ll-dashboard-panel-header">
                  <div className="ll-dashboard-panel-title">
                    <FolderOpen size={15} color="var(--emerald)" />
                    Generated Files
                  </div>
                  <span className="ll-dashboard-count">{allFiles.length}</span>
                </div>
                <div className="ll-scrollbar ll-dashboard-scroll">
                  <table className="ll-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>From conversation</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allFiles.map((f) => (
                        <tr key={f.id}>
                          <td className="ll-mono" style={{ fontWeight: 500 }}>{f.name}</td>
                          <td style={{ color: "rgba(19,48,32,0.6)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.conversation}
                          </td>
                          <td style={{ color: "rgba(19,48,32,0.55)" }}>{f.created}</td>
                          <td>
                            <span className={`ll-status-badge ${f.status}`}>
                              <CircleDot size={8} />
                              {f.status === "ready" ? "Ready" : "Failed"}
                            </span>
                          </td>
                          <td>
                            {f.status === "ready" && (
                              <button className="ll-icon-btn" aria-label="Download" title="Download">
                                <Download size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SignOutModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}