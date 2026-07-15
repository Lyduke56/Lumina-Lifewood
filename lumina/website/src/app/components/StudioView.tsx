"use client";

import { useState } from "react";
import { SetupCard } from "./SetupCard";
import { LivePreview } from "./LivePreview";
import { Loader2 } from "lucide-react";
import type { ReportConfig, ChartPreviewJson } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

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
      <div
        className={`ll-studio-setup ${isGenerated ? "ll-studio-setup--compact" : "ll-studio-setup--full"}`}
      >
        <SetupCard
          onComplete={isGenerated ? handleRegenerate : handleComplete}
          onCancel={() => { setState({ phase: "idle" }); setError(null); }}
          inline
          compact={isGenerated}
          regenCount={state.phase === "generated" ? state.regenCount : 0}
          maxRegen={MAX_REGEN}
        />
      </div>

      {/* ── Live preview panel (right, only after generate) ─────── */}
      {isGenerated && (
        <div className="ll-studio-preview">
          <div className="ll-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
            <LivePreview
              chartData={state.chartPreviewJson}
              isMock={!state.chartPreviewJson}
              dataColors={state.dataColors}
              status="ready"
              onDownload={handleDownload}
            />
          </div>
        </div>
      )}
    </div>
  );
}
