"""Record what job each column does — the second of the six tools in Decision 8.

Decision 3 replaced a fixed list of expected figures ("target quantity", "actual
hours"…) with roles. The software no longer looks for particular columns; it learns
what job each column in *this* workbook is doing. What is being counted — images,
videos, revenue — becomes information carried through to the labels, rather than
something built into the code, which is what lets one piece of software serve
customers who measure entirely different things.

The agent proposes the assignment from a sheet profile. This module is the gate it
has to pass, and refuses anything that would produce a wrong or misleading report.
Two of those refusals are conditions Decision 3 attached explicitly:

  * every column must be accounted for, so nothing is discarded in silence;
  * every achieved figure must name the planned figure it belongs to, because
    mismatching them is what produced a nonsensical "265% complete" during testing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from sheet_profiler import ColumnProfile, SheetProfile


class Role(str, Enum):
    DATE = "date"  # the timeline
    LABEL = "label"  # something to group or filter by
    TARGET = "target"  # a planned figure
    ACTUAL = "actual"  # an achieved figure, belonging to a planned one
    CALCULATED = "calculated"  # derivable from the figures above
    IGNORE = "ignore"  # row numbers, notes, free text


class RoleError(ValueError):
    """The proposed assignment would produce a wrong report. The message is written
    to be shown to the agent, which has to correct it and try again."""


# Figures Decision 4 says to work out ourselves rather than read from the sheet. A
# calculated column may name the one it holds, which lets us compare the customer's
# arithmetic against our own and tell them when the two disagree.
DERIVABLE = (
    "completion_rate",
    "shortfall",
    "cumulative_target",
    "cumulative_actual",
)


@dataclass
class Assignment:
    """One column, and the job the agent says it is doing."""

    position: int
    role: Role
    unit: str | None = None  # what a figure counts: "Images", "Videos", "Hours"
    pairs_with: int | None = None  # for an actual: the position of its target
    derives: str | None = None  # for a calculated column: which figure it holds


@dataclass
class MeasurePair:
    """A planned figure and the achieved figures belonging to it.

    Several achieved columns may share one planned column — the older Lifewood
    workbooks set a single target and then recorded actuals per language team.
    """

    target: int
    actuals: list[int]
    unit: str | None

    @property
    def can_derive(self) -> list[str]:
        """Figures Decision 4 says to calculate rather than read from the sheet."""
        return list(DERIVABLE)


@dataclass
class Schema:
    """What the workbook means, once agreed. The rest of the pipeline reads this."""

    sheet: str
    date_column: int
    labels: list[int] = field(default_factory=list)
    pairs: list[MeasurePair] = field(default_factory=list)
    calculated: list[int] = field(default_factory=list)
    ignored: list[int] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    # column position -> (figure it holds, the target it belongs to). Lets summarising
    # compare the customer's own arithmetic against ours, per Decision 4.
    cross_checks: dict[int, tuple[str, int]] = field(default_factory=dict)

    @property
    def units(self) -> list[str]:
        return sorted({p.unit for p in self.pairs if p.unit})


def _heading(column: ColumnProfile) -> str:
    return column.heading or f"column {column.position}"


def set_column_roles(
    profile: SheetProfile, assignments: list[Assignment]
) -> Schema:
    """Validate and record what each column means. Raises RoleError if it would not work.

    Every refusal names the column and says what to do instead, because the caller is
    an agent that has to act on the message rather than a developer reading a log.
    """
    by_position = {c.position: c for c in profile.columns}
    proposed = {a.position: a for a in assignments}

    if duplicates := [p for p in proposed if [a.position for a in assignments].count(p) > 1]:
        raise RoleError(f"Column(s) {sorted(set(duplicates))} were assigned more than once.")

    if unknown := sorted(set(proposed) - set(by_position)):
        raise RoleError(
            f"Column(s) {unknown} do not exist in sheet '{profile.name}'. "
            f"It has columns {sorted(by_position)}."
        )

    # Condition from Decision 3: nothing may be quietly dropped.
    if missing := sorted(set(by_position) - set(proposed)):
        described = ", ".join(f"{p} ({_heading(by_position[p])})" for p in missing)
        raise RoleError(
            f"Every column must be given a job so that nothing is discarded without "
            f"the customer seeing it. Still unassigned: {described}. Use 'ignore' for "
            f"anything genuinely not needed."
        )

    dates = [a for a in assignments if a.role is Role.DATE]
    if len(dates) != 1:
        found = ", ".join(str(a.position) for a in dates) or "none"
        raise RoleError(
            f"Exactly one column must be the timeline; {len(dates)} were given ({found})."
        )
    date_col = by_position[dates[0].position]
    if date_col.mostly != "date":
        raise RoleError(
            f"'{_heading(date_col)}' was given as the timeline but holds "
            f"{date_col.mostly} values, not dates."
        )

    notes: list[str] = []

    # A figure has to be numeric, or nothing can be added up.
    for a in assignments:
        if a.role not in (Role.TARGET, Role.ACTUAL):
            continue
        column = by_position[a.position]
        if column.mostly != "number":
            raise RoleError(
                f"'{_heading(column)}' was given as a {a.role.value} figure but holds "
                f"{column.mostly} values. Figures must be numeric."
            )
        if column.non_numeric_examples:
            notes.append(
                f"'{_heading(column)}' contains "
                f"{', '.join(repr(x) for x in column.non_numeric_examples)} among its "
                f"numbers; these will be read as missing rather than zero."
            )
        if not a.unit:
            notes.append(
                f"'{_heading(column)}' has no unit recorded, so charts will not be able "
                f"to say what is being counted."
            )

    # Grouping by a column that is different on every row gives one bucket per row.
    for a in assignments:
        if a.role is not Role.LABEL:
            continue
        column = by_position[a.position]
        if column.breakdown_suitability == "unsuitable":
            raise RoleError(
                f"'{_heading(column)}' cannot be used for grouping: it has "
                f"{column.distinct}{'+' if column.distinct_capped else ''} different "
                f"values across {column.populated} rows, so a chart would have roughly "
                f"one bar per row. Mark it 'ignore', or use it as a figure if it is one."
            )
        if column.breakdown_suitability == "top-n-only":
            notes.append(
                f"'{_heading(column)}' has {column.distinct} different values — usable, "
                f"but only as a 'top ten' rather than a full breakdown."
            )

    # The pairing. Getting this wrong is what produced "265% complete" in testing.
    targets = {a.position for a in assignments if a.role is Role.TARGET}
    pairs: dict[int, MeasurePair] = {}
    for a in assignments:
        if a.role is not Role.ACTUAL:
            continue
        column = by_position[a.position]
        if a.pairs_with is None:
            raise RoleError(
                f"'{_heading(column)}' is an achieved figure but does not say which "
                f"planned figure it belongs to. Set pairs_with to the target's column "
                f"number. Available targets: {sorted(targets) or 'none'}."
            )
        if a.pairs_with not in targets:
            raise RoleError(
                f"'{_heading(column)}' says it belongs to column {a.pairs_with}, which "
                f"is not a planned figure. Available targets: {sorted(targets) or 'none'}."
            )
        target_unit = proposed[a.pairs_with].unit
        if a.unit and target_unit and a.unit != target_unit:
            raise RoleError(
                f"'{_heading(column)}' counts {a.unit!r} but the planned figure it "
                f"belongs to counts {target_unit!r}. Comparing them would be meaningless."
            )
        pair = pairs.setdefault(
            a.pairs_with, MeasurePair(a.pairs_with, [], target_unit or a.unit)
        )
        pair.actuals.append(a.position)

    # A calculated column may say which figure it holds, so its arithmetic can be
    # compared against ours later. Optional: many are unlabelled or idiosyncratic.
    cross_checks: dict[int, tuple[str, int]] = {}
    for a in assignments:
        if a.role is not Role.CALCULATED or not a.derives:
            continue
        column = by_position[a.position]
        if a.derives not in DERIVABLE:
            raise RoleError(
                f"'{_heading(column)}' says it holds {a.derives!r}, which is not "
                f"something we can work out. Expected one of: {', '.join(DERIVABLE)}."
            )
        if a.pairs_with not in targets:
            raise RoleError(
                f"'{_heading(column)}' holds {a.derives!r} but does not say which "
                f"planned figure it relates to. Set pairs_with. Available targets: "
                f"{sorted(targets) or 'none'}."
            )
        cross_checks[a.position] = (a.derives, a.pairs_with)

    for position in sorted(targets - set(pairs)):
        notes.append(
            f"'{_heading(by_position[position])}' is a planned figure with nothing "
            f"recorded against it, so no progress can be shown for it."
        )

    if not pairs:
        raise RoleError(
            "No planned figure has an achieved figure against it, so there is nothing "
            "to report progress on. At least one target/actual pair is needed."
        )

    schema = Schema(
        sheet=profile.name,
        date_column=dates[0].position,
        labels=sorted(a.position for a in assignments if a.role is Role.LABEL),
        pairs=[pairs[k] for k in sorted(pairs)],
        calculated=sorted(a.position for a in assignments if a.role is Role.CALCULATED),
        ignored=sorted(a.position for a in assignments if a.role is Role.IGNORE),
        notes=notes,
        cross_checks=cross_checks,
    )

    # Decision 3's other condition: what was set aside must be visible, not silent.
    if schema.ignored:
        schema.notes.append(
            "Set aside and not used: "
            + ", ".join(f"'{_heading(by_position[p])}'" for p in schema.ignored)
            + "."
        )
    return schema


def describe(schema: Schema, profile: SheetProfile) -> str:
    """A plain-language summary for the customer to confirm or correct.

    Decision 3 requires the matching to be checked with the customer rather than
    assumed, and Decision 1 requires the AI to ask rather than guess silently.
    """
    name = {c.position: _heading(c) for c in profile.columns}
    lines = [f"In '{schema.sheet}' I have read:", ""]
    lines.append(f"  • Timeline: {name[schema.date_column]}")
    for pair in schema.pairs:
        unit = f" ({pair.unit})" if pair.unit else ""
        achieved = " and ".join(name[a] for a in pair.actuals)
        lines.append(f"  • Planned: {name[pair.target]}{unit} — achieved: {achieved}")
    if schema.labels:
        lines.append(f"  • Can break down by: {', '.join(name[p] for p in schema.labels)}")
    if schema.calculated:
        lines.append(
            f"  • Worked out from the above, so recalculated rather than read: "
            f"{', '.join(name[p] for p in schema.calculated)}"
        )
    if schema.ignored:
        lines.append(f"  • Ignored: {', '.join(name[p] for p in schema.ignored)}")
    if schema.notes:
        lines += ["", "Worth knowing:"] + [f"  - {n}" for n in schema.notes]
    return "\n".join(lines)
