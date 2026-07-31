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
  // chart data for in-app preview
  chart_preview_json: ChartPreviewJson | null;
  layout_json: Record<string, unknown> | null;
  // client-side regen tracking (not persisted)
  regen_count?: number;
};

export type ChartPreviewJson = {
  data_colors?: string[];
  heading_font?: string;
  body_font?: string;
  visuals: Array<{
    type: "card" | "line" | "bar" | "table";
    fields: string[];
  }>;
  records: Array<{
    date: string;
    target_quantity: number | null;
    actual_quantity: number | null;
    target_hours: number | null;
    actual_hours: number | null;
    completion_rate: number | null;
  }>;
};

/**
 * A report built by conversation, describing itself.
 *
 * A different shape from ChartPreviewJson above, which names six fixed figures. That is
 * the limitation Decision 3 removes: a customer counting videos or revenue has no
 * `target_quantity` or `actual_hours`. This carries its own labels and whatever figures
 * the report actually holds. `kind: "flexible"` is how the two are told apart, so
 * existing reports keep being drawn exactly as they are now.
 */
export type FlexiblePreview = {
  kind: "flexible";
  title: string;
  group_by: { key: string; label: string };
  /** Every column the figures are grouped by, in order. A chart may run along any of them. */
  groupings?: Array<{ key: string; label: string }>;
  /** How much of the customer's sheet went into this, for the subtitle. */
  rows_used?: number;
  rows_seen?: number;
  measures: Array<{
    key: string;
    label: string;
    format: "number" | "percent";
    aggregate: "sum" | "max";
  }>;
  /** A rate, and the achieved/planned totals it is made of, so it is never averaged. */
  rates?: Record<string, [string, string]>;
  headline_figures: Array<{ measure: string; label: string }>;
  charts: Array<{ kind: string; title: string; measures: string[]; group_by?: string }>;
  rows: Array<Record<string, string | number | null>>;
  data_colors?: string[];
  heading_font?: string;
  body_font?: string;
};

/**
 * One past conversation, as the sidebar lists it.
 *
 * The sidebar used to list finished reports, which duplicated the Files tab and offered
 * no way back into a conversation. It lists these instead, the way a messaging app does.
 */
export type ChatSummary = {
  id: string;
  title: string;
  created_at: string;
  last_at: string;
  /** The most recent thing said, so a chat is recognisable without opening it. */
  preview: string;
  messages: number;
};

/** Either shape may be stored against a generated file. */
export type AnyPreview = ChartPreviewJson | FlexiblePreview;

export function isFlexible(preview: unknown): preview is FlexiblePreview {
  return !!preview && (preview as FlexiblePreview).kind === "flexible";
}

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
export type FontPresetId  = "manrope" | "inter-inter" | "playfair-inter" | "montserrat-lato" | "fraunces-dm" | "custom";
export type ReportTypeId  = "Progress Overview" | "Executive Summary" | "Detailed Breakdown" | "Custom";

export type ReportConfig = {
  reportName: string;
  reportType: ReportTypeId;
  colorPreset: ColorPresetId;
  dataColors: string[];
  fontPreset: FontPresetId;
  headingFont: string;
  bodyFont: string;
  file: File | null;
  instructions: string;
  goodThreshold: number;
  neutralThreshold: number;
  source: "web" | "whatsapp";
};