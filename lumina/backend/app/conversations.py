"""Keep a conversation between messages, and between visits.

The agent needs to remember what has already been said, and Decision 9 keeps that on
the server rather than making the customer's browser carry it. This holds the exchange
itself; `workbench` holds the figures being worked on.

Two separate stores because they have different lifetimes: a conversation begins when
somebody uploads a file, and a workbench session begins later, when the agent decides
to open that file. One conversation may open several.

Kept in memory *and* in the database. In memory because a conversation is asked for
several times a minute while it is live; in the database because it was previously lost
the moment the customer looked at anything else, and because restarting the server
should not wipe what people were in the middle of. The database is the authority: memory
is only there to save a round trip.

The identifier is the database row's own id, not a second one of our own invention.
Carrying two ids for one conversation meant the durable one was known only to the server
while the browser held the throwaway one — so the browser had nothing it could ask to be
resumed.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

from supabase_client import get_client

# How long a conversation stays in memory before we go back to the database for it.
# Nothing is lost when it expires; it is only dropped from the cache.
CONVERSATION_LIFETIME_SECONDS = 6 * 60 * 60


@dataclass
class Conversation:
    id: str  # the conversations row id, used everywhere
    owner: str  # the Supabase user, so nobody can read anyone else's
    workbook: Path | None = None
    history: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    touched_at: float = field(default_factory=time.time)
    # Set when the customer takes back what they said while the reply is still being
    # worked on. Without it the two race: the take-back removes the turn, and the reply
    # finishes a moment later and writes it straight back.
    taken_back: bool = False

    @property
    def supabase_id(self) -> str:
        """The row this conversation's reports belong to — now simply its id."""
        return self.id


class ConversationError(ValueError):
    """No such conversation, or it belongs to somebody else."""


_conversations: dict[str, Conversation] = {}


def start(owner: str, workbook: Path | None, title: str) -> Conversation:
    """Begin a conversation, creating the row that everything else will hang off."""
    _expire()
    created = (
        get_client()
        .table("conversations")
        .insert(
            {
                "user_id": owner,
                "title": title,
                # Kept so a conversation resumed after a restart still knows which
                # spreadsheet it is about.
                "workbook_path": str(workbook) if workbook else None,
            }
        )
        .execute()
    )
    conversation = Conversation(
        id=created.data[0]["id"], owner=owner, workbook=workbook
    )
    _conversations[conversation.id] = conversation
    return conversation


def get(conversation_id: str, owner: str) -> Conversation:
    """Fetch a conversation, from memory if it is there and the database if not."""
    _expire()
    conversation = _conversations.get(conversation_id) or _load(conversation_id)
    # Deliberately the same message either way: telling a caller that a conversation
    # exists but is not theirs is more than they need to know.
    if conversation is None or conversation.owner != owner:
        raise ConversationError("No conversation in progress with that id.")
    conversation.touched_at = time.time()
    return conversation


def _load(conversation_id: str) -> Conversation | None:
    """Rebuild a conversation from the database.

    Its own working memory is restored too, not merely the words exchanged — otherwise a
    conversation would look continuous to the customer while the agent had no idea what
    had already been agreed.
    """
    try:
        found = (
            get_client()
            .table("conversations")
            .select("id, user_id, workbook_path, agent_history")
            .eq("id", conversation_id)
            .limit(1)
            .execute()
        )
    except Exception:  # a malformed id is a miss, not a crash
        return None
    if not found.data:
        return None

    row = found.data[0]
    path = row.get("workbook_path")
    conversation = Conversation(
        id=row["id"],
        owner=row["user_id"],
        workbook=Path(path) if path else None,
        history=row.get("agent_history") or [],
    )
    _conversations[conversation.id] = conversation
    return conversation


def remember(conversation: Conversation) -> None:
    """Write the agent's working memory back, so the next visit can carry on.

    Called after a turn rather than during one: a half-finished turn is not a state
    worth resuming, and writing on every step would cost a round trip per tool.
    """
    try:
        get_client().table("conversations").update(
            {"agent_history": conversation.history}
        ).eq("id", conversation.id).execute()
    except Exception:
        # Losing the ability to resume is a poor outcome; failing the customer's reply
        # over it is a worse one.
        pass


def take_back(conversation: Conversation) -> str | None:
    """Undo the last thing the customer said, and everything Lumina did about it.

    A stray keystroke sent a single letter and Lumina answered it as an instruction. The
    letter itself was harmless; what is not harmless is that it stays in the record, so
    every later turn is reasoned about with a meaningless message in the middle of it.
    Hiding it on screen would leave that intact — the agent's own memory is what has to
    forget, or the take-back is only a picture of one.

    Returns the words taken back, so they can be put back in the customer's box rather
    than thrown away.
    """
    # The agent's memory, back to just before the customer last spoke. Tool calls and
    # their results come in pairs and must be removed together, which cutting at the
    # customer's own message does by construction.
    conversation.taken_back = True
    spoke_at = None
    for index, entry in enumerate(conversation.history):
        if entry.get("role") == "user":
            spoke_at = index
    said = None
    if spoke_at is not None:
        said = conversation.history[spoke_at].get("content")
        del conversation.history[spoke_at:]
        remember(conversation)

    # And the transcript, which is what the customer sees when they come back.
    try:
        client = get_client()
        rows = (
            client.table("messages")
            .select("id, role, content")
            .eq("conversation_id", conversation.id)
            .order("created_at", desc=True)
            .limit(60)
            .execute()
            .data
            or []
        )
        remove: list[str] = []
        for row in rows:  # newest first, so stop at the customer's most recent words
            remove.append(row["id"])
            if row.get("role") == "you":
                said = said or row.get("content")
                break
        if remove:
            client.table("messages").delete().in_("id", remove).execute()
    except Exception:
        # The memory is the part that changes what happens next, and it is already done.
        pass

    # The first message has the workbook's path appended for the agent's benefit. The
    # customer never typed that and should not get it back in their box.
    if said:
        said = said.split("\n\n(The workbook is at ")[0]
    return said


def _expire() -> None:
    cutoff = time.time() - CONVERSATION_LIFETIME_SECONDS
    for stale in [i for i, c in _conversations.items() if c.touched_at < cutoff]:
        del _conversations[stale]


def record(conversation_id: str, rows: list[dict]) -> None:
    """Save what the customer saw, so returning to a conversation shows it again.

    One row per thing on screen — what they said, what Lumina said, each step of the
    work — written in a single batch at the end of a turn rather than one round trip per
    step, which would slow the very stream it is meant to be recording.

    `messages` has existed in the database since before this work began and had never
    been written to. It is exactly the right shape for this.
    """
    if not rows:
        return
    try:
        get_client().table("messages").insert(
            [{"conversation_id": conversation_id, **row} for row in rows]
        ).execute()
    except Exception:
        # A conversation that cannot be replayed later is a loss; one that fails now
        # because of it is worse.
        pass
