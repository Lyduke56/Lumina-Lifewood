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

// ── Report configuration produced by SetupCard ───────────────────────────────
// Populated via the web setup card or incrementally via the WhatsApp bot.
// Passed to the agent as initial context before the first chat message.

export type ColorPresetId = "lifewood" | "plum-citrus" | "slate-coral" | "custom";
export type FontPresetId  = "inter-inter" | "playfair-inter" | "montserrat-lato" | "fraunces-dm" | "custom";

export type ReportConfig = {
  // Basic
  reportName: string;

  // Theme
  colorPreset: ColorPresetId;
  primaryColor: string;   // hex — derived from preset or entered manually
  accentColor: string;    // hex — derived from preset or entered manually

  // Typography
  fontPreset: FontPresetId;
  headingFont: string;    // e.g. "Fraunces"
  bodyFont: string;       // e.g. "DM Sans"

  // Data
  file: File | null;

  // Optional
  instructions: string;

  // Source — lets the UI know whether config arrived from web or WhatsApp
  source: "web" | "whatsapp";
};