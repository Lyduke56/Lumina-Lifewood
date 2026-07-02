import re
import shutil
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = BACKEND_DIR / "pbib_reference"
OUTPUT_ROOT = BACKEND_DIR / "generated_dashboards"

# M type per column, matching what's declared in the template's clean_export.tmdl
M_TYPES = {
    "date": "datetime",
    "month": "text",
    "target_ops": "Int64.Type",
    "target_sentences": "Int64.Type",
    "target_hours": "number",
    "recording_actual_ops": "Int64.Type",
    "recording_actual_sentences": "Int64.Type",
    "recording_actual_hours": "number",
    "recording_balance_hours": "number",
    "recording_completion_rate": "number",
    "accumulative_target": "number",
    "accumulative_actual": "number",
    "qc_target_ops": "Int64.Type",
    "qc_target_sentences_per_op": "Int64.Type",
    "qc_target_sentences_per_day": "Int64.Type",
    "qc_target_hours": "number",
    "qc_actual_ops": "Int64.Type",
    "qc_actual_sentences": "Int64.Type",
    "qc_actual_hours": "number",
    "qc_balance_hours": "number",
    "qc_completion_rate": "text",
}


def m_value(column: str, value) -> str:
    if value is None:
        return "null"
    if column == "date":
        y, mo, d = int(value[0:4]), int(value[5:7]), int(value[8:10])
        return f"#datetime({y}, {mo}, {d}, 0, 0, 0)"
    if column in ("month", "qc_completion_rate"):
        return '"' + str(value).replace('"', '""') + '"'
    return str(value)


def generate_pbip(records: list[dict], dataset_id: str) -> Path:
    """Copy the reference PBIP template and embed `records` as its data. Returns the output folder path."""
    output_dir = OUTPUT_ROOT / dataset_id
    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(TEMPLATE_DIR, output_dir)

    tmdl_path = (
        output_dir
        / "production_plan_reference.SemanticModel"
        / "definition"
        / "tables"
        / "clean_export.tmdl"
    )

    columns = list(M_TYPES.keys())
    type_sig = ", ".join(f"{c}={M_TYPES[c]}" for c in columns)
    rows_m = [
        "\t\t\t{" + ", ".join(m_value(c, r[c]) for c in columns) + "}" for r in records
    ]
    rows_joined = ",\n".join(rows_m)

    new_query = (
        "\t\t\tlet\n"
        f"\t\t\t\tSource = #table(\n"
        f"\t\t\t\t\ttype table [{type_sig}],\n"
        "\t\t\t\t\t{\n"
        f"{rows_joined}\n"
        "\t\t\t\t\t}\n"
        "\t\t\t\t)\n"
        "\t\t\tin\n"
        "\t\t\t\tSource"
    )

    text = tmdl_path.read_text(encoding="utf-8")
    pattern = re.compile(r"source =\n.*?(?=\n\s*annotation PBI_ResultType)", re.DOTALL)
    new_text, n = pattern.subn(f"source =\n{new_query}", text)
    if n != 1:
        raise RuntimeError(
            f"Expected exactly 1 match to replace, found {n} in {tmdl_path}"
        )

    tmdl_path.write_text(new_text, encoding="utf-8")
    return output_dir


if __name__ == "__main__":
    from excel_parser import load_production_plan

    records = load_production_plan(
        "../sample_ProductionPlan/Sample 1 MSXF Mexico- Read Aloud Production Plan 2024.xlsx"
    )
    out = generate_pbip(records, dataset_id="test-run-1")
    print(f"Generated PBIP at: {out}")
