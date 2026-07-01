from pathlib import Path
import openpyxl


def load_production_plan(path: str | Path) -> list[dict]:
    """Read the 'Production Plan' sheet and return one dict per daily record."""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Production Plan"]

    records = []
    for row in ws.iter_rows(min_row=6, values_only=True):
        date = row[0]
        if not hasattr(date, "year"):  # skips the row 5 rollup / any blank rows
            continue

        accumulative_target, accumulative_actual = row[10], row[11]
        if accumulative_target is None and accumulative_actual is None:
            continue  # beyond the sheet's formula range — trailing artifact, not a real day

        records.append(
            {
                "date": date.isoformat(),
                "month": row[1],
                "target_ops": row[2],
                "target_sentences": row[3],
                "target_hours": row[4],
                "recording_actual_ops": row[5],
                "recording_actual_sentences": row[6],
                "recording_actual_hours": row[7],
                "recording_balance_hours": row[8],
                "recording_completion_rate": row[9],
                "accumulative_target": row[10],
                "accumulative_actual": row[11],
                "qc_target_ops": row[12],
                "qc_target_sentences_per_op": row[13],
                "qc_target_sentences_per_day": row[14],
                "qc_target_hours": row[15],
                "qc_actual_ops": row[16],
                "qc_actual_sentences": row[17],
                "qc_actual_hours": row[18],
                "qc_balance_hours": row[19],
                "qc_completion_rate": row[20],
            }
        )
    return records


def build_dashboard_stub(records: list[dict]) -> tuple[dict, dict]:
    """Placeholder dashboard content — real generation is PBIP/fabric-cicd, not this."""
    total_target_ops = sum(r["target_ops"] or 0 for r in records)
    total_actual_ops = sum(r["recording_actual_ops"] or 0 for r in records)

    layout_json = {
        "sections": [
            {
                "number": 1,
                "title": "Production Overview",
                "summary": {
                    "total_target_ops": total_target_ops,
                    "total_actual_ops": total_actual_ops,
                },
            }
        ]
    }
    chart_preview_json = {
        "type": "line",
        "series": [
            {
                "date": r["date"],
                "target_ops": r["target_ops"],
                "actual_ops": r["recording_actual_ops"],
            }
            for r in records
        ],
    }
    return layout_json, chart_preview_json


if __name__ == "__main__":
    import sys

    records = load_production_plan(sys.argv[1])
    print(f"Parsed {len(records)} daily records")
    print("First:", records[0])
    print("Last:", records[-1])
