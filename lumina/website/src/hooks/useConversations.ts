"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Conversation } from "@/lib/types";

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at, messages(count)")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setConversations(
        data.map((c: any) => ({
          id: c.id,
          title: c.title,
          created_at: c.created_at,
          message_count: c.messages?.[0]?.count ?? 0,
        }))
      );
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createConversation(): Promise<Conversation | null> {
    if (!user) return null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: null })
      .select("id, title, created_at")
      .single();

    if (error || !data) return null;
    const created: Conversation = { ...data, message_count: 0 };
    setConversations((prev) => [created, ...prev]);
    return created;
  }

  return { conversations, loading, refresh, createConversation };
}