"""Ask Power BI's own engine to load the model before a customer does.

Two reports shipped that Power BI Desktop refused to open, and the only thing that
established either was John Peter opening them and telling us. Nothing here can open a
.pbip — or so it seemed. Microsoft publish the Power BI Modeling MCP Server, which loads a
semantic model straight from a PBIP folder with no Power BI Desktop involved, and it
reports the *same* errors:

    a valid model                    loads: true
    a duplicate column name          loads: false
      TMDL objects cannot be merged because both declare the same property: dataType
    an unquoted name with a space    loads: false
      TMDL Format Error: Parsing error type - Indentation

The first of those messages is word for word what Power BI Desktop showed him. So this is
not an approximation of the check — it is the check, run early.

    https://github.com/microsoft/powerbi-modeling-mcp

Runs through `npx`, so it needs Node and a first run that downloads the package. When Node
is missing, or the server cannot be reached, this reports that it does not know rather than
failing a build: `pbip_check` already covers the documented rules, and refusing to deliver a
report because a checking tool is absent would be worse than the fault it looks for.

Only the semantic model is covered. The MCP server cannot read report pages or visuals, so
the charts and cards remain ours to get right.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("lumina.pbip")

PACKAGE = "@microsoft/powerbi-modeling-mcp@latest"

# The first call downloads the package; later ones are cached and quick. Generous, because
# the alternative to waiting is finding out from a customer.
STARTUP_TIMEOUT = 180
CALL_TIMEOUT = 120


class ModelRejected(ValueError):
    """Power BI's engine would not load this model. The message is the engine's own."""


def _rpc(process: subprocess.Popen, message: dict) -> None:
    process.stdin.write(json.dumps(message) + "\n")
    process.stdin.flush()


def _await_reply(process: subprocess.Popen, wanted: int) -> dict | None:
    """Read lines until the reply with this id arrives. Anything else is progress noise."""
    while True:
        line = process.stdout.readline()
        if not line:
            return None
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("id") == wanted:
            return message


def load_model(model_folder: Path) -> str | None:
    """Have the engine load this semantic model.

    Returns None when the check could not be run at all — no Node, no network on a first
    run, or the server never answered. Raises ModelRejected when the engine actually
    refuses the model, quoting what it said.
    """
    definition = Path(model_folder) / "definition"
    if not definition.is_dir():
        raise ModelRejected(f"{model_folder.name} has no definition folder.")

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        log.info("node is not installed, so the model cannot be loaded for checking")
        return None

    process = None
    try:
        process = subprocess.Popen(
            [npx, "-y", PACKAGE, "--start"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            shell=False,
        )
        _rpc(process, {
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "lumina", "version": "1.0"},
            },
        })
        if _await_reply(process, 1) is None:
            log.warning("the modelling server did not start; skipping the engine check")
            return None
        _rpc(process, {"jsonrpc": "2.0", "method": "notifications/initialized"})

        _rpc(process, {
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {
                "name": "connection_operations",
                "arguments": {
                    "request": {
                        "operation": "ConnectFolder",
                        "folderPath": str(definition),
                    }
                },
            },
        })
        reply = _await_reply(process, 2)
        if reply is None:
            log.warning("the modelling server gave no verdict; skipping the engine check")
            return None

        said = " ".join(
            part.get("text", "")
            for part in (reply.get("result", {}).get("content") or [])
        ) or json.dumps(reply.get("error") or reply)

        if "Successfully loaded" in said:
            return said
        raise ModelRejected(
            "Power BI's own engine will not load this model:\n  "
            + said.replace("\\r\\n", " ").replace("\r\n", " ").strip()[:600]
        )
    except (OSError, ValueError) as e:
        if isinstance(e, ModelRejected):
            raise
        log.warning("could not run the engine check: %s", e)
        return None
    finally:
        if process is not None:
            try:
                process.kill()
            except OSError:
                pass
