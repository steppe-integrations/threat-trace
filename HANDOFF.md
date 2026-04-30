# HANDOFF — threat-trace

A multi-agent log analysis pipeline that demonstrates real cross-stream
threat detection, ships as a single-page web app the user runs locally,
and serves as a **human-in-the-loop teaching surface** for anyone
running a stack against the modern bot wave. The product surface is
the web app — the user walks it themselves to learn the loop a Stage 2
API key would otherwise automate. Markdown docs are reference, not
workflow.

> **You are picking up an in-progress project.** This document is
> the architectural source of truth — contracts, decisions, pivots,
> stage boundaries. For the user-facing pitch read [README.md](./README.md).
> For the developer guide (build, test, ship, extend) read [DEV.md](./DEV.md).

## Status

Shipped publicly under MIT at
[github.com/steppe-integrations/threat-trace](https://github.com/steppe-integrations/threat-trace).
Live demo at [steppeintegrations.com/articles/threat-trace](https://steppeintegrations.com/articles/threat-trace).

The "Origin" section below is the historical motivation — a personal
handoff to a former colleague who'd just fought a real bot attack.
That motivation still applies; the audience expanded with the public
release.

---

## Origin

The user is **Derek**, founder of Steppe Integrations. The motivating
incident: a former colleague spent a week defending against a
sophisticated bot attack. The attack started Saturday night and ran
intermittently all week. The attacker was adaptive — every defense
the team put up, the attacker countered. At one point they bypassed
the edge entirely and hit the identity tenant directly. DevOps had
quietly whitelisted endpoints that turned into the attack surface.
The company burned its 40-hour week by Tuesday noon.

The colleague tried "throwing Claude at" their edge config and it
surfaced real holes. But that was prompt engineering, not multi-agent.
Derek wants to teach the colleague what multi-agent orchestration
actually looks like — with a working tool they can run, tune, and learn
from on a locked-down corporate machine.

This is also a live demo of Derek's **Mech Suit Methodology** (he
writes about this on LinkedIn): deterministic skeleton, model-backed
only where pattern-naming earns its keep, observability first-order,
contracts at every seam.

---

## Goal

Build a lightweight multi-agent log analysis pipeline that:

- Demonstrates the difference between prompt-chaining and a typed
  multi-agent DAG with traceable outputs
- Surfaces real cross-stream attack patterns from log data
- Produces findings that trace back to specific raw events
  (`action item → trend → summary → hint → parsed event → raw log line`)
- Runs on a locked-down corporate machine with zero install
- Doubles as a recreation of the attack the colleague just lived
  through

**Ship target:** shipped Apr 29-30 2026 (initial conversation Apr 28,
public release the night after).

**Channel — public web (current):** the live demo at
[steppeintegrations.com/articles/threat-trace](https://steppeintegrations.com/articles/threat-trace).
Visit, click *Open the demo →*, the self-contained bundle loads in
the browser. Zero install, zero account.

**Channel — clone and build (current):** `git clone` from
github.com/steppe-integrations/threat-trace, then `npm install &&
npm run build`. Produces a single self-contained HTML file
(`dist/threat-trace.html`, ~400 KB) built via `vite-plugin-singlefile`.
Double-click in Finder/Explorer; it opens via `file://` and runs
end-to-end with no server, no network calls until you Run something.
The CI/dev surface and the production surface are the same artifact.

**Channel — direct handoff (the original use case):** the same built
HTML file can be emailed, drag-dropped, or USB-sticked to a recipient
on a locked-down corporate machine. This was the first audience and
remains supported — the standalone `dist/threat-trace.html` is the
distribution unit. The personal-handoff scripts that bundled a docx
and sealed-key alongside it live in `scripts/_archive/` (gitignored).

**Channel — verification fallback:** the same build also emits
`dist/index.html` (identical content) for use with `npx vite preview
--host 127.0.0.1` if you want to smoke-test through a server, or if
a corporate-browser policy strips script execution from `file://`
attachments and the recipient's machine needs an HTTP source instead.

**Channel — Claude.ai-pasteable artifact:** still on the table as a
future option, but largely subsumed by the standalone HTML — both
deliver "zero install" and the standalone file does so without
requiring a Claude.ai account. Revisit only if a specific scenario
requires running inside the Claude.ai artifact runtime.

**Persistence — Stage 1:** in-memory + opt-in localStorage + JSON file
export/import.
**Persistence — Stage 3:** SQLite (the JSON export shape is the schema
in JSON form; v1 files replay forward).

---

## Stages

The pipeline ships in three stages, each one earning the next.

**Stage 1 — Manual orchestration in the browser.** *(shipping)*
The web app shows the per-stream prompts; the user pastes them into a
chat AI of their choice (Claude.ai, ChatGPT, …) and pastes the JSON
reply back. The web app validates the JSON, runs expectation checks,
and explains failures in plain English. **The web app *is* the runbook.**
No keys, no DB, no network calls. State is browser-memory-first with
explicit JSON export/import and opt-in localStorage. *This is the
human-in-the-loop teaching surface — directors walk it themselves to
learn the loop a Stage 2 API call would otherwise drive.*

**Stage 2 — API key inside the same web app.** *(shipping)*
A settings drawer with a memory-only API key field activates an in-app
Anthropic backend. Same prompts, same expectations, but the AI runs
them automatically — no copy-paste. The browser calls
`api.anthropic.com` directly (CORS verified for both `https://` and
`null`/`file://` origins; Anthropic SDK with `dangerouslyAllowBrowser`).
Per-stream Run buttons + a Run-all-three sequential button in the
header. Token usage shown per stream after success. The API key is
held only in `state.runtime.apiKey` — structurally excluded from
`InvestigationFile`, the export payload, and the localStorage write.
The dev/CI script `npm run test:hint` uses the same prompt body for
prompt-regression testing; it is **not** the product surface.

**Stage 3 — Full pipeline + trace explorer, all in browser.** *(BUILT, STAGED)*
Stream summary, trend, and action agents — and a recursive trace
explorer that walks any action item back to a raw log line — were
built and partially validated, then **deliberately rolled out of the
user surface**. The compute layer (`agents/summary.ts`, `agents/trend.ts`,
`agents/action.ts`, the `compute*` functions in `src/lib/pipeline.ts`,
the optional schema fields on `InvestigationFile`) and the React
components (`src/components/{SummaryPanel,TrendSection,ActionSection,
TraceExplorer}.tsx`) are kept in-repo for forward-compat with saved
files and for one-stage-at-a-time revival in a follow-up iteration.
The `useInvestigation` hook still exposes `runSummary`/`runTrend`/
`runAction` and the derived computations; nothing in `src/App.tsx`
consumes them.

What we learned: async coordination across `await` boundaries in a
React useReducer/useMemo/useEffect graph is a discrete category of
complexity that scales with the number of stages. The contracts-first
compute layer never broke; the orchestration layer did. Revival path:
re-import the staged components in `App.tsx`, one stage at a time,
each validated end-to-end with a real key before the next goes in.
No auto-orchestrate ("Run the full pipeline") until per-stage is fully
exercised. See README.md "Stage 3 — staged" for user-facing language.

**Terminology lock:** "runbook" means the web app. The CLI scripts
under `cli-manual/` are dev/CI prompt-regression tooling, not the
runbook.

---

## Architecture

Three log streams (edge, identity, api) feed a six-stage pipeline.
Solid arrows are data flow; the deterministic vs model-backed split
is critical and non-negotiable.

The fixture data this repo ships ingests Cloudflare GraphQL Analytics
(edge), Auth0 tenant logs (identity), and Azure App Insights AppRequest
(api) shapes — chosen because they're the most well-documented public
schemas at each tier. The parsers (`parsers/{edge,identity,api}.ts`)
are written against those shapes; the output `ParsedEvent` contract
is vendor-agnostic. Swap parsers to adapt to Fastly / Akamai / Bunny
at the edge tier, Okta / Cognito / Keycloak / Entra ID at the identity
tier, or any OpenTelemetry-style application logging at the api tier.

```
                  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
                  │    Edge     │  │  Identity   │  │     API     │
                  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                         │                │                │
                  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   DETERMINISTIC  │  Pull/Parse │  │  Pull/Parse │  │  Pull/Parse │
                  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                         │                │                │
                  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   MODEL          │ Hint agent  │  │ Hint agent  │  │ Hint agent  │
                  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                         │                │                │
                  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   MODEL          │   Stream    │  │   Stream    │  │   Stream    │
                  │   Summary   │  │   Summary   │  │   Summary   │
                  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                         │                │                │
                         └────────────────┼────────────────┘
                                          ▼
                                   ┌─────────────┐
   MODEL                           │ Trend agent │   ← cross-stream,
                                   └──────┬──────┘     time-correlated
                                          ▼
                                   ┌─────────────┐
   MODEL                           │   Action    │   ← ranked,
                                   │    items    │     owner-assigned,
                                   └─────────────┘     fully cited
```

**Progressive context within a stream:** the stream summary agent
reads the prior chunk's summary as additional input. This is the only
place feedback context lives. Parsing never sees model output.

**Provenance:** every artifact carries parent IDs.
`ParsedEvent` carries `chunk_id` + `raw_index` for byte-level
traceback. A single in-memory traversal reconstructs the full chain
from any action item back to the original log lines.

---

## Key decisions and pivots

These are the choices that have already been made. Do not relitigate
without good reason.

**Substrate: standalone Vite + React web app.**
Originally planned as Python CLI + SQLite + HTML report. The colleague
can't install SQLite (and likely not Python either). Initially shifted
to "single React artifact pasted into Claude.ai" for true zero-install.
Then shifted again to a **standalone Vite + React web app** the dev
builds (`npm run build`) and the director runs locally
(`npx vite preview --host 127.0.0.1`). Reasons for the second shift:
better dev velocity, real export/import file machinery, no Claude.ai
artifact runtime constraints during build-out. The Claude.ai-pasteable
target is retained as a future fallback (see Channel above) — preserves
optionality without paying the dual-build cost up front.

**Persistence: in-memory + explicit file save/load (Stage 1); SQLite (Stage 3).**
Originally SQLite. Stage 1 lives in React state only with an opt-in
localStorage convenience toggle; the user must explicitly export
investigations as JSON files. The web app fires a blocking modal after
the first successful run, a persistent unsaved banner, and a
beforeunload guard, all to make the in-memory model unmissable
(see "Modal copy" below — implemented in
`src/components/{SaveInvestigationModal,UnsavedBanner}.tsx`).
Migration path: the JSON file shape IS the SQLite schema in JSON form.
Stage 3 SQLite version replays the file forward.

**Data: synthetic GasperCards fixtures, not Derek's personal Azure.**
Original plan was to run against Derek's personal cloud accounts.
Those accounts are too thin. Shifted to synthetic data for fictional
company **GasperCards** — fixture shapes drawn from a real
edge-plus-identity-plus-api stack the author has worked with, mirroring
the kind of incident the colleague fought.

**Three streams, not four.** Initial proposal listed two identity
streams (Auth0 + Okta SDK). Corrected: Okta acquired Auth0; the SDK
shapes overlap. Final stream roles:
**edge, identity, api** — deliberately abstract, so the demo carries
across any CDN/WAF (Cloudflare, Fastly, Akamai), any identity provider
(Auth0, Okta, Cognito, Keycloak, Entra ID), and any application
logging surface (Azure App Insights, OpenTelemetry, custom JSON logs).
The shipped fixture is shaped from Cloudflare/Auth0/App Insights data
because those schemas are the most well-documented; the parser
contract is vendor-agnostic.

**Model placement: parsing is fully deterministic.**
Original proposal had model output (summaries) feeding back into the
parsing path. Corrected — parsing is pure regex/field extraction in
TypeScript, no model calls. The model only ever sees structured
events. This keeps provenance clean: every action item roots in raw
log lines, not in a model-mediated view of them.

**Two fixtures, not one.** A **tutorial** fixture (already authored)
validates the pipeline end-to-end with one obvious cross-stream
pattern. An **incident** fixture (still to be authored) closely
mirrors the actual GasperCards bot attack — IP rotation, eventual
edge bypass, whitelist-hole exploitation.

---

## Stack philosophy

Derek's defaults — please respect these. They are non-obvious, hard-won,
and documented in his "AI productivity retrospective" findings.

- **Contracts-first sequencing.** Schemas/types before any
  implementation. Each pipeline stage has a typed input and a typed
  output, defined before code.
- **Deterministic before model-backed.** Every model call must earn
  its keep. If a regex can do the job, a regex does the job.
- **Observability is first-order, not bolted on.** (Langfuse for the
  CLI/SQLite version. Skipped for v1 because the artifact-side
  Anthropic API doesn't expose trace IDs.)
- **Test harness is a first-class citizen.** Fixture-driven from day
  one.
- **Incremental vertical slices** over big-bang builds.
- **Windows host quirk:** Derek runs Windows + Hyper-V Ubuntu. When
  emitting files via PowerShell, `Set-Content` writes UTF-16 by
  default which breaks Buf and other tooling. We are TypeScript-side
  here, so this is less of a concern, but if you ever generate
  PowerShell scripts: use `[System.IO.File]::WriteAllText` with
  `[System.Text.UTF8Encoding]::new($false)` for UTF-8 no-BOM.

---

## API constraints (Stage 2 + future Claude.ai channel)

These constraints apply to the in-app Anthropic backend (Stage 2)
**and** to the future Claude.ai-pasteable channel. We pin Stage 2 to
the same model and limits the artifact runtime would enforce, so a
prompt that works in one works in the other:

- **`max_tokens` capped at 1000** per call
- **Model is `claude-sonnet-4-20250514`** (alias `claude-sonnet-4-0`)
- No tool use within agents — each "agent" is a single completion
- No web search inside the pipeline
- No persistent trace IDs (so no Langfuse for v1)

**Prompt design implications:**

- Stream summaries must be ≤200 tokens each so the trend agent has
  input headroom
- The trend agent may need to be split into two passes: candidate
  pattern extraction first, then ranking + evidence assembly
- Action items should be terse — title + 1-paragraph description +
  rationale referencing trend IDs

(Stage 1 has no API at all — the user is the orchestrator.)

---

## Contracts (the spine)

Six artifacts, one per pipeline stage. Translate the TypeScript below
to Zod schemas. Every artifact extends a base with `id`,
`pipeline_run_id`, `created_at`. See **ID strategy** below for the
rules on `id` / `pipeline_run_id` shape — they are *not* always UUIDs.

```typescript
// Base shape every artifact carries
interface Artifact {
  id: string;                      // see "ID strategy" below
  pipeline_run_id: string;         // ties one invocation together
  created_at: string;              // ISO 8601
}

type Source   = "edge" | "identity" | "api";
type Outcome  = "success" | "failure" | "blocked" | "challenged";
type Priority = "P1" | "P2" | "P3";
type Owner    = "devops" | "security" | "api" | "platform";

interface Actor {
  ip?: string;
  user_agent?: string;
  user_id?: string;
  asn?: number;
}

interface Subject {
  path?: string;
  endpoint?: string;
  resource?: string;
}

interface LogChunk extends Artifact {
  source: Source;
  query_id: string;
  time_range_start: string;
  time_range_end: string;
  chunk_index: number;
  raw: unknown[];                  // heterogeneous, source-specific
  pulled_at: string;
}

interface ParsedEvent extends Artifact {
  chunk_id: string;                // ↑ provenance
  source: Source;
  event_time: string;
  event_type: string;              // e.g. "identity.login.failed"
  actor: Actor;
  subject: Subject;
  outcome: Outcome;
  raw_index: number;               // offset into chunk.raw — byte-level traceback
  extra?: Record<string, unknown>; // preserved source-specific dims
                                   // (e.g. customDimensions.FailureReason)
}

interface AnomalyHint extends Artifact {
  chunk_id: string;
  parsed_event_ids: string[];      // events the hint considered
  evidence_event_ids: string[];    // smoking-gun subset
  description: string;
  severity: number;                // 1-5
  agent_run_id: string;
}

interface StreamSummary extends Artifact {
  source: Source;
  time_range_start: string;
  time_range_end: string;
  hint_ids: string[];
  prior_summary_id?: string;       // linked list of progressive summaries
  narrative: string;               // ≤200 tokens
  cited_hint_ids: string[];        // hints the narrative actually references
  agent_run_id: string;
}

interface TrendEvidence {
  source: Source;
  hint_ids: string[];
  parsed_event_ids: string[];
}

interface Trend extends Artifact {
  summary_ids: string[];
  description: string;
  confidence: number;              // 0.0 - 1.0
  evidence: TrendEvidence[];
  time_window_start: string;
  time_window_end: string;
  agent_run_id: string;
}

interface ActionItem extends Artifact {
  trend_ids: string[];
  title: string;
  description: string;
  priority: Priority;
  suggested_owner: Owner;
  rationale: string;
  agent_run_id: string;
}
```

**Why `extra` on `ParsedEvent`:** App Insights `customDimensions`
carries critical signal like `FailureReason: "TokenExpired"`. Without
preserving it, the hint agent can't correctly NOT flag the two API
401s in the tutorial fixture. See "Negative checks" below.

The API parser flat-spreads `customDimensions` into `extra` (so
`extra.FailureReason` is a top-level lookup, not a nested one), then
layers other App Insights fields on top.

### ID strategy

Every `Artifact.id` and every `pipeline_run_id` is a non-empty
string. The Zod schema is `z.string().min(1)` — **not** `.uuid()` —
because the pipeline mixes two ID kinds, and the schema must accept
both:

- **Random UUIDs at boundaries.** `pipeline_run_id` and any artifact
  whose creation isn't determined by inputs (e.g., `LogChunk.id`
  produced by the puller / fixture loader) use `crypto.randomUUID()`.
- **Derived deterministic keys for transform outputs.** Anywhere a
  pure function produces an artifact from a parent — most importantly
  parsers emitting `ParsedEvent` — the ID is derived from the parent
  and a stable index. Parsers use
  `` `${chunk.id}:${source}:${raw_index}` ``. This makes the parser a
  true pure function: same chunk in, byte-identical output. Same
  rule should apply to other deterministic transforms added later.

Both shapes are valid non-empty strings; both validate against the
schema. **Do not tighten this to `.uuid()`** — it would reject every
parser-emitted ID. If a future agent "fixes" the schema to UUID, it
will silently break the parser test harness.

---

## Modal copy (UX requirement)

Three checkpoints, escalating clarity:

After first successful run:
> **Save your investigation now.** This tool keeps everything in
> browser memory only. If you close this tab without exporting,
> every parsed event, hint, and action item is lost. Click **Save
> investigation** to download a JSON file you can re-open later.

On `beforeunload` if state has unsaved changes: native dialog
(can't customize text but firing it is enough).

Persistent banner across the top until first save:
> Unsaved investigation. Memory only. → **Save now**

---

## Fixture status

### Tutorial fixture — DONE

`fixtures/tutorial/`

| File | Purpose |
|---|---|
| `generate_tutorial_fixture.py` | Reproducible generator script |
| `README.md` | Scenario, expected output, negative checks |
| `edge.json` | 50 events (Cloudflare GraphQL Analytics shape) |
| `identity.json` | 34 events (Auth0 tenant log shape) |
| `api.json` | 22 events (Azure App Insights AppRequest shape) |

**Encoded pattern:** password spray from `185.220.101.42` (TOR exit,
ASN 4224) hitting 30 GasperCards employees in a 90-second window
between 14:00:03 and 14:01:30 UTC. Visible in the edge stream (WAF in
`log` mode, not blocking) and the identity stream (30 failed-password
events). The api stream is uncorrelated.

**Expected primary finding:** Cross-stream correlation between the
edge and identity streams from one hostile actor. One P1 action item
to block the IP, one P1 to audit affected users, one P2 to tighten
WAF posture, one P3 to monitor api for follow-up.

### Negative checks (the real validation)

The fixture deliberately includes two traps. The pipeline must NOT:

1. **Conflate Carol's typo failed-login with the spray.** She's at
   `203.0.113.117`, Chrome UA, retries successfully 15 seconds later
   from the same IP. Catching this requires actor fingerprinting
   (IP + ASN + UA), not event-type matching.

2. **Correlate the two api 401s with the attack.** They're token
   expirations from a legitimate authenticated user
   (`customDimensions.FailureReason: "TokenExpired"`). If the trend
   agent ties them to the attack, the cross-stream prompt is too
   aggressive about correlation.

**These are prompt-design constraints disguised as test cases.**
Finding the spray is table stakes; *not* hallucinating beyond it is
the test.

### Incident fixture — TODO

Will mirror the colleague's actual experience. Patterns to encode:

1. Identity web-flow events without matching edge ingress
   (web-UA login traffic that never hit the edge) → direct
   origin hit
2. Edge-blocked IPs successfully authenticating in the identity
   stream minutes later → bypass working in real time
3. Api 401 spike without corresponding identity-stream failure
   spike → token forgery/replay (validation happens locally
   against the identity provider's signing keys)
4. Whitelisted edge path receiving 50× baseline traffic →
   the trade-off DevOps made, weaponized
5. IP rotation across all three streams over time → adaptive bot

Mobile identity-SDK traffic legitimately hits the identity
tenant direct (mobile clients usually skip the edge), so the
fixture must include baseline mobile-UA identity traffic with
no edge correspondence as the *control group*. The web-UA
bypass traffic stands out against that baseline.

---

## Validation

Two distinct things, often conflated, **kept separate here**:

1. **Product validation** — does the web app teach the loop to a
   director? This is the Stage 1 ship gate. Verified by walking the
   artifact end-to-end: copy a prompt, paste into a chat AI, paste
   the reply back, read the expectation explanations. Pass criterion:
   *a director can answer "what just happened?" without reading any
   documentation.*
2. **Model validation** — does the prompt produce the right answers
   when given to a real model? Verified separately, against Sonnet 4
   via `npm run test:hint` (CI/dev) or against any chat AI via the
   web app (manual). A failed model validation does **not** block
   product validation; it surfaces in the failed-expectation
   explanation panel as a teaching moment about the negative-check
   behavior the prompt is designed to enforce.

The web app's expectation panel renders both passes and failures with
the same explanation + contrast prose, so the director learns the
same lesson regardless of whether the AI got the answer right.

---

## Current state

**Stage 1 (manual orchestration in the browser) — shipping:**

- Architecture decided (six-stage DAG, deterministic/model split)
- Zod contracts (`contracts/artifacts.ts`)
- Three parsers (`parsers/{edge,identity,api,index}.ts`)
- Hint agent prompt body (`agents/hint.ts`); committed CLI prompt
  examples under `cli-manual/examples/`. *Model validation is
  separate from product validation — see "Validation" above.*
- Backend interface + Anthropic + manual file impls
  (`agents/backend.ts`, `agents/backends/{anthropic,manual}.ts`)
- Shared expectations with explanation + contrast prose
  (`agents/expectations.ts`)
- Web app: header + next-step indicator, stream cards, expectation
  panels with plain-English teach lines, save modal, unsaved
  banner, beforeunload guard, JSON export/import, opt-in
  localStorage (`src/`)
- Tutorial fixture (5 files in `fixtures/tutorial/`)
- Dev/CI scripts: `npm run test:parsers`, `test:hint`,
  `hint:render`, `hint:verify`

**Stage 2 (Anthropic API key inside the web app) — shipping:**

- Settings drawer (gear icon in header) with memory-only API key
  input + show/hide + "forget key" button (`src/components/SettingsDrawer.tsx`)
- Backend selector (Manual | Anthropic API) in the drawer; mode pill
  in the header reflects current backend
- Browser Anthropic adapter (`src/lib/api-client.ts`) wraps the
  existing `AnthropicBackend` with `dangerouslyAllowBrowser: true`
- StreamCard switches Step 2 panel based on mode: paste textarea
  (Manual) or Run button + status row (Anthropic). Token usage chip
  on success, error inline with Retry, loading state during call.
- Run-all-three sequential button in the header (active when API
  mode + key set)
- Stage 2 pill in header transitions from `available` (in settings)
  to `active` when API mode + key both true
- State store extensions: `runtime` slice (backend mode, apiKey,
  perStream {status, error, tokens}); `runStream` and `runAllStreams`
  hook helpers; structural guards keeping `apiKey` out of
  `buildExportPayload` and the localStorage write effect

**Stage 3 (full pipeline + trace explorer, all in browser) — BUILT, STAGED:**

The lib layer below is complete and correct. The UI surfaces are
present in `src/components/` but **not imported by `src/App.tsx`**.
Revival = re-import one stage at a time, validate end-to-end with a
real key, then add the next.

- Stream summary agent (`agents/summary.ts`) — system+user prompt,
  parser, composer; per-stream, with optional prior-summary context.
- Trend agent (`agents/trend.ts`) — first cross-stream call,
  per-source evidence (hint_indices + event_indices), confidence
  score, time-bucketed correlation rules.
- Action agent (`agents/action.ts`) — prioritized, owner-assigned
  ActionItems with trend_id citations.
- Stage 3 expectations (`agents/expectations.ts` extended) — summary
  expectations are soft; trend has the load-bearing negative check
  ("no api 401 cross-stream correlation"); action checks cover the
  P1 IP-block and P1 user-audit table stakes. Note: the Stage 3
  expectations are thinner than Stage 1 — when reviving, give them
  the explanation/contrast/conclusion treatment Stage 1 has.
- Pipeline compute extensions (`src/lib/pipeline.ts`) —
  `computeStreamSummary`, `computeTrend`, `computeAction`, plus
  `buildSummaryPromptText` / `buildTrendPromptText` /
  `buildActionPromptText` for the manual-paste path.
- State store extensions (`src/state/store.ts`) — additive optional
  fields on `InvestigationFile` (`summaries`, `trend`, `action`),
  no `schemaVersion` bump; runtime slices for summary/trend/action
  status; async runners (`runSummary`, `runAllSummaries`,
  `runTrend`, `runAction`). Hook still exposes them; nothing
  consumes them currently. Saved-file format already round-trips
  Stage 3 fields, so reviving is purely a UI rewire.
- UI components staged: `SummaryPanel` (per-stream Step 4),
  `TrendSection`, `ActionSection`, `TraceExplorer`. Files live in
  `src/components/` and are unimported.
- Header pill 3 reads "next iteration" instead of "below the
  streams".

**Lessons from the rolled-back attempt:**

- Async coordination across `await` boundaries in the React
  useReducer/useMemo/useEffect graph is fragile and scales with
  the number of stages. Specifically: derived state captured at
  click-time goes stale across awaits; modal-on-state-change can
  trigger re-render flurries during in-flight pipelines.
- An auto-orchestrate ("Run the full pipeline") button compounds
  the above. Per-stage manual click points are quietly load-bearing
  for both observability and stale-closure safety.
- Errors must surface in the always-visible card row, not behind a
  collapse chevron.
- One stage at a time. Demo each before adding the next.

**Still on the roadmap (not blocking ship):**

- Incident fixture — second fixture encoding the five documented
  patterns (IP rotation, edge bypass, whitelist exploitation, etc.).
- Multi-investigation history / SQLite — only if the workflow
  evolves to need it.

---

## Roadmap

Recommended sequence — each step validates the previous before the
next begins:

1. **Zod contracts** — translate the TypeScript interfaces above.
   ~30 min. No model calls. Validates the shape is buildable.
2. **Three parsers** — deterministic event extraction. Test against
   tutorial fixture: every raw event maps 1:1 to a `ParsedEvent`,
   negative-check events preserve their `extra` fields. ~80 lines TS
   total, ~1-2 hours. No model calls.
3. **Hint agent prompt** — first model-backed step. Iterate against
   tutorial fixture parsed events. Easiest to tune in isolation.
4. **Stream summary agent** — progressive context chain. Force
   ≤200-token output. Test it can summarize the tutorial fixture's
   attack window correctly.
5. **Trend agent** — first cross-stream call. May need 2-pass split.
   Tutorial fixture validates: must produce one primary finding,
   must not over-correlate API/Carol.
6. **Action agent** — converts trends into ranked, owner-assigned
   action items. Smallest prompt of the four.
7. **React artifact skeleton** — single page, three input panels
   (paste-or-load fixture per stream), pipeline status, trace
   explorer (action → trend → summary → hint → event → raw).
8. **Save/load + modal UX** — investigation file format = serialized
   in-memory state graph.
9. **Incident fixture** — author the GasperCards bot-attack scenario
   with the five patterns listed above.
10. **Polish + personal handoff** — done; the original-audience
    standalone-HTML drop happened ahead of the public release.
11. **Public release** — done Apr 29-30 2026. Repo at
    [github.com/steppe-integrations/threat-trace](https://github.com/steppe-integrations/threat-trace),
    live demo at
    [steppeintegrations.com/articles/threat-trace](https://steppeintegrations.com/articles/threat-trace),
    LinkedIn launch deck at `docs/launch/Architecting_Agentic_Defense.pdf`.

---

## Files in this handoff

See [README.md](./README.md) for the user-facing pitch and
[DEV.md](./DEV.md) for the developer guide. Repo layout (current):

```
threat-trace/
  contracts/artifacts.ts
  parsers/{edge,identity,api,index}.ts
  agents/
    {hint,expectations,backend}.ts
    backends/{anthropic,manual}.ts
  src/
    main.tsx, App.tsx, styles.css
    state/store.ts
    lib/pipeline.ts
    components/
      {HeaderBar,StreamCard,ExpectationList,
       SaveInvestigationModal,UnsavedBanner}.tsx
  scripts/
    {test-parsers,test-hint,hint-render,hint-verify,_env}.ts
  fixtures/tutorial/
    {generate_tutorial_fixture.py,README.md,
     edge.json,identity.json,api.json}
  cli-manual/
    examples/{hint-edge,hint-identity,hint-api}.md
    prompts/.gitkeep            (gitignored working copies)
    responses/.gitkeep          (gitignored user-pasted JSON)
  docs/infographics/00..07-*.md (parallel narrative reads)
  index.html, vite.config.ts, tsconfig.json, package.json
  .env.example, .gitignore
  README.md, DEV.md, HANDOFF.md
```
