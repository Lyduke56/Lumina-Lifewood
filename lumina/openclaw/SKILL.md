# SKILL.md - Lumina Production Plan Handler (WhatsApp)

Activate this skill when a WhatsApp user sends a production plan `.xlsx` file.

---

## Prerequisites

- The Lumina MCP server (`lumina-backend`) must be connected and reachable.
- Health check: `ping` → expect `"pong"`. If the ping fails, report backend unavailability to the user and do not proceed.

---

## When to Activate

- User attaches an `.xlsx` file (with or without a caption).
- User explicitly asks to generate a dashboard, report, or Power BI file from an uploaded plan.

---

## Hard Rules (Never Break These)

- **Do NOT** parse `.xlsx` files with generic file-read, shell, or spreadsheet tools. The backend uses openpyxl/pandas — pass the file path directly.
- **Do NOT** use `media://` attachment references. They are unreliable. Always use the **absolute filesystem path** from the inbound media log or attachment metadata.
- **Do NOT** offer CSV, PDF, or screenshot workarounds. Only `.xlsx` is supported.
- **Do NOT** invent a `conversation_id` — always obtain one via `get_or_create_conversation`.
- **Do NOT** show raw storage paths (e.g. `/media/uuid/...`) in any user-facing reply.
- **Do NOT** ask the user for confirmation before processing. Act immediately.
- **Do NOT** output internal health check results, ping responses, memory index messages, or any backend status information into the WhatsApp chat. These are developer-only diagnostics and must never appear in user-facing messages.

---

## Step-by-Step Workflow

### Step 1 — Acknowledge Immediately
Before running any tool, send a brief acknowledgement to the user:
> ✨ Got your file. Processing now — I'll confirm when your dashboard is ready.

This prevents the user from thinking nothing happened while the backend runs.

### Step 2 — Identify the Sender
Extract the sender's phone number from the WhatsApp session metadata (the `from` / sender field OpenClaw provides).

### Step 3 — Resolve the File Path
- Inbound WhatsApp media files land under `~/.openclaw/media/inbound/`
- Use the full absolute path exactly as provided in the attachment log
- Do NOT attempt to read, list, or verify the file yourself — pass the path directly to the backend tool

### Step 4 — Get or Create a Conversation
```
lumina-backend__get_or_create_conversation(phone_number="<sender phone>")
```
- Save the returned `conversation_id`
- **If this fails with "No Lumina account is linked":**
  > Your WhatsApp number isn't linked to a Lumina account. Please sign up at https://lumina-lifewood.vercel.app using this same contact number to get started.

### Step 5 — Extract Report Preferences (if any)
Check whether the user's message caption includes any of the following:
- **Report title** (e.g. "call this March Production Summary")
- **Color preferences** (e.g. "use blue and white")
- **Font preferences** (e.g. "use Arial")
- **Report type** (default: "Progress Overview")
- **Special instructions** (e.g. "highlight rows below 80% completion")

If no preferences are given, use Lifewood defaults (forest green + amber palette, Fraunces + DM Sans fonts).

### Step 6 — Process the File
Execute immediately. Do not ask for confirmation.
```
lumina-backend__process_production_plan(
  file_path="<absolute path to .xlsx>",
  conversation_id="<from Step 4>",
  report_type="Progress Overview",
  report_name="<optional title from user message>",
  instructions="<optional free-text instructions from user>"
)
```

### Step 7 — Reply with the Result

**On success:**
> ✨ Done! Your production plan has been processed — **{record_count} daily records** parsed and your Progress Overview dashboard is ready.
>
> Saved to your Lumina account: **{user_profile.display_name}** ({user_profile.email})
>
> Log in to view and download it: https://lumina-lifewood.vercel.app

If `user_profile.email` is null, omit the email and just say:
> Saved to your Lumina account: **{user_profile.display_name}**

**On failure — invalid file format (no date column, wrong structure):**
> Your file couldn't be processed. Lumina requires dates in Column A (formatted as actual dates, not text) and quantity/hours data in the following columns. Please correct the file and resend it.

**On failure — backend unreachable:**
> The Lumina backend is currently unavailable. Please try again in a few minutes. If the issue persists, contact your Lifewood administrator.

**On failure — unregistered phone:**
> Your WhatsApp number isn't linked to a Lumina account. Please sign up at https://lumina-lifewood.vercel.app using this same contact number to get started.

**On failure — multi-sheet file:**
> Your file contains multiple data sheets. Lumina requires a single consolidated sheet. Please remove the extra sheets and resend the file.

---

## Optional Customizations

If the user specifies customizations in their message, pass them into `process_production_plan`. Examples:

| User says | What to pass |
|-----------|-------------|
| "Title it March Plan" | `report_name="March Plan"` |
| "Use blue and white colors" | `instructions="Use blue and white color palette"` |
| "Highlight anything below 80%" | `instructions="Apply red conditional formatting for completion rate below 80%"` |

When in doubt about the intent of an instruction, pass it as free text in the `instructions` field. The backend's AI layer will interpret it.

---

## File Format Reference (for error explanation)

When explaining file errors to users, use plain language:
- **"Date column missing"** → Column A must contain real Excel date values (not text like "Jan 1" or "01/01")
- **"Multiple sheets"** → The file must have exactly one data sheet
- **"No numeric data found"** → The file must have columns containing target and actual quantities or hours

---

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `ping` | Confirm the backend is alive before processing |
| `lumina-backend__get_or_create_conversation` | Match the sender's phone number to their Supabase account and conversation |
| `lumina-backend__process_production_plan` | Parse the Excel file, generate the PBIP dashboard, upload to storage |
