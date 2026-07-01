// src/lib/supabase/queries.ts
import { createClient } from "@/lib/supabase/server";

export async function getConversations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}