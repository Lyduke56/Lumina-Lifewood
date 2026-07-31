"""Fill an account with finished conversations, for showing the thing to people.

A demo needs chats that already exist. Holding three of them live in front of an audience
means waiting on a free-tier model three times and hoping none of the suppliers is out of
allowance that minute.

These are not staged. Each one is a real conversation with the real agent, driven through
exactly the code path the website uses — the same `conversations.start`, the same
`agent.respond`, the same recording of what appeared on screen — so what a viewer scrolls
through is what actually happened, including any step that had to be retried.

Three deliberately different workbooks, because the claim being demonstrated (Decision 3)
is that Lumina reads a spreadsheet nobody wrote code for: images by production group,
videos by studio and editor, and minutes of audio by language and transcriber.

    python lumina/backend/testdata/make_demo_chats.py --email someone@example.com

Add --dry-run to see what it would do without writing anything.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import time
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
sys.path.insert(0, str(APP))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(APP.parent / ".env")

import agent  # noqa: E402
import conversations  # noqa: E402
from supabase_client import get_client  # noqa: E402

# What the customer says, per workbook. Deliberately ordinary: if a conversation only
# works when the customer knows the right words, it does not work.
DEMOS = [
    {
        "workbook": Path.home() / "Downloads" / "Video Production Plan - TEST.xlsx",
        "replies": [
            "go ahead",
            "the main production plan please",
            "yes, that's right. Group it by month and by studio",
            "yes, add those and build it",
            "yes, build it",
        ],
    },
    {
        "workbook": Path.home() / "Downloads" / "Transcription Output - TEST.xlsx",
        "replies": [
            "go ahead",
            "yes, that looks right",
            "group it by month and by language, then add the headline figures and charts you suggest",
            "yes, build it",
            "yes",
        ],
    },
    {
        "workbook": None,  # filled in below from whichever copy of the first plan exists
        "replies": [
            "go ahead",
            "yes, that's correct",
            "summarise it by month and build me the dashboard",
            "yes, go ahead",
            "yes",
        ],
    },
]


def first_production_plan() -> Path | None:
    """The original images workbook, wherever it was last uploaded to."""
    named = "Lumina Test - Production Plan (values only).xlsx"
    for candidate in [
        Path.home() / "Downloads" / named,
        *sorted(Path.home().glob(f"AppData/Local/Temp/lumina-*/{named}")),
    ]:
        if candidate.exists():
            return candidate
    return None


def hold(owner: str, workbook: Path, replies: list[str]) -> dict:
    """One whole conversation, recorded exactly as the website records one."""
    # Copied somewhere of its own, as an upload would be: a conversation that outlives
    # the file it is about shows "its spreadsheet has not been kept", which is honest but
    # not what a demo wants to open on.
    folder = Path(tempfile.mkdtemp(prefix="lumina-"))
    held = folder / workbook.name
    shutil.copyfile(workbook, held)

    conversation = conversations.start(owner, held, held.stem)
    greeting = (
        f"I have your file, {held.name}. Tell me what you would like to see, "
        f"or just say 'go ahead' and I will suggest something."
    )
    conversations.record(conversation.id, [{"role": "lumina", "content": greeting}])

    owner_context = {"user_id": owner, "conversation_id": conversation.id}
    built = False

    for turn, said in enumerate(replies):
        opening = said
        if turn == 0:
            opening = f"{said}\n\n(The workbook is at {held})"
        conversations.record(conversation.id, [{"role": "you", "content": said}])

        seen: list[dict] = []
        for event in agent.respond(conversation.history, opening, owner_context):
            if event["type"] == "message":
                seen.append({
                    "role": "lumina",
                    "content": event["text"],
                    "payload": {
                        "supplier": event.get("supplier"),
                        "model": event.get("model"),
                        "suggestions": event.get("suggestions") or None,
                    },
                })
            elif event["type"] == "tool_finished":
                seen.append({
                    "role": "step",
                    "content": event["tool"],
                    "payload": {
                        "detail": event.get("detail"),
                        "outcome": event.get("outcome", "ok"),
                        "supplier": event.get("supplier"),
                        "model": event.get("model"),
                    },
                })
                if event.get("report"):
                    seen.append({
                        "role": "lumina",
                        "content": "",
                        "payload": {"report": event["report"]},
                    })
                    built = True
            elif event["type"] == "notice":
                seen.append({
                    "role": "step",
                    "content": event["key"],
                    "payload": {"detail": event.get("detail"), "notice": True},
                })

        conversations.record(conversation.id, seen)
        conversations.remember(conversation)
        if built:
            break

    return {"id": conversation.id, "title": held.stem, "built": built}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--dry-run", action="store_true")
    chosen = parser.parse_args()

    plan = first_production_plan()
    if plan:
        DEMOS[2]["workbook"] = plan
    demos = [d for d in DEMOS if d["workbook"] and Path(d["workbook"]).exists()]

    client = get_client()
    users = [
        u for u in client.auth.admin.list_users()
        if (u.email or "").lower() == chosen.email.lower()
    ]
    if not users:
        print(f"No account for {chosen.email}.")
        return 2
    owner = users[0].id

    print(f"account {chosen.email} -> {owner}")
    for demo in demos:
        print(f"  will use {Path(demo['workbook']).name}")
    missing = [d for d in DEMOS if not d["workbook"] or not Path(d["workbook"]).exists()]
    for demo in missing:
        print(f"  MISSING {demo['workbook']}")
    if chosen.dry_run:
        return 0

    made = []
    for demo in demos:
        started = time.time()
        print(f"\n--- {Path(demo['workbook']).name} ---", flush=True)
        try:
            made.append(hold(owner, Path(demo["workbook"]), demo["replies"]))
            print(f"    {'built a report' if made[-1]['built'] else 'no report built'}"
                  f" in {time.time() - started:.0f}s")
        except Exception as e:
            print(f"    failed: {type(e).__name__}: {e}")

    print("\n" + "-" * 60)
    for chat in made:
        print(f"{'OK  ' if chat['built'] else 'THIN'}  {chat['title']}")
    return 0 if made and all(c["built"] for c in made) else 1


if __name__ == "__main__":
    raise SystemExit(main())
