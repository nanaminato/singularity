"""Atomic project snapshots with optimistic revisions and a cooperating-writer lock."""

import hashlib
import json
import os
import tempfile
from pathlib import Path

from .model import ModelError, validate


def encode(model):
    return (json.dumps(model, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def revision(content):
    return hashlib.sha256(content).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ModelError(f"duplicate JSON field: {key}")
        result[key] = value
    return result


class Store:
    def __init__(self, project):
        self.project = Path(project).resolve()
        self.path = self.project / ".singularity" / "model.json"

    def read(self):
        try:
            content = self.path.read_bytes()
        except FileNotFoundError as error:
            raise ModelError("No format 3 model; run init or follow docs/migration.md") from error
        try:
            model = json.loads(content, object_pairs_hook=unique_object,
                               parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        except (ValueError, UnicodeError) as error:
            raise ModelError(f"Invalid model JSON: {error}") from error
        return validate(model), revision(content)

    def write(self, model, expected):
        validate(model)
        content = encode(model)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_symlink() or self.path.parent.is_symlink():
            raise ModelError("Refusing to write through a model or directory symlink")
        lock = self.path.with_suffix(".lock")
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as error:
            raise ModelError("Another writer holds model.lock; retry. Remove a stale lock only after checking the writer.") from error
        temporary = None
        try:
            with os.fdopen(descriptor, "w") as stream:
                stream.write(str(os.getpid()))
            current = self.path.read_bytes() if self.path.exists() else None
            if (revision(current) if current is not None else None) != expected:
                raise ModelError("Model changed; reload and review before retrying")
            with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix="model-", suffix=".tmp", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
            lock.unlink(missing_ok=True)
        return revision(content)
