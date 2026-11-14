"""Versioned graph semantics and declarative node schemas (standard library only)."""

import json
import re
from pathlib import PurePosixPath, PureWindowsPath
from urllib.parse import urlparse

VERSION = 3
ID = re.compile(r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\Z")
TYPES = {
    "goal": {}, "intent": {}, "constraint": {}, "non_goal": {},
    "capability": {}, "scenario": {}, "requirement": {},
    "acceptance": {"criterion": "string"}, "system": {}, "module": {},
    "interface": {"inputs": "array", "outputs": "array"},
    "data_contract": {"fields": "object"}, "workflow": {"steps": "array"},
    "state_machine": {"states": "array", "transitions": "array"},
    "decision": {"rationale": "string"}, "alternative": {}, "assumption": {},
    "question": {}, "task": {}, "artifact": {}, "test": {},
    "experiment": {"baseline": "string", "metrics": "array"},
    "evidence": {"observation": "string"}, "conflict": {"issue": "string"},
    "region": {},
}
# Direction is part of the public contract. Impact walks upstream -> downstream.
RELATIONS = {
    "contains": "forward", "decomposes": "forward", "plans": "forward",
    "depends_on": "reverse", "derived_from": "reverse", "constrains": "forward",
    "implements": "reverse", "verifies": "reverse", "supports": "forward",
    "conflicts_with": "both", "supersedes": "none", "references": "none",
}
TREES = {"composition": "contains", "objectives": "decomposes", "delivery": "plans"}
AUTH = {"candidate", "confirmed", "rejected", "retired", "not_applicable"}
DELIVERY = {"not_applicable", "planned", "in_progress", "implemented", "abandoned"}
VERIFICATION = {"unverified", "passed", "failed", "stale", "not_applicable"}
KINDS = {"string": str, "array": list, "object": dict, "number": (int, float), "boolean": bool}


class ModelError(ValueError):
    pass


def empty_model(name):
    return {"format": VERSION, "project": {"id": "PROJECT-ROOT", "name": name},
            "types": {}, "nodes": [], "relations": [], "references": [], "views": []}


def require(condition, message):
    if not condition:
        raise ModelError(message)


def text(value):
    return isinstance(value, str) and bool(value.strip())


def keys(obj, required, optional=()):
    require(isinstance(obj, dict), "expected an object")
    require(set(required) <= obj.keys(), f"missing fields: {set(required) - obj.keys()}")
    require(not obj.keys() - set(required) - set(optional),
            f"unknown fields: {obj.keys() - set(required) - set(optional)}")


def stable(value):
    require(isinstance(value, str) and ID.fullmatch(value), f"invalid ID: {value!r}")


def validate(model):
    try:
        json.dumps(model, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ModelError(f"model must contain finite JSON values: {error}") from error
    keys(model, ("format", "project", "types", "nodes", "relations", "references", "views"))
    require(type(model["format"]) is int and model["format"] == VERSION,
            "unsupported format; format 3 requires a fresh project model (see docs/migration.md)")
    keys(model["project"], ("id", "name"))
    stable(model["project"]["id"])
    require(text(model["project"]["name"]), "project name is required")
    require(isinstance(model["types"], dict), "types must be an object")
    schemas = dict(TYPES)
    for name, schema in model["types"].items():
        require(re.fullmatch(r"x_[a-z][a-z0-9_]*", name), "extension types must start with x_")
        keys(schema, ("description", "required", "optional"))
        require(text(schema["description"]), "type description is required")
        for group in ("required", "optional"):
            require(isinstance(schema[group], dict), "schema fields must be objects")
            require(all(text(k) and isinstance(v, str) and v in KINDS for k, v in schema[group].items()),
                    "unsupported attribute type")
        require(not schema["required"].keys() & schema["optional"].keys(), "overlapping schema fields")
        schemas[name] = schema["required"]
    ids = {model["project"]["id"]}
    for collection in ("nodes", "relations", "references", "views"):
        require(isinstance(model[collection], list), f"{collection} must be an array")
        for item in model[collection]:
            require(isinstance(item, dict), f"{collection} entries must be objects")
            stable(item.get("id"))
            require(item["id"] not in ids, f"duplicate ID: {item['id']}")
            ids.add(item["id"])
    nodes = {n["id"]: n for n in model["nodes"]}
    refs = {r["id"] for r in model["references"]}
    for n in nodes.values():
        keys(n, ("id", "type", "title", "body", "actor", "authorization", "delivery", "verification", "attributes"),
             ("references", "authorization_basis", "verification_basis"))
        require(isinstance(n["type"], str) and n["type"] in schemas, f"unknown node type: {n['type']}")
        require(text(n["title"]) and text(n["body"]), f"{n['id']}: title/body required")
        require(n["actor"] in ("Human", "AI"), "invalid actor")
        for field, choices in (("authorization", AUTH), ("delivery", DELIVERY), ("verification", VERIFICATION)):
            require(isinstance(n[field], str) and n[field] in choices, f"invalid {field}")
        if n["type"] in ("intent", "constraint", "non_goal"):
            require(n["authorization"] != "not_applicable", "intent requires an authorization state")
        if n["authorization"] in ("confirmed", "rejected", "retired"):
            require(text(n.get("authorization_basis")), "authorization requires an explicit basis")
        attached = n.get("references", [])
        require(isinstance(attached, list) and all(isinstance(r, str) and r in refs for r in attached),
                f"{n['id']}: dangling reference")
        if n["verification"] in ("passed", "failed"):
            basis = n.get("verification_basis")
            require(isinstance(basis, list) and bool(basis) and
                    all(isinstance(i, str) and i in nodes and nodes[i].get("type") == "evidence" for i in basis),
                    "verification requires evidence node IDs")
        required = schemas[n["type"]]
        optional = model["types"].get(n["type"], {}).get("optional", {})
        attrs = n["attributes"]
        keys(attrs, required, optional)
        for field, value in attrs.items():
            kind = (required | optional)[field]
            require(isinstance(value, KINDS[kind]) and not (kind == "number" and isinstance(value, bool)),
                    f"{n['id']}.{field}: expected {kind}")
            if kind == "string":
                require(text(value), f"{n['id']}.{field}: empty text")
    for r in model["references"]:
        keys(r, ("id", "kind", "target", "purpose", "tracking"), ("locator", "revision", "digest"))
        require(r["kind"] in ("project_file", "external_file", "url"), "invalid reference kind")
        require(text(r["target"]) and text(r["purpose"]), "reference target/purpose required")
        require(r["tracking"] in ("live", "pinned"), "invalid tracking mode")
        for field in ("locator", "revision", "digest"):
            if field in r:
                require(text(r[field]), f"invalid reference {field}")
        if "digest" in r:
            require(re.fullmatch(r"[0-9a-f]{64}", r["digest"]), "digest must be lowercase SHA-256")
        if r["kind"] == "project_file":
            p = PurePosixPath(r["target"])
            require(not p.is_absolute() and ".." not in p.parts and "\\" not in r["target"]
                    and ":" not in r["target"] and p.parts, "project_file must be project-relative")
        elif r["kind"] == "external_file":
            require(PurePosixPath(r["target"]).is_absolute() or PureWindowsPath(r["target"]).is_absolute(),
                    "external_file must be absolute")
        else:
            parsed = urlparse(r["target"])
            require(parsed.scheme in ("https", "http") and bool(parsed.netloc), "invalid HTTP(S) URL")
        if r["tracking"] == "pinned":
            require(text(r.get("revision")) or text(r.get("digest")), "pinned reference needs revision or digest")
    edges = set()
    for e in model["relations"]:
        keys(e, ("id", "type", "source", "target"), ("rationale",))
        require(isinstance(e["type"], str) and e["type"] in RELATIONS, "unknown relation type")
        require(isinstance(e["source"], str) and isinstance(e["target"], str)
                and e["source"] in nodes and e["target"] in nodes, "dangling relation endpoint")
        require(e["source"] != e["target"], "self relation is not allowed")
        edge = (e["type"], e["source"], e["target"])
        require(edge not in edges, "duplicate relation")
        edges.add(edge)
        if e["type"] == "verifies":
            require(nodes[e["source"]]["type"] in ("test", "experiment", "acceptance"),
                    "verifies source must be test, experiment or acceptance")
        if e["type"] == "supports":
            require(nodes[e["source"]]["type"] == "evidence", "supports source must be evidence")
    for relation in TREES.values():
        parents, children = {}, {}
        for e in model["relations"]:
            if e["type"] == relation:
                require(e["target"] not in parents, f"{relation}: multiple parents")
                parents[e["target"]] = e["source"]
                children.setdefault(e["source"], []).append(e["target"])
        # Iterative cycle check permits large trees without recursion limits.
        for start in parents:
            seen, current = set(), start
            while current in parents:
                require(current not in seen, f"{relation}: cycle")
                seen.add(current)
                current = parents[current]
    for v in model["views"]:
        keys(v, ("id", "title", "kind", "roots"))
        require(text(v["title"]) and isinstance(v["kind"], str) and v["kind"] in TREES, "invalid tree view")
        require(isinstance(v["roots"], list) and bool(v["roots"]) and
                all(isinstance(i, str) and i in nodes for i in v["roots"]), "invalid view roots")
        require(len(v["roots"]) == len(set(v["roots"])), "duplicate view roots")
        parents = {e["target"]: e["source"] for e in model["relations"] if e["type"] == TREES[v["kind"]]}
        for root in v["roots"]:
            current = root
            while current in parents:
                current = parents[current]
                require(current not in v["roots"], "view roots must not overlap")
    return model
