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
    "Executive Summary": "a small number of high-level KPI cards only, minimal detail, for leadership or clients who just want the headline numbers",
    "Detailed Breakdown": "a full daily data table alongside trend charts, for someone who wants to inspect the underlying numbers in detail",
}


def choose_visuals(
    report_type: str = "Progress Overview",
    report_name: str = "",
    instructions: str | None = None,
) -> list[dict]:
    """Ask the LLM to choose a sensible set of visuals for this dashboard."""
    context_lines = []
    if report_type in REPORT_TYPES:
        context_lines.append(
            f'Report type: "{report_type}" — {REPORT_TYPES[report_type]}'
        )
    if report_name:
        context_lines.append(f'The report is titled: "{report_name}"')
    if instructions:
        context_lines.append(f'Additional instructions from the user: "{instructions}"')
    context_block = "\n".join(context_lines)

    prompt = f"""You are choosing which charts to include in a Power BI dashboard for a production-plan tracking tool.

Available data fields:
- date: the day of the record
- target_quantity / actual_quantity: planned vs completed work units per day
- target_hours / actual_hours: planned vs actual hours worked per day
- completion_rate: actual_quantity / target_quantity for that day

{context_block}

Choose 3 to 5 visuals that best fit the above (if none of it gives a strong signal, default to
a general progress overview: trends over time plus an overall completion KPI). Each visual must
be one of:
{{"type": "card", "fields": ["<one field>"]}} — a single big-number KPI
{{"type": "line", "fields": ["date", "<field1>", "<field2>", ...]}} — a trend line over time
{{"type": "bar", "fields": ["date", "<field1>", "<field2>", ...]}} — a bar comparison over time
{{"type": "table", "fields": ["date", "<field1>", "<field2>", ...]}} — a detailed row-by-row table

If the user's instructions ask for something these visual types can't do, do the closest reasonable thing with what's available and don't invent a new "type" value.

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
    "table": "tableEx",
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


def _card_visual_json(
    name: str, field: str, position: dict, conditional_measure: str | None = None
) -> dict:
    visual: dict = {
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
    }

    if conditional_measure:
        visual["objects"] = {
            "value": [
                {
                    "properties": {
                        "fontColor": {
                            "solid": {
                                "color": {
                                    "expr": {
                                        "Measure": {
                                            "Expression": {
                                                "SourceRef": {"Entity": ENTITY}
                                            },
                                            "Property": conditional_measure,
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "selector": {"id": "default"},
                }
            ]
        }

    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": visual,
    }


def _table_visual_json(name: str, fields: list[str], position: dict) -> dict:
    projections = []
    for f in fields:
        if f == "date":
            projections.append(
                {
                    "field": _column_ref(f),
                    "queryRef": f"{ENTITY}.{f}",
                    "nativeQueryRef": f,
                }
            )
        else:
            projections.append(
                {
                    "field": _agg_ref(f),
                    "queryRef": f"{_aggregation_label(f)}({ENTITY}.{f})",
                    "nativeQueryRef": f"{_aggregation_label(f)} of {f}",
                }
            )
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": {
            "visualType": "tableEx",
            "query": {"queryState": {"Values": {"projections": projections}}},
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


def apply_visuals(
    page_dir: Path, specs: list[dict], completion_thresholds: bool = False
) -> None:
    """Replace a page's visuals with ones generated from `specs`.

    Each spec is {"type": "card"|"line"|"bar"|"table", "fields": [...]}. For "card", fields
    is a single-item list. For "line"/"bar", fields[0] is the category field and the rest
    are the Y-axis fields (summed). For "table", fields are the columns to show.

    Any field name not in the known canonical schema is dropped rather than written into
    the report — a hallucinated field reference can leave a visual permanently broken for
    anyone just viewing the finished file (no interactive "Fix this" prompt like there is
    in Power BI Desktop while authoring). For "line"/"bar", an invalid field drops the whole
    spec, since filtering it out could silently turn a numeric field into the category axis.
    For "card"/"table", invalid fields are just filtered out of the list.
    """
    known_fields = set(M_TYPES.keys())
    valid_specs = []
    for spec in specs:
        if spec["type"] in ("line", "bar"):
            if len(spec["fields"]) >= 2 and all(
                f in known_fields for f in spec["fields"]
            ):
                valid_specs.append(spec)
        else:
            fields = [f for f in spec["fields"] if f in known_fields]
            if fields:
                valid_specs.append({"type": spec["type"], "fields": fields})

    visuals_dir = page_dir / "visuals"
    if visuals_dir.exists():
        shutil.rmtree(visuals_dir)
    visuals_dir.mkdir(parents=True)

    total = len(valid_specs)
    for i, spec in enumerate(valid_specs):
        name = uuid.uuid4().hex[:20]
        position = _visual_position(i, total)
        visual_type = VISUAL_TYPE_MAP[spec["type"]]

        if spec["type"] == "card":
            field = spec["fields"][0]
            conditional_measure = (
                "Completion Status"
                if completion_thresholds and field == "completion_rate"
                else None
            )
            content = _card_visual_json(name, field, position, conditional_measure)

        elif spec["type"] == "table":
            content = _table_visual_json(name, spec["fields"], position)
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


def add_page(
    output_dir: Path,
    display_name: str,
    specs: list[dict],
    completion_thresholds: bool = False,
) -> str:
    """Create a new report page with the given display name and visuals. Returns the new page's id."""
    pages_root = (
        output_dir / "production_plan_reference.Report" / "definition" / "pages"
    )
    page_id = uuid.uuid4().hex[:20]
    page_dir = pages_root / page_id
    page_dir.mkdir(parents=True)

    page_json = {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
        "name": page_id,
        "displayName": display_name,
        "displayOption": "FitToPage",
        "height": 720,
        "width": 1280,
    }
    (page_dir / "page.json").write_text(
        json.dumps(page_json, indent=2), encoding="utf-8"
    )

    apply_visuals(page_dir, specs, completion_thresholds)

    pages_json_path = pages_root / "pages.json"
    pages_meta = json.loads(pages_json_path.read_text(encoding="utf-8"))
    pages_meta["pageOrder"].append(page_id)
    pages_json_path.write_text(json.dumps(pages_meta, indent=2), encoding="utf-8")

    return page_id


def apply_theme(
    output_dir: Path,
    primary_color: str = "#133020",
    accent_color: str = "#FFB347",
    heading_font: str = "Fraunces",
    body_font: str = "DM Sans",
) -> None:
    """Update the report's theme file with the user's chosen colors and fonts.

    primary/accent become the first two data-series colors (matches the SetupCard's
    own preview, which binds "Actual"/"Target" to these two colors specifically —
    not a general UI-chrome recolor). heading_font applies to the title/header/callout
    text classes (chart titles, KPI headers, and the big KPI number itself);
    body_font applies to the label class (data values, axis labels, table content).
    Secondary text classes (e.g. boldLabel, largeTitle) auto-derive from these per
    Power BI's own theme inheritance rules, so they don't need to be set explicitly.
    """
    theme_path = (
        output_dir
        / "production_plan_reference.Report"
        / "StaticResources"
        / "RegisteredResources"
        / "LuminaTheme.json"
    )

    theme = json.loads(theme_path.read_text(encoding="utf-8"))

    theme["dataColors"][0] = primary_color
    theme["dataColors"][1] = accent_color

    text_classes = theme.get("textClasses", {})
    for cls in ("title", "header", "callout"):
        if cls in text_classes:
            text_classes[cls]["fontFace"] = heading_font
    if "label" in text_classes:
        text_classes["label"]["fontFace"] = body_font

    theme_path.write_text(json.dumps(theme, indent=2), encoding="utf-8")


def apply_completion_thresholds(
    output_dir: Path, good_threshold: float = 0.9, neutral_threshold: float = 0.7
) -> None:
    """Add a 'Completion Status' DAX measure (good/neutral/bad based on the given
    thresholds against average completion_rate) to the semantic model, so a
    completion_rate card can reference it for field-value conditional formatting.
    """
    tmdl_path = (
        output_dir
        / "production_plan_reference.SemanticModel"
        / "definition"
        / "tables"
        / "clean_export.tmdl"
    )
    text = tmdl_path.read_text(encoding="utf-8")

    measure_block = (
        "\n\tmeasure 'Completion Status' = ```\n"
        "\t\t\t\n"
        "\t\t\tVAR CurrentRate = AVERAGE(clean_export[completion_rate])\n"
        "\t\t\tRETURN\n"
        "\t\t\t    SWITCH(\n"
        "\t\t\t        TRUE(),\n"
        f'\t\t\t        CurrentRate >= {good_threshold}, "good",\n'
        f'\t\t\t        CurrentRate >= {neutral_threshold}, "neutral",\n'
        '\t\t\t        "bad"\n'
        "\t\t\t    )\n"
        "\t\t\t\n"
        "\t\t\t```\n"
        f"\t\tlineageTag: {uuid.uuid4()}\n"
    )

    pattern = re.compile(r"(table clean_export\n\tlineageTag: [^\n]+\n)")
    new_text, n = pattern.subn(lambda m: m.group(1) + measure_block, text, count=1)
    if n != 1:
        raise RuntimeError(
            f"Could not find table header to insert measure after in {tmdl_path}"
        )

    tmdl_path.write_text(new_text, encoding="utf-8")


def generate_pbip(
    records: list[dict],
    dataset_id: str,
    visuals: list[dict] | None = None,
    primary_color: str = "#133020",
    accent_color: str = "#FFB347",
    heading_font: str = "Fraunces",
    body_font: str = "DM Sans",
    good_threshold: float | None = None,
    neutral_threshold: float | None = None,
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

    use_thresholds = good_threshold is not None and neutral_threshold is not None
    if use_thresholds:
        apply_completion_thresholds(output_dir, good_threshold, neutral_threshold)

    page_dir = (
        output_dir
        / "production_plan_reference.Report"
        / "definition"
        / "pages"
        / "2bb6229a2baa33c2479a"
    )
    apply_visuals(
        page_dir, visuals or DEFAULT_VISUALS, completion_thresholds=use_thresholds
    )
    apply_theme(output_dir, primary_color, accent_color, heading_font, body_font)

    return output_dir


if __name__ == "__main__":
    from excel_parser import load_production_plan

    records = load_production_plan("../sample_ProductionPlan/Sample1_single_sheet.xlsx")
    visuals = choose_visuals("Progress Overview")
    print("AI chose:", json.dumps(visuals, indent=2))
    out = generate_pbip(records, dataset_id="test-run-ai-chosen", visuals=visuals)
    print(f"Generated PBIP at: {out}")
