# ADR-003: Stage 3 runners read from refs, not memo closures

## Status

Accepted (Sprint 1, 2026-05-01) · Supersedes the earlier "Stage 3 staged for next iteration" rationale in HANDOFF.md.

## Context

Stage 3 (per-stream summary → cross-stream trend → ranked actions) was implemented end-to-end in an earlier iteration, then rolled out of the user surface after async-coordination bugs surfaced. The original `runSummary`, `runTrend`, `runAction` runners depended on closure values from `useInvestigation`'s memos:

```typescript
const runSummary = useCallback(async (source: Source) => {
  const hintComp = computations[source];   // ← stale closure
  // ... build prompt from hintComp.hints ...
}, [computations]);
```

When the orchestrator chained calls — `await runStream(); await runSummary();` — the second call's `runSummary` closure was captured at the *render before runStream dispatched its result*. It saw an empty `computations[source]` and dispatched a "hint stage hasn't run yet" error, even though the dispatch had landed.

This is the textbook stale-closure problem. The previous fix was avoidance: don't chain runners; require the user to click each Run button manually so each click occurs in a fresh render.

## Decision

Refactor `runSummary`, `runTrend`, `runAction` to read directly from refs (`stateRef.current`, `streamsRef.current`) and parse their upstream artifacts inline (using `parseHintResponse` + `composeHints` for hints, etc.) instead of consuming the `computations` / `summaryComputations` memos.

This makes each runner a pure function of `stateRef.current` + `streamsRef.current` at invocation time. No closure deps. The `useCallback` array becomes `[]` for all four Stage 3 runners. The orchestrator `runFullInvestigation` can then chain them safely.

## Consequences

- The closure-safety invariant is now structural: each runner reads through refs, not closures, so adding a new orchestrator (or chaining in unforeseen ways) cannot reintroduce the stale-closure bug.
- A few extra lines per runner — they parse upstream artifacts inline rather than consuming the memo. Acceptable trade for closure-safety.
- The `computations` / `summaryComputations` memos remain for the *render path* (UI components consume them); only the runner path bypasses them.
- React 18 batched state updates + `await new Promise(r => setTimeout(r, 0))` between orchestrator stages ensures `stateRef.current` reflects the prior dispatch by the time the next runner reads it.

## Alternatives considered

- **Keep the manual-button workaround**: rejected — degrades the demo flow. Sprint 1's whole point is one-click "Run investigation."
- **Move computations into refs (mutable mirror of memo)**: rejected — adds a parallel state shape to maintain in sync. Inline parsing is clearer.
- **Use a state machine library (xstate)**: rejected — too much new dependency for a 4-stage pipeline.

## See also

- [src/state/store.ts](../../src/state/store.ts) — the refactored runners, with `// closure-safety` comments at each.
- [ADR-004](004-depth-first-sequential-orchestration.md) — the orchestrator that this refactor enables.
