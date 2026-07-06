# Copy these lines into your OpenClaw workspace AGENTS.md (or merge with existing rules).

## Lumina backend (MCP)

When a WhatsApp user uploads a production plan `.xlsx`, follow the **Lumina Production Plan Handler** skill:

1. Call `get_or_create_conversation` with the sender's phone number.
2. Call `process_production_plan` with the **absolute** inbound file path and the returned `conversation_id`.
3. Reply with record count and a link/reminder to check the Lumina web dashboard.

Never parse Excel locally. Never use `media://` paths. If the MCP backend is unreachable, say so honestly — do not pretend processing succeeded.

## Output discipline (WhatsApp)

- Never leak internal file lists, tool traces, or reasoning into WhatsApp replies.
- Keep replies short and user-facing.
- On errors, state what failed and what the user should do next.
