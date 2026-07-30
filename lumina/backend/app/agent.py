"""The conversation that builds a report — Decision 1, in the backend.

Decision 9 put the agent here rather than in the WhatsApp gateway, because Decision 2
wants the customer watching the dashboard take shape as they talk, and a preview can
only be driven from where the conversation lives.

The loop is deliberately plain: send the conversation and the tool definitions to the
model, run whatever it asks for, hand the result back, repeat. All the judgement about
what is a *valid* thing to do lives in the tools themselves (Decision 6), so this file
does not need to second-guess the model — it only has to stop it running away.

Progress is emitted as events rather than returned at the end, so the website can show
the work happening instead of a spinner.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from typing import Any

from openai import RateLimitError

import agent_tools
import workbench
from llm_client import DEFAULT_MODEL, available_suppliers, mark_exhausted

AGENT_MODEL = DEFAULT_MODEL

# Free models are rate limited, and one provider being busy should not end a customer's
# conversation. OpenRouter can be asked to try several in turn; it accepts at most three,
# and its own free router is a useful last resort because it picks any free model that
# supports what the request needs. Other providers serve one model per request.
AGENT_FALLBACKS = [AGENT_MODEL, "openai/gpt-oss-20b:free", "openrouter/free"]

# Decision 7 warns that agents wander. This is the hard stop.
MAX_STEPS = 24

# Left unset, the client asks the provider to reserve its full context window, which is
# both wasteful and — on a pay-as-you-go balance — refused before a single token is
# generated. Generous enough that a full set of column meanings, which is a long tool
# call, is not cut off half-written; 1500 truncated one mid-sentence.
MAX_REPLY_TOKENS = 3000

SYSTEM_PROMPT = """You are Lumina, helping a Lifewood production manager turn their \
spreadsheet into a Power BI dashboard. You talk to them in plain language; they are not \
technical and should never see jargon, column numbers, or tool names.

Work through the tools in order: open the workbook, examine the sheet they want, agree \
what its columns mean, summarise the figures, then add headline figures and charts, then \
build the file. Building the file finishes the job: say it is ready and stop there. Never \
build a second time unless they have asked for a change.

HOW YOU SPEAK: the customer only ever sees what you pass to reply_to_customer. Anything \
you write outside a tool is thrown away and never reaches them. So when you want to ask a \
question, explain a finding, or confirm something, call reply_to_customer — do not simply \
write it out.

How to behave:

- ASK BEFORE YOU ASSUME. When you have read a sheet, tell them in plain words what you \
think each column is for and ask them to confirm before going further. Getting the \
planned and achieved figures paired wrongly produces a confident, wrong dashboard.
- REPORT WHAT YOU FIND. If a sheet has a total row, padding, or placeholder text instead \
of numbers, say so plainly — it is their spreadsheet and they may not know.
- SUGGEST, DO NOT INTERROGATE. Offer a sensible set of charts and let them adjust, rather \
than asking a long list of questions. One question at a time.
- NEVER INVENT FIGURES. Everything you state must have come from a tool.
- If a tool refuses, read why, fix it, and try again. Do not tell the customer about the \
error unless it is something only they can resolve.

Keep replies short. They are busy."""


# Free tiers are rate limited per minute as well as per day — Google allows five
# requests a minute on its free models, and one conversation makes about eight. Being
# asked to wait a moment is normal operation here, not a failure, so we wait.
RATE_LIMIT_ATTEMPTS = 4
RATE_LIMIT_PAUSE_CAP = 65.0


def _retry_after(error: Exception) -> float | None:
    """How long to wait, or None if waiting will not help.

    A per-minute limit comes with a delay and clears itself. A spent daily allowance
    either offers no delay or one far too long to hold a customer through — in both
    cases the answer is a different supplier, not patience.
    """
    text = str(error)
    match = re.search(r"(?:retry in|try again in)\s*([\d.]+)\s*s", text, re.I)
    if match:
        wait = float(match.group(1)) + 1
        return wait if wait <= RATE_LIMIT_PAUSE_CAP else None
    if re.search(r"per[- ]day|daily|tokens per day|TPD|credits", text, re.I):
        return None
    return None


def _complete(history: list[dict], tools: list[dict]):
    """One call to the model, reporting anything that delays it.

    A rate limit is worth waiting out; an exhausted allowance is not, and the two are
    told apart by whether the supplier offers a retry delay. Where waiting will not
    help, the next supplier holding a key is tried instead — free tiers run dry on
    their own separate schedules, and a customer's conversation should not end because
    one of them did.

    Both of those take time, and a customer watching a conversation that has gone quiet
    deserves to know why rather than assuming it has broken. So this yields notices as
    it goes and returns the answer at the end — a generator rather than a plain call.
    """
    suppliers = available_suppliers()
    last: Exception | None = None

    for index, supplier in enumerate(suppliers):
        if index:
            yield {
                "type": "notice",
                "key": "switched_supplier",
                "detail": "The last one has reached its limit for now",
            }
        for attempt in range(RATE_LIMIT_ATTEMPTS):
            try:
                return supplier.client.chat.completions.create(
                    model=supplier.model,
                    messages=history,
                    tools=tools,
                    temperature=0,
                    max_tokens=MAX_REPLY_TOKENS,
                    # Only OpenRouter understands a list of models to try; the others
                    # reject the extra field outright.
                    **(
                        {"extra_body": {"models": AGENT_FALLBACKS, "route": "fallback"}}
                        if supplier.name == "openrouter"
                        else {}
                    ),
                )
            except RateLimitError as e:
                last = e
                pause = _retry_after(e)
                # No delay offered means the allowance is spent, not merely busy.
                if pause is None or attempt == RATE_LIMIT_ATTEMPTS - 1:
                    mark_exhausted(supplier.name)
                    break
                yield {
                    "type": "notice",
                    "key": "waiting",
                    "detail": f"It is busy — trying again in {pause:.0f} seconds",
                }
                time.sleep(pause)
            except Exception as e:  # a bad key or a withdrawn model: try the next one
                last = e
                break

    raise last or RuntimeError("No AI supplier is configured.")


# Tool output that has served its purpose, and what to leave in its place. The whole
# conversation is re-sent on every call, so a long answer is paid for again and again.
# The sheet description is the worst offender at roughly 500 tokens: essential while
# deciding what the columns mean, and dead weight the moment that is settled, because
# the answer is then held on the server and does not need repeating to the model.
_SUPERSEDED = {
    "examine_sheet": (
        "record_column_meanings",
        "(The sheet has been examined and its columns agreed; details omitted.)",
    ),
}


def _trim(history: list[dict]) -> list[dict]:
    """Replace tool output the conversation has moved past, keeping the shape intact.

    The messages themselves stay — removing one would orphan the tool call that asked
    for it — only their contents are shortened.
    """
    settled = {
        call["function"]["name"]
        for message in history
        for call in (message.get("tool_calls") or [])
    }
    replacements: dict[str, str] = {}
    for tool, (after, placeholder) in _SUPERSEDED.items():
        if after in settled:
            replacements[tool] = placeholder
    if not replacements:
        return history

    # Which call ids belong to the tools we are shortening.
    ids = {
        call["id"]: call["function"]["name"]
        for message in history
        for call in (message.get("tool_calls") or [])
        if call["function"]["name"] in replacements
    }
    return [
        {**m, "content": replacements[ids[m["tool_call_id"]]]}
        if m.get("role") == "tool" and m.get("tool_call_id") in ids
        else m
        for m in history
    ]


def _tool_result(name: str, arguments: dict, owner: dict | None) -> str:
    """Run one tool. A refusal is an answer, not a crash — the model has to see it.

    Who the report belongs to is set here, immediately before the call, rather than
    once for the whole reply. A streamed reply is resumed step by step and each step
    runs in a fresh copy of the context, so anything set on an earlier step has
    vanished by the next one — which is why a finished report was quietly never
    uploaded: by the time the workbook was opened, the owner had gone.
    """
    token = workbench.CURRENT_OWNER.set(owner)
    try:
        return str(agent_tools.BY_NAME[name](**arguments))
    except KeyError:
        return f"There is no tool called {name!r}. Available: {', '.join(agent_tools.BY_NAME)}."
    except Exception as e:  # tools raise deliberately, with messages meant to be read
        return f"That did not work: {e}"
    finally:
        workbench.CURRENT_OWNER.reset(token)


def _detail(name: str, session) -> str | None:
    """A line of plain fact about what a step just did, for the customer to watch.

    Read from what the tools actually produced rather than from what the AI said about
    them, so a step that claims to have summarised 180 rows has genuinely done so.
    """
    if session is None:
        return None
    try:
        if name == "open_workbook":
            return session.workbook.name
        if name == "examine_sheet" and session.profiles:
            p = list(session.profiles.values())[-1]
            rows = "row" if p.data_row_count == 1 else "rows"
            cols = "column" if len(p.columns) == 1 else "columns"
            return f"{p.data_row_count:,} {rows} · {len(p.columns)} {cols}"
        if name == "record_column_meanings" and session.schema:
            measures = sum(1 + len(p.actuals) for p in session.schema.pairs)
            breakdowns = len(session.schema.labels)
            ways = "way" if breakdowns == 1 else "ways"
            return f"{measures} figures · {breakdowns} {ways} to break them down"
        if name == "summarise_figures" and session.summary:
            s = session.summary
            periods = "period" if len(s.rows) == 1 else "periods"
            return f"{len(s.rows)} {periods} from {s.source_rows_used:,} rows"
        if name == "add_headline_figure" and session.spec.kpis:
            return session.spec.kpis[-1].title
        if name == "add_report_chart" and session.spec.charts:
            return session.spec.charts[-1].title
        if name == "build_report_file" and session.last_report:
            return "Ready to download"
    except Exception:  # a display detail is never worth failing a conversation over
        return None
    return None


def respond(
    history: list[dict], message: str, owner: dict | None = None
) -> Iterator[dict[str, Any]]:
    """Answer the customer, using tools as needed. Yields events as work happens.

    `history` is the conversation so far in the model's own format, and is appended to
    in place so the caller can keep it for the next turn.
    """
    if not history:
        history.append({"role": "system", "content": SYSTEM_PROMPT})
    history.append({"role": "user", "content": message})

    for _ in range(MAX_STEPS):
        completion = yield from _complete(_trim(history), agent_tools.schemas_for(history))
        choice = completion.choices[0].message
        history.append(choice.model_dump(exclude_none=True))

        # Anything written outside reply_to_customer is deliberately discarded. Models
        # vary in how much of their own reasoning they spill into ordinary content —
        # one free model produced "We need to interpret columns. Let's list columns with
        # positions…" in front of a production manager. Rather than hope each model
        # behaves, the customer only ever sees what was passed to a tool, which makes
        # the leak impossible instead of unlikely.
        if not choice.tool_calls:
            yield {"type": "nudge"}
            history.append(
                {
                    "role": "user",
                    "content": (
                        "Say that to the customer using reply_to_customer, or carry on "
                        "with the next tool. Anything written outside a tool is not seen."
                    ),
                }
            )
            continue

        for call in choice.tool_calls:
            name = call.function.name
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}

            if name == "reply_to_customer":
                yield {"type": "message", "text": arguments.get("message", "")}
                history.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": agent_tools.reply_to_customer(**arguments),
                    }
                )
                yield {"type": "done"}
                return

            yield {"type": "tool_started", "tool": name}
            result = _tool_result(name, arguments, owner)
            history.append(
                {"role": "tool", "tool_call_id": call.id, "content": result}
            )
            # A finished report travels with the event, so the conversation can
            # offer it for download rather than telling the customer it exists and
            # leaving them to go looking.
            session = workbench._sessions.get(arguments.get("session_id", ""))
            report = (
                session.last_report
                if session and name == "build_report_file"
                else None
            )

            yield {
                "type": "tool_finished",
                "tool": name,
                "report": report,
                "detail": _detail(name, session),
                # The website watches for these to know when to redraw the preview.
                "session_id": arguments.get("session_id"),
                "changed_report": name
                in {
                    "summarise_figures",
                    "add_headline_figure",
                    "add_report_chart",
                    # Without this the finished file lands in the customer's account
                    # and the list they are looking at never notices.
                    "build_report_file",
                },
            }

    yield {
        "type": "message",
        "text": (
            "I have gone back and forth on this more than expected and stopped to avoid "
            "going in circles. Could you tell me what you would like next?"
        ),
    }
    yield {"type": "done"}
