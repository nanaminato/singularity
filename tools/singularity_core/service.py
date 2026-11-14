"""Shared transaction boundary for human and Agent clients."""

from copy import deepcopy

from .model import ModelError, keys, require, text, validate


def apply(model, operations, actor="AI", basis=None):
    validate(model)
    require(actor in ("Human", "AI"), "invalid actor")
    require(isinstance(operations, list) and bool(operations), "operations must be a non-empty array")
    result = deepcopy(model)
    for op in operations:
        keys(op, ("action", "collection"), ("value", "id"))
        collection = op["collection"]
        require(collection in ("nodes", "relations", "references", "views", "types"), "invalid collection")
        require(op["action"] in ("put", "delete"), "invalid operation")
        if collection == "types":
            require(text(op.get("id")), "type name required")
            if op["action"] == "put":
                require("value" in op, "put needs value")
                result[collection][op["id"]] = deepcopy(op["value"])
            else:
                require(op["id"] in result[collection], "type not found")
                del result[collection][op["id"]]
            continue
        value = deepcopy(op.get("value"))
        if op["action"] == "put":
            require(isinstance(value, dict) and "id" in value, "put requires a full object with ID")
            ident = value["id"]
            require("id" not in op or op["id"] == ident, "operation ID mismatch")
        else:
            ident = op.get("id")
        old = next((item for item in result[collection] if item["id"] == ident), None)
        if op["action"] == "delete":
            require(old is not None, "object not found")
        if collection == "nodes":
            protected = old is not None and old["authorization"] in ("confirmed", "retired")
            authorization = value.get("authorization") if isinstance(value, dict) else None
            changed_authority = authorization in ("confirmed", "retired", "rejected") and (
                old is None or old["authorization"] != authorization)
            if protected or changed_authority:
                require(actor == "Human" and text(basis), "protected intent requires Human actor and explicit basis")
            if value is not None:
                value["actor"] = actor
                if protected or changed_authority:
                    value["authorization_basis"] = basis
        if op["action"] == "delete":
            result[collection].remove(old)
        elif old is None:
            result[collection].append(value)
        else:
            # The position of a relation determines its sibling order in trees.
            result[collection][result[collection].index(old)] = value
    # Validate the entire batch, so endpoint deletion/replacement can be transactional.
    return validate(result)
