"""Check a generated Power BI project before it reaches anybody.

Two files shipped to a customer today that Power BI refused to open: one with two
columns of the same name, one with a name that needed quoting and did not have it. Both
were "verified" first — the text looked right, the names did not collide, nothing needed
escaping as far as I could tell. Nothing in this environment can open a .pbip, so being
sure by reading was not being sure at all.

Microsoft publish the rules. Their semantic-model-authoring skill prescribes a validation
checklist, and the two steps that work without a live Analysis Services connection are
exactly the two available here: check the project structure, and check the definition
against the TMDL guidelines. This encodes those, so a malformed project fails on our
machine rather than on a customer's.

    https://github.com/microsoft/skills-for-fabric
      plugins/powerbi-authoring/skills/semantic-model-authoring/references/tmdl-guidelines.md
      plugins/powerbi-authoring/skills/semantic-model-authoring/references/pbip.md

It is not a substitute for opening the file. It cannot tell whether a report reads well,
whether a measure returns the right number, or whether a visual property name is one
Power BI honours — that still needs a person and Power BI Desktop. It catches the class of
fault that made a file unopenable, which is the class that wasted an afternoon.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# A TMDL name may be written bare only if it is a simple identifier; anything containing a
# space, a dot, an equals, a colon or a quote must be wrapped in single quotes.
_BARE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_OBJECT = re.compile(r"^\t(table|column|measure|partition|hierarchy)\s+(.+?)\s*(=.*)?$")


class ProjectError(ValueError):
    """The project would not open, or would open wrongly. The message says why."""


def _name_of(declared: str) -> str:
    """The object's name, with TMDL quoting removed."""
    declared = declared.strip()
    if declared.startswith("'") and declared.endswith("'") and len(declared) > 1:
        return declared[1:-1].replace("''", "'")
    return declared


def _check_names(text: str, path: Path, problems: list[str]) -> None:
    """Every declared name either simple or quoted, and none declared twice."""
    seen: dict[str, list[str]] = {}
    for line in text.splitlines():
        match = _OBJECT.match(line)
        if not match:
            continue
        kind, declared = match.group(1), match.group(2).strip()
        quoted = declared.startswith("'")
        if not quoted and not _BARE_NAME.match(declared):
            problems.append(
                f"{path.name}: {kind} {declared!r} needs single quotes — a TMDL name with "
                f"a space or a special character must be written {kind} '{declared}'."
            )
        seen.setdefault(kind, []).append(_name_of(declared))

    for kind, names in seen.items():
        duplicates = sorted({n for n in names if names.count(n) > 1})
        if duplicates:
            problems.append(
                f"{path.name}: two {kind}s are both called {', '.join(duplicates)}. "
                f"Power BI refuses the file outright — 'TMDL objects cannot be merged'."
            )


def _check_table(text: str, path: Path, problems: list[str]) -> None:
    """The rules that apply inside a table definition."""
    if "\n//" in text or text.startswith("//"):
        problems.append(f"{path.name}: '//' comments are not supported in TMDL.")

    # Every measure needs a formatString, or Power BI shows a raw number.
    for match in re.finditer(r"^\tmeasure\s+(.+?)\s*=", text, re.M):
        block = text[match.end() :].split("\n\tmeasure ")[0].split("\n\tcolumn ")[0]
        if "formatString:" not in block:
            problems.append(
                f"{path.name}: measure {match.group(1).strip()} has no formatString."
            )

    # Measures come before columns.
    first_column = text.find("\n\tcolumn ")
    last_measure = text.rfind("\n\tmeasure ")
    if first_column != -1 and last_measure > first_column:
        problems.append(
            f"{path.name}: measures must be declared before columns."
        )

    columns = {_name_of(m.group(1)) for m in re.finditer(r"^\tcolumn\s+(.+)$", text, re.M)}
    for match in re.finditer(r"^\t\tsortByColumn:\s*(.+)$", text, re.M):
        target = _name_of(match.group(1))
        if target not in columns:
            problems.append(
                f"{path.name}: sortByColumn points at {target!r}, which is not a column "
                f"in this table."
            )

    # The M table's own column names have to be escaped the Power Query way, which is not
    # the TMDL way: #"With Spaces" rather than 'With Spaces'.
    signature = re.search(r"type table \[(.+?)\]", text, re.S)
    if signature:
        for field in signature.group(1).split(","):
            name = field.split("=")[0].strip()
            if not name.startswith('#"') and not _BARE_NAME.match(name):
                problems.append(
                    f'{path.name}: the M column {name!r} needs #"..." quoting inside '
                    f"type table [...]."
                )


def _check_visuals(root: Path, report: Path, columns: set[str], problems: list[str]) -> None:
    """Every field a visual asks for should exist in the model."""
    for path in sorted(report.glob("definition/pages/*/visuals/*/visual.json")):
        try:
            visual = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            problems.append(f"{path.parent.name}/visual.json is not valid JSON: {e}")
            continue
        for match in re.finditer(r'"Property":\s*"(.+?)"', json.dumps(visual)):
            field = match.group(1)
            if field not in columns:
                problems.append(
                    f"a visual refers to {field!r}, which the model does not contain."
                )


def check(root: Path) -> list[str]:
    """Everything wrong with this project, in the order a person would want to fix it."""
    root = Path(root)
    problems: list[str] = []

    pbip = list(root.glob("*.pbip"))
    reports = [p for p in root.glob("*.Report") if p.is_dir()]
    models = [p for p in root.glob("*.SemanticModel") if p.is_dir()]
    if not pbip:
        problems.append("no .pbip file, so Power BI has nothing to open.")
    if not reports:
        problems.append("no .Report folder.")
    if not models:
        problems.append("no .SemanticModel folder.")
    if problems:
        return problems  # nothing further makes sense

    report, model = reports[0], models[0]

    for required in (report / "definition.pbir", model / "definition.pbism"):
        if not required.exists():
            problems.append(f"{required.name} is missing, and is required.")

    pbir = report / "definition.pbir"
    if pbir.exists():
        try:
            reference = json.loads(pbir.read_text(encoding="utf-8"))
            path = (
                reference.get("datasetReference", {}).get("byPath", {}).get("path", "")
            )
            if "\\" in path:
                problems.append(
                    f"definition.pbir points at {path!r}; byPath must use forward slashes."
                )
            # Relative to the .Report folder itself, which is where the file lives.
            elif path and not (report / path).resolve().exists():
                problems.append(f"definition.pbir points at {path!r}, which does not exist.")
        except json.JSONDecodeError as e:
            problems.append(f"definition.pbir is not valid JSON: {e}")

    database = model / "definition" / "database.tmdl"
    if database.exists() and not database.read_text(encoding="utf-8").lstrip().startswith(
        "database"
    ):
        problems.append(
            "database.tmdl must begin with a 'database' declaration; a bare property "
            "gives InvalidLineType."
        )

    model_file = model / "definition" / "model.tmdl"
    tables = sorted((model / "definition" / "tables").glob("*.tmdl"))
    if model_file.exists():
        text = model_file.read_text(encoding="utf-8")
        if "defaultPowerBIDataSourceVersion: powerBI_V3" not in text:
            problems.append(
                "model.tmdl is missing 'defaultPowerBIDataSourceVersion: powerBI_V3', "
                "which import-mode models require."
            )
        for table in tables:
            if f"ref table {table.stem}" not in text:
                problems.append(f"model.tmdl has no 'ref table {table.stem}'.")

    columns: set[str] = set()
    for table in tables:
        text = table.read_text(encoding="utf-8")
        _check_names(text, table, problems)
        _check_table(text, table, problems)
        columns |= {
            _name_of(m.group(1))
            for m in re.finditer(r"^\t(?:column|measure)\s+(.+?)\s*(?:=.*)?$", text, re.M)
        }

    _check_visuals(root, report, columns, problems)
    return problems


def require_valid(root: Path) -> None:
    """Refuse to hand over a project that will not open."""
    problems = check(root)
    if problems:
        raise ProjectError(
            "The Power BI file would not open correctly:\n  - "
            + "\n  - ".join(problems)
        )
