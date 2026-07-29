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
from llm_client import DEFAULT_MODEL, SUPPORTS_MODEL_FALLBACK, client

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
build the file.

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


def _retry_after(error: Exception) -> float:
    """How long the provider asked us to wait, if it said."""
    match = re.search(r"retry in ([\d.]+)s", str(error), re.I)
    if match:
        return min(float(match.group(1)) + 1, RATE_LIMIT_PAUSE_CAP)
    return 20.0


def _complete(history: list[dict]):
    """One call to the model, waiting out a rate limit rather than giving up on it."""
    for attempt in range(RATE_LIMIT_ATTEMPTS):
        try:
            return client.chat.completions.create(
                model=AGENT_MODEL,
                messages=history,
                tools=agent_tools.schemas(),
                temperature=0,
                max_tokens=MAX_REPLY_TOKENS,
                # Only OpenRouter understands a list of models to try; the others
                # reject the extra field outright.
                **(
                    {"extra_body": {"models": AGENT_FALLBACKS, "route": "fallback"}}
                    if SUPPORTS_MODEL_FALLBACK
                    else {}
                ),
            )
        except RateLimitError as e:
            if attempt == RATE_LIMIT_ATTEMPTS - 1:
                raise
            time.sleep(_retry_after(e))
    raise RuntimeError("unreachable")


def _tool_result(name: str, arguments: dict) -> str:
    """Run one tool. A refusal is an answer, not a crash — the model has to see it."""
    try:
        return str(agent_tools.BY_NAME[name](**arguments))
    except KeyError:
        return f"There is no tool called {name!r}. Available: {', '.join(agent_tools.BY_NAME)}."
    except Exception as e:  # tools raise deliberately, with messages meant to be read
        return f"That did not work: {e}"


def respond(history: list[dict], message: str) -> Iterator[dict[str, Any]]:
    """Answer the customer, using tools as needed. Yields events as work happens.

    `history` is the conversation so far in the model's own format, and is appended to
    in place so the caller can keep it for the next turn.
    """
    if not history:
        history.append({"role": "system", "content": SYSTEM_PROMPT})
    history.append({"role": "user", "content": message})

    for _ in range(MAX_STEPS):
        completion = _complete(history)
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
            result = _tool_result(name, arguments)
            history.append(
                {"role": "tool", "tool_call_id": call.id, "content": result}
            )
            yield {
                "type": "tool_finished",
                "tool": name,
                # The website watches for these to know when to redraw the preview.
                "session_id": arguments.get("session_id"),
                "changed_report": name
                in {"summarise_figures", "add_headline_figure", "add_report_chart"},
            }

    yield {
        "type": "message",
        "text": (
            "I have gone back and forth on this more than expected and stopped to avoid "
            "going in circles. Could you tell me what you would like next?"
        ),
    }
    yield {"type": "done"}
