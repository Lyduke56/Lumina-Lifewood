"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

// Import your newly extracted components
import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { PreviewPanel } from "./PreviewPanel";
import { Dashboard } from "./Dashboard";
import AuthModal from "./AuthModal";
import SignOutModal from "./SignOutModal";

// Import your mock data from the mocks folder
import { mockRevenueData, mockHistory, mockAllConversations, mockAllFiles } from "@/mocks/data";

type ViewMode = "chats" | "dashboard";

export default function App() {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<ViewMode>("chats");

  function requireAuth() {
    if (!user) {
      setAuthOpen(true);
      return false;
    }
    return true;
  }

  function handleSend() {
    if (!requireAuth()) return;
    // Add real send logic here later
  }

  function handleUploadClick() {
    if (!requireAuth()) return;
    // Add real upload logic here later
  }

  return (
    <div className="ll-root">
      
      <Sidebar 
        user={user}
        view={view}
        setView={setView}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        history={mockHistory}
        onRequireAuth={requireAuth}
        onSignOut={() => setSignOutOpen(true)}
      />

      {view === "chats" && (
        <>
          <ChatPanel 
            user={user}
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
          conversations={mockAllConversations}
          files={mockAllFiles}
          onNavigateToChat={() => setView("chats")}
        />
      )}

      {/* Modals remain exactly as they were */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SignOutModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}