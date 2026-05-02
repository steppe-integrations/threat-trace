# Sprint 1 retro — Stage 3 wiring + hosted reference

**Dates:** 2026-05-01 (single sitting)
**Goal:** Take threat-trace from "single-file SPA with Stages 1+2 working and Stage 3 staged" to "hosted reference deployment with the full pipeline live, BYOK, on a public URL."

## What shipped

- **Stage 3 fully wired** — per-stream summary → cross-stream trend → ranked action items, all visible in the UI, all gated correctly, all reachable in one click via the new "Run investigation" button.
- **`runFullInvestigation` orchestrator** — depth-first sequential through the pipeline ([ADR-004](../adr/004-depth-first-sequential-orchestration.md)).
- **Stage 3 runners refactored to be ref-based** — fixes the stale-closure bug that gated the original revival ([ADR-003](../adr/003-stage-3-runners-ref-based.md)).
- **React error #310 fix** — moved `useState`/`useCallback` before early-return null in `TrendSection`, `ActionSection`, and `TraceExplorer`. Pre-existing latent bug; surfaced once the components mounted for the first time.
- **Layout polish** — `SummaryPanel` nested inside `StreamCard` via a `children` slot ([ADR-005](../adr/005-collapse-ux-with-delay.md)); auto-collapse Steps 1–3 after a 1.5s delay with manual "Show details" override; gold visual hierarchy for section-level titles.
- **"Working…" banners** with pulsing dot animation in SummaryPanel, TrendSection, ActionSection during their respective Sonnet 4 calls.
- **Cloudflare Pages deploy** — first reference deployment live at `threat-trace.pages.dev`. Full guide at [docs/deploy/cloudflare-pages.md](../deploy/cloudflare-pages.md). Post-build script made tolerant of missing `package/` for CI.
- **README + DEV.md updated** for the new "what ships today" reality.
- **5 new ADRs** capturing the load-bearing decisions for future contributors.
- **11 PM strategy briefs** at [docs/strategy/](../strategy/README.md) — separate session-starter for the next phase of buyer/market research.

## What went well

- **Reading before writing.** The first 30 minutes of the session were pure exploration — reading `state/store.ts`, `lib/pipeline.ts`, the four agent files, and every Stage 3 component before touching any code. This is what made the subsequent ~90 minutes of edits feel surgical instead of speculative. The recon turned up the critical insight: Stage 3 was much more wired up than the recon agent's first-pass summary suggested. Components, runners, computations, persistence, export/import — all already present. The actual work was wiring, not building.
- **Mech Suit Methodology held.** The pipeline's contracts-first / deterministic skeleton / model-where-it-earns-its-keep design meant the new orchestrator was small. `runFullInvestigation` is ~50 lines of glue over runners that already worked. No new contracts, no new schemas, no new agents.
- **Honest tight feedback loops.** The user ran the build locally between every meaningful change and screenshot-tested. That caught both the React #310 hooks-order bug and the layout/UX issues that no amount of static review would have surfaced. Estimated 6–8 round trips total in the build phase.
- **PM research stayed alongside the build.** The strategy briefs in `docs/strategy/` were written in the prior chapter of this session and served as a reference for "why are we doing this at all" while the build was happening. Tactical and strategic work in the same workspace.

## What didn't go well

- **The async-coordination bug was misdiagnosed initially.** The recon agent (and my first read) treated "Stage 3 was rolled back due to async bugs" as a known-hard area to be cautious about. The actual bug was a **closure-safety violation** in the runners, which is a five-minute fix once seen. The bigger trap was the **React error #310** in TrendSection/ActionSection — `useState` then early return then `useCallback`, a Rules-of-Hooks violation that the components had carried since they were written but never tripped because they were never mounted. Both were structural bugs, not race conditions. The user's earlier mental model ("we just had to make each stage a manual button press") had been protective but obscured the actual fix.
- **The parallel-within-stages orchestration was wrong on first attempt.** ~12s wall time looked good on paper. In practice it read as chaos: three streams lighting up simultaneously, summary panels appearing all at once, "did I just see something race?" The depth-first sequential rewrite (ADR-004) fixed it but should have been the first attempt. Lesson: for *demo* pipelines, optimize for **cadence**, not **wall time**.
- **CSS hierarchy took two iterations.** First gilded the wrong layer (panel titles), then reversed to gild section titles. A 30-second screenshot review before each style edit would have saved the round trip.
- **Cloudflare Pages deploy hit two avoidable papercuts.** Wrangler's Node 22 requirement (the user had Node 20) and a stale `dist/` from the wrong directory. Both fixable but cost a couple of round trips. The deploy doc now flags both up front.

## Surprises

- **Stage 3 was 80% wired, 20% surfaced.** The recon agent's summary of "BUILT but STAGED" turned out to mean "compute + state + runners + components all present; just unimported in App.tsx." The wiring was a 6-line JSX change in App.tsx plus a closure-safety refactor — far smaller than expected.
- **Hooks bugs lurk in unmounted components.** TrendSection and ActionSection had carried the #310 trap since they were written. The previous "rollback Stage 3" decision had inadvertently shielded the bug. Anything in `src/components/` that's not actually mounted should be treated as untested code, not as "ready to wire up."
- **The `package/` mirror in `post-build.ts` was a hard failure on a clean checkout.** That script is for the founder's email-handoff workflow, but it was breaking CI/Cloudflare-style builds. Made tolerant of missing dirs without changing the email-handoff path.
- **The strategy work fed the build directly.** The PM research's audit-play angle (`docs/strategy/10-third-party-audit-market.md`) shaped the README's positioning ("rehearse what your AI security agent will do — before you deploy it") more than I expected. Build context flowed from strategic context.

## What we learned

- **For demo pipelines, sequential beats parallel** even when parallel is faster. Visible cadence > total wall time. Same lesson likely applies to any "show your work" UX where the AI's reasoning is the product.
- **Closure-safety in async React hooks needs a structural rule, not a comment.** `useCallback` deps that include memo values are a trap waiting for an orchestrator. The fix is "runners read from refs, never from closure-captured memos." This is now in [ADR-003](../adr/003-stage-3-runners-ref-based.md).
- **Latent bugs in unmounted components are real.** A component file that isn't imported by App.tsx is not "ready code." It's source code that hasn't been compiled into the React tree, never mind tested. Treat surfacing as a real change.
- **Visual hierarchy is one of the cheapest demo upgrades.** Choosing one accent color for section-level titles (gold) vs sub-section (muted) made the page legible at a glance. ~30 lines of CSS, dramatic improvement.

## What's next

Sprint 2 candidates, in rough priority order:

1. **TraceExplorer surfaced** — Track D in the README. Drill into any action item and walk it back through trends → summaries → hints → raw log lines. Highest "wow" per hour for the demo.
2. **Resolve the "Threat Tracer" naming collision** ([brief 08](../strategy/08-naming-and-ip.md)) before the public URL goes anywhere strangers can find it.
3. **AML port** ([brief 02](../strategy/02-aml-buyer-channel.md)) — first proof the pattern generalizes beyond security. Vendor parsers swap, system prompts swap, expectations swap; pipeline skeleton stays.
4. **First-client motion** ([brief 09](../strategy/09-first-client-playbook.md)) — warm-intro list, design-partner pitch, public launch artifact.
5. **Add Plausible analytics** so we can see who actually runs the demo and how far they get.
6. **Streaming responses** — Anthropic's streaming API would let summaries token-stream into the panel rather than appearing as a wall. Real demo improvement, more complex; revisit when basic flow has soaked.
