# Architecture Decision Records

Append-only log of load-bearing decisions for threat-trace. Each ADR captures a single decision: the context it was made in, what was chosen, what was traded away, and what alternatives were considered. Future contributors should read these before changing the corresponding code path.

| # | Decision | Status |
|---|----------|--------|
| [001](001-path-c-open-framework-hosted-reference.md) | Path C — open framework + hosted reference (over closed SaaS) | Accepted |
| [002](002-byok-only-no-auth-no-proxy.md) | BYOK-only — no auth, no proxy, no billing for the hosted reference | Accepted |
| [003](003-stage-3-runners-ref-based.md) | Stage 3 runners read from refs, not memo closures | Accepted |
| [004](004-depth-first-sequential-orchestration.md) | Depth-first sequential orchestration over parallel-within-stages | Accepted |
| [005](005-collapse-ux-with-delay.md) | Steps 1–3 auto-collapse with 1.5s delay; Step 4 nested in same card | Accepted |

## Conventions

- One file per decision, named `NNN-kebab-title.md`. Numbers monotonic, never reused.
- Status: **Proposed**, **Accepted**, **Superseded by NNN**, **Deprecated**.
- Don't edit Accepted ADRs — append a new ADR that supersedes the old one. The history is the point.
- Keep each ADR under ~400 words. If you need more, you're documenting design, not a decision.
