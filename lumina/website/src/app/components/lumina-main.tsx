"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar }       from "./Sidebar";
import { StudioView }    from "./StudioView";
import { FilesView }     from "./FilesView";
import { FileDetailModal } from "./FileDetailModal";
import SignOutModal      from "./SignOutModal";
import { useRouter }     from "next/navigation";
import { useGeneratedFiles } from "@/hooks/useGeneratedFiles";
import type { GeneratedFile } from "@/lib/types";
import type { ChartPreviewJson } from "@/lib/types";

type ViewMode = "studio" | "files";

export default function App() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [signOutOpen, setSignOutOpen]         = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView]                       = useState<ViewMode>("studio");
  const [activeFileId, setActiveFileId]       = useState<string | null>(null);
  const [sidebarFile, setSidebarFile]         = useState<GeneratedFile | null>(null);

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
    const f = files.find((f) => f.id === id) ?? null;
    setActiveFileId(id);
    setSidebarFile(f);
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
        />
      )}

      {/* Sidebar file detail modal */}
      {sidebarFile && (
        <FileDetailModal
          file={sidebarFile}
          regenCount={regenCounts[sidebarFile.id] ?? 0}
          onClose={() => setSidebarFile(null)}
          onRegenerate={(f) => { handleRegenerate(f); setSidebarFile(null); }}
        />
      )}

      <SignOutModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}