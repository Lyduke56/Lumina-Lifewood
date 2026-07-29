"""The six tools, in the form an AI can call them.

Decision 8 chose six tools to start with; Decision 9 settled that they sit alongside
the existing conveyor belt rather than replacing it, so nothing anyone uses changes.

Two things shape how these are written:

  * **They return words, not data.** The figures stay on the server (Decision 9) and
    each answer is a short readable summary. The AI needs to decide what to do next,
    not read 180 rows of numbers.
  * **They refuse rather than improvise.** Every failure is a sentence saying what went
    wrong and what to do instead, because the reader is an agent that has to act on it.
    Decision 7 records why: a tool that accepts a bad instruction and produces a broken
    report is worse than one that declines.
"""

from __future__ import annotations

import workbench
from column_roles import Assignment, Role, RoleError, describe, set_column_roles
from report_builder import ReportError, add_chart, add_kpi, build_powerbi
from sheet_profiler import list_sheets, profile_sheet
from supabase_client import (
    save_dataset,
    save_generated_file,
    upload_generated_file,
)
from summariser import SummaryError, summarise


def reply_to_customer(message: str) -> str:
    """Say something to the customer. This is the ONLY way they hear from you.

    Anything written outside a tool is discarded and never reaches them, so use this for
    every question, explanation and confirmation.

    Args:
        message: Plain language for a busy, non-technical production manager. No column
            numbers, no tool names, no thinking out loud — just what they need to know
            or decide. A few sentences at most.
    """
    return "Sent. Wait for their reply before doing anything further."


def open_workbook(file_path: str) -> str:
    """Begin a report from an Excel workbook, and list the sheets it contains.

    Returns a session id to pass to every later step, along with each sheet and its
    size so you can ask the customer which one holds their production plan.

    Args:
        file_path: Absolute path to the .xlsx file on disk.
    """
    session = workbench.open_session(file_path)
    sheets = list_sheets(session.workbook)
    lines = [f"Report session {session.id} started for {session.workbook.name}.", ""]
    lines += [
        f"  {s['name']} — {s['rows']:,} rows, {s['columns']} columns" for s in sheets
    ]
    lines += ["", "Ask which sheet to use, then examine it."]
    return "\n".join(lines)


def examine_sheet(session_id: str, sheet_name: str) -> str:
    """Describe one sheet: what each column holds and anything hazardous in it.

    Read this before deciding anything. It reports what kind of information each
    column holds, how varied it is, whether it could be grouped by, and warns about
    total rows, padding and placeholder text that would otherwise corrupt the report.

    Args:
        session_id: From open_workbook.
        sheet_name: Exactly as listed by open_workbook.
    """
    session = workbench.get(session_id)
    profile = profile_sheet(session.workbook, sheet_name)
    session.profiles[sheet_name] = profile

    lines = [
        f"'{sheet_name}': {profile.data_row_count:,} rows of data, "
        f"starting at row {profile.data_starts_at}.",
        "",
        f"  {'#':>3}  {'heading':30} {'holds':7} {'different':>9}  can group by",
    ]
    for column in profile.columns:
        distinct = f"{column.distinct}{'+' if column.distinct_capped else ''}"
        lines.append(
            f"  {column.position:>3}  {str(column.heading or '(unnamed)')[:30]:30} "
            f"{column.mostly:7} {distinct:>9}  {column.breakdown_suitability}"
        )
    if profile.warnings:
        lines += ["", "Watch out for:"]
        lines += [f"  - {w}" for w in profile.warnings]
    # A ready-made skeleton, every column already present and set to 'ignore'. Building
    # this list from scratch is where models slip: they omit a column, are refused, and
    # try again — six attempts in one observed conversation, each costing a request
    # against a daily allowance. Editing a complete list is a far smaller task than
    # composing one.
    skeleton = "\n".join(
        f'    {{"position": {c.position}, "role": "ignore"}},'
        f'  # {c.heading or "(unnamed)"} — holds {c.mostly}'
        for c in profile.columns
    )
    lines += [
        "",
        "Now say what each column is for with record_column_meanings. Every column must",
        "be given a job. Start from this and change the roles that are not 'ignore':",
        "",
        "  columns = [",
        skeleton,
        "  ]",
        "",
        "Roles: date (the timeline), label (something to group by), target (a planned",
        "figure — add unit), actual (an achieved figure — add unit and pairs_with),",
        "calculated (worked out from the others — optionally add derives), ignore.",
    ]
    return "\n".join(lines)


def record_column_meanings(session_id: str, sheet_name: str, columns: list[dict]) -> str:
    """Say what job each column does, and have it checked.

    Every column must appear. Each achieved figure must say which planned figure it
    belongs to — pairing them wrongly is what once reported a nonsensical
    "265% complete".

    Args:
        session_id: From open_workbook.
        sheet_name: The sheet examined.
        columns: One entry per column, each with:
            position  - the column number from examine_sheet
            role      - date, label, target, actual, calculated or ignore
            unit      - for a figure, what it counts, e.g. "Images"
            pairs_with- for an actual, the column number of its target
            derives   - for a calculated column, which figure it holds
                        (completion_rate, shortfall, cumulative_target,
                         cumulative_actual), so we can check their arithmetic
    """
    session = workbench.get(session_id)
    profile = session.profiles.get(sheet_name)
    if profile is None:
        raise workbench.SessionError(
            f"'{sheet_name}' has not been examined yet. Call examine_sheet first."
        )
    try:
        assignments = [
            Assignment(
                position=int(c["position"]),
                role=Role(str(c["role"]).lower()),
                unit=c.get("unit"),
                pairs_with=c.get("pairs_with"),
                derives=c.get("derives"),
            )
            for c in columns
        ]
    except (KeyError, ValueError) as e:
        raise RoleError(
            f"Could not read the column list: {e}. Each entry needs a 'position' and "
            f"a 'role' of {', '.join(r.value for r in Role)}."
        ) from e

    session.schema = set_column_roles(profile, assignments)
    session.summary = None  # the figures must be totalled again under new meanings
    return (
        describe(session.schema, profile)
        + "\n\nConfirm this with the customer, then summarise the figures."
    )


def summarise_figures(
    session_id: str,
    period: str = "month",
    group_by: list[int] | None = None,
    top_n: int | None = None,
) -> str:
    """Total the figures, ready to go into the report.

    A dashboard needs totals, not every record. Summarise before building anything.

    Args:
        session_id: From open_workbook.
        period: day, week, month, quarter, or none.
        group_by: Column numbers to split by. Must be columns marked 'label'.
        top_n: Keep only the largest groups, gathering the rest into "Other". Use
            this when a column has too many values to chart readably.
    """
    session = workbench.get(session_id)
    schema = workbench.require_schema(session)
    profile = session.profiles[schema.sheet]
    summary = summarise(
        session.workbook, profile, schema, period=period, group_by=group_by, top_n=top_n
    )
    session.summary = summary
    session.spec.charts.clear()
    session.spec.kpis.clear()

    lines = [
        f"Summarised into {summary.group_count} rows from "
        f"{summary.source_rows_used:,} rows of the sheet.",
        "",
        f"Figures available: {', '.join(summary.measures)}",
    ]
    preview = summary.rows[:6]
    if preview:
        lines += ["", "First rows:"]
        for row in preview:
            lines.append(
                "  "
                + ", ".join(
                    f"{k}={'-' if v is None else (f'{v:,.2f}'.rstrip('0').rstrip('.') if isinstance(v, (int, float)) else v)}"
                    for k, v in row.items()
                )
            )
        if summary.group_count > len(preview):
            lines.append(f"  … and {summary.group_count - len(preview)} more")
    for w in summary.warnings:
        lines.append(f"  ! {w}")
    for r in summary.reconciliation:
        lines.append(f"  {r}")
    lines += ["", "Now add headline figures and charts."]
    return "\n".join(lines)


def add_headline_figure(
    session_id: str,
    measure: str,
    title: str | None = None,
    good_threshold: float | None = None,
    neutral_threshold: float | None = None,
) -> str:
    """Put a single large number on the report.

    Args:
        session_id: From open_workbook.
        measure: One of the figures listed by summarise_figures.
        title: What to call it. Defaults to a readable version of the figure's name.
        good_threshold: At or above this it is shown green, e.g. 0.9 for 90%.
        neutral_threshold: At or above this, amber; below it, red.
    """
    session = workbench.get(session_id)
    summary = workbench.require_summary(session)
    add_kpi(session.spec, summary, measure, title, good_threshold, neutral_threshold)
    return (
        f"Added headline figure '{session.spec.kpis[-1].title}'. "
        f"The report now has {len(session.spec.kpis)} headline figure(s) and "
        f"{len(session.spec.charts)} chart(s)."
    )


def add_report_chart(
    session_id: str,
    kind: str,
    measures: list[str],
    group_by: str | None = None,
    title: str | None = None,
) -> str:
    """Put a chart on the report.

    Args:
        session_id: From open_workbook.
        kind: line, bar or table.
        measures: Figures from summarise_figures to plot.
        group_by: What the horizontal axis runs along. Defaults to the period.
        title: What to call it. A readable one is worked out if omitted.
    """
    session = workbench.get(session_id)
    summary = workbench.require_summary(session)
    add_chart(session.spec, summary, kind, measures, group_by, title)
    return (
        f"Added {kind} chart '{session.spec.charts[-1].title}'. "
        f"The report now has {len(session.spec.kpis)} headline figure(s) and "
        f"{len(session.spec.charts)} chart(s)."
    )


def build_report_file(session_id: str, dataset_id: str) -> str:
    """Write the Power BI file from everything added so far.

    Args:
        session_id: From open_workbook.
        dataset_id: A unique name for this report's folder.
    """
    session = workbench.get(session_id)
    summary = workbench.require_summary(session)
    folder = build_powerbi(session.spec, summary, dataset_id)

    built = (
        f"{len(session.spec.kpis)} headline figure(s) and "
        f"{len(session.spec.charts)} chart(s) over {summary.group_count} rows"
    )

    # Writing the file to the server is not delivering it. Without this the report
    # existed only in a folder on our machine — it never reached the customer's Files
    # list and there was nothing for them to download, while the agent cheerfully
    # reported it as ready.
    if not session.owner:
        return f"Built the report ({built}), saved at {folder}."

    dataset = save_dataset(
        source_file_path=str(session.workbook),
        parsed_rows=summary.rows,
        conversation_id=session.owner["conversation_id"],
    )
    storage_path = upload_generated_file(
        folder,
        user_id=session.owner["user_id"],
        dataset_id=dataset["id"],
        report_name=session.spec.title,
    )
    save_generated_file(
        dataset_id=dataset["id"],
        layout_json={
            "headline_figures": [k.title for k in session.spec.kpis],
            "charts": [c.title for c in session.spec.charts],
        },
        # The website's preview expects the older fixed column names and cannot read
        # these yet; that is the next piece of work, not something to fake here.
        chart_preview_json=None,
        conversation_id=session.owner["conversation_id"],
        storage_path=storage_path,
    )
    return (
        f"Built the report ({built}) and saved it to the customer's account. It is now "
        f"in their Files list, ready to download. Tell them it is ready — do not mention "
        f"folders or file paths."
    )


# The six tools of Decision 8, in the order they are meant to be used.
TOOLS = [
    reply_to_customer,
    open_workbook,
    examine_sheet,
    record_column_meanings,
    summarise_figures,
    add_headline_figure,
    add_report_chart,
    build_report_file,
]

BY_NAME = {fn.__name__: fn for fn in TOOLS}

# Written out rather than parsed from the docstrings, because this is the wording the
# model actually reads when deciding what to call — it deserves to be deliberate. The
# shape of each tool is still taken from its signature, so the two cannot drift apart.
PARAMETER_HELP: dict[str, dict[str, str]] = {
    "reply_to_customer": {
        "message": (
            "Plain language for a busy, non-technical production manager. No column "
            "numbers, no tool names, no thinking out loud. A few sentences at most."
        ),
    },
    "open_workbook": {
        "file_path": "Absolute path to the .xlsx file on disk.",
    },
    "examine_sheet": {
        "session_id": "From open_workbook.",
        "sheet_name": "Exactly as listed by open_workbook.",
    },
    "record_column_meanings": {
        "session_id": "From open_workbook.",
        "sheet_name": "The sheet you examined.",
        "columns": (
            "One entry per column, every column included. Each entry has: position "
            "(the number from examine_sheet); role (date, label, target, actual, "
            "calculated or ignore); unit (for a figure, what it counts, e.g. 'Images'); "
            "pairs_with (for an actual, the column number of the target it belongs to); "
            "derives (for a calculated column, which figure it holds: completion_rate, "
            "shortfall, cumulative_target or cumulative_actual — pairs_with is only "
            "needed here if the sheet has more than one planned figure)."
        ),
    },
    "summarise_figures": {
        "session_id": "From open_workbook.",
        "period": "day, week, month, quarter, or none.",
        "group_by": "Column numbers to split by. Must be columns you marked 'label'.",
        "top_n": "Keep only the largest groups, gathering the rest into 'Other'.",
    },
    "add_headline_figure": {
        "session_id": "From open_workbook.",
        "measure": "One of the figures listed by summarise_figures.",
        "title": "What to call it. Optional.",
        "good_threshold": "At or above this it shows green, e.g. 0.9 for 90%.",
        "neutral_threshold": "At or above this, amber; below it, red.",
    },
    "add_report_chart": {
        "session_id": "From open_workbook.",
        "kind": "line, bar or table.",
        "measures": "Figures from summarise_figures to plot.",
        "group_by": "What the horizontal axis runs along. Defaults to the period.",
        "title": "What to call it. Optional.",
    },
    "build_report_file": {
        "session_id": "From open_workbook.",
        "dataset_id": "A unique name for this report's folder.",
    },
}


def _json_type(annotation) -> dict:
    text = str(annotation)
    if "list[int]" in text:
        return {"type": "array", "items": {"type": "integer"}}
    if "list[str]" in text:
        return {"type": "array", "items": {"type": "string"}}
    if "list[dict]" in text:
        return {"type": "array", "items": {"type": "object"}}
    if "int" in text:
        return {"type": "integer"}
    if "float" in text:
        return {"type": "number"}
    return {"type": "string"}


def schemas() -> list[dict]:
    """Tool definitions in the shape a language model expects."""
    import inspect

    definitions = []
    for fn in TOOLS:
        signature = inspect.signature(fn)
        properties, required = {}, []
        for name, parameter in signature.parameters.items():
            properties[name] = _json_type(parameter.annotation)
            help_text = PARAMETER_HELP.get(fn.__name__, {}).get(name)
            if help_text:
                properties[name]["description"] = help_text
            if parameter.default is inspect.Parameter.empty:
                required.append(name)
        definitions.append(
            {
                "type": "function",
                "function": {
                    "name": fn.__name__,
                    "description": (fn.__doc__ or "").strip().split("\n\n")[0],
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required,
                    },
                },
            }
        )
    return definitions


def register(mcp) -> None:
    """Add the six tools to an MCP server, leaving anything already there alone."""
    for fn in TOOLS:
        mcp.tool(fn)


# Which tools are worth offering, given how far the conversation has got. Every tool
# description is re-sent on every single call, and all eight cost about 1,100 tokens —
# roughly 9,000 across a conversation, spent describing work that cannot be done yet.
# Offering only what is reachable also removes a way to go wrong: the model cannot ask
# to build a file before anything has been summarised if that tool is not on the table.
_STAGE_TOOLS = {
    "start": ["reply_to_customer", "open_workbook"],
    "opened": ["reply_to_customer", "examine_sheet", "open_workbook"],
    "examined": ["reply_to_customer", "record_column_meanings", "examine_sheet"],
    "agreed": ["reply_to_customer", "summarise_figures", "record_column_meanings"],
    "summarised": [
        "reply_to_customer",
        "add_headline_figure",
        "add_report_chart",
        "build_report_file",
        "summarise_figures",
    ],
}


def _stage(history: list[dict]) -> str:
    """How far along we are, judged by which tools have already succeeded."""
    done = {
        call["function"]["name"]
        for message in history
        for call in (message.get("tool_calls") or [])
        if isinstance(message, dict)
    }
    if "summarise_figures" in done:
        return "summarised"
    if "record_column_meanings" in done:
        return "agreed"
    if "examine_sheet" in done:
        return "examined"
    if "open_workbook" in done:
        return "opened"
    return "start"


def schemas_for(history: list[dict]) -> list[dict]:
    """Tool definitions worth sending, given where the conversation has got to."""
    allowed = set(_STAGE_TOOLS[_stage(history)])
    return [d for d in schemas() if d["function"]["name"] in allowed]
