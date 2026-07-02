import { FileSpreadsheet, CircleDot, Sparkles, Paperclip, Send, Smartphone } from "lucide-react";
import { User } from "@supabase/supabase-js";

interface ChatPanelProps {
  user: User | null;
  onRequireAuth: () => boolean;
  onUploadClick: () => void;
  onSend: () => void;
}

export function ChatPanel({ user, onRequireAuth, onUploadClick, onSend }: ChatPanelProps) {
  return (
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
          <div className="ll-icon-btn" onClick={onUploadClick}>
            <Paperclip size={16} />
          </div>
          <input
            type="text"
            placeholder={user ? "Ask about your data, or drop in an Excel file…" : "Log in to start chatting…"}
            onFocus={() => onRequireAuth()}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--forest)" }}
          />
          <button className="ll-send-btn" onClick={onSend}>
            <Send size={15} />
          </button>
        </div>
      </div>
    </main>
  );
}