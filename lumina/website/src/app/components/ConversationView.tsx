"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Paperclip, Send, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** What the agent is doing, in words a production manager would use. */
const ACTIVITY: Record<string, string> = {
  open_workbook: "Opening your file",
  examine_sheet: "Reading the sheet",
  record_column_meanings: "Working out what the columns mean",
  summarise_figures: "Adding up the figures",
  add_headline_figure: "Adding a headline figure",
  add_report_chart: "Adding a chart",
  build_report_file: "Building your Power BI file",
};

type Message = { role: "you" | "lumina"; text: string };

interface ConversationViewProps {
  session: Session | null;
  /** Fires when the agent changes the report, so a preview can redraw (Decision 2). */
  onReportChanged?: () => void;
}

export function ConversationView({ session, onReportChanged }: ConversationViewProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Keep the newest message in view; a reply can arrive a while after it was asked for.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity]);

  const auth = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;

  async function startFrom(file: File) {
    if (!auth) { setError("Please log in first."); return; }
    setError(null);
    setBusy(true);
    setActivity("Uploading your file");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${BACKEND}/conversation`, { method: "POST", headers: auth, body });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Upload failed (${res.status}).`);
      const started = await res.json();
      setConversationId(started.conversation_id);
      setWorkbook(started.workbook);
      setMessages([{ role: "lumina", text: started.greeting }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that file.");
    } finally {
      setBusy(false);
      setActivity(null);
    }
  }

  async function send(text: string) {
    if (!conversationId || !auth || !text.trim()) return;
    setError(null);
    setDraft("");
    setMessages((m) => [...m, { role: "you", text }]);
    setBusy(true);

    try {
      const res = await fetch(`${BACKEND}/conversation/${conversationId}/message`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.json().catch(() => null))?.detail ?? `Something went wrong (${res.status}).`);
      }

      // The reply arrives as a stream of events rather than in one piece, so the
      // customer sees the work happening instead of waiting at a spinner.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === "message") {
            setActivity(null);
            setMessages((m) => [...m, { role: "lumina", text: event.text }]);
          } else if (event.type === "tool_started") {
            setActivity(ACTIVITY[event.tool] ?? "Working on it");
          } else if (event.type === "tool_finished" && event.changed_report) {
            onReportChanged?.();
          } else if (event.type === "error") {
            setError(event.text);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lost the connection. Please try again.");
    } finally {
      setBusy(false);
      setActivity(null);
    }
  }

  // ── Before a file has been uploaded ────────────────────────────────────────
  if (!conversationId) {
    return (
      <main className="ll-chat">
        <div className="ll-chat-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--forest)" }}>
            <Sparkles size={18} color="var(--emerald)" /> Talk to Lumina
          </div>
        </div>

        <div
          className="ll-empty-state"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) startFrom(file);
          }}
        >
          <FileSpreadsheet size={30} color="var(--emerald)" />
          <h3 className="ll-brand-font">Drop your production plan here</h3>
          <p>
            Share your spreadsheet and I will read it, ask anything I am unsure about, and build
            your dashboard with you.
          </p>
          <button
            className="ll-send-btn"
            style={{ width: "auto", padding: "8px 16px", marginTop: 6, fontSize: 13, fontWeight: 600 }}
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            {busy ? "Uploading…" : "Choose a file"}
          </button>
          {error && <p style={{ color: "#B3261E", marginTop: 8 }}>{error}</p>}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) startFrom(file);
          }}
        />
      </main>
    );
  }

  // ── The conversation ───────────────────────────────────────────────────────
  return (
    <main className="ll-chat">
      <div className="ll-chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--forest)" }}>
          <Sparkles size={18} color="var(--emerald)" /> Talk to Lumina
        </div>
        {workbook && (
          <span className="ll-badge-sync">
            <FileSpreadsheet size={12} /> {workbook}
          </span>
        )}
      </div>

      <div
        className="ll-scrollbar"
        style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}
      >
        {messages.map((m, i) => (
          <div key={i} className={m.role === "you" ? "ll-msg-user" : "ll-msg-assistant"}>
            {m.text}
          </div>
        ))}

        {activity && (
          <div className="ll-msg-assistant" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ll-pulse-bars"><span /><span /><span /><span /></span>
            {activity}…
          </div>
        )}

        {error && (
          <div className="ll-msg-assistant" style={{ borderColor: "#B3261E44", color: "#B3261E" }}>
            {error}
          </div>
        )}

        <div ref={bottom} />
      </div>

      <div className="ll-composer">
        <div className="ll-composer-box">
          <div className="ll-icon-btn" onClick={() => fileInput.current?.click()} title="Use a different file">
            <Paperclip size={16} />
          </div>
          <input
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--forest)" }}
            placeholder={busy ? "Lumina is working…" : "Ask for a change, or say what you need…"}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) send(draft); }}
          />
          <button className="ll-send-btn" onClick={() => send(draft)} disabled={busy || !draft.trim()}>
            <Send size={15} />
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setConversationId(null); setMessages([]); startFrom(file); }
        }}
      />
    </main>
  );
}
