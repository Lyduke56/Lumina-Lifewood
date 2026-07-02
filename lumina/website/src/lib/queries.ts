// Server-side data access. Use these from Server Components or API routes.
// For client components (which is where Sidebar/Dashboard currently live),
// use the hooks in src/hooks/ instead — same queries, browser client.
import { createClient } from "@/lib/supabase/server";
import type { Conversation, GeneratedFile } from "@/lib/types";

export async function getConversations(): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, messages(count)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((c: any) => ({
    id: c.id,
    title: c.title,
    created_at: c.created_at,
    message_count: c.messages?.[0]?.count ?? 0,
  }));
}

export async function getGeneratedFiles(): Promise<GeneratedFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("generated_files")
    .select("id, storage_path, created_at, status, conversation_id, conversations(title)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((f: any) => ({
    id: f.id,
    storage_path: f.storage_path,
    created_at: f.created_at,
    status: f.status,
    conversation_id: f.conversation_id,
    conversation_title: f.conversations?.title ?? null,
  }));
}

export async function createConversation(): Promise<Conversation> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, title: null })
    .select("id, title, created_at")
    .single();

  if (error) throw error;
  return { ...data, message_count: 0 };
}