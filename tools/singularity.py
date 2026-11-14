"""CLI for the proposed TOML singularity format."""

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path


ID_PATTERN = re.compile(r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+")
STATUSES = ("Candidate", "Confirmed", "Rejected", "Retired")
FIELDS = {"id", "status", "statement", "reason", "actor", "rejection_reason"}
DISPOSITIONS = {
    "reject": ("Candidate", "Rejected", "rejection_reason"),
    "retire": ("Confirmed", "Retired", None),
}
PATH_FIELD = "paths"
DECISION_FIELD = "decisions"
FORMAT_VERSION = 2
LEGACY_FIELDS = {"confirmation", "retirement_basis"}


def is_project_path(value):
    return (
        isinstance(value, str)
        and not any(char in value for char in '\\:*?[]"<>|')
        and all(
            part.strip() and part not in (".", "..")
            and not any(ord(char) < 32 for char in part)
            for part in value.split("/")
        )
    )


def validate_record(record):
    version = record.get("format", 1)
    fields = FIELDS | LEGACY_FIELDS if version == 1 else FIELDS
    for field in sorted(record.keys() - fields - {PATH_FIELD, DECISION_FIELD, "format"}):
        yield f"unknown field {field!r}"
    if type(version) is not int or version not in (1, FORMAT_VERSION):
        yield "format must be the integer 1 or 2"

    required = {"id", "status", "statement"}
    if version == FORMAT_VERSION:
        required.add("actor")
    if record.get("status") == "Rejected":
        required.add("rejection_reason")
    for field in sorted(required | (record.keys() & fields)):
        value = record.get(field)
        if not isinstance(value, str) or not value.strip():
            yield f"{field} must be a non-empty string"
        elif field == "actor" and value not in ("Human", "AI"):
            yield "actor must be Human or AI"
        elif field == "id" and not ID_PATTERN.fullmatch(value):
            yield "id must contain uppercase segments separated by hyphens"
        elif field == "status" and value not in STATUSES:
            yield f"status must be one of {', '.join(STATUSES)}"

    if PATH_FIELD in record:
        paths = record[PATH_FIELD]
        if not isinstance(paths, list) or not all(
            isinstance(path, str) and is_project_path(path.removesuffix("/"))
            for path in paths
        ):
            yield "paths must be an array of project-relative paths using '/'"

    if DECISION_FIELD in record:
        decisions = record[DECISION_FIELD]
        if not isinstance(decisions, list) or not all(
            isinstance(decision, str) and ID_PATTERN.fullmatch(decision)
            for decision in decisions
        ):
            yield "decisions must be an array of stable decision IDs"


def matches_path(path, anchor):
    if anchor.endswith("/"):
        return path.startswith(anchor)
    return path == anchor


def load_records(sources):
    records = {}
    locations = {}
    errors = []
    for path, read in sources:
        try:
            record = tomllib.loads(read().decode("utf-8"))
        except (OSError, UnicodeError, ValueError) as error:
            errors.append(f"{path}: {error}")
            continue

        errors.extend(f"{path}: {error}" for error in validate_record(record))
        record_id = record.get("id")
        if isinstance(record_id, str) and ID_PATTERN.fullmatch(record_id):
            if record_id in locations:
                errors.append(f"{path}: duplicate ID {record_id} (also in {locations[record_id]})")
            else:
                records[record_id] = record
                locations[record_id] = path

    return records, locations, errors


def working_sources(directory, allow_empty=False):
    try:
        files = sorted(path for path in directory.iterdir() if path.suffix == ".toml")
    except FileNotFoundError:
        if allow_empty:
            return []
        raise
    if not files and not allow_empty:
        raise ValueError(f"{directory}: no .toml records found")
    return [(path, path.read_bytes) for path in files]


def git(directory, *args):
    result = subprocess.run(["git", "-C", str(directory), *args], capture_output=True)
    if result.returncode:
        raise ValueError(result.stderr.decode("utf-8", errors="replace").strip())
    return result.stdout


def repository_scope(directory):
    directory = directory.resolve()
    ancestor = next(path for path in (directory, *directory.parents) if path.is_dir())
    root = Path(git(ancestor, "rev-parse", "--show-toplevel").decode("utf-8").rstrip("\r\n")).resolve()
    if not directory.is_relative_to(root):
        raise ValueError(f"{directory}: record directory must be inside {root}")
    return root, directory.relative_to(root)


def base_sources(directory, base):
    root, relative = repository_scope(directory)
    commit = git(root, "rev-parse", "--verify", "--end-of-options", f"{base}^{{commit}}").decode("ascii").strip()
    return committed_sources(root, relative, commit)


def committed_sources(root, relative, commit):
    scope = [] if relative == Path(".") else [relative.as_posix()]
    entries = git(root, "--literal-pathspecs", "ls-tree", "-rz", "--name-only", commit, "--", *scope)
    sources = []
    for entry in entries.decode("utf-8").split("\0"):
        path = Path(entry)
        if path.parent == relative and path.suffix == ".toml":
            object_name = f"{commit}:{entry}"
            sources.append((object_name, lambda name=object_name: git(root, "show", name)))
    return sources


def record_history(directory, record_id):
    if not ID_PATTERN.fullmatch(record_id):
        raise ValueError("Invalid stable record ID")
    root, relative = repository_scope(directory)
    if not git(root, "rev-list", "--all", "--max-count=1").strip():
        return []
    scope = [] if relative == Path(".") else [relative.as_posix()]
    log = git(root, "--literal-pathspecs", "log", "--first-parent", "--full-history",
              "--reverse", "-z", "--format=%H%x00%aI%x00%s", "HEAD", "--", *scope)
    metadata = log.decode("utf-8", errors="replace").rstrip("\0").split("\0") if log else []
    history = []
    previous, previous_path = {}, None
    for commit, date, subject in zip(metadata[::3], metadata[1::3], metadata[2::3]):
        records, locations, errors = load_records(committed_sources(root, relative, commit))
        if errors:
            raise ValueError("\n".join(errors))
        current = records.get(record_id, {})
        source = locations.get(record_id)
        path = source.split(":", 1)[1] if source else None
        changes = {
            key: {"before": previous.get(key), "after": current.get(key)}
            for key in sorted(previous.keys() | current.keys())
            if previous.get(key) != current.get(key)
        }
        if changes or previous_path != path:
            history.append({
                "commit": commit, "date": date, "subject": subject,
                "path_before": previous_path, "path_after": path, "changes": changes,
            })
        previous, previous_path = current, path
    return history


def impact_changes(before, after):
    for record_id in sorted(before.keys() | after.keys()):
        old = before.get(record_id, {})
        new = after.get(record_id, {})
        fields = sorted(key for key in old.keys() | new.keys() if old.get(key) != new.get(key))
        if not fields:
            continue
        yield {
            "id": record_id,
            "change": "modified" if old and new else ("added" if new else "removed"),
            "fields": fields,
            "decisions": sorted(set(old.get(DECISION_FIELD, [])) | set(new.get(DECISION_FIELD, []))),
            "paths": sorted(set(old.get(PATH_FIELD, [])) | set(new.get(PATH_FIELD, []))),
        }


def write_record(path, record, updated):
    # The schema contains only strings and arrays of strings. JSON string escapes
    # are TOML-compatible here once the literal DEL character is escaped.
    content = "".join(
        f"{key} = {json.dumps(value, ensure_ascii=False)}\n"
        for key, value in updated.items()
    ).replace("\x7f", r"\u007F")
    if tomllib.loads(content) != updated:
        raise ValueError(f"{path}: could not serialize updated record")

    if path.is_symlink():
        raise ValueError(f"{path}: cannot update a symbolic link")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content.encode("utf-8"))
        if record is None:
            if os.name == "nt":
                temporary.rename(path)
            else:
                os.link(temporary, path)
        else:
            temporary.chmod(stat.S_IMODE(path.stat().st_mode))
            if tomllib.loads(path.read_bytes().decode("utf-8")) != record:
                raise ValueError(f"{path}: record changed during update; retry with current contents")
            os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def edit_record(directory, record_id, action, *, statement=None, actor="AI",
                paths=None, decisions=None, expected=None, disposition=None, remove=False):
    records, locations, errors = load_records(working_sources(directory, allow_empty=action == "create"))
    if errors:
        raise ValueError("\n".join(errors))
    if action == "create":
        if record_id in records:
            raise ValueError(f"Record already exists: {record_id}")
        record = None
        updated = {"format": FORMAT_VERSION, "id": record_id, "status": "Candidate", "statement": statement}
        path = directory / f"{record_id}.toml"
    else:
        record, path = existing_record(records, locations, record_id, expected)
        updated = record.copy()
        if action == "confirm":
            if record["status"] != "Candidate":
                raise ValueError(f"{record_id}: confirm requires status Candidate")
            updated["status"] = "Confirmed"
        elif action in DISPOSITIONS:
            source, target, field = DISPOSITIONS[action]
            if record["status"] != source:
                raise ValueError(f"{record_id}: {action} requires status {source}")
            updated["status"] = target
            if field:
                updated[field] = disposition
        elif record["status"] in ("Rejected", "Retired"):
            raise ValueError(f"{record_id}: cannot edit a {record['status']} record")
        elif action == "update":
            updated["statement"] = statement
        if (action in ("confirm", "retire") or
                (action == "update" and record["status"] == "Confirmed")) and actor != "Human":
            raise ValueError("This operation requires a Human actor")
    if actor not in ("Human", "AI"):
        raise ValueError("actor must be Human or AI")
    if remove:
        if action != "retire":
            raise ValueError("Removal is only available when retiring a confirmed record")
        if path.is_symlink() or tomllib.loads(path.read_text(encoding="utf-8")) != record:
            raise ValueError(f"{path}: record changed or is a symbolic link")
        path.unlink()
        return True
    if updated == record and paths is None and decisions is None:
        return False
    updated.update(format=FORMAT_VERSION, actor=actor)
    for field in LEGACY_FIELDS:
        updated.pop(field, None)
    if paths is not None:
        updated[PATH_FIELD] = paths
    if decisions is not None:
        updated[DECISION_FIELD] = decisions
    problems = list(validate_record(updated))
    if problems:
        raise ValueError("\n".join(problems))
    if updated == record:
        return False
    if action == "create":
        directory.mkdir(parents=True, exist_ok=True)
    write_record(path, record, updated)
    return True


def existing_record(records, locations, record_id, expected):
    if record_id not in records:
        raise ValueError(f"Record not found: {record_id}")
    record = records[record_id]
    if expected is not None and expected != record_revision(record):
        raise ValueError("Record changed since it was opened. Reload and review the current version.")
    return record, locations[record_id]


def record_revision(record):
    content = json.dumps(record, sort_keys=True).encode("ascii")
    return hashlib.sha256(content).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--records",
        type=Path,
        default=Path(".singularity/singularities"),
        help="record directory (default: .singularity/singularities)",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate", help="check all records")
    commands.add_parser("list", help="print all records as JSON")
    serve = commands.add_parser("serve", help="open the local editor on a loopback port")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--open", action="store_true", help="open the default browser")
    history = commands.add_parser("history", help="show committed changes by stable ID")
    history.add_argument("id")
    get = commands.add_parser("get", help="print one record as JSON")
    get.add_argument("id", help="stable singularity ID")
    context = commands.add_parser("context", help="print records related to a file as JSON")
    context.add_argument("--path", required=True, help="project-relative file path")
    impact = commands.add_parser("impact", help="compare records with a Git commit")
    impact.add_argument("--base", required=True, help="base Git commit")
    update = commands.add_parser("update", help="change the statement of a record")
    update.add_argument("id", help="stable singularity ID")
    update.add_argument("--statement", required=True, help="replacement statement")
    confirm = commands.add_parser("confirm", help="confirm a Candidate record")
    confirm.add_argument("id", help="stable singularity ID")
    create = commands.add_parser("create", help="create a Candidate record")
    create.add_argument("id", help="new stable singularity ID")
    create.add_argument("--statement", required=True)
    links = commands.add_parser("links", help="replace a record's paths or decision references")
    links.add_argument("id", help="stable singularity ID")
    for command in (create, links):
        command.add_argument("--paths", nargs="*", metavar="PATH")
        command.add_argument("--decisions", nargs="*", metavar="ID")
    reject = commands.add_parser("reject", help="reject a Candidate and record why")
    reject.add_argument("id")
    reject.add_argument("--reason", dest="disposition", required=True)
    retire = commands.add_parser("retire", help="retire a Confirmed record with human evidence")
    retire.add_argument("id")
    retire.add_argument("--remove", action="store_true", help="delete the record file")
    for command in (create, update, links, confirm, reject, retire):
        command.add_argument("--actor", choices=("Human", "AI"), default="AI")
    args = parser.parse_args()

    if args.command == "serve":
        from singularity_web import serve_editor

        try:
            serve_editor(args.records.resolve(), args.port, open_browser=args.open)
        except (OSError, ValueError, OverflowError) as error:
            print(error, file=sys.stderr)
            return 1
        return 0

    if args.command == "history":
        try:
            print(json.dumps(record_history(args.records, args.id), indent=2))
        except (OSError, ValueError) as error:
            print(error, file=sys.stderr)
            return 1
        return 0

    if args.command in ("update", "confirm", "create", "links", *DISPOSITIONS):
        try:
            changed = edit_record(
                args.records, args.id, args.command,
                statement=getattr(args, "statement", None),
                actor=args.actor, remove=getattr(args, "remove", False),
                paths=getattr(args, "paths", None), decisions=getattr(args, "decisions", None),
                disposition=getattr(args, "disposition", None),
            )
        except (OSError, ValueError) as error:
            print(error, file=sys.stderr)
            return 1
        messages = {"confirm": "Confirmed", "create": "Created", "reject": "Rejected", "retire": "Retired"}
        result = messages.get(args.command, "Updated") if changed else "Unchanged"
        print(f"{result} {args.id}.")
        return 0

    if args.command == "context":
        query_path = args.path.replace("\\", "/")
        if not is_project_path(query_path):
            context.error("--path must be a project-relative file path")

    try:
        if args.command == "impact":
            before, _, base_errors = load_records(base_sources(args.records, args.base))
        records, _, errors = load_records(working_sources(args.records, allow_empty=args.command == "impact"))
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    if args.command == "impact":
        errors = base_errors + errors
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    if args.command == "impact":
        print(json.dumps(list(impact_changes(before, records)), indent=2))
        return 0
    if args.command == "validate":
        print(f"Validated {len(records)} record(s).")
        return 0
    if args.command == "list":
        print(json.dumps([records[key] for key in sorted(records)], indent=2))
        return 0
    if args.command == "context":
        matches = [
            record
            for _, record in sorted(records.items())
            if any(matches_path(query_path, anchor) for anchor in record.get(PATH_FIELD, []))
        ]
        print(json.dumps(matches, indent=2))
        return 0
    if args.id not in records:
        print(f"Record not found: {args.id}", file=sys.stderr)
        return 1

    print(json.dumps(records[args.id], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
