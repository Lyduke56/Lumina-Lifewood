# WhatsApp + OpenClaw Integration Guide

This guide connects your **already-working OpenClaw WhatsApp channel** to the **Lumina Python backend** via MCP (Model Context Protocol).

## Architecture

```
WhatsApp user
    ↓
OpenClaw gateway (WhatsApp channel, AI model, cron)
    ↓  MCP streamable-http
Lumina backend — server.py :8001/mcp
    ↓
Supabase (conversations, datasets, generated_files, storage)
    ↓
Power BI PBIP zip generated
    ↓
OpenClaw replies on WhatsApp + user views file on web dashboard
```

OpenClaw is **transport + conversation AI only**. It never talks to Supabase directly. All data persistence goes through the backend MCP tools.

---

## Part 1 — Backend setup

### 1.1 Prerequisites

- Python 3.11+
- Supabase project with `profiles`, `conversations`, `datasets`, `generated_files` tables
- `.env` file in `lumina/backend/` (copy from `.env.example`)

### 1.2 Install dependencies

```bash
cd lumina/backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 1.3 Configure environment

Create `lumina/backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENROUTER_API_KEY=your-openrouter-key

MCP_TRANSPORT=streamable-http
MCP_HOST=0.0.0.0
MCP_PORT=8001
MCP_PATH=/mcp
```

### 1.4 Start the backend (two services)

| Service | Port | Purpose |
|---------|------|---------|
| `server.py` | **8001** | MCP for OpenClaw / WhatsApp |
| `http_api.py` | **8000** | HTTP API for the Next.js web app |

**Linux / macOS (both at once):**

```bash
cd lumina/backend
chmod +x scripts/start_backend.sh
./scripts/start_backend.sh
```

**Or start separately:**

```bash
cd lumina/backend/app
source ../.venv/bin/activate

# Terminal 1 — MCP (OpenClaw)
python server.py

# Terminal 2 — Web HTTP API
uvicorn http_api:app --host 0.0.0.0 --port 8000
```

**Windows:**

```powershell
cd lumina\backend\scripts
.\start_backend.ps1
```

### 1.5 Verify MCP is running

```bash
curl http://localhost:8001/health
# → ok

# Optional: probe tools with fastmcp CLI if installed
# fastmcp run server.py --transport streamable-http --port 8001
```

MCP endpoint for OpenClaw: **`http://<backend-host>:8001/mcp`**

If OpenClaw and the backend run on the **same machine**, use `http://127.0.0.1:8001/mcp`.

If they run on **different machines**, use the backend server's LAN IP or a tunnel (see Part 4).

### 1.6 Production: run MCP as a systemd service (Linux)

Create `/etc/systemd/system/lumina-mcp.service`:

```ini
[Unit]
Description=Lumina MCP server for OpenClaw
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/Lumina-Lifewood/lumina/backend/app
EnvironmentFile=/path/to/Lumina-Lifewood/lumina/backend/.env
ExecStart=/path/to/Lumina-Lifewood/lumina/backend/.venv/bin/python server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lumina-mcp
sudo systemctl status lumina-mcp
```

---

## Part 2 — Link WhatsApp numbers to Lumina accounts

The backend maps WhatsApp senders to Supabase users via **`profiles.contact_number`**.

### 2.1 User signup flow

1. User registers on the Lumina web app.
2. During signup they enter their **contact number** (same number they'll WhatsApp from).
3. That number is stored in `profiles.contact_number`.

### 2.2 OpenClaw allowlist

Your WhatsApp channel already uses `channels.whatsapp.allowFrom` — only whitelisted numbers can message the bot. **The number in Supabase and in OpenClaw's allowlist must match the same phone.**

### 2.3 What happens on first message

When OpenClaw calls `get_or_create_conversation(phone_number)`:

1. Backend normalizes the phone and looks up `profiles.contact_number`.
2. If found → returns (or creates) a `conversations` row titled `"WhatsApp"`.
3. If not found → error telling the user to sign up on the web app first.

---

## Part 3 — OpenClaw configuration

Assumes OpenClaw is already onboarded with WhatsApp connected (per your progress log).

### 3.1 Register the Lumina MCP server

**Important:** Use `url` + `transport` only. Do **not** set both `command` and `url` — OpenClaw rejects that.

**CLI (recommended):**

```bash
openclaw mcp add lumina-backend \
  --url http://127.0.0.1:8001/mcp \
  --transport streamable-http \
  --timeout 120 \
  --connect-timeout 10
```

If backend is on another host:

```bash
openclaw mcp add lumina-backend \
  --url http://192.168.1.50:8001/mcp \
  --transport streamable-http \
  --timeout 120
```

**Or edit OpenClaw config directly:**

```json
{
  "mcp": {
    "servers": {
      "lumina-backend": {
        "url": "http://127.0.0.1:8001/mcp",
        "transport": "streamable-http",
        "connectTimeout": 10,
        "timeout": 120
      }
    }
  }
}
```

### 3.2 Verify MCP connection

```bash
openclaw mcp status --verbose
openclaw mcp probe lumina-backend
```

You should see tools: `ping`, `get_or_create_conversation`, `process_production_plan`.

Test ping from probe output or by asking the agent to call `ping`.

### 3.3 Install the ClawHub skill

Copy the skill into your OpenClaw workspace:

```bash
cp lumina/openclaw/SKILL.md ~/.openclaw/workspace/skills/lumina-production-plan/SKILL.md
```

Or merge `lumina/openclaw/AGENTS-snippet.md` into your workspace `AGENTS.md`.

Reload OpenClaw / restart the gateway if needed:

```bash
openclaw mcp reload
# or restart the gateway systemd service
sudo systemctl restart openclaw-gateway   # name may vary
```

### 3.4 MCP tools reference

| Tool | Args | Returns |
|------|------|---------|
| `ping` | — | `"pong"` |
| `get_or_create_conversation` | `phone_number` | `{ conversation_id, user_id, created }` |
| `process_production_plan` | `file_path`, `conversation_id`, optional report params | `{ dataset_id, generated_file_id, record_count, storage_path }` |

---

## Part 4 — Network scenarios

### Same server (simplest)

OpenClaw gateway and Lumina backend on one machine:

```
url: http://127.0.0.1:8001/mcp
```

### Backend on a different machine

1. Start backend with `MCP_HOST=0.0.0.0`.
2. Open firewall port 8001 (or put nginx in front).
3. Point OpenClaw at `http://<backend-ip>:8001/mcp`.

### Backend behind HTTPS reverse proxy

```nginx
location /mcp {
    proxy_pass http://127.0.0.1:8001/mcp;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

OpenClaw config:

```json
"url": "https://lumina-api.yourdomain.com/mcp"
```

---

## Part 5 — End-to-end test

### 5.1 Pre-flight checklist

- [ ] Backend MCP running (`curl http://localhost:8001/health` → `ok`)
- [ ] `openclaw mcp probe lumina-backend` lists 3 tools
- [ ] Test WhatsApp number is in `channels.whatsapp.allowFrom`
- [ ] Same number registered in Lumina web app (`profiles.contact_number`)
- [ ] SKILL.md copied to OpenClaw workspace

### 5.2 Test sequence

1. From a **different** WhatsApp number (not self-chat — OpenClaw ignores self-chat by design), send a message: *"Hi Lumina"*
2. Confirm the bot replies normally (validates WhatsApp + model).
3. Send a valid production plan `.xlsx` file.
4. Watch OpenClaw logs for the inbound file path under `~/.openclaw/media/inbound/...`
5. Bot should:
   - Call `get_or_create_conversation` with your phone
   - Call `process_production_plan` with the **absolute** file path
   - Reply with record count and success message
6. Open the Lumina web app → **Dashboard** → confirm the generated file appears.

### 5.3 Manual MCP test (optional)

If the agent doesn't call tools reliably (free-tier models sometimes drop tool calls), test the pipeline directly:

```python
# From lumina/backend/app with venv active
from supabase_client import get_or_create_whatsapp_conversation
from server import run_pipeline

conv = get_or_create_whatsapp_conversation("+639123456789")
print(conv)

result = run_pipeline("/path/to/test.xlsx", conv["conversation_id"])
print(result)
```

---

## Part 6 — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `openclaw mcp probe` times out | MCP not running or wrong URL | Start `python server.py`, check port/firewall |
| "No Lumina account linked" | Phone not in `profiles.contact_number` | User signs up on web with same number |
| "Conversation not found" | Invalid `conversation_id` passed | Always call `get_or_create_conversation` first |
| File not found in pipeline | Used `media://` path | Use absolute path from `~/.openclaw/media/inbound/` |
| Self-chat doesn't work | OpenClaw safety feature | Test from a second phone number |
| Tool calls dropped / no reply | Free OpenRouter model flakiness | Switch to a paid model or retry; stricter AGENTS.md rules |
| Excel parse error | Wrong file format | File must have exactly one data sheet (production plan) |
| Generated file not on web | Different user/conversation | Confirm same phone → same Supabase user |

---

## Part 7 — What changed in this repo

| File | Change |
|------|--------|
| `lumina/backend/app/server.py` | HTTP MCP on port 8001, `get_or_create_conversation` tool, `/health` route |
| `lumina/backend/app/supabase_client.py` | Phone lookup + WhatsApp conversation creation |
| `lumina/backend/app/phone_utils.py` | Phone number normalization/matching |
| `lumina/openclaw/SKILL.md` | OpenClaw skill for `.xlsx` handling |
| `lumina/openclaw/AGENTS-snippet.md` | Rules to merge into workspace AGENTS.md |
| `lumina/backend/.env.example` | Environment template |
| `lumina/backend/scripts/start_backend.*` | Start both HTTP + MCP services |

---

## Quick reference: full integration checklist

1. **Backend:** `.env` → `pip install` → start MCP on `:8001`
2. **Users:** Sign up on web with WhatsApp phone number
3. **OpenClaw:** `openclaw mcp add lumina-backend --url http://127.0.0.1:8001/mcp --transport streamable-http`
4. **OpenClaw:** Copy `SKILL.md` to workspace skills folder
5. **OpenClaw:** Merge `AGENTS-snippet.md` into `AGENTS.md`
6. **Test:** WhatsApp `.xlsx` → bot reply → file on web dashboard
