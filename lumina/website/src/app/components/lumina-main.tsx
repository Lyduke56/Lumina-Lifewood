"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "./AuthModal";

import {
  MessageSquare,
  LayoutDashboard,
  Link2,
  Settings,
  Plus,
  Paperclip,
  Send,
  FileSpreadsheet,
  Download,
  Share2,
  ChevronDown,
  Smartphone,
  Globe,
  Sparkles,
  BarChart3,
  Table2,
  FileDown,
  RefreshCw,
  CircleDot,
  LogOut,
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

const tableRows = [
  { month: "Jul", region: "APAC", revenue: 142, units: 1180 },
  { month: "Aug", region: "APAC", revenue: 158, units: 1240 },
  { month: "Sep", region: "APAC", revenue: 182, units: 1390 },
  { month: "Jul", region: "EMEA", revenue: 108, units: 890 },
  { month: "Aug", region: "EMEA", revenue: 119, units: 920 },
];

const history = [
  { id: 1, title: "Q3 regional revenue breakdown", time: "10:42 AM", channel: "web", active: true },
  { id: 2, title: "\u201cshow me last month too\u201d", time: "9:15 AM", channel: "whatsapp", active: false },
  { id: 3, title: "Inventory turnover — warehouse B", time: "Yesterday", channel: "web", active: false },
  { id: 4, title: "Marketing spend vs. conversions", time: "Yesterday", channel: "whatsapp", active: false },
  { id: 5, title: "Headcount by department.xlsx", time: "Mon", channel: "web", active: false },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("viz");
  const { user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  // Gate: call this before any action that should require a logged-in user.
  // Returns true if the user may proceed, false if the modal was shown instead.
  function requireAuth() {
    if (!user) {
      setAuthOpen(true);
      return false;
    }
    return true;
  }

  function handleSend() {
    if (!requireAuth()) return;
    // real send logic goes here once the chat API route exists
  }

  function handleUploadClick() {
    if (!requireAuth()) return;
    // real file picker trigger goes here
  }

  function handleComposerFocus() {
    requireAuth();
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
        }
        .ll-sidebar-muted { color: var(--tan-muted); }
        .ll-sidebar-section { border-top: 1px solid rgba(245,238,219,0.10); }

        .ll-navitem {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 8px;
          font-size: 13.5px; font-weight: 500;
          color: var(--tan-muted);
          cursor: pointer;
        }
        .ll-navitem:hover { background: rgba(245,238,219,0.06); color: var(--cream); }
        .ll-navitem.active { background: rgba(245,238,219,0.10); color: var(--cream); }
        .ll-navitem.disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

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

        /* ---- Right preview panel ---- */
        .ll-preview { width: 420px; flex-shrink: 0; background: var(--white); border-left: 1px solid var(--line);
          display: flex; flex-direction: column; height: 100%; }
        .ll-preview-header { padding: 14px 18px 0; flex-shrink: 0; }
        .ll-preview-tabs { display: flex; gap: 4px; margin-top: 12px; border-bottom: 1px solid var(--line); }
        .ll-tab {
          font-size: 13px; font-weight: 500; color: rgba(19,48,32,0.55);
          padding: 8px 4px; margin-right: 16px; cursor: pointer; border-bottom: 2px solid transparent;
          display: flex; align-items: center; gap: 6px;
        }
        .ll-tab.active { color: var(--forest); border-bottom-color: var(--emerald); }
        .ll-preview-body { flex: 1; overflow-y: auto; padding: 16px 18px; }

        .ll-export-btn {
          display: flex; align-items: center; justify-content: space-between; width: 100%;
          padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--offwhite);
          font-size: 13px; font-weight: 500; color: var(--forest); cursor: pointer; margin-bottom: 8px;
        }
        .ll-export-btn:hover { border-color: var(--emerald); }

        table.ll-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        table.ll-table th {
          text-align: left; font-weight: 600; color: rgba(19,48,32,0.6); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 8px; border-bottom: 1px solid var(--line);
        }
        table.ll-table td { padding: 7px 8px; border-bottom: 1px solid var(--line); font-family: 'JetBrains Mono', monospace; }

        .ll-scrollbar::-webkit-scrollbar { width: 6px; }
        .ll-scrollbar::-webkit-scrollbar-thumb { background: rgba(19,48,32,0.15); border-radius: 4px; }
      `}</style>

      {/* ============ LEFT: dashboard / auth / history ============ */}
      <aside className="ll-sidebar">
        <div style={{ padding: "18px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="#FFB347" />
              <path d="M5 15L10 9L14 13L19 7" stroke="#133020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="ll-brand-font" style={{ fontSize: 18, fontWeight: 600, color: "#F5EEDB" }}>
              lumina
            </span>
          </div>
        </div>

        {/* auth / user card */}
        <div className="ll-sidebar-section" style={{ padding: "14px 16px" }}>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34, height: 34, borderRadius: "50%", background: "var(--emerald)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 600, color: "#fff", flexShrink: 0,
                }}
              >
                {initials}
              </div>
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
                onClick={signOut}
                className="ll-icon-btn"
                style={{ color: "var(--tan-muted)" }}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
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

        <div style={{ padding: "0 16px 14px" }}>
          <button className="ll-btn-amber" style={{ width: "100%" }} onClick={() => requireAuth()}>
            <Plus size={16} /> New chat
          </button>
        </div>

        <nav className="ll-sidebar-section" style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="ll-navitem active">
            <MessageSquare size={16} /> Chats
          </div>
          <div className={`ll-navitem ${isLoggedOut ? "disabled" : ""}`}>
            <LayoutDashboard size={16} /> Dashboard
          </div>
          <div className={`ll-navitem ${isLoggedOut ? "disabled" : ""}`}>
            <Link2 size={16} /> Connections
            {user && (
              <span
                className="ll-mono"
                style={{ marginLeft: "auto", fontSize: 10, background: "rgba(255,179,71,0.15)", color: "#FFC370", padding: "1px 6px", borderRadius: 5 }}
              >
                2
              </span>
            )}
          </div>
        </nav>

        {/* conversation history — linked per user, tagged by channel */}
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

        <div className="ll-sidebar-section" style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="ll-navitem" style={{ padding: "6px 8px" }}>
            <Settings size={16} /> Settings
          </div>
          {user && (
            <span className="ll-sidebar-muted" style={{ fontSize: 11 }}>
              412 msgs synced
            </span>
          )}
        </div>
      </aside>

      {/* ============ CENTER: chat ============ */}
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

      {/* ============ RIGHT: preview panel (artifact-style) ============ */}
      <aside className="ll-preview">
        <div className="ll-preview-header">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user ? "Regional Revenue.pbip" : "No file yet"}
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.55)" }}>
                {user ? "Updated just now" : "Upload a plan to see a preview"}
              </div>
            </div>
            {user && (
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <div className="ll-icon-btn">
                  <RefreshCw size={14} />
                </div>
                <div className="ll-icon-btn">
                  <Share2 size={14} />
                </div>
              </div>
            )}
          </div>

          <div className="ll-preview-tabs">
            <div className={`ll-tab ${activeTab === "viz" ? "active" : ""}`} onClick={() => setActiveTab("viz")}>
              <BarChart3 size={14} /> Visualization
            </div>
            <div className={`ll-tab ${activeTab === "data" ? "active" : ""}`} onClick={() => setActiveTab("data")}>
              <Table2 size={14} /> Data
            </div>
            <div className={`ll-tab ${activeTab === "export" ? "active" : ""}`} onClick={() => setActiveTab("export")}>
              <FileDown size={14} /> Export
            </div>
          </div>
        </div>

        <div className="ll-scrollbar ll-preview-body">
          {!user ? (
            <div className="ll-empty-state" style={{ padding: "24px 8px" }}>
              <BarChart3 size={24} color="var(--tan-muted)" />
              <p>Nothing to preview yet. Log in and upload a plan to see charts here.</p>
            </div>
          ) : (
            <>
              {activeTab === "viz" && (
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
                  <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11.5, color: "rgba(19,48,32,0.65)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: "#046241", display: "inline-block" }} /> Revenue ($K)
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: "#A65A12", display: "inline-block" }} /> QoQ growth (%)
                    </span>
                  </div>

                  <div style={{ marginTop: 18, padding: "10px 12px", background: "var(--emerald-tint)", borderRadius: 10, fontSize: 12, color: "var(--emerald-dark)" }}>
                    <strong>Sparkles</strong>Auto-detected: revenue column, region dimension, and a time
                    grain of "month." Chart type picked to compare a categorical value alongside a rate.
                  </div>
                </div>
              )}

              {activeTab === "data" && (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Parsed source rows (5 of 1,842)</div>
                  <table className="ll-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Region</th>
                        <th>Revenue</th>
                        <th>Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.month}</td>
                          <td>{r.region}</td>
                          <td>{r.revenue}</td>
                          <td>{r.units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "export" && (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Download or open</div>
                  <button className="ll-export-btn">
                    Download Power BI project (.pbip) <Download size={14} />
                  </button>
                  <button className="ll-export-btn">
                    Download chart as .png <Download size={14} />
                  </button>
                  <button className="ll-export-btn">
                    Export data as .csv <Download size={14} />
                  </button>
                  <div style={{ marginTop: 14, fontSize: 11.5, color: "rgba(19,48,32,0.55)" }}>
                    Opens in Power BI Desktop with the Grid-Zone layout applied automatically. Use{" "}
                    <span className="ll-mono">Save As → .pbix</span> in Desktop if you need the compiled
                    format.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}