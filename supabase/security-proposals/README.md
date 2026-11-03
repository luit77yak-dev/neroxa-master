# Security proposals — NOT DEPLOYABLE

These SQL files are candidate fixes for the 2026-10-09 audit. They are **not** migrations and have not been run against production or a test database in this session.

- A01 removes direct client-role writes to orders, items and history; must verify the RPC path and role ACLs.
- A02 adds a composite order-to-instance/organization foreign key; requires compatibility and locking review.
- A05 adds AAL2 checks to the three known platform-member write policies; requires AAL1/AAL2 regression tests and a review of other permissive policies.

Do not execute these files remotely, merge this PR, or copy them into migrations without an isolated PostgreSQL replay and signed-off deployment plan. In particular, the audit found that the complete migration chain does not currently replay on an empty database (A07).
