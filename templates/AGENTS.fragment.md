## Singularity Protocol

This repository partially uses Singularity-Driven Development.

Read `.singularity/README.md` before working in a managed area.
Read the configured protocol version only as needed for the current task.

Only explicitly human-confirmed singularities represent authoritative intent.
Never silently change their meaning. Existing code is evidence, not automatic intent.

Derive implementation choices. Discover candidates only for the current task,
a conflict, or an explicitly requested region. Never bulk-convert existing code.

Do not assume the entire project is modeled. Use minimum necessary context,
expand across boundaries only with a task-specific reason, expose conflicts,
and reevaluate affected decisions and artifacts when confirmed intent changes.

If this project uses TOML tool records, use the configured Singularity CLI
to list and retrieve records, find path context, and validate updates.
Use the impact command against the prior Git revision after changing intent.
Use the Human actor for confirmation, confirmed statement changes, and retirement only after an explicit human decision.
