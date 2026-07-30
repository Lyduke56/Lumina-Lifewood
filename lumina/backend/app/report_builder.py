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
import os
import re
import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import pbib_generator as pbi
import pbip_check
import pbip_engine
import pbir_check
from summariser import ORDER_KEY, PERIOD_LABEL, Summary

CHART_KINDS = {"line": "lineChart", "bar": "clusteredColumnChart", "table": "tableEx"}

# How many bars or points a chart can carry and still be read. This belongs to the chart,
# not to the figures behind it: a report may hold a hundred rows and still draw a perfectly
# readable four-bar chart, because Power BI totals the rest.
MAX_AXIS_VALUES = 30

# The page, and how things sit on it. Measured against a real Lifewood-style report John
# Peter supplied: 1280x720, headline cards about 95 tall in a row, and content visuals
# roughly 480 tall placed *beside* each other rather than stacked. Ours stacked everything
# full width and split the leftover height evenly, so a table of twenty-eight editors got
# 170 pixels and showed four rows with a scrollbar — the figures were right and unusable.
PAGE_WIDTH = 1280
PAGE_HEIGHT = 720
MARGIN = 24
GAP = 16
# 96 clipped the caption under the number — a card shows a value *and* what it is.
CARD_HEIGHT = 118

# Two side by side is as far as it goes: three across on a 1280 page leaves each too narrow
# to label, which is the same mistake in the other direction.
PER_ROW = 2

# A table earns more of the page than a chart. A chart says the same thing at 250 pixels as
# at 400; a table just shows fewer rows.
TABLE_WEIGHT = 1.6


def _layout_positions(
    kpis: list[Kpi], charts: list[Chart], written: bool = False
) -> tuple[list[dict], dict, dict | None]:
    """Where everything sits: the visuals, the title band, and the written panel.

    Deliberately separate from the older flow's version, which Studio and WhatsApp still
    draw with and which John Peter asked to leave alone.
    """
    positions: list[dict] = []
    inner = PAGE_WIDTH - 2 * MARGIN
    y = MARGIN

    header = {
        "x": MARGIN, "y": y, "z": 0, "width": inner, "height": HEADER_HEIGHT,
        "tabOrder": 0,
    }
    y += HEADER_HEIGHT + GAP

    if kpis:
        width = (inner - GAP * (len(kpis) - 1)) / len(kpis)
        for slot in range(len(kpis)):
            positions.append({
                "x": MARGIN + slot * (width + GAP),
                "y": y,
                "z": len(positions),
                "width": width,
                "height": CARD_HEIGHT,
                "tabOrder": len(positions),
            })
        y += CARD_HEIGHT + GAP

    if not charts:
        return positions, header, None

    # The written panel runs down the right of the content, as it does in every published
    # dashboard John Peter compared ours against — beside the charts it explains, not
    # beneath them where nobody scrolls.
    panel = None
    content = inner
    if written:
        panel_width = round(inner * INSIGHT_SHARE)
        content = inner - panel_width - GAP
        panel = {
            "x": MARGIN + content + GAP,
            "y": y,
            "z": 1,
            "width": panel_width,
            "height": PAGE_HEIGHT - MARGIN - y,
            "tabOrder": 1,
        }

    rows = [charts[i : i + PER_ROW] for i in range(0, len(charts), PER_ROW)]
    weights = [
        max((TABLE_WEIGHT if c.kind == "table" else 1.0) for c in row) for row in rows
    ]
    available = PAGE_HEIGHT - MARGIN - y - GAP * (len(rows) - 1)
    share = available / sum(weights)

    for row, weight in zip(rows, weights):
        height = share * weight
        width = (content - GAP * (len(row) - 1)) / len(row)
        for slot in range(len(row)):
            positions.append({
                "x": MARGIN + slot * (width + GAP),
                "y": y,
                "z": len(positions),
                "width": width,
                "height": height,
                "tabOrder": len(positions),
            })
        y += height + GAP

    return positions, header, panel


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

    # Set from the workbook when a session opens, and by the agent when it builds.
    title: str = "Report"
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

    # A rate and a count cannot share an axis. Asked to chart a completion rate of 1.5
    # beside a target of 135,000, no axis can show both: the rate collapses to an
    # invisible line along the bottom. A table can hold them together; a chart cannot, so
    # the tool declines rather than producing something unreadable.
    if kind != "table":
        rates = [m for m in measures if m.startswith("completion_rate")]
        counts = [m for m in measures if not m.startswith("completion_rate")]
        if rates and counts:
            raise ReportError(
                f"A rate and a count cannot share an axis — {rates[0]} runs around 1 "
                f"while {counts[0]} runs into the thousands, so the rate would be "
                f"invisible. Put the rate on its own chart, or use a table to show them "
                f"together."
            )

    group_by = group_by or (summary.group_by[0] if summary.group_by else None)
    if group_by not in summary.group_by:
        raise ReportError(
            f"{group_by!r} is not something this summary is grouped by. Available: "
            f"{', '.join(summary.group_by)}."
        )
    if kind != "table":
        on_axis = {
            row.get(group_by)
            for row in summary.rows
            if row.get(group_by) is not None
        }
        if len(on_axis) > MAX_AXIS_VALUES:
            raise ReportError(
                f"A chart against {group_by!r} would have {len(on_axis)} bars, more than "
                f"anyone can read. Use a table for that many, chart against something with "
                f"fewer values, or summarise it as a top ten."
            )

    spec.charts.append(
        Chart(
            kind,
            list(measures),
            group_by,
            title or _chart_title(kind, measures, group_by, summary.period),
        )
    )
    return spec


# What a derived figure is called in the report, where it differs from what the code
# calls it. "shortfall" is achieved minus planned, which is positive in a good month and
# negative in a bad one — so a figure called Shortfall showed −114,561 for the month
# production collapsed, which reads backwards. The customer's own workbook calls that
# column Balance, and John Peter chose to keep his word rather than invent ours.
DISPLAY_NAMES = {"shortfall": "Balance"}


def _pretty(name: str) -> str:
    """'completion_rate_Images' -> 'Completion Rate (Images)'."""
    for stem in ("completion_rate", "cumulative_target", "cumulative_actual", "shortfall"):
        if name.startswith(stem + "_"):
            label = DISPLAY_NAMES.get(stem, stem.replace("_", " ").title())
            return f"{label} ({name[len(stem) + 1:]})"
    if "_" in name:
        head, _, unit = name.partition("_")
        return f"{head.title()} ({unit})"
    return name.replace("_", " ").title()


def _chart_title(kind: str, measures: list[str], group_by: str, period: str = "day") -> str:
    """A title for a chart, naming the axis as the finished report labels it.

    Titles said "by Date" while the axis beneath them said "Month" — written before the
    timeline had a proper name, and left disagreeing with it afterwards.
    """
    axis = PERIOD_LABEL.get(period, "Date") if group_by == "period" else _pretty(group_by)
    if kind == "table":
        # Listing every column would give a table a title longer than its heading row.
        return f"Detail by {axis}"
    return f"{' vs '.join(_pretty(m) for m in measures)} by {axis}"


# ── Tool six: compile the specification into a Power BI file ─────────────────

ENTITY = "report_data"

# What the template's folders are called before we name them after the report.
TEMPLATE_STEM = "production_plan_reference"

# The ISO values are kept in a hidden companion column and the visible one is sorted by
# it, which is how Power BI is meant to be told that "Apr 2025" comes before "May 2025".
# Sorted on the readable text alone, a year of months reads Apr, Aug, Dec, Feb.
ORDER_COLUMN = "period_order"

# Colours a headline figure takes when thresholds are set. Green when it is meeting the
# target, amber when it is close, red when it is not.
STATUS_COLOURS = (pbi.CASTLETON_GREEN, "#B7791F", "#B3261E")


def _status_measure(kpi: Kpi) -> str:
    """A measure returning a colour, for a headline figure with thresholds set.

    Returns hex rather than words. The older flow wrote a measure returning "good",
    "neutral" and "bad" and bound a font colour to it — none of which are colours, so
    nothing could have come of it.
    """
    return f"{kpi.title} Colour"


def _project_name(title: str) -> str:
    """A folder name for this report, from its title.

    Every report used to be called 'production_plan_reference' — the template's name,
    which nobody chose. Two open at once in Power BI Desktop were indistinguishable.
    """
    cleaned = re.sub(r"[^A-Za-z0-9 _-]+", "", title).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:60] or "Report"


def _axis_name(summary: Summary) -> str:
    """What to call the timeline column in the finished report."""
    return PERIOD_LABEL.get(summary.period, "Date")


def _format_period(value, period: str) -> str:
    """'2025-04' -> 'Apr 2025'. Left alone if it is not the shape we expect."""
    text = str(value)
    try:
        if period == "month":
            year, month = text.split("-")
            return f"{MONTHS[int(month) - 1]} {year}"
        if period == "quarter":
            year, quarter = text.split("-Q")
            return f"Q{quarter} {year}"
        if period == "day":
            year, month, day = text.split("-")
            return f"{int(day)} {MONTHS[int(month) - 1]} {year}"
    except (ValueError, IndexError):
        pass
    return text


MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# A name safe to write unquoted, in either language. Anything else has to be escaped,
# and the two languages escape differently.
_SIMPLE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _tmdl_name(name: str) -> str:
    """A column name as TMDL needs it written.

    Measures were always quoted — 'Target (Images)' — and those files opened. Columns were
    not, which held only because every column name so far happened to be a single word. A
    column called 'Month (2)' produced a file Power BI refused to parse, and any customer
    heading with a space in it would have done the same.
    """
    if _SIMPLE_NAME.match(name):
        return name
    return "'" + name.replace("'", "''") + "'"


def _m_name(name: str) -> str:
    """The same name as Power Query needs it written, which is not the same escaping."""
    if _SIMPLE_NAME.match(name):
        return name
    return '#"' + name.replace('"', '""') + '"'


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
    stem = _name_project(root, spec.title)

    rows, columns, types = _model_columns(summary)
    _write_model(root, stem, summary, rows, columns, types, spec.kpis)
    _write_page(root, stem, spec, summary)

    pbi.apply_theme(root, spec.palette, spec.heading_font, spec.body_font)

    # copytree carries the template's own modification times across, so Power BI Desktop
    # announced a report built today as last saved on the day the template was made.
    now = time.time()
    for path in root.rglob("*"):
        os.utime(path, (now, now))
    os.utime(root, (now, now))

    # Checked against Microsoft's own TMDL and PBIP rules before anybody sees it. Two
    # files shipped today that Power BI refused to open, both after being "verified" by
    # reading them. Nothing here can open a .pbip, so the rules have to be checked
    # mechanically rather than by eye.
    pbip_check.require_valid(root)

    # And then have Power BI's own engine load it. Microsoft's modelling server reads a
    # PBIP folder directly and reports the same errors Power BI Desktop does — the
    # duplicate-column message it gives is word for word the one a customer saw. Reports
    # that will not open are the one fault nothing here could catch; now they fail in
    # three seconds on this machine instead. Reports that it cannot run are ignored: the
    # documented rules are already checked above, and refusing to deliver a report because
    # Node is missing would be worse than the fault being looked for.
    pbip_engine.load_model(root / f"{stem}.SemanticModel")

    # And the visuals, which the engine check cannot see. A property Power BI does not
    # recognise is accepted into the file and then ignored without complaint, so a report
    # looks wrong for no visible reason. This ran once and immediately found that every
    # chart axis and legend had been coloured with a property that does not exist.
    pbir_check.require_valid(root / f"{stem}.Report")
    return root


def _rename(source: Path, target: Path, attempts: int = 10) -> None:
    """Rename, waiting out a transient lock.

    Windows refuses to rename a folder anything still holds open, and on this machine that
    is briefly true for a folder just written — a virus scanner reading it, or a checking
    tool that has not quite let go. It presents as "Access is denied" on a folder nothing
    appears to be using.
    """
    for attempt in range(attempts):
        try:
            source.rename(target)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.3)


def _name_project(root: Path, title: str) -> str:
    """Rename the copied template after the report, and fix what points at it."""
    stem = _project_name(title)
    if stem == TEMPLATE_STEM:
        return stem
    for suffix in (".Report", ".SemanticModel"):
        _rename(root / f"{TEMPLATE_STEM}{suffix}", root / f"{stem}{suffix}")
    (root / f"{TEMPLATE_STEM}.pbip").rename(root / f"{stem}.pbip")

    # Both files name the folders by hand, so renaming without these is a broken project.
    for relative in (f"{stem}.pbip", f"{stem}.Report/definition.pbir"):
        path = root / relative
        path.write_text(
            path.read_text(encoding="utf-8").replace(TEMPLATE_STEM, stem),
            encoding="utf-8",
        )
    return stem


def _model_columns(summary: Summary) -> tuple[list[dict], list[str], dict]:
    """The columns to write, with the timeline given a name and readable values.

    Done here rather than in the summariser because it is a presentation decision: the
    figures are the same either way, and the summariser's own callers want the sortable
    form.
    """
    axis = _axis_name(summary)
    ordered = summary.group_by[0] if summary.group_by else None

    rows: list[dict] = []
    for row in summary.rows:
        copy = {k: v for k, v in row.items() if k != ORDER_KEY}
        if "period" in copy:
            # The sortable form of the timeline, kept beside the readable one.
            copy[ORDER_COLUMN] = str(copy["period"])
            copy[axis] = _format_period(copy.pop("period"), summary.period)
        elif ordered and row.get(ORDER_KEY) is not None:
            # Grouped by a label rather than a timeline. Ordered by when each group first
            # appeared, because a chart of month *names* otherwise runs April, August,
            # July, June, May, September — the alphabet's idea of a year, which reads as
            # though production collapsed in the second month instead of the fifth.
            copy[ORDER_COLUMN] = str(row[ORDER_KEY])
        rows.append(copy)

    columns = [axis if c == "period" else c for c in summary.group_by]
    if rows and ORDER_COLUMN in rows[0]:
        columns.append(ORDER_COLUMN)
    columns += summary.measures

    # Two columns of the same name make a file Power BI refuses to open outright, with
    # an error about TMDL objects that cannot be merged. It happened, and it reached a
    # customer. Caught here rather than trusted not to happen: a report that will not open
    # is worse than one that is never built, because the failure surfaces days later in
    # front of somebody who cannot act on it.
    duplicates = {c for c in columns if columns.count(c) > 1}
    if duplicates:
        raise ReportError(
            f"Two columns would be called {', '.join(sorted(duplicates))}, which Power BI "
            f"cannot open. Summarise without grouping by a column that shares its name "
            f"with the timeline."
        )

    types = {c: _tmdl_type([r.get(c) for r in rows]) for c in columns}
    return rows, columns, types


def _write_model(
    root: Path,
    stem: str,
    summary: Summary,
    rows: list[dict],
    columns: list[str],
    types: dict,
    kpis: list[Kpi],
) -> None:
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

    # A colour for each headline figure given thresholds. Its own measure, so the number
    # and its colour come from one expression and cannot disagree — and returning hex,
    # unlike the older attempt, which returned the words "good", "neutral" and "bad" and
    # bound a font colour to them. None of those are colours.
    for kpi in kpis:
        if kpi.good is None or kpi.neutral is None:
            continue
        lines += [
            f"\tmeasure '{_status_measure(kpi)}' = ```",
            f"\t\t\tVAR Rate = {_measure_dax(kpi.measure)[0]}",
            "\t\t\tRETURN",
            "\t\t\t    SWITCH(",
            "\t\t\t        TRUE(),",
            f'\t\t\t        Rate >= {kpi.good}, "{STATUS_COLOURS[0]}",',
            f'\t\t\t        Rate >= {kpi.neutral}, "{STATUS_COLOURS[1]}",',
            f'\t\t\t        "{STATUS_COLOURS[2]}"',
            "\t\t\t    )",
            "\t\t\t```",
            f"\t\tlineageTag: {uuid.uuid4()}",
            "",
        ]

    axis = _axis_name(summary)
    # Whichever column the report is grouped by is the one that needs ordering — the
    # readable timeline when there is one, otherwise the label that replaced it.
    sorted_column = axis if "period" in summary.group_by else (
        summary.group_by[0] if summary.group_by else None
    )
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
        ]
        if column == sorted_column and ORDER_COLUMN in columns:
            # 'Apr 2025' comes before 'Aug 2025' in the alphabet but not in a year, so
            # the readable column is ordered by the sortable one beside it.
            lines.append(f"\t\tsortByColumn: {ORDER_COLUMN}")
        if column == ORDER_COLUMN:
            lines.append("\t\tisHidden")  # it exists only to put the other in order
        lines += ["", "\t\tannotation SummarizationSetBy = User", ""]

    signature = ", ".join(f"{_m_name(c)}={_m_type(types[c])}" for c in columns)
    literals = ",\n".join(
        "\t\t\t\t\t{" + ", ".join(_m_literal(r.get(c), types[c]) for c in columns) + "}"
        for r in rows
    )
    lines += [
        f"\tpartition {ENTITY} = m",
        "\t\tmode: import",
        "\t\tsource =",
        "\t\t\tlet",
        "\t\t\t\tSource = #table(",
        f"\t\t\t\t\ttype table [{signature}],",
        "\t\t\t\t\t{",
        literals,
        "\t\t\t\t\t}",
        "\t\t\t\t)",
        "\t\t\tin",
        "\t\t\t\tSource",
        "",
        "\tannotation PBI_ResultType = Table",
        "",
    ]

    tables = root / f"{stem}.SemanticModel" / "definition" / "tables"
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


def _projection(name: str, as_measure: bool, formatted: bool = False) -> dict:
    """One field on a visual.

    `formatted` writes the measure's format string onto the projection, which is how a
    visual overrides how a number is shown. A card otherwise abbreviates: 2,966 and 2,563
    both read "3K" — two different figures displayed identically, and the first thing a
    manager sees. The property is not `labelDisplayUnits` on the value object, which is
    what a plausible-looking guess tried and Power BI silently ignored; it is a `format`
    beside `queryRef`, learned by setting it by hand in Power BI Desktop and reading back
    the single line it wrote.
    """
    dax, fmt, title = _measure_dax(name) if as_measure else (None, None, _pretty(name))
    projection = {
        "field": _measure_ref(title) if as_measure else _column_ref(name),
        "queryRef": f"{ENTITY}.{title if as_measure else name}",
        "nativeQueryRef": title,
    }
    if formatted and fmt:
        projection["format"] = fmt
    return projection


def _write_page(root: Path, stem: str, spec: ReportSpec, summary: Summary) -> None:
    page = (
        root
        / f"{stem}.Report"
        / "definition"
        / "pages"
        / "2bb6229a2baa33c2479a"
    )
    visuals = page / "visuals"
    shutil.rmtree(visuals, ignore_errors=True)
    visuals.mkdir(parents=True)

    palette = pbi._valid_data_colors(spec.palette)
    written = insights(spec, summary)
    layout, header, panel = _layout_positions(spec.kpis, spec.charts, bool(written))

    for index, kpi in enumerate(spec.kpis):
        _write_visual(visuals, _kpi_json(kpi, layout[index], spec))

    axis = _axis_name(summary)
    for offset, chart in enumerate(spec.charts):
        position = layout[len(spec.kpis) + offset]
        _write_visual(visuals, _chart_json(chart, position, palette, axis))

    # The brand mark sits at the right of the title band, as it does in the report John
    # Peter asked us to match. The title keeps the room the logo does not take.
    band = dict(header)
    if _register_logo(root, stem):
        band["width"] = header["width"] - LOGO_WIDTH - GAP
        _write_visual(visuals, _logo_json(uuid.uuid4().hex[:20], {
            "x": header["x"] + header["width"] - LOGO_WIDTH,
            "y": header["y"] + (HEADER_HEIGHT - LOGO_HEIGHT) / 2,
            "z": 0,
            "width": LOGO_WIDTH,
            "height": LOGO_HEIGHT,
            "tabOrder": 0,
        }))

    # The title band, so the page says what it is before anything else does.
    _write_visual(visuals, _textbox(uuid.uuid4().hex[:20], band, [
        {
            "textRuns": [_run(spec.title, 20, pbi.DARK_SERPENT, bold=True)],
            "horizontalTextAlignment": "left",
        },
        {
            "textRuns": [
                # Grouped three ways, 238 rows are not 238 months. Say what is true of
                # any grouping: how much of the customer's sheet went into this.
                _run(
                    f"Built from {summary.source_rows_used:,} of "
                    f"{summary.source_rows_used + summary.source_rows_skipped:,} rows"
                    + (
                        f", grouped by {', '.join(summary.group_by).replace('period', _axis_name(summary))}"
                        if summary.group_by
                        else ""
                    ),
                    10,
                    pbi.CASTLETON_GREEN,
                )
            ],
            "horizontalTextAlignment": "left",
        },
    ]))

    if panel and written:
        paragraphs = [{
            "textRuns": [_run("What the figures say", 13, pbi.DARK_SERPENT, bold=True)],
            "horizontalTextAlignment": "left",
        }]
        for line in written:
            paragraphs.append({
                "textRuns": [_run(line, 10, pbi.DARK_SERPENT)],
                "horizontalTextAlignment": "left",
            })
        written_panel = _textbox(uuid.uuid4().hex[:20], panel, paragraphs)
        _framed(written_panel["visual"])
        _write_visual(visuals, written_panel)

    pbi.apply_page_background(page)
    _name_page(page, spec.title)


def _name_page(page: Path, title: str) -> None:
    """Call the tab after the report rather than leaving it as 'Page 1'."""
    path = page / "page.json"
    content = json.loads(path.read_text(encoding="utf-8"))
    content["displayName"] = title
    path.write_text(json.dumps(content, indent=2), encoding="utf-8")


def _write_visual(visuals: Path, content: dict) -> None:
    folder = visuals / content["name"]
    folder.mkdir()
    (folder / "visual.json").write_text(json.dumps(content, indent=2), encoding="utf-8")


def _kpi_json(kpi: Kpi, position: dict, spec: ReportSpec) -> dict:
    card: dict = {}
    title = _measure_dax(kpi.measure)[2]
    value_props = pbi._text_style(spec.heading_font)
    # Show the number in full. A card abbreviates by default, so 2,966 and 2,563 both read
    # "3K" — two different figures displayed identically, and the first thing a manager
    # sees. The property name was right the first time and the *value* was wrong: this is
    # an enum where 0 means Auto, so setting 0 asked for the default and changed nothing.
    # 1 is None. Established from Microsoft's own CLI rather than guessed:
    #   powerbi-report-author formatting describe-object cardVisual value
    #   -> labelDisplayUnits {"type":"enum","values":["0","1","1000",...]}
    value_props["labelDisplayUnits"] = {"expr": {"Literal": {"Value": "'1'"}}}
    if kpi.good is not None and kpi.neutral is not None:
        # Bound to the colour measure written alongside the figure. Thresholds were being
        # stored and then ignored here: every card was painted green whatever it said.
        value_props["fontColor"] = {
            "solid": {
                "color": {
                    "expr": {
                        "Measure": {
                            "Expression": {"SourceRef": {"Entity": ENTITY}},
                            "Property": _status_measure(kpi),
                        }
                    }
                }
            }
        }
    else:
        value_props["fontColor"] = {"solid": {"color": pbi._literal(pbi.CASTLETON_GREEN)}}
    name = uuid.uuid4().hex[:20]
    card = {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": {
            "visualType": "cardVisual",
            "query": {
                "queryState": {
                    "Data": {
                        "projections": [
                            _projection(kpi.measure, as_measure=True, formatted=True)
                        ]
                    }
                }
            },
            "objects": {
                "value": [
                    {"properties": value_props, "selector": {"id": "default"}}
                ],
                "label": [
                    {
                        "properties": {
                            **pbi._text_style(spec.body_font, pbi.DARK_SERPENT),
                            "show": {"expr": {"Literal": {"Value": "true"}}},
                            # The name the customer agreed to. Without this a card shows
                            # the raw measure name from the model, so a figure asked for
                            # as "Total Planned Videos" was captioned "Cumulative Target
                            # (Videos)". Documented in Microsoft's card reference:
                            # "By default the card shows the raw measure name from the
                            # model. Override with label.text."
                            "text": pbi._literal(kpi.title),
                        },
                        "selector": {"id": "default"},
                    }
                ],
            },
            "drillFilterOtherVisuals": True,
        },
    }
    _framed(card["visual"])
    return card


def _chart_json(chart: Chart, position: dict, palette: list[str], axis: str) -> dict:
    """One chart. `axis` is what the timeline column ended up being called."""
    name = uuid.uuid4().hex[:20]
    # The specification talks about "period"; the model calls it Month, Week or Date.
    group_by = axis if chart.group_by == "period" else chart.group_by
    if chart.kind == "table":
        query = {
            "queryState": {
                "Values": {
                    "projections": [_projection(group_by, as_measure=False)]
                    + [_projection(m, as_measure=True) for m in chart.measures]
                }
            }
        }
    else:
        query = {
            "queryState": {
                "Category": {
                    "projections": [
                        {**_projection(group_by, as_measure=False), "active": True}
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
                    {"field": _column_ref(group_by), "direction": "Ascending"}
                ],
                "isDefaultSort": True,
            },
        }

    visual = {"visualType": CHART_KINDS[chart.kind], "query": query, "drillFilterOtherVisuals": True}
    pbi._titled(visual, chart.title)
    _framed(visual)
    if chart.kind != "table":
        visual["objects"] = {"dataPoint": _series_colors(chart.measures, palette)}
        pbi._styled_axes(visual)
        # Power BI titles the value axis by listing every series on it, which produced
        # "Target (Images) and Actual (Images)" beside a chart already titled and
        # labelled with exactly that. The chart title and legend say it once; an axis
        # does not need to say it again. `showAxisTitle` is Microsoft's own property
        # name, taken from the base theme they ship rather than guessed at.
        visual["objects"]["valueAxis"][0]["properties"]["showAxisTitle"] = {
            "expr": {"Literal": {"Value": "false"}}
        }
        # The number written on each bar. Every published dashboard John Peter compared
        # ours against does this, and it saves a reader estimating against a gridline.
        visual["objects"]["labels"] = [{"properties": {"show": _literal("true")}}]
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": visual,
    }


# ── The same report, drawn in the website beside the conversation ────────────


def web_preview(spec: ReportSpec, summary: Summary) -> dict:
    """The report described for the website to draw, as Decision 2 intended.

    A separate shape from the one the older flow produces, and deliberately so. That one
    names six fixed figures — target_quantity, actual_hours and the rest — which is the
    limitation Decision 3 exists to remove; a customer counting videos or revenue has
    none of them. This carries its own labels and whatever figures the report actually
    has, so the preview can describe a workbook nobody has seen yet.

    Marked with `kind` so the website can tell the two apart and keep drawing existing
    reports exactly as it does now.
    """
    axis = _axis_name(summary) if "period" in summary.group_by else (
        summary.group_by[0] if summary.group_by else "Group"
    )
    rows, _, _ = _model_columns(summary)

    # Which totals a rate is made of, so the preview divides the same way the report's
    # own DAX does rather than averaging percentages — the mistake that once reported
    # 129% for a plan that delivered 100%.
    rates: dict[str, list[str]] = {}
    for measure in summary.measures:
        if measure.startswith("completion_rate_"):
            unit = measure[len("completion_rate_") :]
            rates[measure] = [f"actual_{unit}", f"target_{unit}"]

    return {
        "kind": "flexible",
        "title": spec.title,
        "group_by": {"key": axis, "label": axis},
        "measures": [
            {
                "key": m,
                "label": _measure_dax(m)[2],
                "format": "percent" if m.startswith("completion_rate_") else "number",
                "aggregate": "max" if m.startswith("cumulative_") else "sum",
            }
            for m in summary.measures
        ],
        "rates": rates,
        "headline_figures": [
            {"measure": k.measure, "label": _measure_dax(k.measure)[2]} for k in spec.kpis
        ],
        "charts": [
            {"kind": c.kind, "title": c.title, "measures": c.measures} for c in spec.charts
        ],
        "rows": [
            {k: v for k, v in row.items() if k not in (ORDER_COLUMN, ORDER_KEY)}
            for row in rows
        ],
        "data_colors": pbi._valid_data_colors(spec.palette),
        "heading_font": spec.heading_font,
        "body_font": spec.body_font,
    }


# ── Making it look like a dashboard rather than three visuals on a page ──────
#
# John Peter put ours beside a real Lifewood report and some published dashboards and the
# difference was not the figures — it was that theirs are *designed*: white cards on a
# tinted page, a title band, numbers written on the bars, and a panel of written insights
# beside the charts. He singled out the last of those.
#
# Every property below was read out of the real Power BI file he supplied rather than
# guessed at, because a wrong visual property is accepted in silence and discovered by a
# customer. `pbir_check` now refuses the ones Microsoft does not document.

CARD_WHITE = "#FFFFFF"
CARD_RADIUS = 10
HEADER_HEIGHT = 64
INSIGHT_SHARE = 0.34  # how much of the content width the written insights take


def _literal(value: str | float | bool) -> dict:
    return {"expr": {"Literal": {"Value": value}}}


def _framed(visual: dict, tinted: bool = False) -> dict:
    """Put a visual in a white card with a soft rounded border.

    The single change that most closes the gap with a designed dashboard: visuals stop
    floating on the page background and become cards, the way every published example does.
    """
    container = visual.setdefault("visualContainerObjects", {})
    container["background"] = [
        {
            "properties": {
                "show": _literal("true"),
                "color": {"solid": {"color": _literal(f"'{CARD_WHITE}'")}},
                "transparency": _literal("0D"),
            }
        }
    ]
    container["border"] = [
        {
            "properties": {
                "show": _literal("true"),
                "color": {"solid": {"color": _literal(f"'{pbi.PAPER}'")}},
                "radius": _literal(f"{CARD_RADIUS}D"),
                "width": _literal("1D"),
            }
        }
    ]
    return visual


def _textbox(name: str, position: dict, paragraphs: list[dict]) -> dict:
    """A block of written text on the page — a title, or the insights panel.

    The shape of `paragraphs` is copied from the working report: a list of paragraphs, each
    a list of text runs carrying their own size, weight and colour.
    """
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": {
            "visualType": "textbox",
            "objects": {"general": [{"properties": {"paragraphs": paragraphs}}]},
            "drillFilterOtherVisuals": True,
        },
    }


# The brand mark, and its shape on the page. Taken from the PNG embedded in the website's
# own logo file, so it is the same mark customers already see, not a redrawn one.
LOGO_SOURCE = Path(__file__).resolve().parent.parent / "pbib_reference" / "lifewood-full-green.png"
LOGO_ITEM = "LifewoodLogo.png"
LOGO_HEIGHT = 36
LOGO_WIDTH = round(LOGO_HEIGHT * 1519 / 429)  # the file's own proportions, not a guess


def _register_logo(root: Path, stem: str) -> bool:
    """Put the logo in the report's resources and declare it, the way the reference does.

    A picture on a Power BI page is not a file path: it is an item in the report's
    RegisteredResources package, referred to by name. Copying the file in without declaring
    it leaves an empty box, and declaring it without copying it in stops the report opening.
    """
    if not LOGO_SOURCE.exists():
        return False

    report = root / f"{stem}.Report"
    resources = report / "StaticResources" / "RegisteredResources"
    resources.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(LOGO_SOURCE, resources / LOGO_ITEM)

    path = report / "definition" / "report.json"
    content = json.loads(path.read_text(encoding="utf-8"))
    for package in content.get("resourcePackages", []):
        if package.get("type") != "RegisteredResources":
            continue
        items = package.setdefault("items", [])
        if not any(item.get("name") == LOGO_ITEM for item in items):
            items.append({"name": LOGO_ITEM, "path": LOGO_ITEM, "type": "Image"})
        path.write_text(json.dumps(content, indent=2), encoding="utf-8")
        return True
    return False


def _logo_json(name: str, position: dict) -> dict:
    """The logo as an image visual, sized to fit rather than stretched."""
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
        "name": name,
        "position": position,
        "visual": {
            "visualType": "image",
            "objects": {
                "image": [
                    {
                        "properties": {
                            "sourceFile": {
                                "image": {
                                    "name": _literal(f"'{LOGO_ITEM}'"),
                                    "url": {
                                        "expr": {
                                            "ResourcePackageItem": {
                                                "PackageName": "RegisteredResources",
                                                "PackageType": 1,
                                                "ItemName": LOGO_ITEM,
                                            }
                                        }
                                    },
                                    "scaling": _literal("'Normal'"),
                                }
                            },
                            # Fit, not Fill: Fill crops the mark to the box, and a cropped
                            # logo is worse than none.
                            "fit": _literal("'Fit'"),
                        },
                        "selector": {"id": "default"},
                    }
                ]
            },
            "drillFilterOtherVisuals": True,
        },
    }


def _run(text: str, size: int, colour: str, bold: bool = False) -> dict:
    style = {"fontSize": f"{size}pt", "color": colour, "fontFamily": pbi.BODY_FONT}
    if bold:
        style["fontWeight"] = "bold"
    return {"value": text, "textStyle": style}


def insights(spec: ReportSpec, summary: Summary) -> list[str]:
    """What the figures say, in sentences, for the panel beside the charts.

    John Peter liked this in the published dashboards he compared ours against, and it is
    the one thing on a dashboard that tells a manager what happened rather than leaving
    them to work it out from bars.

    Every figure here is read out of the summary, never recomputed and never estimated —
    the same rule the conversation is held to. A written insight that quietly rounds or
    guesses is worse than no insight, because prose is believed more readily than a chart.
    """
    lines: list[str] = []
    if not summary.rows or not summary.group_by:
        return lines

    axis = summary.group_by[0]
    period_label = _axis_name(summary) if axis == "period" else axis

    for measure in summary.measures:
        if not measure.startswith("completion_rate_"):
            continue
        unit = measure[len("completion_rate_") :]
        planned = [r.get(f"target_{unit}") for r in summary.rows]
        achieved = [r.get(f"actual_{unit}") for r in summary.rows]
        total_planned = sum(v for v in planned if isinstance(v, (int, float)))
        total_achieved = sum(v for v in achieved if isinstance(v, (int, float)))
        if not total_planned:
            continue

        rate = total_achieved / total_planned
        shortfall = total_achieved - total_planned
        lines.append(
            f"{total_achieved:,.0f} of {total_planned:,.0f} {unit.lower()} planned were "
            f"delivered — {rate:.1%}."
        )
        if shortfall < 0:
            lines.append(f"That is {abs(shortfall):,.0f} {unit.lower()} short of the plan.")
        elif shortfall > 0:
            lines.append(f"That is {shortfall:,.0f} {unit.lower()} above the plan.")

        # The best and worst periods, which is the thing a single overall figure hides —
        # a project can meet its contract exactly and still have collapsed in one month.
        # Named as the finished report names it: "Feb 2026", not "2026-02".
        def shown(value) -> str:
            return (
                _format_period(value, summary.period) if axis == "period" else str(value)
            )

        # Totalled per period first. Grouped by month *and* studio *and* editor, a single
        # row is one editor in one studio in one month — reading the rate off it reported
        # "strongest month: Jan at 350%" when January as a whole ran at 118%. The best row
        # is not the best month, and prose that says "month" must mean the month.
        per_period: dict[str, list[float]] = {}
        for row in summary.rows:
            key = row.get(axis)
            if key is None:
                continue
            # Counted independently. A row whose planned figure is a dash still delivered
            # what it delivered, and the chart adds it up — skipping the whole row put the
            # panel 1.4 points below the bar beside it, which is the sort of small
            # disagreement that costs more trust than a large one.
            got = per_period.setdefault(shown(key), [0.0, 0.0])
            planned_here = row.get(f"target_{unit}")
            achieved_here = row.get(f"actual_{unit}")
            if isinstance(planned_here, (int, float)):
                got[0] += planned_here
            if isinstance(achieved_here, (int, float)):
                got[1] += achieved_here

        rated = [
            (name, totals[1] / totals[0])
            for name, totals in per_period.items()
            if totals[0]
        ]
        if len(rated) > 1:
            best = max(rated, key=lambda pair: pair[1])
            worst = min(rated, key=lambda pair: pair[1])
            if best[0] != worst[0]:
                lines.append(
                    f"Strongest {period_label.lower()}: {best[0]} at {best[1]:.1%}."
                )
                lines.append(
                    f"Weakest {period_label.lower()}: {worst[0]} at {worst[1]:.1%}."
                )
        break

    if summary.source_rows_skipped:
        lines.append(
            f"{summary.source_rows_used:,} of "
            f"{summary.source_rows_used + summary.source_rows_skipped:,} rows were used; "
            f"the rest had no date or no figures."
        )
    return lines
