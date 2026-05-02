# ADR-004: Depth-first sequential orchestration

## Status

Accepted (Sprint 1, 2026-05-01) · Supersedes the brief parallel-within-stages design.

## Context

The "Run investigation" button in the HeaderBar orchestrates the full pipeline: hint per stream × 3 → summary per stream × 3 → trend → action. Two natural orderings:

- **Parallel within stages** (initial implementation): `Promise.all` on the three hints, then `Promise.all` on the three summaries, then trend, then action. Total wall ~10–12s.
- **Depth-first sequential** (this ADR): for each stream in order, run hint then summary; then trend; then action. Total wall ~20–25s.

User testing of the parallel version revealed two real problems:

1. **Visual confusion.** Three things lighting up simultaneously read as "did I just see three races?" — even though there was no actual race.
2. **No demo cadence.** The parallel version blasts through in 12 seconds with the user unable to follow which stream is doing what. Synthesis appears at the end as a wall of output.

The hosted reference's job is **demonstration of agent reasoning**, not minimum latency. A clean per-stream cadence — Edge fully completes before Identity starts, including summary — makes the demo readable and trustworthy.

## Decision

Depth-first sequential. The `runFullInvestigation` orchestrator runs each stream's hint AND summary fully before moving to the next stream:

```
for source in [edge, identity, api]:
    await runStream(source)            # hint
    await runSummary(source)           # per-stream summary
await runTrend()                       # cross-stream
await runAction()                      # ranked recommendations
```

Per-stream `SummaryPanel` visibility flips to true the moment THAT stream's hint parses (not waiting for all three), so the summary panel appears in the same card as its hint output and immediately shows a "Working…" indicator.

## Consequences

- Total wall time roughly doubles (12s → 20–25s). Acceptable: the demo reads as a clear sequence.
- API calls are sequential, never racing. No backpressure concerns. Gentler on rate limits.
- One stream's hint failing doesn't poison the others — the orchestrator skips that stream's summary and continues. Cross-stream trend still requires all three summaries; if any are missing, the trend stage bails (correctly — partial input would skew the correlation).
- Per-stream visibility means each `SummaryPanel` mounts independently when its hint lands. Combined with depth-first, this produces a clean cinematic flow: card lights up, expectation passes, summary panel appears with "Working…", narrative fills in, card collapses, next card starts.

## Alternatives considered

- **Parallel within stages**: rejected — see Context. Faster but worse demo.
- **Breadth-first sequential** (all hints, then all summaries): rejected — the synthesis appears too late; user loses the per-stream narrative.
- **Streaming responses**: deferred — Anthropic's streaming API would let summaries appear token-by-token. Real demo improvement but more complex; revisit when the basic flow proves tight.

## See also

- [src/state/store.ts:runFullInvestigation](../../src/state/store.ts) — the orchestrator implementation.
- [ADR-003](003-stage-3-runners-ref-based.md) — the closure-safety refactor that this orchestration depends on.
- [docs/retro/sprint-1.md](../retro/sprint-1.md) — what we learned during the parallel→sequential pivot.
