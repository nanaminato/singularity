"""Small read-only projections for agents. The format 3 store is unchanged."""
import json
import unicodedata
from collections import defaultdict, deque

from .model import RELATIONS, TYPES, require

SUMMARY_KEYS = ("id", "type", "title", "authorization", "delivery", "verification")
CRITICAL_TYPES = {"constraint", "non_goal", "conflict", "decision", "evidence", "assumption", "question"}
DEFAULT_NODES = 16
DEFAULT_BYTES = 8192


def wire(result):
    """Serialize exactly as the compact CLI commands emit, including the LF."""
    return (json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def summary(node):
    return {key: node[key] for key in SUMMARY_KEYS}


def normalized(value):
    return unicodedata.normalize("NFKC", value).casefold()


def find(model, query, node_types=(), limit=12):
    """Match every whitespace-delimited term; prefer exact ID and title hits."""
    require(type(limit) is int and 1 <= limit <= 100, "find limit must be 1–100")
    query = " ".join(normalized(query).split())
    require(query, "search text is required")
    terms = query.split()
    nodes = model["nodes"]
    if node_types:
        require(set(node_types) <= TYPES.keys() | model["types"].keys(),
                "unknown node type in find")
    refs = {ref["id"]: ref for ref in model["references"]}
    matches = []
    for node in nodes:
        if node_types and node["type"] not in node_types:
            continue
        ident, title = map(normalized, (node["id"], node["title"]))
        attached = [refs[r] for r in node.get("references", [])]
        fields = [node["body"]] + [r[key] for r in attached for key in ("target", "purpose")]
        head = ident + " " + title
        search = head + " " + " ".join(normalized(f) for f in fields)
        if all(t in search for t in terms):
            rank = (ident != query, title != query, -sum(t in head for t in terms), ident)
            matches.append((rank, summary(node)))
    matches.sort(key=lambda row: row[0])
    return {"matches": [item for _, item in matches[:limit]], "total": len(matches),
            "truncated": len(matches) > limit}


def bounded_context(model, start, depth=2, *, relations=(), summary_only=False,
                    max_nodes=DEFAULT_NODES, max_bytes=DEFAULT_BYTES, revision=None):
    """Select from the depth-bounded declared graph and its direct evidence links."""
    nodes = {n["id"]: n for n in model["nodes"]}
    require(start in nodes, f"unknown node: {start}")
    require(type(depth) is int and 0 <= depth <= 100, "depth must be between 0 and 100")
    require(type(max_nodes) is int and 1 <= max_nodes <= 250, "max nodes must be 1–250")
    require(type(max_bytes) is int and 1024 <= max_bytes <= 1_000_000,
            "max bytes must be 1024–1000000")
    selected_relations = set(relations)
    require(selected_relations <= RELATIONS.keys(), "unknown relation in context")

    adjacent = defaultdict(list)
    for edge in model["relations"]:
        if not selected_relations or edge["type"] in selected_relations:
            adjacent[edge["source"]].append((edge["target"], edge))
            adjacent[edge["target"]].append((edge["source"], edge))

    distance, via, waiting = {start: 0}, {}, deque([start])
    while waiting:
        current = waiting.popleft()
        if distance[current] >= depth:
            continue
        for neighbor, edge in sorted(adjacent[current], key=lambda pair: (pair[0], pair[1]["id"])):
            if neighbor not in distance:
                distance[neighbor] = distance[current] + 1
                via[neighbor] = {k: edge[k] for k in ("id", "type", "source", "target")}
                waiting.append(neighbor)

    graph_count = len(distance)
    # verification_basis is a node field, not a relation edge. Include direct
    # evidence from this neighborhood even at depth 0 or with an edge filter.
    for ident in sorted(distance, key=lambda i: (distance[i], i)):
        for evidence in nodes[ident].get("verification_basis", []):
            if evidence in nodes and evidence not in distance:
                distance[evidence] = distance[ident] + 1
                via[evidence] = {"type": "verification_basis", "source": ident, "target": evidence}

    critical = {i for i in distance if nodes[i]["type"] in CRITICAL_TYPES
                or nodes[i]["authorization"] == "confirmed" or nodes[i].get("authorization_basis")
                or nodes[i]["verification"] in {"failed", "stale"}}
    order = sorted(distance, key=lambda i: (i != start, i not in critical, distance[i], i))
    included, rows = set(), []
    result = {"root": start, "revision": revision, "depth": depth, "relation_filter": sorted(selected_relations),
              "mode": "summary" if summary_only else "full_nodes",
              "scope": "Declared graph plus direct verification basis; via is one discovery link, not all relations.",
              "graph_nodes": graph_count, "eligible_nodes": len(order), "nodes": rows}

    def describe_omissions():
        missing_critical = [i for i in order if i in critical and i not in included]
        examples = []
        # Keep omission metadata bounded even when IDs or the graph are large.
        for ident in missing_critical[:8]:
            if len(ident) <= 64:
                examples.append({"id": ident, "type": nodes[ident]["type"]})
        result["omissions"] = {
            "root_missing": start not in included,
            "nodes": len(order) - len(included),
            "critical": len(missing_critical), "critical_examples": examples,
            "unlisted_critical": len(missing_critical) - len(examples),
        }
        # A long valid root ID may make even the header exceed the budget.
        while examples and len(wire(result)) > max_bytes:
            examples.pop()
            result["omissions"]["unlisted_critical"] += 1

    for ident in order:
        if len(rows) == max_nodes:
            break
        node = nodes[ident]
        if summary_only:
            projected = summary(node)
            for key in ("references", "verification_basis"):
                if node.get(key):
                    projected[key] = node[key]
            if node.get("authorization_basis"):
                projected["has_authorization_basis"] = True
        else:
            projected = node
        if ident in via:
            projected = projected | {"via": via[ident]}
        rows.append(projected)
        included.add(ident)
        describe_omissions()
        if len(wire(result)) > max_bytes:
            rows.pop()
            included.remove(ident)

    describe_omissions()
    require(len(wire(result)) <= max_bytes, "context metadata exceeds budget; use get or raise --max-bytes")
    return result
