"""Bounded graph context, conservative impact and reference diagnostics."""

import hashlib
from pathlib import Path

from .model import RELATIONS, TREES, require


def traverse(model, start, depth=2, impact=False):
    nodes = {n["id"]: n for n in model["nodes"]}
    require(start in nodes, f"unknown node: {start}")
    require(type(depth) is int and 0 <= depth <= 100, "depth must be between 0 and 100")
    visited, frontier, reasons = {start}, {start}, []
    for _ in range(depth):
        following = set()
        for e in model["relations"]:
            direction = RELATIONS[e["type"]] if impact else "both"
            pairs = []
            if direction in ("forward", "both"):
                pairs.append((e["source"], e["target"]))
            if direction in ("reverse", "both"):
                pairs.append((e["target"], e["source"]))
            for source, target in pairs:
                if source in frontier and target not in visited:
                    following.add(target)
                    reasons.append({"from": source, "to": target, "relation": e["id"], "type": e["type"]})
        visited |= following
        frontier = following
        if not frontier:
            break
    selected = [nodes[i] for i in sorted(visited)]
    ref_ids = {r for n in selected for r in n.get("references", [])}
    return {"nodes": selected, "relations": [e for e in model["relations"] if e["source"] in visited and e["target"] in visited],
            "references": [r for r in model["references"] if r["id"] in ref_ids], "reasons": reasons,
            "depth": depth, "scope": "declared graph only; not proof of complete project coverage"}


def tree(model, view_id):
    view = next((v for v in model["views"] if v["id"] == view_id), None)
    require(view is not None, "view not found")
    children = {}
    for e in model["relations"]:
        if e["type"] == TREES[view["kind"]]:
            children.setdefault(e["source"], []).append(e["target"])
    rows, stack = [], [(i, None, 0) for i in reversed(view["roots"])]
    while stack:
        ident, parent, depth = stack.pop()
        rows.append({"id": ident, "parent": parent, "depth": depth})
        stack.extend((i, ident, depth + 1) for i in reversed(children.get(ident, [])))
    return {"view": view, "rows": rows}


def check_references(model, project, external=False):
    root = Path(project).resolve()
    results = []
    for ref in model["references"]:
        status = "unchecked"
        if ref["kind"] != "url" and (ref["kind"] == "project_file" or external):
            path = (root / ref["target"]).resolve() if ref["kind"] == "project_file" else Path(ref["target"])
            if ref["kind"] == "project_file" and not path.is_relative_to(root):
                status = "outside_project"
            elif not path.is_file():
                status = "missing"
            elif ref.get("digest"):
                try:
                    digest = hashlib.sha256(path.read_bytes()).hexdigest()
                    status = "matched" if digest == ref["digest"] else "changed"
                except OSError:
                    status = "unreadable"
            else:
                status = "exists"
        results.append({"id": ref["id"], "status": status,
                        "locator_checked": False, "revision_checked": False})
    return results


def gaps(model):
    linked = {e["target"] for e in model["relations"] if e["type"] == "verifies"}
    result = []
    for n in model["nodes"]:
        if n["type"] in ("requirement", "capability", "interface") and n["id"] not in linked:
            result.append({"id": n["id"], "gap": "no declared verification"})
        if n["type"] in ("assumption", "question", "conflict") and n["delivery"] != "abandoned":
            result.append({"id": n["id"], "gap": "open uncertainty; review body and evidence"})
        if n["verification"] == "stale":
            result.append({"id": n["id"], "gap": "requires re-verification"})
    return result
