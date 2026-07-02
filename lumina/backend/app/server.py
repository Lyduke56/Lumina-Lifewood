from fastmcp import FastMCP

from excel_parser import load_production_plan, build_dashboard_stub
from supabase_client import save_dataset, save_generated_file
from pbib_generator import generate_pbip

mcp = FastMCP("Lumina Backend")


@mcp.tool
def ping() -> str:
    """Health check tool to confirm the MCP server is running."""
    return "pong"


@mcp.tool
def process_production_plan(file_path: str) -> dict:
    """Parse a production-plan Excel file, store it, and generate a real PBIP dashboard.

    Args:
        file_path: Path to the .xlsx production plan file on disk.
    """
    records = load_production_plan(file_path)
    dataset = save_dataset(source_file_path=file_path, parsed_rows=records)

    layout_json, chart_preview_json = build_dashboard_stub(records)
    output_dir = generate_pbip(records, dataset_id=dataset["id"])

    generated_file = save_generated_file(
        dataset_id=dataset["id"],
        layout_json=layout_json,
        chart_preview_json=chart_preview_json,
        storage_path=str(output_dir),
    )

    return {
        "dataset_id": dataset["id"],
        "generated_file_id": generated_file["id"],
        "record_count": len(records),
        "pbip_path": str(output_dir),
    }


if __name__ == "__main__":
    mcp.run()
