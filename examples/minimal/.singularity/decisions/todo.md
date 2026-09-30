# Todo Decisions

These Active decisions are illustrative, not implemented or tested.

## D-TODO-001

Status: Active

Derived from: [S-TODO-003, S-TODO-004](../singularities/todo.md).

Decision: Enforce role checks at the service write boundary; reject Observer create, modify, and delete operations. UI reflects the same allowed actions.

Reason: Intent must hold for direct requests as well as UI actions.

Verification: Pending real implementation. Test each action for Owner and Observer, including direct requests.

## D-TODO-002

Status: Active

Derived from: [S-TODO-005, S-TODO-006](../singularities/todo.md).

Decision: Persist saved data durably; preserve unsent editing state locally across temporary disconnection. Choose storage and synchronization details from actual project evidence.

Reason: Durable saved data and transient editing state have separate lifetimes.

Verification: Pending real implementation. Save then restart the server; disconnect while editing and restore connectivity without losing the draft.

## Round 2 impact (not yet applied)

The [scenario change](../../README.md) invalidates D-TODO-001's blanket rejection of creation.
Retain it as Superseded and add a new Active decision that distinguishes create from update/delete.
Reevaluate authorization entry points, UI, action tests, and regressions; inspect persistence if creation affects it.
D-TODO-002 is not automatically invalidated, but its creation-related assumptions still need checking.
