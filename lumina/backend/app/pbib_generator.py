import json
import re
import shutil
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = BACKEND_DIR / "pbib_reference"
OUTPUT_ROOT = BACKEND_DIR / "generated_dashboards"

ENTITY = "clean_export"

from llm_client import ask

REPORT_TYPES = {
    "Progress Overview": "target vs actual trends over time, and overall completion",
}


def choose_visuals(report_type: str = "Progress Overview") -> list[dict]:
    """Ask the LLM to choose a sensible set of visuals for the given report type."""
    prompt = f"""You are choosing which charts to include in a Power BI dashboard for a production-plan tracking tool.

Available data fields:
- date: the day of the record
- target_quantity / actual_quantity: planned vs completed work units per day
- target_hours / actual_hours: planned vs actual hours worked per day
- completion_rate: actual_quantity / target_quantity for that day

Report type: "{report_type}" — {REPORT_TYPES[report_type]}

Choose 3 to 5 visuals that best fit this report type. Each visual must be one of:
{{"type": "card", "fields": ["<one field>"]}} — a single big-number KPI
{{"type": "line", "fields": ["date", "<field1>", "<field2>", ...]}} — a trend line over time
{{"type": "bar", "fields": ["date", "<field1>", "<field2>", ...]}} — a bar comparison over time

Respond with ONLY a JSON list of visual specs, no other text."""

    response = ask(prompt, temperature=0, use_fallback=False)
    start, end = response.find("["), response.rfind("]")
    return json.loads(response[start : end + 1])


# M type per column, matching what's declared in the template's clean_export.tmdl
M_TYPES = {
    "date": "datetime",
    "target_quantity": "number",
    "actual_quantity": "number",
    "target_hours": "number",
    "actual_hours": "number",
    "completion_rate": "number",
}

# Maps a simple spec type to Power BI's internal visualType string.
VISUAL_TYPE_MAP = {
    "card": "cardVisual",
    "line": "lineChart",
    "bar": "clusteredColumnChart",
}

DEFAULT_VISUALS = [
    {"type": "card", "fields": ["actual_quantity"]},
    {"type": "line", "fields": ["date", "target_quantity", "actual_quantity"]},
]


def m_value(column: str, value) -> str:
    if value is None:
        return "null"
    if column == "date":
        y, mo, d = int(value[0:4]), int(value[5:7]), int(value[8:10])
        return f"#datetime({y}, {mo}, {d}, 0, 0, 0)"
    return str(value)


def _column_expr(field: str) -> dict:
    return {
        "Expression": {"SourceRef": {"Entity": ENTITY}},
        "Property": field,
    }


def _column_ref(field: str) -> dict:
    return {"Column": _column_expr(field)}


RATE_FIELDS = {"completion_rate"}


def _aggregation_function(field: str) -> int:
    return 1 if field in RATE_FIELDS else 0


def _aggregation_label(field: str) -> str:
    return "Average" if field in RATE_FIELDS else "Sum"


def _agg_ref(field: str) -> dict:
    return {
        "Aggregation": {
            "Expression": {"Column": _column_expr(field)},
            "Function": _aggregation_function(field),
        }
    }


def _categorical_visual_json(
    visual_type: str,
    name: str,
    category_field: str,
    y_fields: list[str],
    position: dict,
) -> dict:
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": {
            "visualType": visual_type,
            "query": {
                "queryState": {
                    "Category": {
                        "projections": [
                            {
                                "field": _column_ref(category_field),
                                "queryRef": f"{ENTITY}.{category_field}",
                                "nativeQueryRef": category_field,
                                "active": True,
                            }
                        ]
                    },
                    "Y": {
                        "projections": [
                            {
                                "field": _agg_ref(f),
                                "queryRef": f"{_aggregation_label(f)}({ENTITY}.{f})",
                                "nativeQueryRef": f"{_aggregation_label(f)} of {f}",
                            }
                            for f in y_fields
                        ]
                    },
                },
                "sortDefinition": {
                    "sort": [
                        {"field": _column_ref(category_field), "direction": "Ascending"}
                    ],
                    "isDefaultSort": True,
                },
            },
            "drillFilterOtherVisuals": True,
        },
    }


def _card_visual_json(name: str, field: str, position: dict) -> dict:
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": {
            "visualType": "cardVisual",
            "query": {
                "queryState": {
                    "Data": {
                        "projections": [
                            {
                                "field": _agg_ref(field),
                                "queryRef": f"{_aggregation_label(field)}({ENTITY}.{field})",
                                "nativeQueryRef": f"{_aggregation_label(field)} of {field}",
                            }
                        ]
                    }
                },
                "sortDefinition": {
                    "sort": [{"field": _agg_ref(field), "direction": "Descending"}],
                    "isDefaultSort": True,
                },
            },
            "drillFilterOtherVisuals": True,
        },
    }


def _visual_position(index: int, total: int, page_width=1280, page_height=720) -> dict:
    """Simple placeholder layout: stack visuals full-width, evenly split vertically."""
    height = page_height / total
    return {
        "x": 0,
        "y": index * height,
        "z": index,
        "height": height,
        "width": page_width,
        "tabOrder": index,
    }


def apply_visuals(page_dir: Path, specs: list[dict]) -> None:
    """Replace a page's visuals with ones generated from `specs`.

    Each spec is {"type": "card"|"line"|"bar", "fields": [...]}. For "card", fields
    is a single-item list. For "line"/"bar", fields[0] is the category field and the
    rest are the Y-axis fields (summed).
    """
    visuals_dir = page_dir / "visuals"
    if visuals_dir.exists():
        shutil.rmtree(visuals_dir)
    visuals_dir.mkdir(parents=True)

    total = len(specs)
    for i, spec in enumerate(specs):
        name = uuid.uuid4().hex[:20]
        position = _visual_position(i, total)
        visual_type = VISUAL_TYPE_MAP[spec["type"]]

        if spec["type"] == "card":
            content = _card_visual_json(name, spec["fields"][0], position)
        else:
            category_field, *y_fields = spec["fields"]
            content = _categorical_visual_json(
                visual_type, name, category_field, y_fields, position
            )

        visual_dir = visuals_dir / name
        visual_dir.mkdir()
        (visual_dir / "visual.json").write_text(
            json.dumps(content, indent=2), encoding="utf-8"
        )


def generate_pbip(
    records: list[dict], dataset_id: str, visuals: list[dict] | None = None
) -> Path:
    """Copy the reference PBIP template, embed `records` as its data, and generate
    the visuals described by `visuals` (defaults to a baseline card + line chart).
    Returns the output folder path."""
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

    page_dir = (
        output_dir
        / "production_plan_reference.Report"
        / "definition"
        / "pages"
        / "2bb6229a2baa33c2479a"
    )
    apply_visuals(page_dir, visuals or DEFAULT_VISUALS)

    return output_dir


if __name__ == "__main__":
    from excel_parser import load_production_plan

    records = load_production_plan("../sample_ProductionPlan/Sample1_single_sheet.xlsx")
    visuals = choose_visuals("Progress Overview")
    print("AI chose:", json.dumps(visuals, indent=2))
    out = generate_pbip(records, dataset_id="test-run-ai-chosen", visuals=visuals)
    print(f"Generated PBIP at: {out}")
