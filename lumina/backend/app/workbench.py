"""Hold a report while it is being built, so the AI does not have to carry it.

Decision 9: the six tools pass substantial things between them — a description of a
sheet, an agreed set of column meanings, a table of summarised figures. The AI talks
in plain text, so either the server keeps these between steps or the AI carries them
from one call to the next.

The server keeps them. A daily summary of the official workbook is 180 rows of seven
figures and a breakdown of its detailed sheet is far larger; passing that through the
AI on every step would flood it, cost more, and make it worse at deciding things. The
AI needs to make decisions *about* the figures, not read them.

Each session is one report being built. Tools take a session id, and return a short
readable answer rather than the data itself.
"""

from __future__ import annotations

import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path

from column_roles import Schema
from report_builder import ReportSpec
from sheet_profiler import SheetProfile
from summariser import Summary

# A session is a conversation in progress. Abandoned ones would otherwise accumulate
# for the life of the process, holding a summary each.
SESSION_LIFETIME_SECONDS = 6 * 60 * 60


# Who the finished report belongs to, for the duration of one agent turn. The tools
# take a session id and nothing else — a customer should never see an account id, and
# the agent has no business handling one — so it is carried alongside rather than
# passed through the conversation. Left unset on the WhatsApp path, which has its own
# arrangements.
CURRENT_OWNER: ContextVar[dict | None] = ContextVar("current_owner", default=None)


@dataclass
class Session:
    id: str
    workbook: Path
    owner: dict | None = None  # {"user_id": ..., "conversation_id": ...}
    created_at: float = field(default_factory=time.time)
    touched_at: float = field(default_factory=time.time)
    profiles: dict[str, SheetProfile] = field(default_factory=dict)
    schema: Schema | None = None
    summary: Summary | None = None
    spec: ReportSpec = field(default_factory=ReportSpec)
    # Where the finished report ended up, so the conversation can offer it for
    # download instead of merely announcing that it exists.
    last_report: dict | None = None

    def touch(self) -> None:
        self.touched_at = time.time()


class SessionError(ValueError):
    """The session does not exist, or is not far enough along for what was asked."""


_sessions: dict[str, Session] = {}


def open_session(workbook: str | Path) -> Session:
    _expire()
    path = Path(workbook)
    if not path.exists():
        raise SessionError(f"No file at {path}.")
    session = Session(
        id=uuid.uuid4().hex[:12], workbook=path, owner=CURRENT_OWNER.get()
    )
    # Named after the customer's own file until the agent chooses something better.
    # The default was "Production Plan" — our first customer's words, baked in, so a
    # workbook counting videos produced a report called Production Plan, a project folder
    # called Production Plan and a download called Production Plan. Decision 3 undone by a
    # default value, and invisible for as long as only that one workbook was tested.
    session.spec.title = path.stem
    _sessions[session.id] = session
    return session


def get(session_id: str) -> Session:
    _expire()
    session = _sessions.get(session_id)
    if session is None:
        raise SessionError(
            f"No report in progress with id {session_id!r}. Start one by opening a "
            f"workbook first."
        )
    session.touch()
    return session


def close(session_id: str) -> None:
    _sessions.pop(session_id, None)


def _expire() -> None:
    cutoff = time.time() - SESSION_LIFETIME_SECONDS
    for stale in [i for i, s in _sessions.items() if s.touched_at < cutoff]:
        del _sessions[stale]


def require_schema(session: Session) -> Schema:
    if session.schema is None:
        raise SessionError(
            "The columns have not been agreed yet. Examine a sheet and record what its "
            "columns mean first."
        )
    return session.schema


def require_summary(session: Session) -> Summary:
    if session.summary is None:
        raise SessionError(
            "Nothing has been summarised yet. Summarise the figures before adding "
            "anything to the report."
        )
    return session.summary
