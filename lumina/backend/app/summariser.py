"""Add the figures up — the third of the six tools in Decision 8.

Decision 5 settled that the Power BI file carries its own data rather than reaching
out to a database, and that the data is **summarised before it goes in**. A dashboard
needs totals by month or by language, not 352,626 individual records: embedding those
raw would produce roughly 29 MB of text inside a single file.

Decision 4 settled that anything derivable — completion rates, shortfalls, running
totals — is **worked out here rather than read from the spreadsheet**. The official
Lifewood workbook proves the point: its own running totals stop a month early and are
7,137 short. Where the customer's arithmetic is available, it is compared against ours
and any disagreement is reported back to them rather than silently overwritten.
"""

from __future__ import annotations

import re

import datetime as dt
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl

from column_roles import Schema
from sheet_profiler import SheetProfile

# More groups than this makes an unreadable chart, and is the point at which the tool
# declines and suggests a top-N instead rather than producing something useless.
MAX_GROUPS = 60

PERIODS = ("day", "week", "month", "quarter", "none")

# What the timeline is called in the finished report. Defined here rather than in
# report_builder because the naming of the *other* grouping columns has to avoid it: a
# workbook with its own "Month" column, summarised by month, produced two columns called
# Month in one table and Power BI refused to open the file at all.
PERIOD_LABEL = {"day": "Date", "week": "Week", "month": "Month", "quarter": "Quarter"}

# Carried on every row and never shown: the earliest date that fell into that group.
# Grouping by a label loses the timeline, and a report grouped by a month *name* then
# ordered its axis April, August, July, June, May, September — the alphabet's idea of a
# year, which reads as though production collapsed in the second month rather than the
# fifth. This is what the finished report sorts by.
ORDER_KEY = "__first_seen"


def _iso(value) -> str:
    """A sortable text form of a date, whatever shape the spreadsheet gave us."""
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _column_name(profile, position: int, taken: set[str]) -> str:
    """What to call a grouping column in the report: its own heading.

    Was `column_2`, which is our name for it and appeared on the axis of every chart
    grouped that way. Falls back to the old form when a heading is missing or would
    collide with something else in the table.
    """
    heading = next(
        (c.heading for c in profile.columns if c.position == position), None
    )
    cleaned = re.sub(r"[^0-9A-Za-z _-]+", "", str(heading or "")).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned or cleaned.lower() == "period":
        return f"column_{position}"
    # Distinguished rather than discarded: the heading is still the most useful name, and
    # falling back to "column_2" puts our word for it on the customer's axis. Underscored
    # rather than "Month (2)" so it needs no escaping in either Power BI language — the
    # bracketed form produced a file Power BI would not parse.
    if cleaned in taken:
        return f"{cleaned.replace(' ', '_')}_{position}"
    return cleaned


@dataclass
class Summary:
    """Aggregated rows, ready to be charted or written into a Power BI model."""

    group_by: list[str]
    measures: list[str]
    # Whether the timeline was gathered by day, week, month or quarter. Carried through
    # because the report has to *label* it — an axis headed "period" is our word for it,
    # not the customer's.
    period: str = "day"
    rows: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    reconciliation: list[str] = field(default_factory=list)
    source_rows_used: int = 0
    source_rows_skipped: int = 0

    @property
    def group_count(self) -> int:
        return len(self.rows)


class SummaryError(ValueError):
    """The summary asked for would not be usable. The message says what to do instead."""


def _number(value):
    """A figure, or None. Text such as '-' is missing, not zero.

    Reading a placeholder as zero would quietly drag every average down, which is
    exactly the kind of silent wrongness this project keeps running into.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value


def _period_key(value, period: str):
    if period == "none":
        return None
    if not isinstance(value, (dt.datetime, dt.date)):
        return None
    d = value.date() if isinstance(value, dt.datetime) else value
    if period == "day":
        return d.isoformat()
    if period == "week":
        monday = d - dt.timedelta(days=d.weekday())
        return monday.isoformat()
    if period == "month":
        return f"{d.year}-{d.month:02d}"
    if period == "quarter":
        return f"{d.year}-Q{(d.month - 1) // 3 + 1}"
    raise SummaryError(f"Unknown period {period!r}. Expected one of: {', '.join(PERIODS)}.")


def summarise(
    path: str | Path,
    profile: SheetProfile,
    schema: Schema,
    period: str = "day",
    group_by: list[int] | None = None,
    top_n: int | None = None,
) -> Summary:
    """Total the figures by period, and optionally by one or more labels.

    `group_by` takes column positions, which must have been agreed as labels. `top_n`
    keeps only the largest groups and gathers the rest into "Other", which is how a
    column with hundreds of values is made usable rather than refused outright.
    """
    if period not in PERIODS:
        raise SummaryError(f"Unknown period {period!r}. Expected one of: {', '.join(PERIODS)}.")

    group_by = list(group_by or [])
    if invalid := [p for p in group_by if p not in schema.labels]:
        raise SummaryError(
            f"Column(s) {invalid} were not agreed as something to group by. "
            f"Available: {schema.labels or 'none'}."
        )
    if period == "none" and not group_by:
        raise SummaryError(
            "Nothing to group by. Give a period, one or more labels, or both."
        )

    targets = {p.target: p for p in schema.pairs}
    measure_columns = {p.target for p in schema.pairs} | {
        a for p in schema.pairs for a in p.actuals
    }

    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        ws = wb[schema.sheet]
        buckets: OrderedDict[tuple, dict] = OrderedDict()
        # How many source rows landed in each bucket. Their own calculated columns are
        # per-row, so they can only be compared where a bucket holds exactly one row —
        # comparing a day's completion rate against a month's would always "disagree".
        bucket_rows: dict[tuple, int] = {}
        # The earliest date in each group, so a report grouped by label can still be
        # put in chronological order rather than alphabetical.
        first_seen: dict[tuple, object] = {}
        used = skipped = 0
        checks: dict[int, list[tuple]] = {c: [] for c in schema.cross_checks}

        for n, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if n < (profile.data_starts_at or 1):
                continue
            if n == profile.suspected_total_row:
                skipped += 1  # a grand total is not a day's work
                continue

            date_value = row[schema.date_column - 1] if schema.date_column <= len(row) else None
            key_period = _period_key(date_value, period)
            if period != "none" and key_period is None:
                skipped += 1  # no date, so it cannot be placed on a timeline
                continue

            figures = {
                c: _number(row[c - 1]) if c <= len(row) else None for c in measure_columns
            }
            if all(v is None for v in figures.values()):
                skipped += 1  # padding: a date, perhaps a label, but nothing to add up
                continue

            key = tuple(
                [key_period] if period != "none" else []
            ) + tuple(
                str(row[g - 1]) if g <= len(row) and row[g - 1] is not None else "(blank)"
                for g in group_by
            )
            bucket = buckets.setdefault(key, {c: None for c in measure_columns})
            bucket_rows[key] = bucket_rows.get(key, 0) + 1
            if date_value is not None:
                seen = first_seen.get(key)
                if seen is None or date_value < seen:
                    first_seen[key] = date_value
            for c, v in figures.items():
                if v is not None:
                    bucket[c] = (bucket[c] or 0) + v
            used += 1

            for column, (_, _) in schema.cross_checks.items():
                theirs = _number(row[column - 1]) if column <= len(row) else None
                if theirs is not None:
                    checks[column].append((key, theirs))
    finally:
        wb.close()

    # Seeded with whatever the timeline column will end up being called, not with
    # "period" — that is the internal name, and it is renamed before Power BI sees it.
    names: set[str] = {"period"}
    if period != "none":
        names.add(PERIOD_LABEL.get(period, "Date"))
    label_names = []
    for g in group_by:
        name = _column_name(profile, g, names)
        names.add(name)
        label_names.append(name)

    summary = Summary(
        group_by=(["period"] if period != "none" else []) + label_names,
        measures=[],
        period=period,
        source_rows_used=used,
        source_rows_skipped=skipped,
    )

    if not buckets:
        raise SummaryError(
            "No rows could be summarised — every row was empty, undated, or skipped."
        )

    buckets = _apply_top_n(buckets, summary, period, group_by, top_n, measure_columns)

    # Build the output rows, working out the derived figures as we go (Decision 4).
    running: dict[int, dict[str, float]] = {}
    for key, sums in buckets.items():
        out: dict = {}
        for i, name in enumerate(summary.group_by):
            out[name] = key[i]
        if key in first_seen:
            # As text, not a date. These rows are stored as JSON and handed to the
            # website, and a datetime cannot be either — which is what broke four
            # attempts to build a report while every step still showed a tick.
            out[ORDER_KEY] = _iso(first_seen[key])
        for pair in schema.pairs:
            unit = pair.unit or "units"
            planned = sums.get(pair.target)
            achieved = sum(v for a in pair.actuals if (v := sums.get(a)) is not None) or None
            out[f"target_{unit}"] = planned
            out[f"actual_{unit}"] = achieved
            both = planned is not None and achieved is not None
            out[f"shortfall_{unit}"] = achieved - planned if both else None
            # Left unknown rather than zero when nothing was recorded: a day with no
            # figure against it is not a day that achieved nothing, and treating it as
            # zero would drag every average down.
            out[f"completion_rate_{unit}"] = achieved / planned if both and planned else None
            if period != "none" and not group_by:
                # Running totals only make sense along a single ordered timeline.
                acc = running.setdefault(pair.target, {"t": 0.0, "a": 0.0})
                acc["t"] += planned or 0
                acc["a"] += achieved or 0
                out[f"cumulative_target_{unit}"] = acc["t"]
                out[f"cumulative_actual_{unit}"] = acc["a"]
        summary.rows.append(out)

    summary.measures = [
        k for k in summary.rows[0] if k not in summary.group_by and k != ORDER_KEY
    ]
    summary.reconciliation = _reconcile(schema, summary, checks, bucket_rows, group_by)

    if skipped:
        summary.warnings.append(
            f"{skipped:,} row(s) were left out: a grand total, or rows with no date or "
            f"no figures."
        )
    return summary


def _apply_top_n(buckets, summary, period, group_by, top_n, measure_columns):
    """Keep the largest groups and gather the remainder into 'Other'.

    Decision 6 offers a high-cardinality column as a top-N rather than refusing it.
    Without this, grouping by something like Participant produces hundreds of bars.
    """
    if not group_by:
        return buckets

    distinct = len({k[len([1] if period != "none" else []) :] for k in buckets})
    if top_n is None and distinct > MAX_GROUPS:
        raise SummaryError(
            f"Grouping this way produces {distinct} groups, which no chart can show "
            f"readably. Ask for a top ten instead, or group by something with fewer "
            f"values."
        )
    if top_n is None or distinct <= top_n:
        return buckets

    offset = 1 if period != "none" else 0
    totals: dict[tuple, float] = {}
    for key, sums in buckets.items():
        label = key[offset:]
        totals[label] = totals.get(label, 0) + sum(v or 0 for v in sums.values())
    keep = {k for k, _ in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:top_n]}

    merged: OrderedDict[tuple, dict] = OrderedDict()
    for key, sums in buckets.items():
        label = key[offset:]
        new_key = key if label in keep else key[:offset] + tuple("Other" for _ in label)
        target = merged.setdefault(new_key, {c: None for c in measure_columns})
        for c, v in sums.items():
            if v is not None:
                target[c] = (target[c] or 0) + v
    summary.warnings.append(
        f"Showing the top {top_n} of {distinct}; the remaining {distinct - top_n} are "
        f"gathered into 'Other'."
    )
    return merged


def _reconcile(schema, summary, checks, bucket_rows, group_by) -> list[str]:
    """Compare the customer's own arithmetic against ours, per Decision 4.

    Their calculated columns hold one value per row of the spreadsheet, so they can only
    be compared where a summary bucket holds exactly one source row. Comparing a single
    day's completion rate against a whole month's total would report a disagreement on
    every row and mean nothing.

    We do not correct their spreadsheet, and we do not silently prefer our own figure —
    we tell them, which is what turns a data-quality problem into something useful.
    """
    messages: list[str] = []
    if group_by:
        return messages  # their columns are per-row, so only a plain timeline compares

    comparable = {k for k, n in bucket_rows.items() if n == 1}
    if not comparable:
        return [
            "Your own calculated columns could not be checked: each summary row covers "
            "several days, and their figures are per day. Summarise by day to compare."
        ]

    for column, (figure, target) in schema.cross_checks.items():
        theirs = checks.get(column) or []
        pair = next((p for p in schema.pairs if p.target == target), None)
        if not theirs or pair is None:
            continue
        unit = pair.unit or "units"
        ours_by_key = {
            tuple(r[g] for g in summary.group_by): r.get(f"{figure}_{unit}")
            for r in summary.rows
        }
        checked = disagreements = 0
        worst = 0.0
        for key, value in theirs:
            if key not in comparable:
                continue
            ours = ours_by_key.get(key)
            if ours is None:
                continue
            checked += 1
            if abs(ours - value) > max(1e-6, abs(ours) * 0.005):
                disagreements += 1
                worst = max(worst, abs(ours - value), key=abs)
        if not checked:
            continue

        if disagreements:
            gap = f"{worst:,.2f}".rstrip("0").rstrip(".")
            messages.append(
                f"Your '{figure}' column disagrees with our own calculation on "
                f"{disagreements} of {checked} rows compared (largest difference {gap}). "
                f"We have used ours."
            )
        else:
            messages.append(
                f"Your '{figure}' column agrees with our calculation on all {checked} "
                f"rows compared."
            )

        # Agreeing where filled in is not the same as being complete. The official
        # workbook's running totals stop a month before its data does, which is
        # invisible unless coverage is reported alongside agreement.
        expected = sum(
            1
            for key in comparable
            if ours_by_key.get(key) is not None
        )
        if expected - checked > 0:
            messages.append(
                f"  …but it is only filled in on {checked} of {expected} rows — it stops "
                f"short of the data. Ours covers all of them."
            )
    return messages
