# DEV — developer guide

Dev-facing reference for threat-trace: how to build the web app, run
the CI scripts, ship a bundle (or fork the source), and extend the
pipeline through Stages 2 and 3.

> **Not the product surface.** The product is the web app. If you're
> walking Stage 1 to learn the loop, you don't read this — you visit
> [steppeintegrations.com/articles/threat-trace](https://steppeintegrations.com/articles/threat-trace)
> (or run the three commands at the top of [README.md](./README.md))
> and follow the web app. This file is for developers extending the
> pipeline.

> **Architectural context** lives in [HANDOFF.md](./HANDOFF.md):
> contracts, agent boundaries, decisions and pivots, and the full
> roadmap. Read that first if you're picking the project up cold.
>
> **Decision records** live in [docs/adr/](./docs/adr/README.md) —
> the load-bearing "why" for the choices that shaped the current
> codebase. Especially [ADR-003](./docs/adr/003-stage-3-runners-ref-based.md)
> (closure-safety in Stage 3 runners) and [ADR-004](./docs/adr/004-depth-first-sequential-orchestration.md)
> (depth-first sequential orchestration) before touching `runFullInvestigation`.
>
> **Sprint retros** at [docs/retro/](./docs/retro/) tell the story of
> what shipped, what surprised, and what's queued next.

---

## Repo layout

```
contracts/artifacts.ts        Zod schemas + inferred types — the spine
parsers/                      Pure event-shape transforms (edge, identity, api)
agents/
  hint.ts                     System+user prompt, response parsing, ID composer
  expectations.ts             Behavior assertions (shared across UI and CI)
  backend.ts                  HintAgentBackend interface + I/O types
  backends/
    anthropic.ts              Sonnet 4 SDK impl (CI surface; future Stage 2 wiring)
    manual.ts                 Filesystem-based copy-paste impl (CLI regression tool)
src/                          React app — the Stage 1 product surface
  main.tsx, App.tsx
  state/store.ts              useReducer + Zod-validated export/import
  components/                 HeaderBar, StreamCard, ExpectationList
  lib/pipeline.ts             Bridge: bundles fixtures, composes pure modules
scripts/
  _env.ts                     Tiny .env loader (no dotenv dep)
  test-parsers.ts             Parser contract tests (engineer/CI)
  test-hint.ts                API hint-agent prompt regression (engineer/CI; needs key)
  hint-render.ts              CLI regression flow #1: writes prompts to cli-manual/prompts/
  hint-verify.ts              CLI regression flow #2: reads cli-manual/responses/, asserts
fixtures/tutorial/            Synthetic fixture — generator + 3 stream JSONs
cli-manual/
  examples/                   Committed reference snapshots of CLI prompts
  prompts/                    (gitignored) auto-generated prompts for the CLI flow
  responses/                  (gitignored) user-pasted JSON for the CLI flow
docs/infographics/            Eight-part narrative read (parallel to README)
HANDOFF.md                    Architectural source of truth
README.md                     Director-facing pitch + stage ladder
DEV.md                        (you are here)
```

---

## Local development

```sh
npm install
npm run dev          # Vite dev server, hot reload — http://localhost:5173
npm run typecheck    # tsc --noEmit across the whole project
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # serves dist/ at http://127.0.0.1:4173
```

The product is a single-page Vite + React + TypeScript app. No backend.
No network calls in Stage 1 mode. Reuses the existing pure modules
(`contracts/`, `parsers/`, `agents/hint.ts`, `agents/expectations.ts`)
unchanged — `src/lib/pipeline.ts` is the only new bridge.

### State + persistence

State lives in a single `useReducer` in `src/state/store.ts`. The
*persisted* shape is deliberately minimal — only `pipelineRunId`,
`createdAt`, and the user-pasted `responseText` per stream. Everything
else (parsed events, hints, expectation results) is derived at render
time, so import/export is robust across prompt-body changes and
fixture updates.

`localStorage` is **opt-in via a header toggle**. Off by default.
Toggling off removes the saved investigation.

Export produces `threat-trace-investigation-{timestamp}.json` matching
the `InvestigationFileSchema` Zod schema that import validates against.
Imports of unknown `schemaVersion` or malformed JSON are rejected
before the reducer ever sees the data.

---

## CI / dev tooling

```sh
npm run test:parsers     # 15 parser contract checks. No model. No key.
npm run test:hint        # API hint-agent prompt regression. Needs ANTHROPIC_API_KEY.
npm run hint:render      # CLI regression flow #1: writes cli-manual/prompts/*.md
npm run hint:verify      # CLI regression flow #2: reads cli-manual/responses/*.json
```

These are **dev/CI tools**, not user workflows. The web app is the user
workflow.

- `test:parsers` — fast contract regression. Runs in the parser CI job.
- `test:hint` — prompt regression against Sonnet 4 (the model the Stage
  2 in-app path will use). Needs an `ANTHROPIC_API_KEY` in `.env` or
  exported in the shell. Same prompt body, same `evaluateExpectations`
  helper as the web app, same verdict — different transport.
- `hint:render` / `hint:verify` — predates the web app. Same prompt,
  CLI-driven copy-paste. Useful for scripted regression in environments
  where you can't or don't want to drive a browser. The committed
  prompts under `cli-manual/examples/` are the reviewable snapshot of
  the prompt body for code review.

### .env loading

`scripts/_env.ts` reads `.env` at the project root, parses
`KEY=VALUE` lines, and populates `process.env` (without overwriting
explicit shell exports, but **does** overwrite empty strings — which
is what Claude Code's environment leaves `ANTHROPIC_API_KEY` at by
default). Imported and called at the top of `scripts/test-hint.ts`.

A committed `.env.example` documents the file shape.

---

## Shipping the web app to a director

**Primary path: ship `dist/threat-trace.html` as a single file.**

```sh
npm install
npm run build
```

Produces `dist/threat-trace.html` — a single self-contained HTML file
(~290 KB) with all JavaScript and CSS inlined via
[`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile).
No external assets, no module imports to fetch, no network calls. The
director double-clicks the file in Finder/Explorer and the artifact
runs in their default browser.

Why this works where a normal Vite build doesn't: the singlefile
plugin emits one inline `<script type="module">` containing the entire
bundle. Inline modules don't need to fetch external files, so the
`file://` cross-origin restriction that breaks normal ES-module loads
doesn't apply.

Distribution channels — pick whichever crosses fewer policy gates:
- Email attachment (290 KB sails through any reasonable MTA).
- USB stick / network share / SharePoint upload.
- Any static file host (the file is also valid as `https://` content).

**Always verify on the actual target machine before relying.** Some
locked-down corporate browsers strip script execution from `file://`
HTML; if the director's IT enforces that, host `dist/threat-trace.html`
behind any HTTPS source they already trust.

**Alternative path: Vite preview server (dev / verification).**

```sh
npx vite preview --host 127.0.0.1
```

Serves `dist/index.html` (identical content to `threat-trace.html`)
at `http://127.0.0.1:4173`. Useful for the dev to smoke-test before
sending the standalone file, or as a fallback if `file://` is blocked
on the target.

---

## Stage 2 — implemented (Anthropic API key inside the web app)

**Status:** shipping. The standalone HTML now contains both Manual
and Anthropic-API paths. Backend toggle lives in the settings drawer
(gear icon in the header).

### How it works

- **Settings drawer** (`src/components/SettingsDrawer.tsx`) — slide-in
  panel with backend toggle (Manual / Anthropic API), password-masked
  API-key input with show/hide, and a "Forget key" button. ESC and
  click-outside both dismiss.
- **State** (`src/state/store.ts`) — adds a `runtime` slice with
  `backend`, `apiKey`, and `perStream {status, error, inputTokens,
  outputTokens}`. The slice is **structurally absent** from
  `InvestigationFile`, so it cannot leak through `buildExportPayload`
  or the localStorage write. The reducer also wipes `perStream` on
  reset/import without touching `apiKey` or `backend` (the user keeps
  their key across investigations).
- **Browser adapter** (`src/lib/api-client.ts`) — single function
  `makeBrowserAnthropicBackend(key)` that wraps the existing
  `AnthropicBackend` with an `Anthropic` client constructed using
  `dangerouslyAllowBrowser: true`. Server-side CORS verified across
  both `https://` and `null`/`file://` origins.
- **StreamCard** (`src/components/StreamCard.tsx`) — Step 2 panel
  switches by mode: paste textarea in Manual, Run button + status row
  in Anthropic API. Token usage chip on success, inline error block
  on failure, loading state during call. Step 1 (the prompt) and
  Step 3 (the expectations panel) are mode-independent.
- **HeaderBar** (`src/components/HeaderBar.tsx`) — gear icon opens
  the drawer; mode pill shows current backend (`Manual` or
  `API · key suffix`). When backend is Anthropic + key set, a primary
  **Run all three** button appears. Stage 2 pill transitions from
  `available` (when in Manual) to `active` (when API mode + key set).
- **Hook helpers** (`useInvestigation`) — `runStream(source)` and
  `runAllStreams()` are async. They read state via refs so sequential
  awaits don't see stale closures.

### Acceptance criteria (all met)

- `npm run typecheck` clean
- `npm run build` clean — single 368 KB self-contained HTML
- `npm run test:parsers` — 15/15 still green
- `npm run test:hint` (CLI prompt regression) — unchanged behavior
- Manual-mode regression: pasting JSON into the textarea still works
  identically to Stage 1
- API-mode end-to-end: with a real key, all three streams turn green
  and tokens display correctly (verified on the target machine)
- Export/import round-trip: the saved JSON file does not contain the
  API key under any field; reimport does not auto-populate the key
  (it stays empty, requiring re-entry from the settings drawer)

### Known constraints

- Direct-browser API calls work today via `dangerouslyAllowBrowser:
  true` + the `anthropic-dangerous-direct-browser-access` header. If
  Anthropic ever tightens that policy, the fallback is a tiny local
  proxy bundled alongside the HTML; not currently needed.
- The 368 KB bundle is ~73 KB larger than the Stage-1-only build
  because the Anthropic SDK is now reachable from `src/`. Still well
  under any practical email-attachment limit.

---

## Stage 3 — shipped (Sprint 1, 2026-05-01)

**Status:** live in the user surface. Bundle ships at ~427 KB
(Stages 1 + 2 + 3, single self-contained HTML, gzip ~108 KB). The
"Run investigation" button in the HeaderBar orchestrates the full
pipeline end-to-end: hint → summary → trend → action items, depth-first
sequential, ~20–25s wall.

**Why this required care:** Stage 3 was implemented end-to-end in an
earlier iteration, then rolled out of the user surface after async-
coordination bugs surfaced. Sprint 1 surfaced the actual root causes
and fixed them structurally:

- **Stale-closure bug in runners.** The original `runSummary`,
  `runTrend`, `runAction` consumed `computations` from a `useCallback`
  closure. When chained in an orchestrator, the second runner saw the
  closure from the prior render. Fix: refactor runners to read from
  `stateRef.current` / `streamsRef.current` and parse upstream
  artifacts inline. See [ADR-003](./docs/adr/003-stage-3-runners-ref-based.md).
- **React error #310 in Stage 3 components.** `TrendSection` and
  `ActionSection` had `useState` followed by an early `if (!visible)
  return null` followed by `useCallback` — a Rules-of-Hooks violation
  that was latent because the components were never mounted. Fix:
  move all hooks before any early return. Same fix preempted in
  `TraceExplorer` (Track D).
- **Parallel-within-stages was visually chaotic.** First attempt at
  `runFullInvestigation` used `Promise.all` for hints and summaries.
  Faster (~12s) but read as race-confusion. Pivoted to depth-first
  sequential per-stream — see [ADR-004](./docs/adr/004-depth-first-sequential-orchestration.md).

Full Sprint 1 story: [docs/retro/sprint-1.md](./docs/retro/sprint-1.md).

### Code map (still on disk)

```
agents/
  summary.ts            # Stage 3 summary agent
  trend.ts              # cross-stream agent
  action.ts             # action items agent
  expectations.ts       # evaluateSummaryExpectations, evaluateTrendExpectations,
                        #   evaluateActionExpectations
  shared.ts             # STREAM_LABELS_FOR_PROMPT + helpers
src/
  lib/pipeline.ts       # computeStreamSummary, computeTrend, computeAction
                        #   + buildSummaryPromptText / buildTrendPromptText /
                        #     buildActionPromptText
  lib/api-client.ts     # callAnthropic() generic helper
  state/store.ts        # InvestigationFile schema fields (optional);
                        #   reducer cases; runtime slices; async runners
  components/
    SummaryPanel.tsx    # Step 4 inside StreamCard, mode-aware (UNIMPORTED)
    TrendSection.tsx    # cross-stream section (UNIMPORTED)
    ActionSection.tsx   # action items + priority badges (UNIMPORTED)
    TraceExplorer.tsx   # recursive provenance tree (UNIMPORTED)
```

### Schema strategy (forward-compat preserved)

`InvestigationFile` already has the three optional Stage 3 fields:

```ts
summaries?: { edge?, identity?, api?: { responseText: string } }
trend?:  { responseText: string }
action?: { responseText: string }
```

A Stage 1+2 build exports/imports these fields cleanly when present
in a saved file. So when Stage 3 revives, investigations exported
from a Stage 1+2 build will load forward into Stage 3 without
migration.

### Revival plan (next iteration)

One stage at a time, validated end-to-end with a real key before the
next is added:

1. **Summary alone.** Re-import `SummaryPanel` into `StreamCard`,
   wire its props from `useInvestigation`. Validate per-stream
   summary Run buttons across all three streams against a real
   key. Add explanation/contrast/conclusion treatment to the
   thin Stage 3 expectations.
2. **Trend.** Re-import `TrendSection` into `App.tsx` below the
   stream stack. Validate the load-bearing negative-correlation
   check fires correctly when the model false-positives.
3. **Action.** Re-import `ActionSection`. Validate priority
   distribution and trend citations.
4. **Trace explorer.** Re-import `TraceExplorer`. Validate the
   recursive walk renders cleanly for all nodes.
5. **Errors visible by default.** Don't reintroduce the collapsed
   card pattern — keep run errors in the always-visible card row.
6. **No auto-orchestrate.** A "Run the full pipeline" button is a
   convenience that compounds async coordination complexity. Defer
   until per-stage is fully exercised.

### Stage 3 negative-check load-bearing test (still in `agents/expectations.ts`)

The trend agent's prompt includes explicit guards against the api
TokenExpired 401s being correlated with the edge+identity spray. The
trend stage's `evaluateTrendExpectations` has a `loadBearing: true`
check that fails if any emitted Trend cites an api 401 with
`extra.FailureReason: "TokenExpired"` as cross-stream evidence.
This is the canonical false-positive trap moved to its real layer
(cross-stream).

## Extending — Tracks

- **Track A — Revive Stage 3 — DONE in Sprint 1.** See the section
  above and [docs/retro/sprint-1.md](./docs/retro/sprint-1.md).
  Original Track A plan retained below for historical reference.
- **Track B — Add persistence** (SQLite-backed investigations)
- **Track C — Add additional fixtures** (broaden scenario coverage)
- **Track D — Surface TraceExplorer** — drill-down view that walks
  any action item back through trends → summaries → hints → raw log
  lines. Component exists at `src/components/TraceExplorer.tsx`,
  the React #310 trap was preempted in Sprint 1, just needs wiring
  into App.tsx.
- **Track E — Port to a non-security domain** — AML alert triage,
  radiology second-read, claims adjudication. Swap parsers + system
  prompts + expectation checks; pipeline skeleton stays. See
  [docs/strategy/](./docs/strategy/README.md) for the cross-domain
  map and target buyer profiles.

### Track A — Revive Stage 3 (DONE in Sprint 1)

Original plan, retained for historical reference. The actual Sprint 1
arc differed in detail (closure-safety refactor, React #310 fix,
depth-first orchestration); see the ADRs and retro for what shipped.

#### A1 — Summary Panel

Re-import the existing summary surface.

- Source: `src/components/SummaryPanel.tsx`
- Data: already produced by `agents/summary.ts` via `useInvestigation`

Steps:

- Mount `SummaryPanel` into the main investigation view (co-located with stream outputs)
- Wire props from existing investigation state (no new fetch/compute)
- Validate:
  - Uses real LLM output (not fixture text)
  - Updates on re-run
  - No regression in stream rendering

#### A2 — Trend Section

Re-activate trend analysis.

- Source: `src/components/TrendSection.tsx`
- Data: `agents/trend.ts` (already includes negative checks)

Steps:

- Mount in `App.tsx` below or alongside summary
- Ensure existing investigation pipeline populates required inputs
- Validate:
  - Trend output renders
  - Negative/neutral cases behave correctly (no forced signal)

#### A3 — Action Section

Re-activate action generation.

- Source: `src/components/ActionSection.tsx`
- Data: `agents/action.ts`

Steps:

- Mount in `App.tsx`
- Wire to investigation outputs
- Validate:
  - Actions reflect current investigation
  - No duplication with summary content
  - Stable across reruns

#### A4 — Trace Explorer

Restore trace inspection UI.

- Source: `src/components/TraceExplorer.tsx`
- Data: existing trace objects (no schema changes required)

Steps:

- Mount behind existing debug/trace affordance (or reintroduce toggle)
- Ensure recursive rendering works with current trace shape
- Do not bump `schemaVersion` — current design uses additive optional fields

Validate:

- Nested spans render correctly
- No crashes on partial traces
- Works with current pipeline output

### Track B — Persistence (SQLite-backed investigations)

Goal: persist investigations locally and allow replay.

This track is independent of Track A.

#### B1 — Storage Layer

Introduce a local persistence adapter.

Targets:

- Node/dev: `better-sqlite3`
- Browser: `sql.js` or OPFS-backed SQLite

Schema:

- Mirror existing JSON export shape (no new abstraction layer)
- Tables:
  - `investigations`
  - `streams`
  - `traces`
  - `outputs` (summary/trend/actions)

#### B2 — Write Path

On investigation completion:

- Serialize current in-memory structure
- Persist to SQLite
- Maintain idempotency (same run → overwrite or version)

#### B3 — Read / Replay Path

- Load investigation by id
- Hydrate into existing in-memory shape
- Reuse current rendering pipeline (no special-case UI)

#### B4 — Validation

- Run investigation → reload page → state restored
- JSON export ↔ DB roundtrip produces identical structure
- No dependency on Stage 3 being mounted

### Track C — Additional Fixture

Goal: expand scenario coverage beyond current baseline.

#### C1 — New Incident Fixture

Author a second fixture representing a distinct pattern (e.g.,
non-auth anomaly, multi-actor pattern).

Requirements:

- Full stream coverage
- Realistic distribution of signals vs noise
- Compatible with existing pipeline contracts

#### C2 — Validation

- All streams parse
- Summary/trend/action agents produce differentiated output vs original fixture
- No hardcoded assumptions exposed

### Execution Notes

- Tracks A and B can proceed in parallel without conflict.
- Track A is pure wiring — no new logic.
- Track B is pure infrastructure — no UI dependency.
- Avoid "helpful" refactors during revival; treat this as controlled reactivation.

---

## Maintenance notes

- **Prompt examples** at `cli-manual/examples/hint-{source}.md` are
  the canonical reviewable snapshot of the CLI regression prompts.
  Refresh them whenever `agents/hint.ts` or the fixture changes:
  ```sh
  npm run hint:render
  cp cli-manual/prompts/*.md cli-manual/examples/
  ```
- **Schema versioning.** Investigation files carry `schemaVersion: 1`.
  Bump the literal in `src/state/store.ts` whenever the persisted
  shape changes; importer rejects unknown versions rather than
  guessing.
- **Token-usage discipline.** The eventual artifact-side Anthropic
  API caps `max_tokens` at 1000 per call. Stream summaries must stay
  ≤200 tokens. The trend agent may need 2-pass splitting once it
  lands.
- **Fixture regeneration:**
  `python3 fixtures/tutorial/generate_tutorial_fixture.py`. Edit the
  constants at the top to vary attacker IP, target list, time
  window, or volume of background traffic.
