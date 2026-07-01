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


if __name__ == "__main__":
    import sys
    from excel_parser import load_production_plan

    path = sys.argv[1]
    records = load_production_plan(path)
    row = save_dataset(source_file_path=path, parsed_rows=records)
    print(f"Saved dataset id={row['id']} with {len(records)} records")
