-- Applied to Supabase on 30 July 2026. Recorded here because it was not before: the
-- schema had only ever been changed by hand in the dashboard, so nothing in the repository
-- said what shape the database is meant to be. A second developer, or a rebuilt project,
-- had no way to find out but to look.
--
-- Safe to run again; every statement is conditional.

-- ── A report with no preview is a fact, not an error ─────────────────────────
-- The conversation does not produce a chart preview yet, because the preview still reads
-- the old fixed column names. This column demanded one, so every finished report failed
-- to save — which is what made the agent build the same report over and over: it was
-- told its build had failed, and tried again.
alter table public.generated_files
  alter column chart_preview_json drop not null;

-- ── Remembering a conversation between visits ───────────────────────────────
-- Leaving the chat and coming back showed an empty page. `agent_history` holds the
-- agent's own working memory, so a follow-up still knows what was agreed rather than
-- merely looking as though it does; `workbook_path` so a resumed conversation knows
-- which spreadsheet it is about.
alter table public.conversations
  add column if not exists agent_history jsonb,
  add column if not exists workbook_path text;

-- ── What was said ───────────────────────────────────────────────────────────
-- `messages` has existed since before this work began and had never been written to.
-- `payload` carries the parts of a conversation that are not plain text: the detail
-- under a step, and a finished report offered as a download.
alter table public.messages
  add column if not exists payload jsonb;

-- Ordering. Everything written in one batch shares a timestamp to the microsecond, so
-- ordering a conversation by created_at shuffles it into nonsense.
alter table public.messages
  add column if not exists seq bigserial;

create index if not exists messages_conversation_seq
  on public.messages (conversation_id, seq);
