"""Validate a report's visuals with Microsoft's own PBIR validator.

`pbip_engine` has Power BI's engine load the semantic model, which catches a file that will
not open. It says nothing about the report itself — the charts, cards, colours and fonts —
and that gap has been expensive.

A visual property Power BI does not recognise is written into the file, accepted, and then
silently ignored. Nothing fails. So a report looks wrong for no visible reason and the only
way to find out was a person opening it and noticing. Three separate afternoons went that
way: a caption font set as `labels` instead of `label`, display units set to the enum's
*default* rather than to None, and — found the moment this validator was first run —
`fontColor` on every chart axis and legend, where the property is `labelColor`. Every axis
on every report had been Microsoft's default grey rather than Lifewood green since that code
was written, and nothing had ever complained.

    npm i -g @microsoft/powerbi-report-authoring-cli
    powerbi-report-author validate <path to .Report>
    powerbi-report-author formatting describe-object clusteredColumnChart categoryAxis

The CLI is also the way to *find* a property name rather than guess one, which is worth more
than the validation: `describe-object` lists the real names, types and permitted values.

Run through `npx`, so Node is needed. Where it is unavailable this reports that it does not
know rather than failing a build — the same reasoning as the engine check.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("lumina.pbir")

PACKAGE = "@microsoft/powerbi-report-authoring-cli@latest"

# Generous: the first run downloads the package.
TIMEOUT = 240

# Network-dependent rather than a fault in the report. Microsoft's schemas are fetched over
# the internet, and a build should not fail because a server was unreachable.
IGNORED = {"PBIR_SCHEMA_UNREACHABLE"}


class ReportRejected(ValueError):
    """The report has faults Power BI would not report. The message lists them."""


def validate(report_folder: Path) -> list[str] | None:
    """Faults in this report, or None if the check could not be run."""
    report_folder = Path(report_folder)
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        log.info("node is not installed, so the report's visuals cannot be validated")
        return None

    try:
        finished = subprocess.run(
            [npx, "-y", "-p", PACKAGE, "powerbi-report-author", "validate",
             str(report_folder)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=TIMEOUT,
            shell=False,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        log.warning("could not run the report validator: %s", e)
        return None

    # The CLI prints one JSON object; anything else on the way is progress noise.
    payload = None
    for line in reversed((finished.stdout or "").splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                payload = json.loads(line)
                break
            except json.JSONDecodeError:
                continue
    if payload is None:
        log.warning("the report validator gave no verdict; skipping it")
        return None

    diagnostics = (payload.get("data") or {}).get("diagnostics") or {}
    faults: list[str] = []
    for code, detail in diagnostics.items():
        if detail.get("severity") != "error" or code in IGNORED:
            continue
        for item in detail.get("items", []):
            # The message ends with the offending file path, which is ours not theirs.
            faults.append(f"{code}: {item.get('message', '').split(':')[0].strip()}")
    return faults


def require_valid(report_folder: Path) -> None:
    """Refuse to hand over a report whose visuals Power BI would quietly ignore."""
    faults = validate(report_folder)
    if faults:
        raise ReportRejected(
            "Power BI would silently ignore parts of this report:\n  - "
            + "\n  - ".join(dict.fromkeys(faults))
        )
