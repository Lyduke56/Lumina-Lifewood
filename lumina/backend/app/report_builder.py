"""Build the report, then write the Power BI file — tools four, five and six.

These complete the six-tool set of Decision 8. Together with the profiler, the role
agreement and the summariser, a workbook nobody has seen before can now travel the
whole way to a finished Power BI file without any column name being written into the
software.

The important departure from the previous generator: it wrote a fixed table of six
known columns — target_quantity, actual_hours and so on — which is exactly the
limitation Decision 3 exists to remove. Here the table is **generated from whatever
the summary actually contains**, so a workbook counting videos or revenue produces a
model describing videos or revenue.

The report is held as a specification that the tools add to, and only compiled into
Power BI at the end. That is deliberate: the agent edits the specification, never the
files, so it cannot express something the emitter would choke on.
"""

from __future__ import annotations

import json
import re
import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import pbib_generator as pbi
from summariser import Summary

CHART_KINDS = {"line": "lineChart", "bar": "clusteredColumnChart", "table": "tableEx"}


class ReportError(ValueError):
    """The request would produce a broken or meaningless report. The message says why."""


@dataclass
class Kpi:
    measure: str
    title: str
    good: float | None = None
    neutral: float | None = None


@dataclass
class Chart:
    kind: str
    measures: list[str]
    group_by: str
    title: str


@dataclass
class ReportSpec:
    """What the report should contain. The agent edits this; nothing else."""

    title: str = "Production Plan"
    kpis: list[Kpi] = field(default_factory=list)
    charts: list[Chart] = field(default_factory=list)
    palette: list[str] | None = None
    heading_font: str = pbi.HEADING_FONT
    body_font: str = pbi.BODY_FONT


# ── Tools four and five: put things on the page ──────────────────────────────


def _check_measure(summary: Summary, measure: str) -> None:
    if measure not in summary.measures:
        raise ReportError(
            f"There is no figure called {measure!r} in the summary. Available: "
            f"{', '.join(summary.measures)}."
        )


def add_kpi(
    spec: ReportSpec,
    summary: Summary,
    measure: str,
    title: str | None = None,
    good: float | None = None,
    neutral: float | None = None,
) -> ReportSpec:
    """Add a headline figure — a single large number.

    Thresholds colour it green, amber or red. They are given as proportions, so 0.9
    means 90%, and only make sense on a rate.
    """
    _check_measure(summary, measure)
    if (good is None) != (neutral is None):
        raise ReportError("Give both a good and a neutral threshold, or neither.")
    if good is not None and not good > neutral:
        raise ReportError(
            f"The good threshold ({good}) must be higher than the neutral one ({neutral})."
        )
    if good is not None and "completion_rate" not in measure:
        raise ReportError(
            f"Thresholds colour a rate against a target, so they do not apply to "
            f"{measure!r}. Use them on a completion rate."
        )
    spec.kpis.append(Kpi(measure, title or _pretty(measure), good, neutral))
    return spec


def add_chart(
    spec: ReportSpec,
    summary: Summary,
    kind: str,
    measures: list[str],
    group_by: str | None = None,
    title: str | None = None,
) -> ReportSpec:
    """Add a chart. `measures` are figures from the summary; `group_by` is what the
    horizontal axis runs along."""
    if kind not in CHART_KINDS:
        raise ReportError(
            f"{kind!r} is not a chart we can draw. Available: {', '.join(CHART_KINDS)}."
        )
    if not measures:
        raise ReportError("A chart needs at least one figure to show.")
    for measure in measures:
        _check_measure(summary, measure)

    group_by = group_by or (summary.group_by[0] if summary.group_by else None)
    if group_by not in summary.group_by:
        raise ReportError(
            f"{group_by!r} is not something this summary is grouped by. Available: "
            f"{', '.join(summary.group_by)}."
        )
    spec.charts.append(
        Chart(
            kind,
            list(measures),
            group_by,
            title or _chart_title(kind, measures, group_by),
        )
    )
    return spec


def _pretty(name: str) -> str:
    """'completion_rate_Images' -> 'Completion Rate (Images)'."""
    for stem in ("completion_rate", "cumulative_target", "cumulative_actual", "shortfall"):
        if name.startswith(stem + "_"):
            return f"{stem.replace('_', ' ').title()} ({name[len(stem) + 1:]})"
    if "_" in name:
        head, _, unit = name.partition("_")
        return f"{head.title()} ({unit})"
    return name.replace("_", " ").title()


def _chart_title(kind: str, measures: list[str], group_by: str) -> str:
    axis = "Date" if group_by == "period" else _pretty(group_by)
    if kind == "table":
        # Listing every column would give a table a title longer than its heading row.
        return f"Detail by {axis}"
    return f"{' vs '.join(_pretty(m) for m in measures)} by {axis}"


# ── Tool six: compile the specification into a Power BI file ─────────────────

ENTITY = "report_data"


def _tmdl_type(values: list) -> str:
    return "double" if any(isinstance(v, (int, float)) for v in values) else "string"


def _m_type(tmdl: str) -> str:
    return "number" if tmdl == "double" else "text"


def _m_literal(value, tmdl_type: str) -> str:
    if value is None:
        return "null"
    if tmdl_type == "double":
        return repr(float(value))
    return '"' + str(value).replace('"', '""') + '"'


def _measure_dax(name: str) -> tuple[str, str, str]:
    """How a summary column should be totalled, and how it should be shown.

    A rate cannot be summed or averaged across rows and stay meaningful — averaging
    daily percentages is exactly what once reported 1.29 for a plan that delivered
    100% — so it is recomputed from its underlying totals. A running total must not be
    summed either; the largest value in range is the one that is meant.
    """
    if name.startswith("completion_rate_"):
        unit = name[len("completion_rate_") :]
        return (
            f"DIVIDE(SUM({ENTITY}[actual_{unit}]), SUM({ENTITY}[target_{unit}]))",
            "0.0%",
            _pretty(name),
        )
    if name.startswith("cumulative_"):
        return f"MAX({ENTITY}[{name}])", "#,0", _pretty(name)
    return f"SUM({ENTITY}[{name}])", "#,0", _pretty(name)


def build_powerbi(
    spec: ReportSpec,
    summary: Summary,
    dataset_id: str,
    output_root: Path | None = None,
) -> Path:
    """Write the Power BI project. Returns the folder it was written to."""
    if not spec.kpis and not spec.charts:
        raise ReportError("The report is empty — add a chart or a headline figure first.")

    root = (output_root or pbi.OUTPUT_ROOT) / dataset_id
    if root.exists():
        shutil.rmtree(root)
    shutil.copytree(pbi.TEMPLATE_DIR, root)

    columns = summary.group_by + summary.measures
    types = {
        c: _tmdl_type([r.get(c) for r in summary.rows]) for c in columns
    }
    _write_model(root, summary, columns, types)
    _write_page(root, spec, summary)

    pbi.apply_theme(root, spec.palette, spec.heading_font, spec.body_font)
    return root


def _write_model(root: Path, summary: Summary, columns: list[str], types: dict) -> None:
    """Generate the table from whatever the summary holds, rather than a fixed six."""
    lines = [f"table {ENTITY}", f"\tlineageTag: {uuid.uuid4()}", ""]

    for name in summary.measures:
        dax, fmt, title = _measure_dax(name)
        lines += [
            f"\tmeasure '{title}' = {dax}",
            f"\t\tformatString: {fmt}",
            f"\t\tlineageTag: {uuid.uuid4()}",
            "",
        ]

    for column in columns:
        kind = types[column]
        lines += [
            f"\tcolumn {column}",
            f"\t\tdataType: {kind}",
            f"\t\tlineageTag: {uuid.uuid4()}",
            # Everything is totalled through an explicit measure above, so Power BI
            # must not offer its own implicit aggregation as well.
            "\t\tsummarizeBy: none",
            f"\t\tsourceColumn: {column}",
            "",
            "\t\tannotation SummarizationSetBy = User",
            "",
        ]

    signature = ", ".join(f"{c}={_m_type(types[c])}" for c in columns)
    rows = ",\n".join(
        "\t\t\t\t\t{" + ", ".join(_m_literal(r.get(c), types[c]) for c in columns) + "}"
        for r in summary.rows
    )
    lines += [
        f"\tpartition {ENTITY} = m",
        "\t\tmode: import",
        "\t\tsource =",
        "\t\t\tlet",
        "\t\t\t\tSource = #table(",
        f"\t\t\t\t\ttype table [{signature}],",
        "\t\t\t\t\t{",
        rows,
        "\t\t\t\t\t}",
        "\t\t\t\t)",
        "\t\t\tin",
        "\t\t\t\tSource",
        "",
        "\tannotation PBI_ResultType = Table",
        "",
    ]

    tables = root / "production_plan_reference.SemanticModel" / "definition" / "tables"
    for stale in tables.glob("*.tmdl"):
        stale.unlink()
    (tables / f"{ENTITY}.tmdl").write_text("\n".join(lines), encoding="utf-8")

    model = tables.parent / "model.tmdl"
    model.write_text(
        re.sub(
            r"^ref table .*$",
            f"ref table {ENTITY}",
            model.read_text(encoding="utf-8"),
            flags=re.M,
        ).replace('PBI_QueryOrder = ["clean_export"]', f'PBI_QueryOrder = ["{ENTITY}"]'),
        encoding="utf-8",
    )


def _measure_ref(title: str) -> dict:
    return {
        "Measure": {
            "Expression": {"SourceRef": {"Entity": ENTITY}},
            "Property": title,
        }
    }


def _column_ref(name: str) -> dict:
    return {
        "Column": {"Expression": {"SourceRef": {"Entity": ENTITY}}, "Property": name}
    }


def _series_colors(measures: list[str], palette: list[str]) -> list[dict]:
    """Pin each series to an explicit colour rather than letting the theme supply it.

    Power BI drops a hand-registered theme once Desktop saves the project, so anything
    left to the theme reverts to Microsoft's default blue the first time a customer
    saves. The selector has to match the queryRef of the projection it colours, which
    is why this cannot borrow the older generator's version — that one builds its
    selectors from the fixed column names this module exists to get rid of.
    """
    return [
        {
            "properties": {
                "fill": {
                    "solid": {
                        "color": pbi._literal(palette[index % len(palette)])
                    }
                }
            },
            "selector": {"metadata": f"{ENTITY}.{_measure_dax(measure)[2]}"},
        }
        for index, measure in enumerate(measures)
    ]


def _projection(name: str, as_measure: bool) -> dict:
    title = _measure_dax(name)[2] if as_measure else _pretty(name)
    return {
        "field": _measure_ref(title) if as_measure else _column_ref(name),
        "queryRef": f"{ENTITY}.{title if as_measure else name}",
        "nativeQueryRef": title,
    }


def _write_page(root: Path, spec: ReportSpec, summary: Summary) -> None:
    page = (
        root
        / "production_plan_reference.Report"
        / "definition"
        / "pages"
        / "2bb6229a2baa33c2479a"
    )
    visuals = page / "visuals"
    shutil.rmtree(visuals, ignore_errors=True)
    visuals.mkdir(parents=True)

    palette = pbi._valid_data_colors(spec.palette)
    layout = pbi._layout_positions(
        [{"type": "card"} for _ in spec.kpis] + [{"type": c.kind} for c in spec.charts]
    )

    for index, kpi in enumerate(spec.kpis):
        _write_visual(visuals, _kpi_json(kpi, layout[index], spec))

    for offset, chart in enumerate(spec.charts):
        position = layout[len(spec.kpis) + offset]
        _write_visual(visuals, _chart_json(chart, position, palette))

    pbi.apply_page_background(page)


def _write_visual(visuals: Path, content: dict) -> None:
    folder = visuals / content["name"]
    folder.mkdir()
    (folder / "visual.json").write_text(json.dumps(content, indent=2), encoding="utf-8")


def _kpi_json(kpi: Kpi, position: dict, spec: ReportSpec) -> dict:
    title = _measure_dax(kpi.measure)[2]
    value_props = pbi._text_style(spec.heading_font)
    value_props["fontColor"] = {"solid": {"color": pbi._literal(pbi.CASTLETON_GREEN)}}
    name = uuid.uuid4().hex[:20]
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": {
            "visualType": "cardVisual",
            "query": {
                "queryState": {
                    "Data": {"projections": [_projection(kpi.measure, as_measure=True)]}
                }
            },
            "objects": {
                "value": [
                    {"properties": value_props, "selector": {"id": "default"}}
                ],
                "label": [
                    {
                        "properties": pbi._text_style(spec.body_font, pbi.DARK_SERPENT),
                        "selector": {"id": "default"},
                    }
                ],
            },
            "drillFilterOtherVisuals": True,
        },
    }


def _chart_json(chart: Chart, position: dict, palette: list[str]) -> dict:
    name = uuid.uuid4().hex[:20]
    if chart.kind == "table":
        query = {
            "queryState": {
                "Values": {
                    "projections": [_projection(chart.group_by, as_measure=False)]
                    + [_projection(m, as_measure=True) for m in chart.measures]
                }
            }
        }
    else:
        query = {
            "queryState": {
                "Category": {
                    "projections": [
                        {**_projection(chart.group_by, as_measure=False), "active": True}
                    ]
                },
                "Y": {
                    "projections": [
                        _projection(m, as_measure=True) for m in chart.measures
                    ]
                },
            },
            "sortDefinition": {
                "sort": [
                    {"field": _column_ref(chart.group_by), "direction": "Ascending"}
                ],
                "isDefaultSort": True,
            },
        }

    visual = {"visualType": CHART_KINDS[chart.kind], "query": query, "drillFilterOtherVisuals": True}
    pbi._titled(visual, chart.title)
    if chart.kind != "table":
        visual["objects"] = {"dataPoint": _series_colors(chart.measures, palette)}
        pbi._styled_axes(visual)
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": visual,
    }
