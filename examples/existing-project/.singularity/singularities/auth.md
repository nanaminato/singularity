# Authentication

All confirmations below belong to a fictional scenario, not an actual project.

## S-AUTH-001

Status: Confirmed

Statement: Linux authentication uses the operating system PAM stack.

Confirmation basis: Fictional human instruction in the [Auth adoption scenario](../../README.md).

## S-AUTH-002

Status: Confirmed

Statement: Authentication must not require this product to maintain a duplicate operating-system password database.

Confirmation basis: Fictional human instruction in the [Auth adoption scenario](../../README.md).

## S-PRIV-001

Status: Candidate

Statement: Authenticated administrators may execute privileged operations through the helper.

Evidence: [Boundary observation and service-account restriction](../evidence.md).

Question: Does the human intend to retain the service-account restriction, or explicitly permit administrator operations? What operations are intended?

This candidate is not confirmed by existing code or by the request to investigate the behavior.
