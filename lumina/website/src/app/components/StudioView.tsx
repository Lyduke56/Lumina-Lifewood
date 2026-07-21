"use client";

import { useState } from "react";
import { SetupCard } from "./SetupCard";
import { WebDashboard } from "./WebDashboard";
import { Loader2 } from "lucide-react";
import type { ReportConfig, ChartPreviewJson } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

function hexToRgba(hex: string, alpha: number) {
  if (!hex || !hex.startsWith("#")) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const MAX_REGEN = 3;

interface StudioViewProps {
  session: Session | null;
  onFileGenerated: (fileId: string, chartPreviewJson: ChartPreviewJson | null) => void;
}

type StudioState =
  | { phase: "idle" }
  | { phase: "generating" }
  | { phase: "generated"; conversationId: string; chartPreviewJson: ChartPreviewJson | null; dataColors: string[]; regenCount: number; lastConfig: ReportConfig; storagePath: string };

export function StudioView({ session, onFileGenerated }: StudioViewProps) {
  const [state, setState] = useState<StudioState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function ensureConversation(title: string | null = null): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: title })
      .select("id")
      .single();
    if (error) { console.error(error); return null; }
    return data.id;
  }

  async function runGenerate(config: ReportConfig, conversationId: string, regenCount: number) {
    setError(null);
    setState({ phase: "generating" });

    const formData = new FormData();
    formData.append("file", config.file!);
    formData.append("conversation_id", conversationId);
    formData.append("report_type", config.reportType);
    formData.append("report_name", config.reportName);
    formData.append("instructions", config.instructions);
    config.dataColors.forEach((c) => formData.append("data_colors", c));
    formData.append("heading_font", config.headingFont);
    formData.append("body_font", config.bodyFont);
    formData.append("good_threshold", String(config.goodThreshold));
    formData.append("neutral_threshold", String(config.neutralThreshold));

    try {
      const res = await fetch("http://localhost:8000/generate-dashboard", {
        method: "POST",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.detail ?? `Generation failed (${res.status}). Check backend logs.`);
        setState({ phase: "idle" });
        return;
      }

      const result = await res.json();

      // Fetch the chart_preview_json for the generated file
      const { data: fileData } = await supabase
        .from("generated_files")
        .select("id, chart_preview_json")
        .eq("id", result.generated_file_id)
        .single();

      const chartPreviewJson = fileData?.chart_preview_json ?? null;

      setState({
        phase: "generated",
        conversationId,
        chartPreviewJson,
        dataColors: config.dataColors,
        regenCount,
        lastConfig: config,
        storagePath: result.storage_path,
      });

      onFileGenerated(result.generated_file_id, chartPreviewJson);
    } catch {
      setError("Could not reach the backend. Make sure it's running on :8000.");
      setState({ phase: "idle" });
    }
  }

  async function handleComplete(config: ReportConfig) {
    const fileName = config.reportName || config.file?.name?.replace(/\.[^/.]+$/, "") || "Report";
    const conversationId = await ensureConversation(fileName);
    if (!conversationId) { setError("Could not create conversation. Are you logged in?"); return; }
    await runGenerate(config, conversationId, 0);
  }

  async function handleRegenerate(config: ReportConfig) {
    if (state.phase !== "generated") return;
    if (state.regenCount >= MAX_REGEN) return;
    await runGenerate(config, state.conversationId, state.regenCount + 1);
  }

  async function handleDownload() {
    if (state.phase !== "generated") return;
    if (!state.storagePath) {
      alert("Please regenerate the report to enable downloading (hot-reload state missing path).");
      return;
    }
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: state.storagePath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create signed URL");
      
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = state.storagePath.split("/").pop() || "Report.zip";
      a.click();
    } catch (err: any) {
      console.error(err);
      alert("Download failed: " + (err.message || JSON.stringify(err)));
    }
  }

  const isGenerated = state.phase === "generated";
  const isGenerating = state.phase === "generating";

  return (
    <div className="ll-studio">
      {/* ── Error banner ────────────────────────────────────────── */}
      {error && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          zIndex: 30,
          background: "#FBEAE9", border: "1px solid #B3261E22",
          color: "#B3261E", borderRadius: 10, padding: "10px 18px",
          fontSize: 13, fontWeight: 500, maxWidth: 480,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#B3261E", padding: 0, fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Generating spinner overlay ───────────────────────────── */}
      {isGenerating && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: "rgba(249,247,247,0.75)",
          backdropFilter: "blur(3px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 14,
        }}>
          <Loader2
            size={36}
            color="var(--emerald)"
            style={{ animation: "llSpin 1s linear infinite" }}
          />
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--forest)" }}>
            Generating your dashboard…
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(19,48,32,0.5)" }}>
            Parsing Excel, selecting visuals, building Power BI project
          </div>
        </div>
      )}

      {/* ── SetupCard panel (left, or full-screen) ──────────────── */}
      {!isGenerated && (
        <div className="ll-studio-setup ll-studio-setup--full">
          <SetupCard
            onComplete={handleComplete}
            onCancel={() => { setState({ phase: "idle" }); setError(null); }}
            inline
            compact={false}
            regenCount={0}
            maxRegen={MAX_REGEN}
          />
        </div>
      )}

      {/* ── Web Dashboard panel (right, only after generate) ─────── */}
      {isGenerated && (
        <div 
          className="ll-studio-preview" 
          style={{ 
            backgroundColor: "#F9F7F7",
            backgroundImage: `radial-gradient(circle at 10% 20%, ${hexToRgba(state.dataColors[0] || "#E7F0EA", 0.05)} 0%, transparent 40%, ${hexToRgba(state.dataColors[1] || "#FFEFD6", 0.08)} 100%)`,
            position: "relative"
          }}
        >
          {/* Abstract floating shapes for spatial depth */}
          <div style={{ position: "absolute", top: "10%", right: "5%", width: "40vw", height: "40vw", background: `radial-gradient(circle, ${hexToRgba(state.dataColors[1] || "#FFB347", 0.08)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "10%", left: "10%", width: "50vw", height: "50vw", background: `radial-gradient(circle, ${hexToRgba(state.dataColors[0] || "#046241", 0.05)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />

          <div className="ll-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "24px 28px", position: "relative", zIndex: 1 }}>
            <WebDashboard
              chartData={state.chartPreviewJson}
              isMock={!state.chartPreviewJson}
              dataColors={state.dataColors}
              fileName={state.lastConfig?.reportName || state.lastConfig?.file?.name?.replace(/\.[^/.]+$/, "") || "Generated Report"}
              status="ready"
              onDownload={handleDownload}
            />
          </div>
        </div>
      )}
    </div>
  );
}
