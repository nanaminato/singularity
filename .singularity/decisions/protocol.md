# Protocol Decisions

## D-PROTOCOL-001

Status: Proposed

Derived from: [MS-001–MS-010](../singularities/) (Candidate).

Decision: Publish a Markdown-first draft with six concepts, grouped stable IDs, optional regions, a short project entry, and two illustrative examples.

Reason: The final source proposal calls for Protocol 0.1 before tooling or an Agent. Separating intent from derived documents makes later revision inexpensive.

Evidence: [Source and scope](../../docs/origin.md).

Anchors: [SPEC](../../SPEC.md), [adoption guide](../../docs/adoption.md), [project entry](../../templates/project/.singularity/README.md).

Verification: On 2026-09-30, local structural checks passed for 39 Markdown documents, ten unique meta IDs, six concepts, and an independently copied adoption scaffold. The [manual acceptance scenarios](../../docs/experiments.md) remain pending in real projects; no behavioral effectiveness is claimed.

Impact of meta changes: Reevaluate SPEC, lifecycle, relation semantics, Agent instructions, templates, examples, and adoption instructions. Source provenance should remain historical evidence.

## D-PROTOCOL-002

Status: Proposed

Derived from: [MS-003, MS-004](../singularities/) (Candidate).

Decision: Keep initial meta singularities as Candidate and mark the derived specification Draft. Label example confirmations as fictional.

Reason: A request to create a repository from a discussion authorizes this artifact, but does not provide explicit approval of every proposed axiom. The resulting draft remains concrete and reviewable.

## D-PROTOCOL-003

Status: Proposed

Derived from: [MS-003, MS-004, MS-007, MS-008, MS-010](../singularities/) (Candidate).

Decision: Use format 2 TOML for project and meta singularities. The CLI and Angular editor record the actor as Human or AI. Human decisions authorize confirmation, changes to confirmed statements, and retirement. Keep retired records as Retired or remove their files. Git retains committed history.

Anchors: [CLI and editor](../../tools/README.md), [Specification](../../SPEC.md).
