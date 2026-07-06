import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_client = None


def get_client():
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _client


def save_dataset(
    source_file_path: str, parsed_rows: list[dict], conversation_id: str | None = None
) -> dict:
    """Insert a parsed production plan into the datasets table."""
    client = get_client()
    result = (
        client.table("datasets")
        .insert(
            {
                "conversation_id": conversation_id,
                "source_file_path": source_file_path,
                "parsed_rows": parsed_rows,
            }
        )
        .execute()
    )
    return result.data[0]


def save_generated_file(
    dataset_id: str,
    layout_json: dict,
    chart_preview_json: dict,
    conversation_id: str | None = None,
    storage_path: str = "stub://not-yet-generated",
) -> dict:
    """Insert a (stub) dashboard output row into generated_files."""
    client = get_client()
    result = (
        client.table("generated_files")
        .insert(
            {
                "conversation_id": conversation_id,
                "dataset_id": dataset_id,
                "storage_path": storage_path,
                "layout_json": layout_json,
                "chart_preview_json": chart_preview_json,
                "status": "ready",
            }
        )
        .execute()
    )
    return result.data[0]


import shutil
import tempfile
from pathlib import Path


def get_conversation_owner(conversation_id: str) -> str:
    """Look up the user_id that owns a conversation."""
    client = get_client()
    result = (
        client.table("conversations")
        .select("user_id")
        .eq("id", conversation_id)
        .execute()
    )
    return result.data[0]["user_id"]


def upload_generated_file(local_dir: Path, user_id: str, dataset_id: str) -> str:
    """Zip a generated PBIP folder and upload it to the generated-files bucket.

    Returns the object path within the bucket, e.g.
    "{user_id}/{dataset_id}/production_plan_reference.zip" — the first path
    segment must be the owning user's ID to satisfy the storage RLS policy.
    """
    client = get_client()
    zip_base = Path(tempfile.mkdtemp()) / dataset_id
    shutil.make_archive(str(zip_base), "zip", root_dir=local_dir)

    object_path = f"{user_id}/{dataset_id}/production_plan_reference.zip"
    with open(f"{zip_base}.zip", "rb") as f:
        client.storage.from_("generated-files").upload(
            object_path,
            f.read(),
            file_options={"content-type": "application/zip"},
        )
    return object_path


def get_authenticated_user_id(access_token: str) -> str:
    """Verify a Supabase user access token and return the owning user_id."""
    client = get_client()
    try:
        response = client.auth.get_user(access_token)
    except Exception as e:
        raise ValueError("Your session has expired. Please log in again.") from e
    if not response or not response.user:
        raise ValueError("Your session has expired. Please log in again.")
    return response.user.id


def verify_conversation_owner(conversation_id: str, user_id: str) -> None:
    """Raise ValueError if `conversation_id` does not belong to `user_id`."""
    owner_id = get_conversation_owner(conversation_id)
    if owner_id != user_id:
        raise ValueError("You don't have access to this conversation.")


if __name__ == "__main__":
    import sys
    from excel_parser import load_production_plan

    path = sys.argv[1]
    records = load_production_plan(path)
    row = save_dataset(source_file_path=path, parsed_rows=records)
    print(f"Saved dataset id={row['id']} with {len(records)} records")
