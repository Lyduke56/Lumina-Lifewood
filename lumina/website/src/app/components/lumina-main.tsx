"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar }       from "./Sidebar";
import { StudioView }    from "./StudioView";
import { FilesView }     from "./FilesView";
import SignOutModal      from "./SignOutModal";
import { useRouter }     from "next/navigation";
import { useGeneratedFiles } from "@/hooks/useGeneratedFiles";
import { WebDashboard }  from "./WebDashboard";
import type { GeneratedFile, ChartPreviewJson } from "@/lib/types";

type ViewMode = "studio" | "files" | "dashboard";

export default function App() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [signOutOpen, setSignOutOpen]         = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView]                       = useState<ViewMode>("studio");
  const [activeFileId, setActiveFileId]       = useState<string | null>(null);

  // regen count map: fileId -> count (client-side only)
  const [regenCounts, setRegenCounts] = useState<Record<string, number>>({});

  const { files, refresh: refreshFiles } = useGeneratedFiles();

  function requireAuth() {
    if (!user) { router.push("/login"); return false; }
    return true;
  }

  function handleNewReport() {
    if (!requireAuth()) return;
    setView("studio");
  }

  function handleFileGenerated(fileId: string, _chartJson: ChartPreviewJson | null) {
    refreshFiles();
    setActiveFileId(fileId);
  }

  function handleSelectFile(id: string) {
    setActiveFileId(id);
    setView("dashboard");
  }

  function handleRegenerate(file: GeneratedFile) {
    setRegenCounts((prev) => ({
      ...prev,
      [file.id]: (prev[file.id] ?? 0) + 1,
    }));
    // TODO: wire up regen pipeline — for now just bumps the counter
  }

  return (
    <div className="ll-root">
      <Sidebar
        user={user}
        view={view}
        setView={setView}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        files={files}
        activeFileId={activeFileId}
        onSelectFile={handleSelectFile}
        onNewReport={handleNewReport}
        onRequireAuth={requireAuth}
        onSignOut={() => setSignOutOpen(true)}
      />

      {/* ── Main content area ────────────────────────────────────── */}
      {view === "studio" && (
        <StudioView
          session={session}
          onFileGenerated={handleFileGenerated}
        />
      )}

      {view === "files" && (
        <FilesView
          user={user}
          files={files}
          regenCounts={regenCounts}
          onRegenerate={handleRegenerate}
          onSelectFile={handleSelectFile}
        />
      )}

      {view === "dashboard" && activeFileId && (() => {
        const f = files.find(x => x.id === activeFileId);
        if (!f) return null;
        
        const colors = f.chart_preview_json?.data_colors || ["#046241", "#FFB347"];
        
        function hexToRgba(hex: string, alpha: number) {
          if (!hex || !hex.startsWith("#")) return `rgba(0,0,0,${alpha})`;
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          if (isNaN(r)) return `rgba(0,0,0,${alpha})`;
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        async function handleDownload() {
          if (!f?.storage_path) return;
          try {
            const res = await fetch("/api/download", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ storagePath: f.storage_path })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create signed URL");
            
            const a = document.createElement("a");
            a.href = data.signedUrl;
            a.download = f.storage_path.split("/").pop() || "Report.zip";
            a.click();
          } catch (err: any) {
            console.error(err);
            alert("Download failed: " + (err.message || JSON.stringify(err)));
          }
        }

        return (
          <div className="ll-studio">
            <div 
              className="ll-studio-preview" 
              style={{ 
                backgroundColor: "#F9F7F7",
                backgroundImage: `radial-gradient(circle at 10% 20%, ${hexToRgba(colors[0], 0.05)} 0%, transparent 40%, ${hexToRgba(colors[1], 0.08)} 100%)`,
                position: "relative"
              }}
            >
              <div style={{ position: "absolute", top: "10%", right: "5%", width: "40vw", height: "40vw", background: `radial-gradient(circle, ${hexToRgba(colors[1], 0.08)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: "10%", left: "10%", width: "50vw", height: "50vw", background: `radial-gradient(circle, ${hexToRgba(colors[0], 0.05)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />

              <div className="ll-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "24px 28px", position: "relative", zIndex: 1 }}>
                <WebDashboard 
                  chartData={f.chart_preview_json}
                  fileName={f.conversation_title && f.conversation_title !== "WhatsApp" ? f.conversation_title : (f.storage_path.split("/").pop() ?? "Report")}
                  status={f.status}
                  storagePath={f.storage_path}
                  dataColors={colors}
                  onDownload={handleDownload}
                />
              </div>
            </div>
          </div>
        );
      })()}

      <SignOutModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}