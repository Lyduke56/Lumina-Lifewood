import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from server import run_pipeline

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
):
    """Thin HTTP entry point for the web frontend's SetupCard modal. Accepts a
    multipart upload, runs the same pipeline the MCP tool uses, and returns the
    result as JSON. Theme/typography fields (colors, fonts) are accepted by the
    frontend but not yet applied to the generated dashboard — separate follow-up.
    """
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
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return result
