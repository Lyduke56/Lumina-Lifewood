from fastmcp import FastMCP

from excel_parser import load_production_plan, build_dashboard_stub
from supabase_client import (
    save_dataset,
    save_generated_file,
    get_conversation_owner,
    upload_generated_file,
)
from pbib_generator import generate_pbip

mcp = FastMCP("Lumina Backend")


@mcp.tool
def ping() -> str:
    """Health check tool to confirm the MCP server is running."""
    return "pong"


@mcp.tool
def process_production_plan(file_path: str, conversation_id: str) -> dict:
    """Parse a production-plan Excel file, store it, and generate a real PBIP dashboard.

    Args:
        file_path: Path to the .xlsx production plan file on disk.
        conversation_id: The conversation this file belongs to (determines the owning user).
    """
    user_id = get_conversation_owner(conversation_id)

    records = load_production_plan(file_path)
    dataset = save_dataset(
        source_file_path=file_path, parsed_rows=records, conversation_id=conversation_id
    )

    layout_json, chart_preview_json = build_dashboard_stub(records)
    output_dir = generate_pbip(records, dataset_id=dataset["id"])
    object_path = upload_generated_file(
        output_dir, user_id=user_id, dataset_id=dataset["id"]
    )

    generated_file = save_generated_file(
        dataset_id=dataset["id"],
        layout_json=layout_json,
        chart_preview_json=chart_preview_json,
        storage_path=object_path,
        conversation_id=conversation_id,
    )

    return {
        "dataset_id": dataset["id"],
        "generated_file_id": generated_file["id"],
        "record_count": len(records),
        "storage_path": object_path,
    }


if __name__ == "__main__":
    mcp.run()
