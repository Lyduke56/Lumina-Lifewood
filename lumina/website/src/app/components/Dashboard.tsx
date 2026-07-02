import { LayoutDashboard, MessageSquare, Smartphone, Globe, Clock, FolderOpen, CircleDot, Download } from "lucide-react";
import { User } from "@supabase/supabase-js";


interface DashboardProps {
  user: User | null;
  conversations: any[];
  files: any[];
  onNavigateToChat: () => void;
}

export function Dashboard({ user, conversations, files, onNavigateToChat }: DashboardProps) {
  if (!user) {
    return (
      <div className="ll-dashboard">
        <div className="ll-dashboard-header">
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Dashboard</span>
        </div>
        <div className="ll-empty-state">
          <LayoutDashboard size={28} color="var(--emerald)" />
          <h3 className="ll-brand-font">Log in to see your dashboard</h3>
          <p>Every conversation and generated Power BI file will show up here once you're signed in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ll-dashboard">
      <div className="ll-dashboard-header">
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Dashboard</span>
      </div>

      <div className="ll-dashboard-half">
        <div className="ll-dashboard-panel-header">
          <div className="ll-dashboard-panel-title">
            <MessageSquare size={15} color="var(--emerald)" /> Conversations
          </div>
          <span className="ll-dashboard-count">{conversations.length}</span>
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
              {conversations.map((c) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={onNavigateToChat}>
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

      <div className="ll-dashboard-half">
        <div className="ll-dashboard-panel-header">
          <div className="ll-dashboard-panel-title">
            <FolderOpen size={15} color="var(--emerald)" /> Generated Files
          </div>
          <span className="ll-dashboard-count">{files.length}</span>
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
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="ll-mono" style={{ fontWeight: 500 }}>{f.name}</td>
                  <td style={{ color: "rgba(19,48,32,0.6)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.conversation}
                  </td>
                  <td style={{ color: "rgba(19,48,32,0.55)" }}>{f.created}</td>
                  <td>
                    <span className={`ll-status-badge ${f.status}`}>
                      <CircleDot size={8} /> {f.status === "ready" ? "Ready" : "Failed"}
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
    </div>
  );
}