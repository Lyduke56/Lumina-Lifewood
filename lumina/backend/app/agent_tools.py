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
from report_builder import (
    ReportError,
    add_chart,
    add_kpi,
    build_powerbi,
    change_chart,
    change_headline_figure,
    change_report_style,
    remove_from_report,
    report_contents,
    web_preview,
)
from sheet_profiler import list_sheets, profile_sheet
from supabase_client import (
    save_dataset,
    save_generated_file,
    upload_generated_file,
)
from summariser import ORDER_KEY, SummaryError, summarise


def reply_to_customer(message: str, suggestions: list[str] | None = None) -> str:
    """Say something to the customer. This is the ONLY way they hear from you.

    Anything written outside a tool is discarded and never reaches them, so use this for
    every question, explanation and confirmation.

    Args:
        message: Plain language for a busy, non-technical production manager. No column
            numbers, no tool names, no thinking out loud — just what they need to know
            or decide. A few sentences at most.
        suggestions: Two or three likely answers, as the customer would type them, shown
            as buttons they can tap instead of typing. Only when you have asked something
            with a small number of sensible answers.
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

    # What the report already depends on. Summarising used to empty it without a word,
    # so an agent that added four figures and two charts, then summarised again to reach
    # a different breakdown, silently lost the lot — and added them again, and again,
    # until it ran out of steps and gave up on a report it had built four times.
    axes = {c.group_by for c in session.spec.charts}
    figures = {k.measure for k in session.spec.kpis} | {
        m for c in session.spec.charts for m in c.measures
    }

    summary = summarise(
        session.workbook, profile, schema, period=period, group_by=group_by, top_n=top_n
    )

    # Refused only if the new totals genuinely cannot carry what is already on the page.
    # A blanket refusal would be a dead end instead of a loop: three breakdowns will not
    # always fit in one summary — month by studio by editor is 107 groups, more than any
    # chart can show — so summarising again has to stay possible.
    lost_axes = sorted(a for a in axes if a not in summary.group_by)
    lost_figures = sorted(f for f in figures if f not in summary.measures)
    if lost_axes or lost_figures:
        raise workbench.SessionError(
            f"Totalling the figures that way would leave the report broken: "
            + (f"nothing would be grouped by {', '.join(lost_axes)}. " if lost_axes else "")
            + (f"{', '.join(lost_figures)} would not exist. " if lost_figures else "")
            + f"The figures are still grouped by "
            f"{', '.join(session.summary.group_by) if session.summary else 'nothing'} and "
            f"the report is untouched — chart against those, or decide every breakdown you "
            f"need before totalling, because each chart takes its axis from this grouping."
        )

    # Kept, not cleared. Everything on the report still has its axis and its figures.
    session.summary = summary

    total = summary.source_rows_used + summary.source_rows_skipped
    lines = [
        f"Summarised into {summary.group_count} rows from "
        f"{summary.source_rows_used:,} of {total:,} rows in the sheet.",
    ]
    if summary.source_rows_skipped:
        # Said here as well as at the examining step, because this is the moment it
        # matters and a warning given several exchanges earlier does not get passed on.
        lines += [
            "",
            f"{summary.source_rows_skipped:,} row(s) were left out — they had no usable "
            f"figures, or no date to place them on. TELL THE CUSTOMER this, and how many: "
            f"they are entitled to know their own rows were not all counted.",
        ]
    lines += ["", f"Figures available: {', '.join(summary.measures)}"]

    # What else these figures could be split by. The description of the sheet is dropped
    # from the conversation once the columns are agreed, to save re-sending 500 tokens on
    # every step — so by the time charts are chosen the agent no longer knows which
    # columns were suitable to group by, and cannot offer the short list Decision 6 asks
    # for. Restated here, where it is needed, rather than carried the whole way.
    profile = session.profiles.get(session.schema.sheet)
    if profile:
        used = {p for p in group_by or []}
        others = []
        for position in session.schema.labels:
            if position in used:
                continue
            column = next(
                (c for c in profile.columns if c.position == position), None
            )
            if column is None or column.breakdown_suitability == "unsuitable":
                continue
            note = (
                f"{column.heading} ({column.distinct} values"
                + (", ask for a top ten" if column.breakdown_suitability == "top-n-only" else "")
                + ")"
            )
            others.append(f"{position}: {note}")
        if others:
            lines += [
                "",
                "These figures could also be broken down by. To chart against one of "
                "these, summarise ONCE including it — every chart takes its axis from "
                "this grouping, and summarising again is refused once the report has "
                "anything on it:",
            ]
            lines += [f"  {o}" for o in others]
    preview = summary.rows[:6]
    if preview:
        lines += ["", "First rows:"]
        for row in preview:
            lines.append(
                "  "
                + ", ".join(
                    f"{k}={'-' if v is None else (f'{v:,.2f}'.rstrip('0').rstrip('.') if isinstance(v, (int, float)) else v)}"
                    # The ordering value is for the finished report, not for reading.
                    for k, v in row.items() if k != ORDER_KEY
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


def add_headline_figure(session_id: str, measure: str, title: str | None = None) -> str:
    """Put a single large number on the report.

    Deliberately does not offer colour thresholds, though add_kpi supports them. Two
    reasons. They are a second baseline — a judgement about how much shortfall counts as
    acceptable — and nobody at Lifewood has made it; the 90% and 75% in the older flow are
    the previous developer's defaults. And the DAX that colours a card has never been
    opened in Power BI Desktop, so letting the agent reach it would ship output nobody has
    checked. Available in code for whoever decides to use it on purpose.

    Args:
        session_id: From open_workbook.
        measure: One of the figures listed by summarise_figures.
        title: What to call it. Defaults to a readable version of the figure's name.
    """
    session = workbench.get(session_id)
    summary = workbench.require_summary(session)
    add_kpi(session.spec, summary, measure, title)
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


def show_report_contents(session_id: str) -> str:
    """List what is on the report, by name, so a change can be asked for.

    Args:
        session_id: From open_workbook.
    """
    return report_contents(workbench.get(session_id).spec)


def remove_from_the_report(session_id: str, name: str) -> str:
    """Take a chart or a headline figure off the report.

    Args:
        session_id: From open_workbook.
        name: The title of the chart or figure, as the report shows it.
    """
    session = workbench.get(session_id)
    said = remove_from_report(session.spec, name)
    return (
        f"{said} The report now has {len(session.spec.kpis)} headline figure(s) and "
        f"{len(session.spec.charts)} chart(s). Rebuild it for the customer to see this."
    )


def change_report_chart(
    session_id: str,
    chart: str,
    title: str | None = None,
    kind: str | None = None,
    measures: list[str] | None = None,
    group_by: str | None = None,
    position: int | None = None,
) -> str:
    """Change a chart already on the report. Only what you give is changed.

    Args:
        session_id: From open_workbook.
        chart: The title of the chart to change, as the report shows it.
        title: A new title.
        kind: line, bar or table.
        measures: The figures it should show instead.
        group_by: What its horizontal axis should run along instead.
        position: Where it should sit, counting from 1.
    """
    session = workbench.get(session_id)
    summary = workbench.require_summary(session)
    said = change_chart(
        session.spec, summary, chart, title, kind, measures, group_by, position
    )
    return f"{said} Rebuild the report for the customer to see this."


def change_report_headline_figure(
    session_id: str,
    figure: str,
    title: str | None = None,
    measure: str | None = None,
    position: int | None = None,
) -> str:
    """Rename a headline figure, point it at a different total, or move it.

    Args:
        session_id: From open_workbook.
        figure: The title of the figure to change, as the report shows it.
        title: What it should read instead.
        measure: A different figure from summarise_figures for it to total.
        position: Where it should sit, counting from 1.
    """
    session = workbench.get(session_id)
    summary = workbench.require_summary(session)
    said = change_headline_figure(session.spec, summary, figure, title, measure, position)
    return f"{said} Rebuild the report for the customer to see this."


def restyle_report(
    session_id: str, title: str | None = None, colours: list[str] | None = None
) -> str:
    """Rename the whole report, or change the colours its charts are drawn in.

    Args:
        session_id: From open_workbook.
        title: What the report should be called.
        colours: Hex colours for the chart series, in order, like ["#046241", "#FFB347"].
    """
    session = workbench.get(session_id)
    said = change_report_style(session.spec, title, colours)
    return f"{said} Rebuild the report for the customer to see this."


def build_report_file(
    session_id: str, dataset_id: str, title: str | None = None
) -> str:
    """Write the Power BI file from everything added so far.

    Args:
        session_id: From open_workbook.
        dataset_id: A unique name for this report's folder.
        title: What to call the report — it names the file the customer downloads, the
            project Power BI opens and the page inside it. Say what the report is *about*,
            in their words: "Video Production Plan", not "Report" or "Dashboard".
            Defaults to the workbook's own name.
    """
    session = workbench.get(session_id)
    if title and title.strip():
        session.spec.title = title.strip()
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
        return (
            f"Built the report ({built}), saved at {folder}. The job is finished — tell "
            f"the customer and stop. Do not build again unless they ask for a change."
        )

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
    record = save_generated_file(
        dataset_id=dataset["id"],
        layout_json={
            # The title belongs on the record, not only inside the preview: a list of a
            # conversation's reports has to name each one without unpacking a preview it
            # is not going to draw.
            "title": session.spec.title,
            "headline_figures": [k.title for k in session.spec.kpis],
            "charts": [c.title for c in session.spec.charts],
        },
        # The report described for the website to draw beside the conversation. Until
        # now this was left empty, and the website filled the gap with invented numbers —
        # a preview showing 1.3k and 92% for a report that says 352,626 and 100%.
        chart_preview_json=web_preview(session.spec, summary),
        conversation_id=session.owner["conversation_id"],
        storage_path=storage_path,
    )
    # Set last of all, once the record exists. Set any earlier and a failure here still
    # offered the customer a download and told the step it had succeeded — which is how
    # a broken save presented itself as a finished report, and why the agent, seeing the
    # refusal it was actually given, went round again adding charts and rebuilding.
    session.last_report = {
        # The record's own id, so the conversation can offer to open the report on screen
        # as well as download it — the preview is drawn from this row.
        "file_id": record["id"],
        "storage_path": storage_path,
        "title": session.spec.title,
    }
    return (
        f"Built the report ({built}) and saved it to the customer's account, where it is "
        f"ready to download. The job is finished: tell them it is ready and stop there. "
        f"Do not add anything else or build again unless they ask for a change, and do "
        f"not mention folders or file paths."
    )


# The tools of Decision 8, in the order they are meant to be used, followed by the ones
# for changing a report that already exists. Those came later: until then the only edit
# possible was another addition, so a customer who asked for a chart to be *removed* got
# a fourth chart beside the three they did not want.
TOOLS = [
    reply_to_customer,
    open_workbook,
    examine_sheet,
    record_column_meanings,
    summarise_figures,
    add_headline_figure,
    add_report_chart,
    build_report_file,
    show_report_contents,
    remove_from_the_report,
    change_report_chart,
    change_report_headline_figure,
    restyle_report,
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
# Starting again is always allowed. It was not, and an agent that reached a genuine
# dead end — a report grouped one way, a customer asking for another — told the customer
# "the system isn't letting me reopen the workbook right now", which is a fair report of
# a gate that should never have been closed. Whatever else is true, beginning afresh is a
# legitimate thing to want.
_ALWAYS = ["reply_to_customer", "open_workbook"]

_STAGE_TOOLS = {
    "start": _ALWAYS,
    "opened": [*_ALWAYS, "examine_sheet"],
    "examined": [*_ALWAYS, "record_column_meanings", "examine_sheet"],
    "confirmed": [*_ALWAYS, "summarise_figures", "record_column_meanings"],
    "summarised": [
        *_ALWAYS,
        "add_headline_figure",
        "add_report_chart",
        "build_report_file",
        "summarise_figures",
        # Changing what is already there. Reachable from here rather than needing a stage
        # of their own: once the customer has been told about a finished report and has
        # answered, the conversation is back at "summarised" and asking for a change is
        # the ordinary next thing to do.
        "show_report_contents",
        "remove_from_the_report",
        "change_report_chart",
        "change_report_headline_figure",
        "restyle_report",
    ],
    # Column meanings have been recorded but not put to the customer. Decision 3
    # attached this as a condition rather than a preference: the target-to-actual
    # matching must be confirmed, because getting it wrong produces a confident, wrong
    # dashboard that nobody can tell is wrong by looking. Asked for in the instructions
    # too, but a model that skipped it went from spreadsheet to finished file without a
    # word — so it is a guardrail now, in the spirit of Decision 6.
    "agreed": _ALWAYS,
    # Once a file exists there is nothing left to do but hand it over. Without this
    # stage the agent would add another chart, rebuild, add another chart, rebuild —
    # producing a file per step until the step limit stopped it, because nothing in the
    # tools said the job was finished.
    "built": _ALWAYS,
}


def _called(history: list[dict]) -> list[str]:
    """Every tool asked for so far, in order."""
    return [
        call["function"]["name"]
        for message in history
        if isinstance(message, dict)
        for call in (message.get("tool_calls") or [])
    ]


def stage_of(order: list[str]) -> str:
    """How far along we are, judged by which tools have already been used."""
    done = set(order)

    # A file built since the last thing we said to the customer means the customer has
    # not been told yet. Judged by position rather than mere presence, so that somebody
    # asking for a change *after* being handed a file can still have one made.
    def last(name: str) -> int:
        return max((i for i, n in enumerate(order) if n == name), default=-1)

    spoke = last("reply_to_customer")
    if last("build_report_file") > spoke:
        return "built"
    # Judged by position, so this asks once: after the customer has been told and has
    # answered, the full set is available again and the work carries on.
    if last("record_column_meanings") > spoke and "summarise_figures" not in done:
        return "agreed"

    if "summarise_figures" in done:
        return "summarised"
    if "record_column_meanings" in done:
        return "confirmed"
    if "examine_sheet" in done:
        return "examined"
    if "open_workbook" in done:
        return "opened"
    return "start"


def _stage(history: list[dict]) -> str:
    return stage_of(_called(history))


def permitted(order: list[str]) -> set[str]:
    """Which tools may be used next, given everything used so far.

    Separate from schemas_for because the two are asked at different moments. The
    definitions are chosen once per reply, but a model can put several tool calls in one
    reply — and did: four requests to build the report arrived together, so the stage was
    never consulted between them and a guardrail that reads "once a file exists, only
    speak" was bypassed without being broken.
    """
    return set(_STAGE_TOOLS[stage_of(order)])


def schemas_for(history: list[dict]) -> list[dict]:
    """Tool definitions worth sending, given where the conversation has got to."""
    allowed = permitted(_called(history))
    return [d for d in schemas() if d["function"]["name"] in allowed]
