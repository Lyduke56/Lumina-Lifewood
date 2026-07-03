import { FileSpreadsheet, CircleDot, Sparkles, Paperclip, Send, MessageSquare } from "lucide-react";
import { User } from "@supabase/supabase-js";
import type { Conversation } from "@/lib/types";

interface ChatPanelProps {
  user: User | null;
  activeConversation: Conversation | null;
  onRequireAuth: () => boolean;
  onUploadClick: () => void;
  onSend: () => void;
}

export function ChatPanel({ user, activeConversation, onRequireAuth, onUploadClick, onSend }: ChatPanelProps) {
  return (
    <main className="ll-chat">
      <div className="ll-chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FileSpreadsheet size={24} color="var(--emerald)" />
          <span style={{ fontSize: 20, fontWeight: 600 }}>
            {user
              ? activeConversation?.title ?? "New conversation"
              : "New conversation"}
          </span>
        </div>
      </div>

      {!user ? (
        <div className="ll-empty-state">
          <Sparkles size={28} color="var(--emerald)" />
          <h3 className="ll-brand-font">Upload a plan to get started</h3>
          <p>
            Log in and drop in an Excel production plan — Lumina will parse it,
            reason about the right charts, and generate a Power BI project you
            can preview and download.
          </p>
        </div>
      ) : !activeConversation ? (
        <div className="ll-empty-state">
          <MessageSquare size={28} color="var(--emerald)" />
          <h3 className="ll-brand-font">No conversation selected</h3>
          <p>Start a new chat or pick one from your history on the left.</p>
        </div>
      ) : (
        <div className="ll-empty-state">
          <Sparkles size={28} color="var(--emerald)" />
          <h3 className="ll-brand-font">This conversation is ready</h3>
          <p>
            Drop in an Excel file or ask a question below to get started —
            responses will appear here once the AI agent is connected.
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