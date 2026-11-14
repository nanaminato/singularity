"""Local browser editor for a single singularity record directory."""

import json
import re
import secrets
import sys
import tomllib
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlsplit

from singularity import ID_PATTERN, edit_record, load_records, record_history, record_revision, working_sources


def load_node_names(directory):
    path = directory.parent / "node-names.toml"
    try:
        with path.open("rb") as source:
            names = tomllib.load(source)
    except FileNotFoundError:
        return {}
    except ValueError as error:
        raise ValueError(f"{path.name}: {error}") from error
    if any(not ID_PATTERN.fullmatch(key) or not isinstance(name, str) or not name.strip()
           or name.splitlines() != [name] for key, name in names.items()):
        raise ValueError(f"{path.name}: expected non-empty single-line names keyed by stable ID")
    return {key: name.strip() for key, name in names.items()}


def serve_editor(directory, port, *, open_browser=False, on_ready=None):
    assets = Path(__file__).with_name("editor")
    page = assets / "index.html"
    token = secrets.token_urlsafe(32)
    edit_lock = Lock()

    class Editor(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            if sys.stderr is not None:
                super().log_message(format, *args)

        def send_content(self, status, content, content_type):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'")
            self.end_headers()
            self.wfile.write(content)

        def send_json(self, status, body):
            self.send_content(status, json.dumps(body).encode("ascii"), "application/json")

        def do_GET(self):
            if self.headers.get("Host") != host:
                self.send_json(403, {"error": "Invalid host"})
            elif self.path == "/":
                self.send_content(200, page.read_bytes(), "text/html; charset=utf-8")
            elif self.path == "/api/records":
                try:
                    records, _, errors = load_records(working_sources(directory, allow_empty=True))
                    if errors:
                        raise ValueError("\n".join(errors))
                    names = load_node_names(directory)
                except (OSError, ValueError) as error:
                    self.send_json(400, {"error": str(error)})
                    return
                self.send_json(200, {
                    "token": token,
                    "nodeNames": names,
                    "records": [
                        {"record": record, "revision": record_revision(record)}
                        for _, record in sorted(records.items())
                    ],
                })
            elif urlsplit(self.path).path == "/api/history":
                record_id = parse_qs(urlsplit(self.path).query).get("id", [""])[0]
                try:
                    self.send_json(200, record_history(directory, record_id))
                except (OSError, ValueError) as error:
                    self.send_json(400, {"error": str(error)})
            elif re.fullmatch(r"/[A-Za-z0-9_-]+\.(?:js|css)", self.path):
                asset = assets / self.path[1:]
                if asset.is_file():
                    content_type = "text/javascript" if asset.suffix == ".js" else "text/css"
                    self.send_content(200, asset.read_bytes(), content_type)
                else:
                    self.send_json(404, {"error": "Not found"})
            else:
                self.send_json(404, {"error": "Not found"})

        def do_POST(self):
            if self.path != "/api/edit":
                self.send_json(404, {"error": "Not found"})
                return
            if (
                self.headers.get("Host") != host
                or self.headers.get("Origin") != url
                or self.headers.get("X-Editor-Token") != token
            ):
                self.send_json(403, {"error": "Invalid editor request"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 256_000:
                    raise ValueError("Invalid request size")
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError("Expected a JSON object")
                action = body.get("action")
                required = {
                    "create": {"id", "statement"},
                    "links": {"id", "revision"},
                    "update": {"id", "revision", "statement"},
                    "confirm": {"id", "revision"},
                    "reject": {"id", "revision", "disposition"},
                    "retire": {"id", "revision"},
                    "remove": {"id", "revision"},
                }
                if not isinstance(action, str) or action not in required or any(
                    not isinstance(body.get(key), str) or not body[key].strip()
                    for key in required[action]
                ):
                    raise ValueError("Missing or invalid edit fields")
                with edit_lock:
                    changed = edit_record(
                        directory, body["id"], "retire" if action == "remove" else action,
                        statement=body.get("statement"), actor="Human", remove=action == "remove",
                        expected=body.get("revision"),
                        disposition=body.get("disposition"),
                        paths=body.get("paths") if action in ("create", "links") else None,
                        decisions=body.get("decisions") if action in ("create", "links") else None,
                    )
            except (OSError, ValueError) as error:
                self.send_json(400, {"error": str(error)})
                return
            self.send_json(200, {"changed": changed})

    with ThreadingHTTPServer(("127.0.0.1", port), Editor) as server:
        host = f"127.0.0.1:{server.server_port}"
        url = f"http://{host}"
        if on_ready:
            on_ready(f"{url}/")
        else:
            print(f"{url}/", flush=True)
        if open_browser:
            webbrowser.open(f"{url}/")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
