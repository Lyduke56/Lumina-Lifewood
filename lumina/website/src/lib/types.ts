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

// ── User profile (mirrors public.profiles table) ─────────────────────────────
export type Profile = {
  id: string;
  full_name: string | null;
  username: string;
  contact_number: string | null;
  organization: string | null;
  avatar_url: string | null; // null = render initials client-side
  created_at: string;
  updated_at: string;
};

// ── Report configuration produced by SetupCard ───────────────────────────────
export type ColorPresetId = "lifewood" | "plum-citrus" | "slate-coral" | "custom";
export type FontPresetId  = "inter-inter" | "playfair-inter" | "montserrat-lato" | "fraunces-dm" | "custom";
export type ReportTypeId  = "Progress Overview" | "Executive Summary" | "Detailed Breakdown" | "Custom";

export type ReportConfig = {
  reportName: string;
  reportType: ReportTypeId;
  colorPreset: ColorPresetId;
  primaryColor: string;
  accentColor: string;
  fontPreset: FontPresetId;
  headingFont: string;
  bodyFont: string;
  file: File | null;
  instructions: string;
  source: "web" | "whatsapp";
};
