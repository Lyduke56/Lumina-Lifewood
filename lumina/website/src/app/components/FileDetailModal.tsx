"use client";

import { X, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { LivePreview } from "./LivePreview";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/format";
import type { GeneratedFile } from "@/lib/types";

const MAX_REGEN = 3;

interface FileDetailModalProps {
  file: GeneratedFile;
  regenCount: number;
  onClose: () => void;
  onRegenerate: (file: GeneratedFile) => void;
}

export function FileDetailModal({
  file,
  regenCount,
  onClose,
  onRegenerate,
}: FileDetailModalProps) {
  const supabase = createClient();
  const displayName = file.conversation_title ?? file.storage_path.split("/").pop() ?? "Report";
  const regenLeft = MAX_REGEN - regenCount;

  async function handleDownload() {
    const { data, error } = await supabase.storage
      .from("generated-files")
      .createSignedUrl(file.storage_path, 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(19,48,32,0.5)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--white)",
        borderRadius: 18,
        width: "min(860px, 96vw)",
        maxHeight: "92vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 16px 56px rgba(19,48,32,0.24)",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px 14px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--forest)", fontFamily: "'Fraunces', serif" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 12, color: "rgba(19,48,32,0.5)", marginTop: 2 }}>
              Generated {formatRelativeTime(file.created_at)}
              {file.conversation_title === "WhatsApp" && (
                <span style={{
                  marginLeft: 8,
                  background: "rgba(4,98,65,0.1)",
                  color: "var(--emerald)",
                  padding: "1px 7px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  WhatsApp
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ll-icon-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Preview body */}
        <div className="ll-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <LivePreview
            chartData={file.chart_preview_json}
            fileName={displayName}
            status={file.status}
            onDownload={handleDownload}
            isMock={!file.chart_preview_json}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
          borderTop: "1px solid var(--line)",
          flexShrink: 0,
          background: "var(--white)",
        }}>
          {/* Regen info */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {regenCount >= MAX_REGEN ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(19,48,32,0.5)" }}>
                <AlertTriangle size={13} color="#A65A12" />
                Regeneration limit reached ({MAX_REGEN}/{MAX_REGEN})
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "rgba(19,48,32,0.45)" }}>
                {regenLeft} regeneration{regenLeft !== 1 ? "s" : ""} remaining
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => onRegenerate(file)}
              disabled={regenCount >= MAX_REGEN || file.status !== "ready"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 9,
                border: "1px solid var(--line)",
                background: "none", cursor: regenCount >= MAX_REGEN ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 500,
                color: regenCount >= MAX_REGEN ? "rgba(19,48,32,0.35)" : "var(--forest)",
                opacity: regenCount >= MAX_REGEN ? 0.6 : 1,
              }}
            >
              <RefreshCw size={13} />
              Regenerate
            </button>

            {file.status === "ready" && (
              <button onClick={handleDownload} className="ll-btn-amber">
                <Download size={14} /> Download .zip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
