export type Conversation = {
  id: string;
  title: string | null;
  created_at: string;
  message_count: number;
};

export type GeneratedFile = {
  id: string;
  storage_path: string;
  created_at: string;
  status: "compiling" | "ready" | "failed";
  conversation_id: string;
  conversation_title: string | null;
};