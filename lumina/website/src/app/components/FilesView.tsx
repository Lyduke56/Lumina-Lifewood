"use client";

import { useState } from "react";
import { FolderOpen, CircleDot, Download, Clock, Eye } from "lucide-react";
import { User } from "@supabase/supabase-js";
import type { GeneratedFile } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { FileDetailModal } from "./FileDetailModal";
import { createClient } from "@/lib/supabase/client";

interface FilesViewProps {
  user: User | null;
  files: GeneratedFile[];
  regenCounts: Record<string, number>;
  onRegenerate: (file: GeneratedFile) => void;
}

export function FilesView({ user, files, regenCounts, onRegenerate }: FilesViewProps) {
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);

  if (!user) {
    return (
      <div className="ll-files-view">
        <div className="ll-files-header">
          <FolderOpen size={20} color="var(--emerald)" />
          <span style={{ fontSize: 18, fontWeight: 700 }}>Files</span>
        </div>
        <div className="ll-empty-state">
          <FolderOpen size={32} color="var(--emerald)" />
          <h3 className="ll-brand-font">Log in to see your files</h3>
          <p>Every report you generate — from the web or via WhatsApp — will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ll-files-view">
      {/* Header */}
      <div className="ll-files-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FolderOpen size={20} color="var(--emerald)" />
          <span style={{ fontSize: 18, fontWeight: 700 }}>Files</span>
          <span className="ll-dashboard-count">{files.length}</span>
        </div>
        <p style={{ fontSize: 12.5, color: "rgba(19,48,32,0.5)", margin: 0 }}>
          All generated Power BI packages — from web uploads and WhatsApp.
        </p>
      </div>

      {/* File list */}
      <div className="ll-scrollbar ll-files-body">
        {files.length === 0 ? (
          <div className="ll-empty-state" style={{ paddingTop: 80 }}>
            <FolderOpen size={36} color="var(--tan-muted)" />
            <h3 className="ll-brand-font" style={{ color: "rgba(19,48,32,0.5)" }}>No files yet</h3>
            <p>Head to the Studio, upload a production plan, and hit Generate.</p>
          </div>
        ) : (
          <div className="ll-file-grid">
            {files.map((f) => {
              const displayName = f.conversation_title ?? f.storage_path.split("/").pop() ?? "Report";
              const isWhatsapp = f.conversation_title === "WhatsApp";

              return (
                <div
                  key={f.id}
                  className="ll-file-card"
                  onClick={() => setSelectedFile(f)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => { if (e.key === "Enter") setSelectedFile(f); }}
                >
                  {/* Card top bar with source badge */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: "var(--emerald-tint)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <FolderOpen size={18} color="var(--emerald)" />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {isWhatsapp && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                          background: "rgba(4,98,65,0.1)", color: "var(--emerald)",
                          textTransform: "uppercase", letterSpacing: ".04em",
                        }}>
                          WhatsApp
                        </span>
                      )}
                      <span className={`ll-status-badge ${f.status}`}>
                        <CircleDot size={7} />
                        {f.status === "ready" ? "Ready" : f.status === "compiling" ? "Building" : "Failed"}
                      </span>
                    </div>
                  </div>

                  {/* Name */}
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--forest)", marginBottom: 3, lineHeight: 1.3 }}>
                    {displayName}
                  </div>

                  {/* Date */}
                  <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.5)", display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
                    <Clock size={11} />
                    {formatRelativeTime(f.created_at)}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                    <button
                      className="ll-file-action-btn"
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(f); }}
                    >
                      <Eye size={13} /> Preview
                    </button>
                    {f.status === "ready" && (
                      <DownloadButton storagePath={f.storage_path} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedFile && (
        <FileDetailModal
          file={selectedFile}
          regenCount={regenCounts[selectedFile.id] ?? 0}
          onClose={() => setSelectedFile(null)}
          onRegenerate={(f) => {
            onRegenerate(f);
            setSelectedFile(null);
          }}
        />
      )}
    </div>
  );
}

// ── Download button ───────────────────────────────────────────────────────────

function DownloadButton({ storagePath }: { storagePath: string }) {
  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create signed URL");
      
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = storagePath.split("/").pop() || "Report.zip";
      a.click();
    } catch (err: any) {
      console.error(err);
      alert("Download failed: " + (err.message || JSON.stringify(err)));
    }
  }

  return (
    <button className="ll-file-action-btn ll-file-action-btn--primary" onClick={handleDownload}>
      <Download size={13} /> Download
    </button>
  );
}
