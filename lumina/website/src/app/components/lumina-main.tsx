"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar }       from "./Sidebar";
import { ConversationView } from "./ConversationView";
import { StudioView }    from "./StudioView";
import { FilesView }     from "./FilesView";
import SignOutModal      from "./SignOutModal";
import DeleteReportModal from "./DeleteReportModal";
import { useRouter }     from "next/navigation";
import { useGeneratedFiles } from "@/hooks/useGeneratedFiles";
import { useConversations } from "@/hooks/useConversations";
import { createClient } from "@/lib/supabase/client";
import { WebDashboard }  from "./WebDashboard";
import type { ChatSummary, GeneratedFile, ChartPreviewJson } from "@/lib/types";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
import { isFlexible } from "@/lib/types";
import { ReportPreview } from "./ReportPreview";

type ViewMode = "talk" | "studio" | "files" | "dashboard";

export default function App() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [signOutOpen, setSignOutOpen]         = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView]                       = useState<ViewMode>("talk");
  const [activeFileId, setActiveFileId]       = useState<string | null>(null);

  // regen count map: fileId -> count (client-side only)
  const [regenCounts, setRegenCounts] = useState<Record<string, number>>({});
  // Bumped to demand a blank conversation; the count doubles as a remount key.
  const [freshConversation, setFreshConversation] = useState(0);
  // The report awaiting confirmation before being deleted, if any.
  const [pendingDelete, setPendingDelete] = useState<GeneratedFile | null>(null);
  // Likewise for a whole conversation, which takes its reports with it.
  const [pendingChatDelete, setPendingChatDelete] = useState<ChatSummary | null>(null);
  // Which past conversation to open. Null means the most recent one.
  const [openChatId, setOpenChatId] = useState<string | null>(null);

  const { files, refresh: refreshFiles } = useGeneratedFiles();
  const { chats, refresh: refreshChats } = useConversations();

  function requireAuth() {
    if (!user) { router.push("/login"); return false; }
    return true;
  }

  function handleNewReport() {
    if (!requireAuth()) return;
    // Was opening Studio, which meant there was no way to begin a *new* conversation at
    // all — and once conversations were remembered, no way back to a blank one either.
    // Studio is still there in the sidebar, unchanged, for the older flow.
    setOpenChatId(null);
    setFreshConversation((n) => n + 1);
    setView("talk");
  }

  function handleSelectChat(id: string) {
    setOpenChatId(id);
    // Remounts the conversation so it loads the one that was clicked.
    setFreshConversation((n) => n + 1);
    setView("talk");
  }

  async function deleteChat(chat: ChatSummary) {
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Please log in again.");

    const res = await fetch(`${BACKEND}/conversation/${chat.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? body?.detail ?? "Could not delete that conversation.");

    if (openChatId === chat.id) {
      setOpenChatId(null);
      setFreshConversation((n) => n + 1);
    }
    refreshChats();
    refreshFiles();
    setPendingChatDelete(null);
  }

  function handleFileGenerated(fileId: string, _chartJson: ChartPreviewJson | null) {
    refreshFiles();
    setActiveFileId(fileId);
  }

  function handleSelectFile(id: string) {
    setActiveFileId(id);
    setView("dashboard");
  }

  /** The name a report is listed under, so a confirmation names the same thing. */
  function reportName(file: GeneratedFile) {
    if (file.conversation_title && file.conversation_title !== "WhatsApp") {
      return file.conversation_title;
    }
    return file.storage_path.split("/").pop()?.replace(/\.zip$/, "") ?? "Report";
  }

  async function deleteReport(file: GeneratedFile) {
    const res = await fetch("/api/report", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: file.id }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? "Could not delete that report.");

    // Looking at the thing that has just been deleted is not a useful place to be.
    if (activeFileId === file.id) {
      setActiveFileId(null);
      setView("files");
    }
    refreshFiles();
    setPendingDelete(null);
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
        chats={chats}
        activeChatId={openChatId}
        onSelectChat={handleSelectChat}
        onDeleteChat={setPendingChatDelete}
        onNewReport={handleNewReport}
        onRequireAuth={requireAuth}
        onSignOut={() => setSignOutOpen(true)}
      />

      {/* ── Main content area ────────────────────────────────────── */}
      {view === "talk" && (
        <ConversationView
          // A changed key remounts it blank, which is what "New report" asks for.
          key={freshConversation}
          session={session}
          conversationId={openChatId}
          // A blank page only when New report asked for one, not when a past chat did.
          resume={freshConversation === 0 || openChatId !== null}
          onReportChanged={refreshFiles}
          onTurnFinished={refreshChats}
          onOpenReport={async (fileId) => {
            // The record may be newer than the list this page is holding.
            await refreshFiles();
            handleSelectFile(fileId);
          }}
        />
      )}

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
          onDeleteFile={setPendingDelete}
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
                {/* A report built by conversation describes its own figures, so it gets
                    a preview that reads that description. Anything else goes to
                    WebDashboard exactly as before. */}
                {isFlexible(f.chart_preview_json) ? (
                  <ReportPreview preview={f.chart_preview_json} onDownload={handleDownload} />
                ) : (
                <WebDashboard 
                  chartData={f.chart_preview_json}
                  fileName={f.conversation_title && f.conversation_title !== "WhatsApp" ? f.conversation_title : (f.storage_path.split("/").pop() ?? "Report")}
                  status={f.status}
                  storagePath={f.storage_path}
                  dataColors={colors}
                  onDownload={handleDownload}
                />
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <SignOutModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />

      {pendingChatDelete && (
        <DeleteReportModal
          name={pendingChatDelete.title}
          what="conversation"
          onClose={() => setPendingChatDelete(null)}
          onConfirm={() => deleteChat(pendingChatDelete)}
        />
      )}

      {pendingDelete && (
        <DeleteReportModal
          name={reportName(pendingDelete)}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => deleteReport(pendingDelete)}
        />
      )}
    </div>
  );
}