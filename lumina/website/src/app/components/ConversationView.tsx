"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Calculator,
  Check,
  Columns3,
  Download,
  FileSpreadsheet,
  Gauge,
  Hourglass,
  PackageCheck,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Session } from "@supabase/supabase-js";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** Each step of the work, in words a production manager would use, with its own icon.
 *  The steps stay on screen once done, so the conversation carries a visible record of
 *  what was actually done to their spreadsheet rather than a status line that vanishes. */
const STEPS: Record<string, { label: string; Icon: typeof Search }> = {
  open_workbook: { label: "Opening your file", Icon: FileSpreadsheet },
  examine_sheet: { label: "Reading the sheet", Icon: Search },
  record_column_meanings: { label: "Working out what the columns mean", Icon: Columns3 },
  summarise_figures: { label: "Adding up the figures", Icon: Calculator },
  add_headline_figure: { label: "Adding a headline figure", Icon: Gauge },
  add_report_chart: { label: "Adding a chart", Icon: BarChart3 },
  build_report_file: { label: "Building your Power BI file", Icon: PackageCheck },
  // Not work on the report, but the reason a conversation has gone quiet. A wait with
  // an explanation reads as the system coping; the same wait unexplained reads as
  // broken, which is what it looked like before these were shown.
  switched_supplier: { label: "Switching to another AI service", Icon: RefreshCw },
  waiting: { label: "Waiting for the AI service", Icon: Hourglass },
};

/** A finished report, handed straight to the customer in the conversation. */
type Report = { storage_path: string; title: string };

type Step = { tool: string; detail?: string; done: boolean; notice?: boolean };

type Entry =
  | { kind: "said"; role: "you" | "lumina"; text: string; report?: Report }
  | { kind: "steps"; steps: Step[] };

interface ConversationViewProps {
  session: Session | null;
  /** Fires when the agent changes the report, so a preview can redraw (Decision 2). */
  onReportChanged?: () => void;
}

export function ConversationView({ session, onReportChanged }: ConversationViewProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [stale, setStale] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Keep the newest entry in view; a reply can arrive a while after it was asked for.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, thinking]);

  const auth = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
  const token = session?.access_token;

  // Put the last conversation back. Without this it began empty every time — switching
  // to Files and back read as the conversation having been thrown away, because as far
  // as the page was concerned it had been. The record now lives on the server, so this
  // component holding no memory of its own stops mattering.
  useEffect(() => {
    if (!token) { setRestoring(false); return; }
    let current = true;
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/conversation/latest`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const saved = await res.json();
        if (!current || !saved.conversation_id) return;
        setConversationId(saved.conversation_id);
        setWorkbook(saved.workbook ?? null);
        setEntries(saved.entries ?? []);
        // The uploaded spreadsheet lives in temporary storage and does not last for
        // ever. Saying so beats letting a follow-up fail for reasons nobody can see.
        setStale(!saved.workbook_available);
      } catch {
        // Starting fresh is a poor outcome, not a broken one; no need to alarm anybody.
      } finally {
        if (current) setRestoring(false);
      }
    })();
    return () => { current = false; };
  }, [token]);

  /** Add a step to the run in progress, starting a new run if the last thing said was
   *  a message rather than a step. */
  function beginStep(tool: string) {
    setEntries((list) => {
      const last = list[list.length - 1];
      if (last?.kind === "steps") {
        return [...list.slice(0, -1), { ...last, steps: [...last.steps, { tool, done: false }] }];
      }
      return [...list, { kind: "steps", steps: [{ tool, done: false }] }];
    });
  }

  /** Something happened that is worth explaining but is not a step of the work —
   *  a supplier running out, or a pause while one is busy. Shown in place, already
   *  settled, so the customer can see where the time went. */
  function addNotice(tool: string, detail?: string) {
    setEntries((list) => {
      const last = list[list.length - 1];
      const notice: Step = { tool, detail, done: true, notice: true };
      if (last?.kind === "steps") {
        return [...list.slice(0, -1), { ...last, steps: [...last.steps, notice] }];
      }
      return [...list, { kind: "steps", steps: [notice] }];
    });
  }

  function finishStep(tool: string, detail?: string) {
    setEntries((list) => {
      const last = list[list.length - 1];
      if (last?.kind !== "steps") return list;
      const steps = [...last.steps];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].tool === tool && !steps[i].done) {
          steps[i] = { ...steps[i], done: true, detail };
          break;
        }
      }
      return [...list.slice(0, -1), { ...last, steps }];
    });
  }

  async function startFrom(file: File) {
    if (!auth) { setError("Please log in first."); return; }
    setError(null);
    setStale(false);
    setBusy(true);
    setThinking("Uploading your file");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${BACKEND}/conversation`, { method: "POST", headers: auth, body });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Upload failed (${res.status}).`);
      const started = await res.json();
      setConversationId(started.conversation_id);
      setWorkbook(started.workbook);
      setEntries([{ kind: "said", role: "lumina", text: started.greeting }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that file.");
    } finally {
      setBusy(false);
      setThinking(null);
    }
  }

  async function send(text: string) {
    if (!conversationId || !auth || !text.trim()) return;
    setError(null);
    setDraft("");
    setEntries((list) => [...list, { kind: "said", role: "you", text }]);
    setBusy(true);
    setThinking("Thinking");

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
            setThinking(null);
            setEntries((list) => [...list, { kind: "said", role: "lumina", text: event.text }]);
          } else if (event.type === "tool_started") {
            setThinking(null);
            beginStep(event.tool);
          } else if (event.type === "tool_finished") {
            finishStep(event.tool, event.detail ?? undefined);
            // A finished report is offered here rather than only landing in Recent
            // Files — the customer asked for it in this conversation, so this is
            // where they should be able to take it away.
            if (event.report) {
              setEntries((list) => [...list, { kind: "said", role: "lumina", text: "", report: event.report }]);
            }
            if (event.changed_report) onReportChanged?.();
            setThinking("Thinking");
          } else if (event.type === "notice") {
            addNotice(event.key, event.detail ?? undefined);
          } else if (event.type === "error") {
            setError(event.text);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lost the connection. Please try again.");
    } finally {
      setBusy(false);
      setThinking(null);
    }
  }

  async function download(report: Report) {
    setError(null);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: report.storage_path }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not prepare that download.");
      window.location.href = body.signedUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download that file.");
    }
  }

  // ── Fetching the last conversation ─────────────────────────────────────────
  // Shown rather than the empty state, so returning to a conversation does not flash
  // "drop your production plan here" at somebody who already has one.
  if (restoring) {
    return (
      <main className="ll-chat">
        <div className="ll-chat-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--forest)" }}>
            <Sparkles size={18} color="var(--emerald)" /> Talk to Lumina
          </div>
        </div>
        <div className="ll-empty-state">
          <span className="ll-pulse-bars"><span /><span /><span /><span /></span>
          <p>Picking up where you left off…</p>
        </div>
      </main>
    );
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
        {entries.map((entry, i) =>
          entry.kind === "steps" ? (
            <div key={i} className="ll-steps">
              {entry.steps.map((step, j) => {
                const known = STEPS[step.tool];
                const Icon = known?.Icon ?? Sparkles;
                return (
                  <div key={j} className={`ll-step${step.done ? " ll-step-done" : ""}${step.notice ? " ll-step-notice" : ""}`}>
                    <span className="ll-step-icon"><Icon size={16} /></span>
                    <span className="ll-step-text">
                      <strong>{known?.label ?? "Working on it"}</strong>
                      {step.detail && <small>{step.detail}</small>}
                    </span>
                    {step.notice ? null : step.done ? (
                      <span className="ll-step-tick"><Check size={13} strokeWidth={3} /></span>
                    ) : (
                      <span className="ll-step-spinner" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div key={i} className={entry.role === "you" ? "ll-msg-user" : "ll-msg-assistant"}>
              {/* Models write in markdown by habit. Rendering it beats forbidding it —
                  a list of columns genuinely reads better as a list, and it has already
                  produced a table when describing figures. Unrendered, a customer sees
                  stray asterisks. */}
              {entry.role === "you" ? entry.text : <Markdown remarkPlugins={[remarkGfm]}>{entry.text}</Markdown>}
              {entry.report && (
                <button className="ll-report-card" onClick={() => download(entry.report!)}>
                  <FileSpreadsheet size={20} color="var(--emerald)" />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <strong style={{ display: "block", color: "var(--forest)" }}>{entry.report.title}</strong>
                    <small style={{ opacity: 0.7 }}>Power BI project · ready to download</small>
                  </span>
                  <Download size={16} />
                </button>
              )}
            </div>
          )
        )}

        {thinking && (
          <div className="ll-msg-assistant" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ll-pulse-bars"><span /><span /><span /><span /></span>
            {thinking}…
          </div>
        )}

        {/* The conversation can be read back long after the uploaded spreadsheet has
            been cleared from temporary storage. Said plainly here, rather than letting a
            follow-up fail for a reason the customer cannot possibly guess. */}
        {stale && (
          <div className="ll-step ll-step-notice" style={{ alignSelf: "flex-start" }}>
            <span className="ll-step-icon"><Hourglass size={16} /></span>
            <span className="ll-step-text">
              <strong>This conversation has been kept, but its spreadsheet has not</strong>
              <small>Attach the file again to carry on making changes</small>
            </span>
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
          if (file) { setConversationId(null); setEntries([]); startFrom(file); }
        }}
      />
    </main>
  );
}
