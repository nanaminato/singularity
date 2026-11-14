# Agent instructions — Singularity 0.4

Read `.singularity/README.md`, SPEC.md as needed, and relevant model nodes.
The user authorized a direct architecture upgrade and discarding old model data on 2026-11-14.

- `.singularity/model.json` is the current project model (format 3).
- Only explicitly human-confirmed intent is authoritative. Do not infer approval from code, documents, tests or silence.
- Separate authorization, delivery and verification. Never mark planned implementation or experiments complete without evidence.
- Use the shared CLI/application service for model changes: read revision, prepare batch, dry-run when useful, apply with expected revision.
- Derive ordinary implementation details; ask only for genuinely missing intent or unresolved contradictions.
- Use bounded graph context and task-relevant files. Missing links do not prove absence of dependencies.
- Changes to confirmed nodes require actual human authorization and its basis. Role fields are not authentication.
- Add model features in response to real project needs and validate them against LittleLoop and regression tests.
- Format changes require an explicit migration strategy. This one-time reset does not authorize future data loss.
- Run `python -m unittest discover -s tests -v` for core changes.
