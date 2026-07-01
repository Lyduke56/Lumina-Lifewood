from fastmcp import FastMCP

from excel_parser import load_production_plan
from supabase_client import save_dataset

mcp = FastMCP("Lumina Backend")


@mcp.tool
def ping() -> str:
    """Health check tool to confirm the MCP server is running."""
    return "pong"


@mcp.tool
def process_production_plan(file_path: str) -> dict:
    """Parse a production-plan Excel file and store it as a dataset.

    Args:
        file_path: Path to the .xlsx production plan file on disk.
    """
    records = load_production_plan(file_path)
    dataset = save_dataset(source_file_path=file_path, parsed_rows=records)
    return {
        "dataset_id": dataset["id"],
        "record_count": len(records),
    }


if __name__ == "__main__":
    mcp.run()
