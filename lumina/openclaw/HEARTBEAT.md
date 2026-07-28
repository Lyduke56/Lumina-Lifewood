# HEARTBEAT.md — Lumina Scheduled Tasks

## Daily Backend Health Check (every 8 hours)

Check that the Lumina MCP backend is reachable:
- Call `ping()` on the `lumina-backend` MCP server
- If `ping` returns `pong` → log to `memory/heartbeat-state.json` with timestamp, take no user-facing action
- If `ping` fails → write a note to `memory/YYYY-MM-DD.md` noting the backend was unreachable at this time

Do NOT message any user or WhatsApp channel with health check results. These are internal only.

## Weekly Summary (every Monday at 9:00 AM)

Once per week:
- Read recent `memory/YYYY-MM-DD.md` files from the past 7 days
- Identify recurring issues (e.g. repeated file format errors, unregistered phones)
- Fold useful insights into `MEMORY.md` (e.g. which users have common issues)
- Remove daily notes older than 14 days

## Reminder: Never Leak Internal Diagnostics

Heartbeat results, ping responses, memory index messages, and backend status checks must NEVER appear in any WhatsApp chat. Log them only to the memory files above.
