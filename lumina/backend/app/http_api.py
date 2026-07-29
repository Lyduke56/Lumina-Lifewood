import json
import shutil
import tempfile
from pathlib import Path

from fastapi import Body, FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import agent
import conversations
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

    conversation = conversations.start(owner, workbook)
    return {
        "conversation_id": conversation.id,
        "workbook": workbook.name,
        # The opening message is written here rather than asked of the model: it is the
        # same every time, and a free tier's requests are worth saving for real work.
        "greeting": (
            f"I have your file, {workbook.name}. Tell me what you would like to see, "
            f"or just say 'go ahead' and I will suggest something."
        ),
    }


@app.post("/conversation/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    message: str = Body(..., embed=True),
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

    opening = message
    if conversation.workbook and not conversation.history:
        # The agent's tools take a path, and the customer should never see one.
        opening = f"{message}\n\n(The workbook is at {conversation.workbook})"

    def stream():
        try:
            for event in agent.respond(conversation.history, opening):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:  # a failed reply must not look like a hung page
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
