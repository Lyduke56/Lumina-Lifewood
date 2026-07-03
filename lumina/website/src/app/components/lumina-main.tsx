"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

import { Sidebar }     from "./Sidebar";
import { ChatPanel }   from "./ChatPanel";
import { PreviewPanel } from "./PreviewPanel";
import { Dashboard }   from "./Dashboard";
import { SetupCard }   from "./SetupCard";
import AuthModal       from "./AuthModal";
import SignOutModal    from "./SignOutModal";

import { useConversations }  from "@/hooks/useConversations";
import { useGeneratedFiles } from "@/hooks/useGeneratedFiles";
import { mockRevenueData }   from "@/mocks/data";

import type { ReportConfig } from "@/lib/types";

type ViewMode = "chats" | "dashboard";

export default function App() {
  const { user } = useAuth();
  const [authOpen, setAuthOpen]       = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView]               = useState<ViewMode>("chats");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // ── Setup card state ─────────────────────────────────────────────────────
  // showSetup: controls whether the SetupCard overlay is visible
  // reportConfig: null until the user completes setup; populated on submit
  const [showSetup, setShowSetup]       = useState(false);
  const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);

  const { conversations, createConversation } = useConversations();
  const { files } = useGeneratedFiles();

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  function requireAuth() {
    if (!user) {
      setAuthOpen(true);
      return false;
    }
    return true;
  }

  function handleSend() {
    if (!requireAuth()) return;
    // real send logic goes here once the chat API route exists
  }

  function handleUploadClick() {
    if (!requireAuth()) return;
    // real upload logic goes here
  }

  // ── New chat: require auth, then show setup card ─────────────────────────
  async function handleNewChat() {
    if (!requireAuth()) return;
    setShowSetup(true);
  }

  // ── Setup complete: store config, create conversation, close card ─────────
  async function handleSetupComplete(config: ReportConfig) {
    setReportConfig(config);
    setShowSetup(false);

    const conv = await createConversation();
    if (conv) {
      setActiveConversationId(conv.id);
      setView("chats");
    }

    // TODO (Phase 6): pass config + config.file to the agent endpoint here.
    // The agent receives reportName, primaryColor, accentColor, headingFont,
    // bodyFont, instructions, and the uploaded file as multipart form data.
  }

  // ── Setup cancelled: just close the card ─────────────────────────────────
  function handleSetupCancel() {
    setShowSetup(false);
  }

  function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    setView("chats");
  }

  function handleNavigateToChat(conversationId: string) {
    setActiveConversationId(conversationId);
    setView("chats");
  }

  return (
    <div className="ll-root">
      <Sidebar
        user={user}
        view={view}
        setView={setView}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onRequireAuth={requireAuth}
        onSignOut={() => setSignOutOpen(true)}
      />

      {view === "chats" && (
        <>
          <ChatPanel
            user={user}
            activeConversation={activeConversation}
            onRequireAuth={requireAuth}
            onUploadClick={handleUploadClick}
            onSend={handleSend}
          />
          <PreviewPanel
            user={user}
            revenueData={mockRevenueData}
          />
        </>
      )}

      {view === "dashboard" && (
        <Dashboard
          user={user}
          conversations={conversations}
          files={files}
          onNavigateToChat={handleNavigateToChat}
        />
      )}

      {/* ── Setup card — rendered above everything else when active ───────── */}
      {showSetup && (
        <SetupCard
          onComplete={handleSetupComplete}
          onCancel={handleSetupCancel}
        />
      )}

      <AuthModal    open={authOpen}    onClose={() => setAuthOpen(false)}    />
      <SignOutModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}