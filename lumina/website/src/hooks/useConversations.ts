"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import type { ChatSummary } from "@/lib/types";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/**
 * The customer's past conversations, for the sidebar to list.
 *
 * Read from the backend rather than straight from the database, unlike useGeneratedFiles
 * beside it. Deciding what a conversation looks like in a list means reading its messages
 * for the last thing said and leaving out the ones nobody spoke in — judgement that
 * already exists on the server and should not be written a second time here.
 *
 * Replaces an earlier hook of this name that nothing imported: it listed conversations
 * straight from the table and could also create empty ones, which is not how a
 * conversation begins any more — uploading a workbook is.
 */
export function useConversations() {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setChats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setChats([]);
        return;
      }
      const res = await fetch(`${BACKEND}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      setChats(body.chats ?? []);
    } catch {
      // An empty list is a poor outcome, not a broken page.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { chats, loading, refresh };
}
