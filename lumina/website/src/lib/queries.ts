// Server-side data access. Use these from Server Components or API routes.
// For client components use the hooks in src/hooks/ instead.
import { createClient } from "@/lib/supabase/server";
import type { Conversation, GeneratedFile, Profile } from "@/lib/types";

// ── Conversations ─────────────────────────────────────────────────────────────

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

export async function createConversation(): Promise<Conversation> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, title: null })
    .select("id, title, created_at")
    .single();

  if (error) throw error;
  return { ...data, message_count: 0 };
}

// ── Generated files ───────────────────────────────────────────────────────────

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

// ── Profiles ──────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data as Profile;
}

export async function upsertProfile(
  userId: string,
  fields: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>
): Promise<Profile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...fields })
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}

// ── Avatar upload (client-side only — needs auth session) ─────────────────────
// Called from AuthContext or Settings after the user is authenticated.
// Returns the public URL of the uploaded avatar.
export async function uploadAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File
): Promise<string> {
  const ext  = file.name.split(".").pop();
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}