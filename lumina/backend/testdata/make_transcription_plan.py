"""Build a third test workbook, deliberately unlike the other two.

The first counts images, the second videos. This one counts **minutes of audio
transcribed**, which matters because the unit is a duration rather than a count of
things: a figure like 486.5 is ordinary here and a fractional image never was.

It is also different in the ways that catch software out. Its headings use none of the
words the others use — "Session Date", "Quota", "Delivered", "Accuracy %" — so nothing can
be matched by remembering a column name. It breaks down by language and by transcriber
rather than by studio and editor. And it improves over time rather than collapsing, so a
demo does not tell the same story twice.

Kept as a script rather than a committed file so it is reviewable and reproducible.

    python lumina/backend/testdata/make_transcription_plan.py
"""

import random
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

random.seed(21)  # so the same file comes out every time

LANGUAGES = ["Tagalog", "Cebuano", "Ilocano", "English", "Hiligaynon"]
TRANSCRIBERS = [f"T-{i:03d}" for i in range(101, 119)]

START = date(2026, 2, 2)
WEEKS = 14

HEADINGS = [
    "Session Date",
    "Language",
    "Transcriber",
    "Quota (mins)",
    "Delivered (mins)",
    "Accuracy %",
    "Remarks",
]


def rows() -> list[list]:
    """A quarter of transcription work, improving as the team settles in."""
    made: list[list] = []
    for week in range(WEEKS):
        day = START + timedelta(days=7 * week)
        # Accuracy climbs from the low eighties towards the high nineties: a team getting
        # better at the work, which is a different shape of story from a collapse.
        settling = 0.82 + (week / WEEKS) * 0.16

        for language in LANGUAGES:
            for transcriber in random.sample(TRANSCRIBERS, 3):
                quota = random.choice([240, 300, 360, 420])
                delivered = round(quota * random.uniform(settling - 0.08, settling + 0.10), 1)
                accuracy = round(random.uniform(settling, min(0.995, settling + 0.12)) * 100, 1)

                # A handful of sessions were never filled in, as in any real sheet.
                if random.random() < 0.04:
                    made.append([day, language, transcriber, quota, "—", "—", "not submitted"])
                    continue

                made.append([
                    day, language, transcriber, quota, delivered, accuracy,
                    "" if accuracy > 88 else "review requested",
                ])
    return made


def build(path: Path) -> Path:
    book = Workbook()
    sheet = book.active
    sheet.title = "Transcription Output"

    sheet.append(HEADINGS)
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    data = rows()
    for row in data:
        sheet.append(row)

    # An unlabelled grand total at the foot, which is the hazard that once doubled every
    # figure on a page when the report was grouped by a label rather than by month.
    quota = sum(r[3] for r in data if isinstance(r[3], (int, float)))
    delivered = sum(r[4] for r in data if isinstance(r[4], (int, float)))
    sheet.append([None, None, None, quota, round(delivered, 1), None, "TOTAL"])

    # And trailing padding, as spreadsheets that people actually maintain always have.
    for _ in range(3):
        sheet.append([None] * len(HEADINGS))

    for column, width in zip("ABCDEFG", (14, 14, 14, 14, 17, 12, 20)):
        sheet.column_dimensions[column].width = width

    path.parent.mkdir(parents=True, exist_ok=True)
    book.save(path)
    return path


if __name__ == "__main__":
    written = build(Path.home() / "Downloads" / "Transcription Output - TEST.xlsx")
    print(f"wrote {written}")
