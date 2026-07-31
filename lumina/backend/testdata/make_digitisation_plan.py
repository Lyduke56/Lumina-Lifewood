"""Build a fourth test workbook, for driving by hand.

The other three each count one thing against one target. This one has **three figures**
rather than two — pages scanned, pages verified, and pages rejected — because a report
where the interesting number is a third column is a different conversation from one where
it is the obvious second. Whoever drives it has a real decision to make about which
figures belong on the page.

Different again in the ways that catch software out:

  * weekly rather than monthly, so the timeline is not months
  * two label columns of very different sizes — six sites, two shifts — so grouping by the
    small one is sensible and grouping by both is still readable
  * headings that share no words with the other three: "Week Commencing", "Site",
    "Pages Scanned", "Pages Verified"
  * a second sheet, so the agent has to ask which one is meant

It carries the hazards a real sheet carries and that this software already handles: an
unlabelled grand total at the foot, dashes where a shift was not staffed, and trailing
padding.

    python lumina/backend/testdata/make_digitisation_plan.py
"""

import random
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

random.seed(42)  # so the same file comes out every time

SITES = ["Cagayan de Oro", "Bacolod", "Dumaguete", "Tacloban", "Butuan", "Legazpi"]
SHIFTS = ["Day", "Night"]

START = date(2026, 1, 5)  # a Monday
WEEKS = 18

HEADINGS = [
    "Week Commencing",
    "Site",
    "Shift",
    "Target Pages",
    "Pages Scanned",
    "Pages Verified",
    "Pages Rejected",
    "Notes",
]


def rows() -> list[list]:
    """Eighteen weeks of digitisation, with one site struggling throughout."""
    made: list[list] = []
    for week in range(WEEKS):
        monday = START + timedelta(days=7 * week)
        for site in SITES:
            # One site never gets on top of the work, which gives the figures something
            # worth noticing rather than a flat line everybody ignores.
            struggling = 0.62 if site == "Tacloban" else 0.97
            for shift in SHIFTS:
                target = random.choice([4000, 5000, 6000])
                if shift == "Night":
                    target = int(target * 0.6)  # a smaller crew after dark

                # A night shift occasionally goes unstaffed and nobody fills the row in.
                if shift == "Night" and random.random() < 0.07:
                    made.append([monday, site, shift, target, "—", "—", "—", "not staffed"])
                    continue

                scanned = int(target * random.uniform(struggling - 0.12, struggling + 0.14))
                rejected = int(scanned * random.uniform(0.01, 0.06))
                verified = scanned - rejected

                made.append([
                    monday, site, shift, target, scanned, verified, rejected,
                    "backlog cleared" if scanned > target else "",
                ])
    return made


def build(path: Path) -> Path:
    book = Workbook()
    sheet = book.active
    sheet.title = "Digitisation Plan"

    sheet.append(HEADINGS)
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    data = rows()
    for row in data:
        sheet.append(row)

    # An unlabelled grand total, which is the hazard that once doubled every figure on a
    # page when a report was grouped by a label rather than by a period.
    totals = [
        sum(r[at] for r in data if isinstance(r[at], (int, float))) for at in (3, 4, 5, 6)
    ]
    sheet.append([None, None, None, *totals, "TOTAL"])
    for _ in range(3):
        sheet.append([None] * len(HEADINGS))

    # A second sheet, so which one to use is a question that has to be asked.
    log = book.create_sheet("Courier Log")
    log.append(["Date", "Site", "Boxes Received", "Courier"])
    for cell in log[1]:
        cell.font = Font(bold=True)
    for week in range(WEEKS):
        monday = START + timedelta(days=7 * week)
        for site in random.sample(SITES, 3):
            log.append([monday, site, random.randint(4, 18), random.choice(["LBC", "JRS", "2GO"])])

    for column, width in zip("ABCDEFGH", (18, 17, 8, 13, 14, 14, 14, 18)):
        sheet.column_dimensions[column].width = width

    path.parent.mkdir(parents=True, exist_ok=True)
    book.save(path)
    return path


if __name__ == "__main__":
    written = build(Path.home() / "Downloads" / "Digitisation Plan - TEST.xlsx")
    print(f"wrote {written}")
