"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { GeneratedFile } from "@/lib/types";

export function useGeneratedFiles() {
  const { user } = useAuth();
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("generated_files")
      .select("id, storage_path, created_at, status, conversation_id, conversations(title)")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setFiles(
        data.map((f: any) => ({
          id: f.id,
          storage_path: f.storage_path,
          created_at: f.created_at,
          status: f.status,
          conversation_id: f.conversation_id,
          conversation_title: f.conversations?.title ?? null,
        }))
      );
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { files, loading, refresh };
}