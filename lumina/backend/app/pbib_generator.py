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


COMPLETION_RATE_MEASURE = "Completion Rate"
COMPLETION_STATUS_MEASURE = "Completion Status"

# Total delivered over total planned — deliberately NOT the average of each day's
# percentage. Averaging ratios lets one exceptional day cancel several bad ones: on a
# real 184-day plan that had delivered exactly 100%, the daily average read 129%,
# because a single 445% day offset four days at zero.
_COMPLETION_RATE_DAX = (
    f"DIVIDE(SUM({ENTITY}[actual_quantity]), SUM({ENTITY}[target_quantity]))"
)

# Every field is exposed as a named measure rather than being aggregated straight off
# the column. Two reasons. A ratio cannot be summed or averaged across rows and stay
# meaningful. And Power BI names a column aggregation after the column — "Sum of
# target_quantity", or just "target_quantity" once the "Sum of" prefix is switched off —
# ignoring any display name we supply. A measure is shown under its own name, so this is
# the only reliable way to get "Target" into a legend, and it carries a format string too.
#
# field -> (measure name, DAX, format string)
MEASURE_DEFINITIONS: dict[str, tuple[str, str, str]] = {
    "target_quantity": ("Target", f"SUM({ENTITY}[target_quantity])", "#,0"),
    "actual_quantity": ("Actual", f"SUM({ENTITY}[actual_quantity])", "#,0"),
    "target_hours": ("Target Hours", f"SUM({ENTITY}[target_hours])", "#,0.0"),
    "actual_hours": ("Actual Hours", f"SUM({ENTITY}[actual_hours])", "#,0.0"),
    "completion_rate": (COMPLETION_RATE_MEASURE, _COMPLETION_RATE_DAX, "0.0%"),
}

MEASURE_FOR_FIELD = {f: spec[0] for f, spec in MEASURE_DEFINITIONS.items()}


def _value_ref(field: str) -> tuple[dict, str, str]:
    """Return (field expression, queryRef, display name) for a numeric field."""
    measure = MEASURE_FOR_FIELD.get(field)
    if measure:
        return _measure_ref(measure), f"{ENTITY}.{measure}", measure
    return (
        _agg_ref(field),
        f"{_aggregation_label(field)}({ENTITY}.{field})",
        f"{_aggregation_label(field)} of {field}",
    )


def _measure_ref(measure: str) -> dict:
    return {
        "Measure": {
            "Expression": {"SourceRef": {"Entity": ENTITY}},
            "Property": measure,
        }
    }


# Left to itself Power BI titles a visual from the raw column names it was given, e.g.
# "Sum of target_quantity and Sum of actual_quantity by date". These are the names a
# reader should see instead.
FIELD_LABELS = {
    "date": "Date",
    "target_quantity": "Target",
    "actual_quantity": "Actual",
    "target_hours": "Target Hours",
    "actual_hours": "Actual Hours",
    "completion_rate": "Completion Rate",
}


def _label(field: str) -> str:
    return FIELD_LABELS.get(field, field.replace("_", " ").title())


def _literal(value: str) -> dict:
    """Wrap a string as a PBIR literal expression. Power BI expects the value itself to
    be single-quoted inside the JSON string, so any apostrophe has to be doubled."""
    return {"expr": {"Literal": {"Value": "'" + value.replace("'", "''") + "'"}}}


def _text_style(font: str, color: str | None = None) -> dict:
    """Font (and optionally colour) properties written into a visual.

    Power BI stops applying a hand-registered theme once Desktop re-saves the project,
    so anything specified only there reverts to Microsoft's defaults the moment a
    customer saves — and we require every recipient to press Refresh, so they do.
    Colours already survive because they are written into the visual; the typeface has
    to be written here too or it is lost on that same save.
    """
    props: dict = {"fontFamily": _literal(_font_stack(font))}
    if color:
        props["fontColor"] = {"solid": {"color": _literal(color)}}
    return props


def _styled_axes(visual: dict) -> dict:
    """Apply the brand typeface to a chart's axes and legend."""
    objects = visual.setdefault("objects", {})
    for part in ("categoryAxis", "valueAxis", "legend"):
        objects.setdefault(part, [{"properties": {}}])[0]["properties"].update(
            _text_style(BODY_FONT, DARK_SERPENT)
        )
    return visual


def _titled(visual: dict, title: str) -> dict:
    """Give a visual an explicit title, replacing Power BI's auto-generated one."""
    visual["visualContainerObjects"] = {
        "title": [
            {
                "properties": {
                    "show": {"expr": {"Literal": {"Value": "true"}}},
                    "text": _literal(title),
                    **_text_style(HEADING_FONT, DARK_SERPENT),
                }
            }
        ]
    }
    return visual


def _visual_title(spec: dict) -> str:
    """A human title for a visual, derived from the fields it displays."""
    fields = spec["fields"]
    if spec["type"] == "card":
        field = fields[0]
        return _label(field) if field in RATE_FIELDS else f"Total {_label(field)}"
    if spec["type"] == "table":
        return "Detailed Data"
    category, *series = fields
    return f"{' vs '.join(_label(f) for f in series)} by {_label(category)}"


def _series_colors(y_fields: list[str], palette: list[str]) -> list[dict]:
    """Pin each series to an explicit color instead of letting the theme supply it.

    Power BI applies a custom theme on first open, but drops it once Power BI Desktop
    saves the project — a registered resource we wrote by hand is not re-registered on
    save, so the report silently reverts to Microsoft's default blue palette. Colors
    written into the visual itself are part of the report definition and survive.
    Power BI restarts at the first theme color for each visual, so series indexes are
    per-visual, matching what the theme would have done.
    """
    colors = []
    for index, field in enumerate(y_fields):
        _, query_ref, _ = _value_ref(field)
        colors.append(
            {
                "properties": {
                    "fill": {"solid": {"color": _literal(palette[index % len(palette)])}}
                },
                "selector": {"metadata": query_ref},
            }
        )
    return colors


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
                                "nativeQueryRef": _label(category_field),
                                "active": True,
                            }
                        ]
                    },
                    "Y": {
                        "projections": [
                            # Measures, so the legend reads "Target" rather than the
                            # underlying column name.
                            {
                                "field": ref,
                                "queryRef": query_ref,
                                "nativeQueryRef": display,
                            }
                            for ref, query_ref, display in map(_value_ref, y_fields)
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
    # A card prints this name beneath the number, which is why cards get no container
    # title — a title as well would give the same tile two captions.
    data_ref, query_ref, native_ref = _value_ref(field)

    visual: dict = {
        "visualType": "cardVisual",
        "query": {
            "queryState": {
                "Data": {
                    "projections": [
                        {
                            "field": data_ref,
                            "queryRef": query_ref,
                            "nativeQueryRef": native_ref,
                        }
                    ]
                }
            },
            "sortDefinition": {
                "sort": [{"field": data_ref, "direction": "Descending"}],
                "isDefaultSort": True,
            },
        },
        "drillFilterOtherVisuals": True,
    }

    # The big number carries the heading face; its caption the body face. Both are set
    # here rather than in the theme so they survive the customer saving the file.
    value_props = _text_style(HEADING_FONT)
    if conditional_measure:
        value_props["fontColor"] = {
            "solid": {
                "color": {
                    "expr": {
                        "Measure": {
                            "Expression": {"SourceRef": {"Entity": ENTITY}},
                            "Property": conditional_measure,
                        }
                    }
                }
            }
        }
    else:
        value_props["fontColor"] = {"solid": {"color": _literal(CASTLETON_GREEN)}}

    # Only the number is styled here. A "labels" object was tried for the caption
    # beneath it, but Power BI strips it on save — not a property cardVisual accepts —
    # so that one caption still falls back to the theme, and to a default font once the
    # customer saves. The correct object name has not been identified yet.
    visual["objects"] = {
        "value": [{"properties": value_props, "selector": {"id": "default"}}],
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
                    "nativeQueryRef": _label(f),
                }
            )
        else:
            # A measure, so the column heading reads "Target" not "Sum of target_quantity".
            ref, query_ref, display = _value_ref(f)
            projections.append(
                {"field": ref, "queryRef": query_ref, "nativeQueryRef": display}
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


PAGE_WIDTH = 1280
PAGE_HEIGHT = 720
MARGIN = 24  # gutter around the canvas, so the page's own background is visible
GAP = 16  # space between visuals
CARD_HEIGHT = 140  # a headline number needs far less room than a chart


def _layout_positions(specs: list[dict]) -> list[dict]:
    """Place KPI cards in a row across the top, then the charts beneath them.

    Replaces an earlier layout that stacked every visual full-width at equal height.
    That tiled the canvas exactly — 3 visuals of 1280x240 on a 1280x720 page — so the
    themed page background was completely hidden behind the visuals, and a one-number
    KPI card was given as much room as a 184-point trend line. It also left the
    headline figure wherever the AI happened to list it, often last.
    """
    cards = [i for i, s in enumerate(specs) if s["type"] == "card"]
    charts = [i for i, s in enumerate(specs) if s["type"] != "card"]

    positions: list[dict] = [{} for _ in specs]
    inner_width = PAGE_WIDTH - 2 * MARGIN
    y = MARGIN

    if cards:
        width = (inner_width - GAP * (len(cards) - 1)) / len(cards)
        for slot, i in enumerate(cards):
            positions[i] = {
                "x": MARGIN + slot * (width + GAP),
                "y": y,
                "z": i,
                "width": width,
                "height": CARD_HEIGHT,
                "tabOrder": i,
            }
        y += CARD_HEIGHT + GAP

    if charts:
        available = PAGE_HEIGHT - MARGIN - y
        height = (available - GAP * (len(charts) - 1)) / len(charts)
        for slot, i in enumerate(charts):
            positions[i] = {
                "x": MARGIN,
                "y": y + slot * (height + GAP),
                "z": i,
                "width": inner_width,
                "height": height,
                "tabOrder": i,
            }

    return positions


def apply_visuals(
    page_dir: Path,
    specs: list[dict],
    completion_thresholds: bool = False,
    data_colors: list[str] | None = None,
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

    palette = _valid_data_colors(data_colors)
    layout = _layout_positions(valid_specs)
    for i, spec in enumerate(valid_specs):
        name = uuid.uuid4().hex[:20]
        position = layout[i]
        visual_type = VISUAL_TYPE_MAP[spec["type"]]

        if spec["type"] == "card":
            field = spec["fields"][0]
            conditional_measure = (
                COMPLETION_STATUS_MEASURE
                if completion_thresholds and field == "completion_rate"
                else None
            )
            content = _card_visual_json(name, field, position, conditional_measure)

        elif spec["type"] == "table":
            content = _table_visual_json(name, spec["fields"], position)
            _titled(content["visual"], _visual_title(spec))
        else:
            category_field, *y_fields = spec["fields"]
            content = _categorical_visual_json(
                visual_type, name, category_field, y_fields, position
            )
            _titled(content["visual"], _visual_title(spec))
            content["visual"]["objects"] = {
                "dataPoint": _series_colors(y_fields, palette)
            }
            _styled_axes(content["visual"])

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
    apply_page_background(page_dir)

    pages_json_path = pages_root / "pages.json"
    pages_meta = json.loads(pages_json_path.read_text(encoding="utf-8"))
    pages_meta["pageOrder"].append(page_id)
    pages_json_path.write_text(json.dumps(pages_meta, indent=2), encoding="utf-8")

    return page_id


DEFAULT_DATA_COLORS = [
    "#133020",
    "#FFB347",
    "#046241",
    "#FFC370",
    "#417256",
    "#C17710",
    "#708E7C",
    "#9CAFA4",
]


HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")

# Named colors from the Lifewood brand guidelines, used for the parts of a report that
# are not chart series — text, the canvas, the surround.
DARK_SERPENT = "#133020"
CASTLETON_GREEN = "#046241"
PAPER = "#F5EEDB"
SEA_SALT = "#F9F7F7"
WHITE = "#FFFFFF"

# Lifewood's brand typeface. Power BI cannot embed a font — it names one, and each
# machine renders with whatever it has installed — so every font is emitted as a
# fallback chain. Where Manrope is installed the report is properly branded; where it
# isn't, it lands on a font we picked rather than whatever Power BI reaches for.
HEADING_FONT = "Manrope SemiBold"
BODY_FONT = "Manrope"
FONT_FALLBACK = "Segoe UI"

# Weight suffixes install as separate font faces, and a machine may have the family but
# not that particular weight — so the plain family is inserted as an intermediate step.
_WEIGHT_SUFFIXES = {"thin", "light", "regular", "medium", "semibold", "bold", "black"}


def _quote_font(name: str) -> str:
    return f"'{name}'" if " " in name else name


def _font_stack(font: str) -> str:
    """Build a Power BI fontFace chain: the requested font, then sensible fallbacks."""
    font = (font or "").strip()
    chain = []
    if font:
        chain.append(_quote_font(font))
        head, _, last = font.rpartition(" ")
        if head and last.lower() in _WEIGHT_SUFFIXES:
            chain.append(_quote_font(head))
    chain.append(_quote_font(FONT_FALLBACK))
    # dict.fromkeys keeps order while removing duplicates
    return ",".join(dict.fromkeys(chain))


def _valid_data_colors(data_colors: list[str] | None) -> list[str]:
    """Keep only well-formed #RRGGBB values, falling back to the Lifewood default.

    Power BI rejects the *entire* theme file if any one color is malformed — it does
    not skip the bad entry — so a single stray character silently reverts every color
    and font in the report to Power BI's defaults, with no error anywhere. Filtering
    here means a bad value costs one series color instead of the whole theme.
    """
    if not data_colors:
        return DEFAULT_DATA_COLORS

    good = [c for c in data_colors if isinstance(c, str) and HEX_COLOR.match(c)]
    rejected = [c for c in data_colors if c not in good]
    if rejected:
        print(f"Ignoring malformed theme color(s): {rejected}")

    # Below two colors a chart cannot distinguish its series, so prefer the default.
    return good if len(good) >= 2 else DEFAULT_DATA_COLORS


def apply_theme(
    output_dir: Path,
    data_colors: list[str] | None = None,
    heading_font: str = HEADING_FONT,
    body_font: str = BODY_FONT,
) -> None:
    """Update the report's theme file with the user's chosen color palette and fonts.

    data_colors replaces the full chart-series palette (not just the first two
    colors) — Power BI assigns theme colors to chart series in order, so a real
    theme needs more than 2 colors to look intentional once a report has more
    than 2 series. Defaults to the Lifewood brand palette. heading_font applies
    to the title/header/callout text classes (chart titles, KPI headers, and the
    big KPI number itself); body_font applies to the label class (data values,
    axis labels, table content). Secondary text classes (e.g. boldLabel,
    largeTitle) auto-derive from these per Power BI's own theme inheritance
    rules, so they don't need to be set explicitly.
    """
    theme_path = (
        output_dir
        / "production_plan_reference.Report"
        / "StaticResources"
        / "RegisteredResources"
        / "LuminaTheme.json"
    )

    theme = json.loads(theme_path.read_text(encoding="utf-8"))

    theme["dataColors"] = _valid_data_colors(data_colors)

    # Brand guidelines: text is Dark Serpent or white, never a neutral grey; White and
    # Paper are the background colors. The template shipped Power BI's default #252423
    # text on a default white page, so the palette was reaching the bars and nothing else.
    theme["foreground"] = DARK_SERPENT
    theme["background"] = WHITE
    theme["tableAccent"] = CASTLETON_GREEN
    theme["visualStyles"] = {
        "page": {
            "*": {
                # "background" is the canvas; "outspace" is the border around it.
                "background": [
                    {"color": {"solid": {"color": PAPER}}, "transparency": 0}
                ],
                "outspace": [{"color": {"solid": {"color": SEA_SALT}}}],
            }
        }
    }

    text_classes = theme.get("textClasses", {})
    for cls in ("title", "header", "callout"):
        if cls in text_classes:
            text_classes[cls]["fontFace"] = _font_stack(heading_font)
            text_classes[cls]["color"] = DARK_SERPENT
    if "label" in text_classes:
        text_classes["label"]["fontFace"] = _font_stack(body_font)
        text_classes["label"]["color"] = DARK_SERPENT

    theme_path.write_text(json.dumps(theme, indent=2), encoding="utf-8")


def apply_page_background(page_dir: Path, color: str = PAPER) -> None:
    """Set the page's canvas colour in the page definition itself.

    Same reasoning as _series_colors: a theme-supplied background disappears once
    Power BI Desktop saves the project, whereas the page definition survives.
    """
    page_json_path = page_dir / "page.json"
    page = json.loads(page_json_path.read_text(encoding="utf-8"))
    page.setdefault("objects", {})["background"] = [
        {
            "properties": {
                "color": {"solid": {"color": _literal(color)}},
                "transparency": {"expr": {"Literal": {"Value": "0D"}}},
            }
        }
    ]
    page_json_path.write_text(json.dumps(page, indent=2), encoding="utf-8")


def add_completion_measures(
    output_dir: Path,
    good_threshold: float | None = None,
    neutral_threshold: float | None = None,
) -> None:
    """Add the 'Completion Rate' measure to the semantic model, plus a 'Completion
    Status' measure when both thresholds are supplied.

    'Completion Rate' is always added so a card never has to aggregate the ratio column
    directly (see _COMPLETION_RATE_DAX for why that is wrong). 'Completion Status'
    returns good/neutral/bad off the same expression, which a card references for
    conditional formatting — so the colour and the number always agree.
    """
    tmdl_path = (
        output_dir
        / "production_plan_reference.SemanticModel"
        / "definition"
        / "tables"
        / "clean_export.tmdl"
    )
    text = tmdl_path.read_text(encoding="utf-8")

    blocks = ""
    for measure, dax, format_string in MEASURE_DEFINITIONS.values():
        blocks += (
            f"\n\tmeasure '{measure}' = {dax}\n"
            f"\t\tformatString: {format_string}\n"
            f"\t\tlineageTag: {uuid.uuid4()}\n"
        )

    if good_threshold is not None and neutral_threshold is not None:
        blocks += (
            f"\n\tmeasure '{COMPLETION_STATUS_MEASURE}' = ```\n"
            "\t\t\t\n"
            f"\t\t\tVAR CurrentRate = {_COMPLETION_RATE_DAX}\n"
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
    new_text, n = pattern.subn(lambda m: m.group(1) + blocks, text, count=1)
    if n != 1:
        raise RuntimeError(
            f"Could not find table header to insert measures after in {tmdl_path}"
        )

    tmdl_path.write_text(new_text, encoding="utf-8")


def generate_pbip(
    records: list[dict],
    dataset_id: str,
    visuals: list[dict] | None = None,
    data_colors: list[str] | None = None,
    heading_font: str = HEADING_FONT,
    body_font: str = BODY_FONT,
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
    # Always added: a completion_rate card reads the measure whether or not the user
    # asked for threshold colouring.
    add_completion_measures(output_dir, good_threshold, neutral_threshold)

    page_dir = (
        output_dir
        / "production_plan_reference.Report"
        / "definition"
        / "pages"
        / "2bb6229a2baa33c2479a"
    )
    apply_visuals(
        page_dir,
        visuals or DEFAULT_VISUALS,
        completion_thresholds=use_thresholds,
        data_colors=data_colors,
    )
    apply_page_background(page_dir)
    # Still applied: the theme handles text colour and fonts, and is what Power BI uses
    # on a first open. The visual- and page-level colours above are what survive a save.
    apply_theme(output_dir, data_colors, heading_font, body_font)

    return output_dir


if __name__ == "__main__":
    from excel_parser import load_production_plan

    records = load_production_plan("../sample_ProductionPlan/Sample1_single_sheet.xlsx")
    visuals = choose_visuals("Progress Overview")
    print("AI chose:", json.dumps(visuals, indent=2))
    out = generate_pbip(records, dataset_id="test-run-ai-chosen", visuals=visuals)
    print(f"Generated PBIP at: {out}")
