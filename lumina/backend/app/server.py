from fastmcp import FastMCP

from excel_parser import load_production_plan, build_dashboard_preview

from supabase_client import (
    save_dataset,
    save_generated_file,
    get_conversation_owner,
    upload_generated_file,
)
from pbib_generator import generate_pbip, choose_visuals, DEFAULT_VISUALS

mcp = FastMCP("Lumina Backend")


def run_pipeline(
    file_path: str,
    conversation_id: str,
    report_type: str = "Progress Overview",
    report_name: str = "",
    instructions: str | None = None,
    data_colors: list[str] | None = None,
    heading_font: str = "Fraunces",
    body_font: str = "DM Sans",
    good_threshold: float | None = None,
    neutral_threshold: float | None = None,
) -> dict:
    """Parse a production-plan Excel file, store it, and generate a real PBIP dashboard.
    Shared implementation used by both the MCP tool and the HTTP entry point.
    """
    user_id = get_conversation_owner(conversation_id)

    records = load_production_plan(file_path)
    dataset = save_dataset(
        source_file_path=file_path, parsed_rows=records, conversation_id=conversation_id
    )

    layout_json, chart_preview_json = build_dashboard_preview(records)

    try:
        visuals = choose_visuals(report_type, report_name, instructions)
    except Exception:
        visuals = DEFAULT_VISUALS

    output_dir = generate_pbip(
        records,
        dataset_id=dataset["id"],
        visuals=visuals,
        data_colors=data_colors,
        heading_font=heading_font,
        body_font=body_font,
        good_threshold=good_threshold,
        neutral_threshold=neutral_threshold,
    )
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


@mcp.tool
def ping() -> str:
    """Health check tool to confirm the MCP server is running."""
    return "pong"


@mcp.tool
def process_production_plan(
    file_path: str,
    conversation_id: str,
    report_type: str = "Progress Overview",
    report_name: str = "",
    instructions: str = "",
    data_colors: list[str] | None = None,
    heading_font: str = "Fraunces",
    body_font: str = "DM Sans",
    good_threshold: float | None = None,
    neutral_threshold: float | None = None,
) -> dict:
    """Parse a production-plan Excel file, store it, and generate a real PBIP dashboard.

    Args:
        file_path: Path to the .xlsx production plan file on disk.
        conversation_id: The conversation this file belongs to (determines the owning user).
        report_type: Which report type the dashboard should be built for (drives AI chart selection).
        report_name: The user-provided title for the report (weak context for AI chart selection).
        instructions: Free-text instructions from the user (drives AI chart selection).
        data_colors: Hex color palette (up to 8+) for chart series, in series order. Omit for the Lifewood default.
        heading_font: Font family for chart titles, headers, and KPI callout numbers.
        body_font: Font family for data values, axis labels, and table content.
        good_threshold: Average completion_rate at or above this is "good" (green). Omit to skip conditional formatting.
        neutral_threshold: Average completion_rate at or above this (but below good_threshold) is "neutral" (amber); below it is "bad" (red).
    """
    return run_pipeline(
        file_path,
        conversation_id,
        report_type,
        report_name,
        instructions or None,
        data_colors,
        heading_font,
        body_font,
        good_threshold,
        neutral_threshold,
    )


if __name__ == "__main__":
    mcp.run()
