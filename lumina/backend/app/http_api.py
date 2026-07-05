import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from server import run_pipeline
from supabase_client import get_authenticated_user_id, verify_conversation_owner

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


@app.post("/generate-dashboard")
async def generate_dashboard(
    file: UploadFile,
    conversation_id: str = Form(...),
    report_type: str = Form("Progress Overview"),
    report_name: str = Form(""),
    instructions: str = Form(""),
    primary_color: str = Form("#133020"),
    accent_color: str = Form("#FFB347"),
    heading_font: str = Form("Fraunces"),
    body_font: str = Form("DM Sans"),
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
            primary_color,
            accent_color,
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
