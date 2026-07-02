"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { PreviewPanel } from "./PreviewPanel";
import { Dashboard } from "./Dashboard";
import AuthModal from "./AuthModal";
import SignOutModal from "./SignOutModal";

import { useConversations } from "@/hooks/useConversations";
import { useGeneratedFiles } from "@/hooks/useGeneratedFiles";

// revenueData stays mock for now — it's chart output tied to AI generation,
// which isn't wired up yet (Phase 6). Everything session/user-bound
// (conversations, generated files) is now real.
import { mockRevenueData } from "@/mocks/data";

type ViewMode = "chats" | "dashboard";

export default function App() {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<ViewMode>("chats");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

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

  async function handleNewChat() {
    if (!requireAuth()) return;
    const conv = await createConversation();
    if (conv) {
      setActiveConversationId(conv.id);
      setView("chats");
    }
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

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SignOutModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}