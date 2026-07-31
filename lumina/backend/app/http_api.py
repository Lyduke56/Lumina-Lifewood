import json
import shutil
import tempfile
from pathlib import Path

from fastapi import Body, FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import agent
import conversations
import workbench
from supabase_client import get_client
from server import run_pipeline
from supabase_client import get_authenticated_user_id, verify_conversation_owner

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/generate-dashboard")
async def generate_dashboard(
    file: UploadFile,
    conversation_id: str = Form(...),
    report_type: str = Form("Progress Overview"),
    report_name: str = Form(""),
    instructions: str = Form(""),
    data_colors: list[str] = Form([]),
    heading_font: str = Form("Manrope SemiBold"),
    body_font: str = Form("Manrope"),
    good_threshold: float | None = Form(None),
    neutral_threshold: float | None = Form(None),
    authorization: str = Header(...),
):
    """Thin HTTP entry point for the web frontend's SetupCard modal. Accepts a
    multipart upload, verifies the caller actually owns the given conversation,
    then runs the same pipeline the MCP tool uses.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or malformed Authorization header."
        )
    access_token = authorization.removeprefix("Bearer ")

    try:
        user_id = get_authenticated_user_id(access_token)
        verify_conversation_owner(conversation_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    temp_dir = Path(tempfile.mkdtemp())
    temp_path = temp_dir / file.filename

    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        result = run_pipeline(
            str(temp_path),
            conversation_id,
            report_type,
            report_name,
            instructions or None,
            data_colors or None,
            heading_font,
            body_font,
            good_threshold,
            neutral_threshold,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return result


# ── The conversation (Decision 1) ────────────────────────────────────────────
#
# Added alongside /generate-dashboard rather than replacing it. Decision 9: the
# conveyor belt keeps serving both the website and WhatsApp untouched until a surface
# is deliberately pointed here.


def _caller(authorization: str) -> str:
    """The Supabase user making the request, or a 401/403."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header.")
    try:
        return get_authenticated_user_id(authorization.removeprefix("Bearer "))
    except ValueError as e:
        raise HTTPException(403, str(e))


def _shaped(conversation_id: str) -> list[dict]:
    """A saved conversation, arranged the way the browser draws it.

    Shaped here rather than in the website so that both know one arrangement of a
    conversation, not two. Consecutive steps are grouped into a single run of work,
    which is how they appeared and how they read afterwards.
    """
    said = (
        get_client()
        .table("messages")
        .select("role, content, payload")
        .eq("conversation_id", conversation_id)
        .order("seq")
        .execute()
    )

    entries: list[dict] = []
    # Which model was last named. The model is stored against every row, but shown as its
    # own row once and again only when it changes — the same rule the live conversation
    # applies, so a chat looks the same whether it is being watched or read back.
    announced: str | None = None

    def announce(model: str | None) -> None:
        nonlocal announced
        if not model or model == announced:
            return
        announced = model
        row = {"tool": "model", "detail": model, "done": True, "notice": True}
        if entries and entries[-1]["kind"] == "steps":
            entries[-1]["steps"].append(row)
        else:
            entries.append({"kind": "steps", "steps": [row]})

    for m in said.data:
        payload = m.get("payload") or {}
        if not payload.get("notice"):
            announce(payload.get("model"))
        if m["role"] == "step":
            step = {
                "tool": m["content"],
                "detail": payload.get("detail"),
                "done": True,
                "notice": payload.get("notice", False),
                "outcome": payload.get("outcome", "ok"),
            }
            if entries and entries[-1]["kind"] == "steps":
                entries[-1]["steps"].append(step)
            else:
                entries.append({"kind": "steps", "steps": [step]})
        else:
            entries.append(
                {
                    "kind": "said",
                    "role": m["role"],
                    "text": m["content"],
                    "report": payload.get("report"),
                    # Reopening a conversation shows the screenshots that were sent with
                    # it, or a message asking to move a chart reads as though it arrived
                    # with nothing to point at.
                    "images": payload.get("images"),
                }
            )
    return entries


def _described(row: dict, entries: list[dict]) -> dict:
    workbook = Path(row["workbook_path"]).name if row.get("workbook_path") else None
    return {
        "conversation_id": row["id"],
        "title": row.get("title"),
        "workbook": workbook,
        # A conversation can be read back long after the uploaded spreadsheet has gone
        # from temporary storage. Better to say so than to let a follow-up fail obscurely.
        "workbook_available": bool(
            row.get("workbook_path") and Path(row["workbook_path"]).exists()
        ),
        "entries": entries,
    }


def _owned(conversation_id: str, owner: str) -> dict:
    """The conversation row, or a 404 that does not reveal whose it is."""
    found = (
        get_client()
        .table("conversations")
        .select("id, title, workbook_path, user_id")
        .eq("id", conversation_id)
        .limit(1)
        .execute()
    )
    if not found.data or found.data[0]["user_id"] != owner:
        raise HTTPException(404, "No conversation with that id.")
    return found.data[0]


@app.get("/conversations")
async def list_conversations(authorization: str = Header(...)) -> dict:
    """Every conversation this customer has had, newest first.

    The sidebar used to list finished reports, which duplicated the Files tab and gave no
    way back into a past conversation. It lists these instead.

    Conversations nobody spoke in are left out. Building a report through the tools
    directly creates one, and a list of empty rows is worse than no list.
    """
    owner = _caller(authorization)
    rows = (
        get_client()
        .table("conversations")
        .select("id, title, workbook_path, created_at")
        .eq("user_id", owner)
        .order("created_at", desc=True)
        .limit(60)
        .execute()
    )

    chats = []
    for row in rows.data:
        said = (
            get_client()
            .table("messages")
            .select("role, content, created_at")
            .eq("conversation_id", row["id"])
            .order("seq", desc=True)
            .limit(30)
            .execute()
        )
        spoken = [m for m in said.data if m["role"] in ("you", "lumina") and m["content"]]
        if not spoken:
            continue
        chats.append(
            {
                "id": row["id"],
                "title": row.get("title") or "Untitled",
                "created_at": row["created_at"],
                "last_at": said.data[0]["created_at"],
                # The most recent thing said, so a customer recognises which chat this is
                # without opening it — the same reason a messaging app shows one.
                "preview": spoken[0]["content"][:120],
                "messages": len(spoken),
            }
        )
    return {"chats": chats}


@app.get("/conversation/latest")
async def latest_conversation(authorization: str = Header(...)) -> dict:
    """The conversation this customer was last having, ready to put back on screen."""
    owner = _caller(authorization)
    # Several recent ones, because the newest is not necessarily one anybody spoke in.
    # Building a report through the tools directly creates a conversation row without a
    # word being said in it, and restoring one of those showed a customer nothing but a
    # warning that their spreadsheet had expired — which looked exactly like a fault.
    recent = (
        get_client()
        .table("conversations")
        .select("id, title, workbook_path")
        .eq("user_id", owner)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    for row in recent.data:
        entries = _shaped(row["id"])
        if entries:
            return _described(row, entries)
    return {"conversation_id": None}


@app.get("/conversation/{conversation_id}")
async def read_conversation(
    conversation_id: str, authorization: str = Header(...)
) -> dict:
    """One particular conversation, so a customer can go back into it."""
    owner = _caller(authorization)
    row = _owned(conversation_id, owner)
    return _described(row, _shaped(conversation_id))


@app.delete("/conversation/{conversation_id}")
async def delete_conversation(
    conversation_id: str, authorization: str = Header(...)
) -> dict:
    """Delete a conversation, and with it any report built during it.

    The reports go too, and unavoidably: everything in the database hangs off the
    conversation, so removing it cascades them away. Their files are cleared from storage
    first, because a file with no record left pointing at it can never be found again.
    """
    owner = _caller(authorization)
    _owned(conversation_id, owner)

    reports = (
        get_client()
        .table("generated_files")
        .select("storage_path")
        .eq("conversation_id", conversation_id)
        .execute()
    )
    paths = [r["storage_path"] for r in reports.data if r.get("storage_path")]
    if paths:
        get_client().storage.from_("generated-files").remove(paths)

    get_client().table("conversations").delete().eq("id", conversation_id).execute()
    conversations._conversations.pop(conversation_id, None)
    return {"deleted": conversation_id, "reports_removed": len(paths)}


@app.post("/conversation")
async def begin_conversation(
    file: UploadFile,
    authorization: str = Header(...),
) -> dict:
    """Upload a workbook and start a conversation about it.

    The file is written somewhere the agent can reach, since its tools take a path.
    """
    owner = _caller(authorization)

    folder = Path(tempfile.mkdtemp(prefix="lumina-"))
    workbook = folder / (file.filename or "workbook.xlsx")
    with open(workbook, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # The website lists files by conversation, so the report needs one to belong to.
    conversation = conversations.start(owner, workbook, Path(workbook.name).stem)

    # The opening message is written here rather than asked of the model: it is the
    # same every time, and a free tier's requests are worth saving for real work.
    greeting = (
        f"I have your file, {workbook.name}. Tell me what you would like to see, "
        f"or just say 'go ahead' and I will suggest something."
    )
    conversations.record(
        conversation.id, [{"role": "lumina", "content": greeting}]
    )
    return {
        "conversation_id": conversation.id,
        "workbook": workbook.name,
        "greeting": greeting,
    }


@app.get("/conversation/{conversation_id}/reports")
async def conversation_reports(
    conversation_id: str, authorization: str = Header(...)
) -> dict:
    """Every report built during this conversation, newest first.

    A conversation can build a report several times — one already holds eighteen — and
    until now the only place they all appeared was the Files tab, mixed in with every
    report from every other conversation. Which of those eighteen came from asking to
    take a chart off, and which came before, was not answerable.
    """
    owner = _caller(authorization)
    try:
        conversation = conversations.get(conversation_id, owner)
    except conversations.ConversationError as e:
        raise HTTPException(404, str(e))

    rows = (
        get_client()
        .table("generated_files")
        .select("id, created_at, storage_path, layout_json, status")
        .eq("conversation_id", conversation.id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    reports = []
    for index, row in enumerate(rows):
        layout = row.get("layout_json") or {}
        reports.append({
            "file_id": row["id"],
            "storage_path": row.get("storage_path") or "",
            "title": layout.get("title") or "Report",
            "created_at": row["created_at"],
            "headline_figures": layout.get("headline_figures") or [],
            "charts": layout.get("charts") or [],
            # Counting up from the first, so the oldest is version 1 however many
            # there are — a number that changes meaning as the list grows is worse
            # than none.
            "version": len(rows) - index,
            "latest": index == 0,
            "downloadable": not str(row.get("storage_path", "")).startswith("stub://"),
        })
    return {"reports": reports}


@app.post("/conversation/{conversation_id}/take-back")
async def take_back(conversation_id: str, authorization: str = Header(...)) -> dict:
    """Forget the last thing the customer said, and what Lumina did about it.

    Stopping a reply on screen is not enough on its own: the message stays in the agent's
    memory and is reasoned about for the rest of the conversation. A stray keystroke
    became an instruction that way.
    """
    owner = _caller(authorization)
    try:
        conversation = conversations.get(conversation_id, owner)
    except conversations.ConversationError as e:
        raise HTTPException(404, str(e))
    return {"restored": conversations.take_back(conversation)}


@app.post("/conversation/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    message: str = Body(..., embed=True),
    images: list[str] = Body(default=[], embed=True),
    authorization: str = Header(...),
) -> StreamingResponse:
    """Say something, and stream back what the agent does about it.

    Streamed rather than returned in one piece because a reply can involve reading a
    workbook and waiting out a rate limit — the customer should see progress, not a
    spinner (Decision 2).
    """
    owner = _caller(authorization)
    try:
        conversation = conversations.get(conversation_id, owner)
    except conversations.ConversationError as e:
        raise HTTPException(404, str(e))

    for picture in images:
        if not picture.startswith(("data:image/png", "data:image/jpeg", "data:image/webp")):
            raise HTTPException(400, "Screenshots must be PNG, JPEG or WebP.")
        # Roughly 4MB of base64 is 3MB of picture, which is beyond what the free models
        # accept and far beyond what a screenshot of a dashboard needs.
        if len(picture) > 4_000_000:
            raise HTTPException(400, "That screenshot is too large. Send a smaller one.")

    opening = message
    if conversation.workbook and not conversation.history:
        # The agent's tools take a path, and the customer should never see one.
        opening = f"{message}\n\n(The workbook is at {conversation.workbook})"

    owner_context = {
        "user_id": conversation.owner,
        "conversation_id": conversation.supabase_id,
    }

    # Saved before the reply is attempted, so a turn that fails halfway still leaves the
    # customer's own words in the record rather than losing the question they asked.
    conversations.record(
        conversation.id,
        [{
            "role": "you",
            "content": message,
            # Kept so reopening the conversation shows the screenshot they sent, not a
            # message that reads as though it arrived with nothing attached.
            **({"payload": {"images": images}} if images else {}),
        }],
    )

    # Where the agent's memory stood before this turn, so taking the turn back can put it
    # exactly there. Measured here rather than trusted to the take-back itself, which may
    # run while the agent is still adding to it.
    memory_before = len(conversation.history)
    conversation.taken_back = False

    def stream():
        # What appeared on screen, kept so that coming back to this conversation shows
        # it again instead of an empty page. Written once at the end of the turn: a
        # round trip per step would slow the very stream it is recording.
        seen: list[dict] = []
        try:
            for event in agent.respond(
                conversation.history, opening, owner_context, images=images
            ):
                if event["type"] == "message":
                    seen.append(
                        {
                            "role": "lumina",
                            "content": event["text"],
                            "payload": {
                                "supplier": event.get("supplier"),
                                "model": event.get("model"),
                            },
                        }
                    )
                elif event["type"] == "tool_finished":
                    seen.append(
                        {
                            "role": "step",
                            "content": event["tool"],
                            "payload": {
                                "detail": event.get("detail"),
                                # Kept, so a step that failed still reads as failed when
                                # the conversation is reopened. Without it a reload turned
                                # every refusal back into a tick — the exact confusion the
                                # red cross exists to prevent.
                                "outcome": event.get("outcome", "ok"),
                                # Which model decided this step, so comparing them is
                                # possible after the fact and not only while watching.
                                "supplier": event.get("supplier"),
                                "model": event.get("model"),
                            },
                        }
                    )
                    if event.get("report"):
                        seen.append(
                            {
                                "role": "lumina",
                                "content": "",
                                "payload": {"report": event["report"]},
                            }
                        )
                elif event["type"] == "notice":
                    seen.append(
                        {
                            "role": "step",
                            "content": event["key"],
                            "payload": {
                                "detail": event.get("detail"),
                                "notice": True,
                            },
                        }
                    )
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:  # a failed reply must not look like a hung page
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        finally:
            if conversation.taken_back:
                # The customer stopped this turn and took back what caused it. Recording
                # it now would put back what they just removed, so the memory goes to
                # where it stood before they spoke and nothing is written to the
                # transcript — the take-back has already cleared that.
                del conversation.history[memory_before:]
                conversation.taken_back = False
                conversations.remember(conversation)
            else:
                conversations.record(conversation.id, seen)
                # The agent's own working memory, so a follow-up after a restart or a day
                # later still knows what was agreed rather than only looking as though it
                # does.
                conversations.remember(conversation)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
