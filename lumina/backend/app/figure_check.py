"""Refuse to tell a customer a figure the tools never produced.

Asked whether the numbers in a summary were correct, they were not: Lumina reported 420
planned videos and a 98.8% achievement rate when the tools had handed it 2,966 and 86.4%.
The *report* was right — the sentence describing it was not. A dashboard that is correct
while the conversation about it is wrong is worse than a broken file, because a broken file
gets noticed.

Its instructions already say "NEVER INVENT FIGURES. Everything you state must have come
from a tool." Instructions ask; four times today only the tools enforced. So this is a
guardrail: every number in a message is checked against the figures that actually exist,
and a message quoting anything else is not sent.

Two things it deliberately does not do:

  * It does not check small counts. "Four months", "two charts", "the top ten" are about
    the report rather than the data, and a rule strict enough to police them would refuse
    ordinary English.
  * It does not allow arithmetic. A total of two months added together is a figure no tool
    produced, and would be refused. That is consistent with the instruction rather than a
    gap in it — if a customer should see a figure, a tool should have produced it.

Both choices favour a refused sentence over a wrong one, because a refusal costs a moment
and a wrong figure costs trust.
"""

from __future__ import annotations

import re

# Below this, a number is almost always about the report — how many charts, how many
# months — rather than a figure out of the customer's spreadsheet.
SMALL = 20

# Percentages are compared in percentage points, plain figures proportionally, because
# "86.4%" and "0.86" are the same number written for different readers.
PERCENT_TOLERANCE = 0.15
RELATIVE_TOLERANCE = 0.005

# 2,966 is a figure; 2026 is a year. Told apart by the punctuation a writer uses.
_YEAR = re.compile(r"^(19|20)\d\d$")
_NUMBER = re.compile(r"(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s*(%|k\b|K\b|m\b|M\b)?")


def _expand(digits: str, suffix: str | None) -> float | None:
    try:
        value = float(digits.replace(",", ""))
    except ValueError:
        return None
    if suffix in ("k", "K"):
        value *= 1_000
    elif suffix in ("m", "M"):
        value *= 1_000_000
    return value


def allowed(session) -> tuple[set[float], set[float]]:
    """Every figure the tools produced: plain values, and rates as percentages.

    Drawn from the summary rather than from anything the agent has said, so the comparison
    is against what the software knows rather than against itself.
    """
    plain: set[float] = set()
    rates: set[float] = set()

    profile_columns = 0
    for profile in session.profiles.values():
        plain.update({float(profile.data_row_count), float(profile.total_rows)})
        profile_columns = max(profile_columns, len(profile.columns))
        plain.update(float(c.distinct) for c in profile.columns)
    if profile_columns:
        plain.add(float(profile_columns))

    summary = session.summary
    if summary is None:
        return plain, rates

    plain.update({
        float(summary.source_rows_used),
        float(summary.source_rows_skipped),
        float(summary.source_rows_used + summary.source_rows_skipped),
        float(len(summary.rows)),
    })

    for measure in summary.measures:
        values = [
            row[measure]
            for row in summary.rows
            if isinstance(row.get(measure), (int, float))
        ]
        if not values:
            continue
        is_rate = measure.startswith("completion_rate")
        target = rates if is_rate else plain
        for value in values:
            target.add(float(value * 100 if is_rate else value))
        if is_rate:
            continue
        # The totals a headline figure would show: added up, and the largest for a running
        # total, which is how the report itself aggregates them.
        plain.add(float(sum(values)))
        plain.add(float(max(values)))

    # A rate over the whole report is recomputed from its underlying totals, never
    # averaged — the mistake that once reported 129% for a plan that delivered 100%.
    for measure in summary.measures:
        if not measure.startswith("completion_rate_"):
            continue
        unit = measure[len("completion_rate_") :]
        planned = sum(
            row[f"target_{unit}"]
            for row in summary.rows
            if isinstance(row.get(f"target_{unit}"), (int, float))
        )
        achieved = sum(
            row[f"actual_{unit}"]
            for row in summary.rows
            if isinstance(row.get(f"actual_{unit}"), (int, float))
        )
        if planned:
            rates.add(float(achieved / planned * 100))

    return plain, rates


def unsupported(message: str, session) -> list[str]:
    """The figures in this message that no tool produced, as they were written."""
    plain, rates = allowed(session)
    if not plain and not rates:
        return []

    problems: list[str] = []
    for match in _NUMBER.finditer(message):
        # A trailing separator belongs to the sentence, not the number: "Apr 2026, across"
        # was being read as "2026," and so failed the test for a year.
        digits, suffix = match.group(1).rstrip(",."), match.group(2)
        value = _expand(digits, suffix)
        if value is None:
            continue

        if suffix == "%":
            if not any(abs(value - r) <= PERCENT_TOLERANCE for r in rates):
                problems.append(f"{digits}%")
            continue

        if abs(value) < SMALL:
            continue  # a count about the report, not a figure from the sheet
        if _YEAR.match(digits):
            continue  # a year, not a quantity

        near = max(abs(value) * RELATIVE_TOLERANCE, 0.5)
        if not any(abs(value - known) <= near for known in plain):
            problems.append(digits)

    return problems
