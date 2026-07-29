"""Keep a conversation between messages.

The agent needs to remember what has already been said, and Decision 9 keeps that on
the server rather than making the customer's browser carry it. This holds the exchange
itself; `workbench` holds the figures being worked on.

Two separate stores because they have different lifetimes: a conversation begins when
somebody uploads a file, and a workbench session begins later, when the agent decides
to open that file. One conversation may open several.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

# Long enough that a customer can leave a conversation over lunch and come back to it.
CONVERSATION_LIFETIME_SECONDS = 6 * 60 * 60


@dataclass
class Conversation:
    id: str
    owner: str  # the Supabase user, so nobody can read anyone else's
    workbook: Path | None = None
    history: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    touched_at: float = field(default_factory=time.time)


class ConversationError(ValueError):
    """No such conversation, or it belongs to somebody else."""


_conversations: dict[str, Conversation] = {}


def start(owner: str, workbook: Path | None = None) -> Conversation:
    _expire()
    conversation = Conversation(id=uuid.uuid4().hex[:12], owner=owner, workbook=workbook)
    _conversations[conversation.id] = conversation
    return conversation


def get(conversation_id: str, owner: str) -> Conversation:
    _expire()
    conversation = _conversations.get(conversation_id)
    # Deliberately the same message either way: telling a caller that a conversation
    # exists but is not theirs is more than they need to know.
    if conversation is None or conversation.owner != owner:
        raise ConversationError("No conversation in progress with that id.")
    conversation.touched_at = time.time()
    return conversation


def _expire() -> None:
    cutoff = time.time() - CONVERSATION_LIFETIME_SECONDS
    for stale in [i for i, c in _conversations.items() if c.touched_at < cutoff]:
        del _conversations[stale]
