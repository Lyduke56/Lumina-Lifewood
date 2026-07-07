# Lumina Production Plan Handler (WhatsApp)

Use this skill when a WhatsApp user sends a production plan Excel file (`.xlsx`).

## Prerequisites

- The Lumina MCP server (`lumina-backend`) must be connected and reachable.
- Confirm with `ping` → expect `"pong"`.

## When to activate

- User attaches an `.xlsx` file (production plan).
- User asks to generate a dashboard, report, or Power BI file from an uploaded plan.

## Do NOT

- Do not parse `.xlsx` with generic file-read or spreadsheet tools — the backend uses pandas/openpyxl.
- Do not use `media://` attachment references — they are unreliable. Always use the **absolute filesystem path** from the inbound media log or attachment metadata.
- Do not offer CSV/screenshot workarounds.
- Do not invent a `conversation_id` — always obtain one via `get_or_create_conversation`.

## Workflow

1. **Identify the sender phone number** from the WhatsApp session metadata (the `from` / sender field OpenClaw provides).

2. **Resolve the file path**
   - Inbound WhatsApp files land under `~/.openclaw/media/inbound/`.
   - Use the full absolute path shown in logs, e.g. `/home/user/.openclaw/media/inbound/abc123/production_plan.xlsx`.
   - Verify the file exists before calling the backend.

3. **Get or create a conversation**
   ```
   get_or_create_conversation(phone_number="<sender phone>")
   ```
   - Save the returned `conversation_id`.
   - If this fails with "No Lumina account is linked", tell the user to sign up on the Lumina web app using the **same contact number** they message from on WhatsApp.

4. **Process the file**
   ```
   process_production_plan(
     file_path="<absolute path to .xlsx>",
     conversation_id="<from step 3>",
     report_type="Progress Overview",
     report_name="<optional title from user message>",
     instructions="<optional free-text from user>"
   )
   ```

5. **Reply on WhatsApp** with a concise summary:
   - Record count (`record_count`)
   - Confirmation the dashboard was generated
   - Mention they can view/download it on the Lumina web dashboard
   - On failure: explain clearly what went wrong (wrong file format, unregistered phone, backend error)

## Example user-facing success message

> Your production plan is processed — **42 daily records** parsed and a Power BI dashboard package is ready. Open the Lumina web app → Dashboard to download it.

## Example user-facing error (unregistered phone)

> I couldn't find a Lumina account for this WhatsApp number. Please sign up at [your Lumina URL] and use the same contact number you message from here.

## Optional: gather report preferences

If the user specifies report type, title, or styling in their message, pass those into `process_production_plan`. Defaults are fine when they just send the file with no instructions.

## MCP tools used

| Tool | Purpose |
|------|---------|
| `ping` | Health check |
| `get_or_create_conversation` | Map WhatsApp phone → Supabase conversation |
| `process_production_plan` | Parse Excel, store data, generate PBIP zip |
