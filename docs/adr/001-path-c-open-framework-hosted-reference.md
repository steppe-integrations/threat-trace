# ADR-001: Path C — open framework + hosted reference

## Status

Accepted (Sprint 1, 2026-05-01)

## Context

After the PM research synthesis (see [docs/strategy/](../strategy/README.md)), three paths were on the table for productizing threat-trace beyond a single-file SPA:

- **Path A — Hosted demo only.** A public URL of the existing single-file SPA. No new product, just better discoverability.
- **Path B — Hosted multi-tenant SaaS.** Auth, accounts, persistence, billing, the full product surface.
- **Path C — Open framework + hosted reference.** OSS framework (Mech Suit Methodology pattern: contracts-first, deterministic skeleton, model where it earns its keep) with a hosted reference deployment as proof.

The founder's stated leverage is "knowledge, connections, historic proof of being ahead of the curve." Path B requires the most capital and operational overhead, and competes directly with future Prophet/Dropzone-style agent vendors. Path A doesn't compound. Path C aligns with the leverage profile and creates an artifact that other domains (AML, radiology, claims) can fork.

## Decision

Path C. Public repo, hosted reference deployment, OSS framework with consulting/certification as the monetization wedge if/when needed.

## Consequences

- The repo stays public; no source-available licensing tricks.
- The hosted reference is BYOK (see [ADR-002](002-byok-only-no-auth-no-proxy.md)) — no auth, no billing, no operational pager.
- Future verticals (AML, radiology) will be implemented as forks of the framework, not features inside a SaaS.
- Defensibility moves from "we have the SaaS" to "we have the framework, the case studies, and the relationships." Weaker IP moat, stronger trust moat. Acceptable given the stated leverage.
- Acquirers shift: less interesting to a SaaS roll-up, more interesting to Big 4 / consultancies / certification bodies.

## Alternatives considered

- **Path B (closed SaaS)**: rejected — wrong fit for founder's leverage profile, competes head-on with agent vendors who have distribution.
- **Path A (hosted demo only)**: rejected — doesn't compound, no story for "what's next."
- **Source-available + paid hosted**: deferred — middle ground that might work later, but adds licensing complexity now without a revenue path to justify it.

## See also

- [docs/strategy/06-open-source-framework-angle.md](../strategy/06-open-source-framework-angle.md) for the full decision context.
- [ADR-002](002-byok-only-no-auth-no-proxy.md) for the BYOK consequence.
