# Auth Decisions

Example only; no implementation or tests have run.

## D-AUTH-001

Status: Active

Derived from: [S-AUTH-001, S-AUTH-002](../singularities/auth.md).

Decision: Delegate Linux credential verification through a PAM integration boundary instead of storing a duplicate password database.

Reason: Follows the two explicit fictional login constraints. Adapter structure, error handling and tests remain derived choices based on the real project.

Evidence: [E-AUTH-001](../evidence.md).

Verification: Pending real implementation and platform-specific tests.

## D-AUTH-002

Status: Proposed

Derived from: [S-PRIV-001](../singularities/auth.md) (Candidate).

Decision: Investigate action-specific helper authorization before proposing a permission change.

Reason: [C-AUTH-001](../conflicts/auth-privilege.md) exposes a restriction whose intended meaning is unresolved. The investigation may proceed; the permission change depends on the human choice.

Impact: Inspect the current Auth call, helper permission boundary and relevant tests. Do not scan unrelated modules or infer general administrator access.
