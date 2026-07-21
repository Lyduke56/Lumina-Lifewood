"use client";

import { X, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { WebDashboard } from "./WebDashboard";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/format";
import type { GeneratedFile } from "@/lib/types";

function hexToRgba(hex: string, alpha: number) {
  if (!hex || !hex.startsWith("#")) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: file.storage_path })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create signed URL");

      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = file.storage_path.split("/").pop() || "Report.zip";
      a.click();
    } catch (err: any) {
      console.error(err);
      alert("Download failed: " + (err.message || JSON.stringify(err)));
    }
  }

  const dataColors = file.chart_preview_json?.data_colors || [];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        backgroundColor: "#F9F7F7",
        backgroundImage: `radial-gradient(circle at 10% 20%, ${hexToRgba(dataColors[0] || "#E7F0EA", 0.05)} 0%, transparent 40%, ${hexToRgba(dataColors[1] || "#FFEFD6", 0.08)} 100%)`,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Abstract floating shapes for spatial depth */}
      <div style={{ position: "absolute", top: "10%", right: "5%", width: "40vw", height: "40vw", background: `radial-gradient(circle, ${hexToRgba(dataColors[1] || "#FFB347", 0.08)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "10%", left: "10%", width: "50vw", height: "50vw", background: `radial-gradient(circle, ${hexToRgba(dataColors[0] || "#046241", 0.05)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />

      <div style={{
        position: "relative", zIndex: 1,
        flex: 1, display: "flex", flexDirection: "column",
        width: "100%", height: "100%",
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
          <WebDashboard 
            chartData={file.chart_preview_json}
            fileName={displayName}
            status={file.status}
            onDownload={handleDownload}
            isMock={!file.chart_preview_json}
            dataColors={dataColors.length > 0 ? dataColors : undefined}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
          borderTop: "1px solid var(--line)",
          flexShrink: 0,
          background: "rgba(255,255,255,0.4)",
          backdropFilter: "blur(12px)",
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
