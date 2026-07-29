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
import os
from collections.abc import Iterator
from typing import Any

import agent_tools
from llm_client import client

# Free models are documented in this repo as dropping tool calls; this flow needs
# several in sequence, so the model is a single setting rather than buried in code.
AGENT_MODEL = os.getenv("LUMINA_AGENT_MODEL", "anthropic/claude-sonnet-4.5")

# Decision 7 warns that agents wander. This is the hard stop.
MAX_STEPS = 24

# Replies here are a couple of sentences plus a tool call, never an essay. Left unset,
# the client asks the provider to reserve its full context window, which is both wasteful
# and — on a pay-as-you-go balance — refused outright before a single token is generated.
MAX_REPLY_TOKENS = 1500

SYSTEM_PROMPT = """You are Lumina, helping a Lifewood production manager turn their \
spreadsheet into a Power BI dashboard. You talk to them in plain language; they are not \
technical and should never see jargon, column numbers, or tool names.

Work through the tools in order: open the workbook, examine the sheet they want, agree \
what its columns mean, summarise the figures, then add headline figures and charts, then \
build the file.

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
        completion = client.chat.completions.create(
            model=AGENT_MODEL,
            messages=history,
            tools=agent_tools.schemas(),
            temperature=0,
            max_tokens=MAX_REPLY_TOKENS,
        )
        choice = completion.choices[0].message
        history.append(choice.model_dump(exclude_none=True))

        if choice.content:
            yield {"type": "message", "text": choice.content}

        if not choice.tool_calls:
            yield {"type": "done"}
            return

        for call in choice.tool_calls:
            name = call.function.name
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}

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
