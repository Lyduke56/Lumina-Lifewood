import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
gsap.registerPlugin(useGSAP);
import {
  FileSpreadsheet, Sparkles, Paperclip,
  Send, MessageSquare, ArrowRight,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import type { Conversation } from "@/lib/types";

interface ChatPanelProps {
  user: User | null;
  activeConversation: Conversation | null;
  onRequireAuth: () => boolean;
  onUploadClick: () => void;
  onSend: () => void;
  onNewChat: () => void; // triggers SetupCard
}

export function ChatPanel({
  user,
  activeConversation,
  onRequireAuth,
  onUploadClick,
  onSend,
  onNewChat,
}: ChatPanelProps) {

  // Composer is only shown once there's an active configured conversation
  const showComposer = !!user && !!activeConversation;
  
  const containerRef = useRef<HTMLElement>(null);
  useGSAP(() => {
    gsap.from(".ll-chat-header, .ll-empty-state", {
      y: 15,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: "power3.out"
    });
  }, { scope: containerRef, dependencies: [activeConversation?.id, user?.id] });

  return (
    <main className="ll-chat" ref={containerRef}>

      {/* Header */}
      <div className="ll-chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FileSpreadsheet size={24} color="var(--emerald)" />
          <span style={{ fontSize: 20, fontWeight: 600 }}>
            {activeConversation?.title ?? "New conversation"}
          </span>
        </div>
      </div>

      {/* ── Empty states ───────────────────────────────────────────────────── */}

      {/* 1. Guest */}
      {!user && (
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

      {/* 2. Logged in, no active conversation */}
      {user && !activeConversation && (
        <div className="ll-empty-state">
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: "var(--emerald-tint)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 4,
          }}>
            <Sparkles size={24} color="var(--emerald)" />
          </div>

          <h3 className="ll-brand-font" style={{ margin: 0 }}>
            No report configured yet
          </h3>

          <p style={{ maxWidth: 340, margin: 0 }}>
            Each conversation starts with a quick setup — you'll name the
            report, pick a theme, and upload your Excel production plan before
            the AI gets to work.
          </p>

          {/* Steps — sets expectation before they click */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            margin: "4px 0", width: "100%", maxWidth: 300,
          }}>
            {[
              "Name your report and pick a color theme",
              "Upload your Excel production plan",
              "Chat with the AI to refine the output",
            ].map((step, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                fontSize: 13, color: "rgba(19,48,32,0.65)",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: "var(--emerald-tint)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "var(--emerald)",
                  marginTop: 1,
                }}>
                  {i + 1}
                </div>
                <span style={{ lineHeight: 1.45 }}>{step}</span>
              </div>
            ))}
          </div>

          <button
            onClick={onNewChat}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--emerald)", color: "var(--white)",
              border: "none", borderRadius: 10,
              padding: "10px 20px", fontSize: 14, fontWeight: 600,
              cursor: "pointer", marginTop: 4,
            }}
          >
            Start a new report <ArrowRight size={15} />
          </button>

          <p style={{ fontSize: 12, color: "rgba(19,48,32,0.38)", margin: 0 }}>
            Already started on WhatsApp? Your conversation will appear in the
            sidebar once synced.
          </p>
        </div>
      )}

      {/* 3. Active conversation — message list placeholder */}
      {user && activeConversation && (
        <div className="ll-empty-state">
          <Sparkles size={28} color="var(--emerald)" />
          <h3 className="ll-brand-font">Conversation ready</h3>
          <p>
            Ask a question or drop in a follow-up file below — responses will
            appear here once the AI agent is connected.
          </p>
        </div>
      )}

      {/* ── Composer — only shown when a conversation is active ───────────── */}
      {showComposer && (
        <div className="ll-composer">
          <div className="ll-composer-box">
            <div className="ll-icon-btn" onClick={onUploadClick}>
              <Paperclip size={16} />
            </div>
            <input
              type="text"
              placeholder="Ask about your data, or drop in a follow-up file…"
              style={{
                flex: 1, border: "none", outline: "none",
                background: "transparent", fontSize: 14, color: "var(--forest)",
              }}
            />
            <button className="ll-send-btn" onClick={onSend}>
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

    </main>
  );
}