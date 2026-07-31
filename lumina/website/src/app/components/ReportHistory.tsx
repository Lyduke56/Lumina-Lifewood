"use client";

import { useState } from "react";
import { ChevronRight, Clock, Download, Eye, FileText } from "lucide-react";
import type { ConversationReport } from "@/lib/types";

/**
 * Every Power BI file this conversation has built, newest first.
 *
 * A conversation rebuilds whenever the customer asks for a change, so it accumulates
 * files — one already holds eighteen. Until now the only one reachable was whichever card
 * happened to be scrolled to in the transcript, and the Files tab held the rest mixed in
 * with every other conversation's. Which version had the studio chart on it, and which
 * came after asking for it to be taken off, was not answerable.
 *
 * Each entry names what is actually on that version rather than only when it was made,
 * because "11:13" and "11:19" tell a customer nothing about which one they want.
 */

interface ReportHistoryProps {
  reports: ConversationReport[];
  openFileId: string | null;
  onPreview: (fileId: string) => void;
  onDownload: (fileId: string) => void;
}

function when(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return sameDay
    ? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : at.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        ", " +
        at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ReportHistory({
  reports,
  openFileId,
  onPreview,
  onDownload,
}: ReportHistoryProps) {
  const [open, setOpen] = useState(true);
  if (!reports.length) return null;

  // Collapsed, it becomes a rail down the edge carrying the count, so the conversation
  // gets the width back without the list disappearing from the customer's mind.
  if (!open) {
    return (
      <aside className="ll-history is-collapsed">
        <button onClick={() => setOpen(true)} title="Show the reports in this chat">
          <FileText size={14} />
          <span>{reports.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="ll-history">
      <header>
        <FileText size={14} />
        <span>Reports in this chat</span>
        <small>{reports.length}</small>
        <button
          className="ll-history-collapse"
          onClick={() => setOpen(false)}
          title="Hide this panel"
        >
          <ChevronRight size={15} />
        </button>
      </header>

      <div className="ll-history-list">
        {reports.map((report) => (
          <article
            key={report.file_id}
            className={`ll-history-item${report.file_id === openFileId ? " is-open" : ""}`}
          >
            <div className="ll-history-head">
              <strong>{report.title}</strong>
              {report.latest && <em>Latest</em>}
            </div>

            <div className="ll-history-when">
              <Clock size={11} />
              {when(report.created_at)}
              <span>·</span>
              Version {report.version}
            </div>

            {/* What this version changed, which is the question a customer is actually
                asking when they scroll back through them. */}
            {report.changes.length > 0 && (
              <p className="ll-history-changed">{report.changes.join(" · ")}</p>
            )}

            {/* What is actually on this one, so two versions can be told apart without
                opening both. */}
            {(report.headline_figures.length > 0 || report.charts.length > 0) && (
              <ul className="ll-history-holds">
                {report.headline_figures.map((figure) => (
                  <li key={`f-${figure}`}>{figure}</li>
                ))}
                {report.charts.map((chart) => (
                  <li key={`c-${chart}`} className="is-chart">
                    {chart}
                  </li>
                ))}
              </ul>
            )}

            <div className="ll-history-actions">
              <button onClick={() => onPreview(report.file_id)}>
                <Eye size={13} /> Preview
              </button>
              <button
                onClick={() => onDownload(report.file_id)}
                disabled={!report.downloadable}
                title={
                  report.downloadable
                    ? "Download the Power BI project"
                    : "This one was never saved to storage"
                }
              >
                <Download size={13} /> Download
              </button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
