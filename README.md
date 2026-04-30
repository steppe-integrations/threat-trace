# threat-trace

> **Agentic defense, in your browser. One self-contained HTML file.
> No install, no server, no telemetry. Walk the loop in fifteen minutes.**

The attackers running coordinated campaigns against your stack right
now are multi-step, multi-stream, adaptive. Defenders' AI tooling is
mostly: paste a log into a chat AI, ask "what stands out?". That's a
single-completion analyst on a specialty task. It's not a defense
system.

threat-trace is what the composed-signals version looks like —
running, working, with every seam visible.

![Three log streams (edge, identity, api) feed a five-stage composition pipeline; the deliverable is ranked action items, the load-bearing negative check, and a structural provenance chain back to raw log lines.](docs/images/dataflow-demo.jpg)

---

## What's in here

A working multi-agent log-analysis pipeline that demonstrates
**cross-stream correlation done correctly** — and, just as
importantly, demonstrates how it **doesn't hallucinate** when two
unrelated 4xx errors happen to share a time window with a real
attack.

- **Three log streams** of synthetic data from a fictional company
  mid-attack: an **edge** tier (CDN / WAF; fixture data shaped from
  Cloudflare logs — adapts to Fastly, Akamai, CloudFront, …), an
  **identity** tier (login / authentication; fixture data shaped from
  Auth0 logs — adapts to Okta, Cognito, Keycloak, Entra ID, …), and an
  **api** tier (application traffic; fixture data shaped from Azure App
  Insights — same shape a Node service, microservices stack, or .NET
  monolith would all emit through equivalent OpenTelemetry-style
  logging).
- **Three discrete agents** reasoning over each stream in isolation.
  Cross-stream correlation happens at exactly one designated layer.
- **Load-bearing negative check.** Two routine token-expiration 401s
  in the api tier *must not* be lumped in with the unrelated
  password spray happening at the same time. The expectation panel
  evaluates this on every run.
- **Provenance from finding to raw log line.** Every recommended
  action carries its evidence chain back to the specific log lines
  that justified it. Click any action; walk the chain. **Defensible
  in any post-mortem, not just a demo.**

![From single-prompt limits to staged multi-agent security](docs/images/3stage-defense.jpg)

---

## Run it

### No-install path (recommended for first contact)

Open `dist/threat-trace.html` in any modern browser. Double-click in
Finder / Explorer, or drag it onto a browser window. That's the
whole installation. Single self-contained file, no server, no
network calls until you Run something.

The web app is self-explanatory — it tells you what to do at every
step. Phase 1 is free (copy each prompt, paste into Claude.ai /
ChatGPT / any chat AI, paste the JSON reply back). Phase 2 plugs an
Anthropic API key in (memory-only, never written to disk, never
exported) and runs the same prompts automated for ~10 seconds per
stream.

You can also try a hosted version of the demo at
**[steppeintegrations.com/articles/threat-trace](https://steppeintegrations.com/articles/threat-trace/)**.

### Build from source

```sh
npm install
npm run build
```

Produces `dist/threat-trace.html` (the standalone single file) and
`dist/index.html` (identical content for use with `npx vite preview
--host 127.0.0.1` if you want to verify in a local server first).

`npm run dev` for hot-reload development. `npm run test:parsers` for
the parser regression suite.

---

## Architecture

```
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │    Edge     │  │  Identity   │  │     API     │
   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │  Parse      │  │  Parse      │  │  Parse      │     deterministic
   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │  Hint       │  │  Hint       │  │  Hint       │     model
   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │  Summary    │  │  Summary    │  │  Summary    │     model (staged)
   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                   ┌─────────────┐
                   │  Trend      │  ← cross-stream (staged)
                   └──────┬──────┘
                          ▼
                   ┌─────────────┐
                   │   Action    │  ← prioritized + cited (staged)
                   │   items     │
                   └─────────────┘
```

**Parsing is fully deterministic.** Each parser emits a normalized
`ParsedEvent` regardless of source. The agent boundary is sharp —
the model only ever sees structured events, never raw logs.
Cross-stream correlation happens at exactly one layer (the trend
agent), not bleeding across every prompt.

The architectural claim:
**deterministic skeleton, model only where pattern-naming earns its
keep**. Typed contracts, parsers, expectation checks, and ID
composition are all deterministic and reusable. The hint, summary,
trend, and action stages are model-backed — each is a single
completion with a typed contract on the other side. Nothing about
the skeleton requires the model to behave; the skeleton catches the
model when it doesn't.

For the deeper read, see the architectural source-of-truth in
[HANDOFF.md](./HANDOFF.md).

---

## What ships today vs. staged

**Today (Phase 1 + Phase 2):** the hint stage, three streams,
expectation panels, full provenance through hint → parsed event →
raw log line. Manual paste-through-any-chat-AI mode (free). API mode
(plug in an Anthropic key, ~10 seconds per stream automated). Editable
prompts in API mode — try weakening a check and watch the expectation
panel react.

**Staged for the next iteration (Phase 3):** the cross-stream layer
(stream summary → trend → action items) and the trace explorer that
walks any final action back to the raw log lines. The lib code is in
the repo (`agents/summary.ts`, `agents/trend.ts`, `agents/action.ts`,
`src/components/{SummaryPanel,TrendSection,ActionSection,TraceExplorer}.tsx`)
but unmounted from the user surface — see [DEV.md](./DEV.md) "Track A —
Revive Stage 3" for the wiring guide. The investigation file format
already round-trips Phase 3 fields (additive optional schema), so
saved files are forward-compatible.

![The full pipeline + persistence + trace explorer](docs/images/full-pipeline.jpg)

---

## Why it's free

Every defender running a stack against the modern bot wave should
already have tooling that composes signals across systems and traces
every finding back to a raw log line. Most don't. That's the gap
this closes for anyone who walks it.

The methodology that made this small enough to give away — typed
contracts at every seam, model only where pattern-naming earns its
keep, observability first-order — is the same methodology any
serious defender's tooling already needs. Building this isn't the
hard part. Knowing it needs to exist is.

The architectural deck (~5 minute read) lives at
**[steppeintegrations.com/articles/threat-trace](https://steppeintegrations.com/articles/threat-trace/)**.

---

## Take it. Fork it. Beat me to the next slice.

The handoff guide ([DEV.md](./DEV.md)) has prompts an engineer can
paste into Claude Code or Cursor to extend the pipeline:

- **Track A** — revive the staged Phase 3 surfaces (Summary →
  Trend → Action → Trace Explorer), one stage at a time.
- **Track B** — add SQLite persistence (better-sqlite3 in dev,
  sql.js or OPFS-backed SQLite in browser).
- **Track C** — author additional incident fixtures.

Each prompt is self-contained.

---

## What's NDA-safe

Everything is fictional. The attack pattern encoded in
`fixtures/tutorial/` is the *kind* of thing that happens to
companies with this stack — TOR-sourced password sprays against
custom identity-tenant domains fronted by an edge tier with the
WAF in log mode — but no real company, no real incident, no real
credentials.

If you adapt this for your own environment, the three parsers
(`parsers/edge.ts`, `parsers/identity.ts`, `parsers/api.ts`) take
your raw log shapes and emit the same `ParsedEvent` contract. The
fixture data ships in well-documented public shapes (Cloudflare
GraphQL Analytics, Auth0 tenant logs, Azure App Insights AppRequest)
because those are the most reviewable places to start; the parser
contract itself is vendor-agnostic and adapts to Fastly, Akamai,
Okta, Cognito, Keycloak, Entra ID, OpenTelemetry-style application
logs, or anything else that emits structured events. Everything
above the parsers is shape-agnostic.

---

## Where to look next

| You are… | Read… |
|---|---|
| Anyone who wants to walk the demo | Open `dist/threat-trace.html` in your browser, or visit [steppeintegrations.com/articles/threat-trace](https://steppeintegrations.com/articles/threat-trace/). |
| A developer who needs to build, test, ship, or extend | [DEV.md](./DEV.md) |
| A developer who wants the full architectural context | [HANDOFF.md](./HANDOFF.md) |
| Anyone who wants the narrative version with diagrams | [docs/launch/Architecting_Agentic_Defense.pdf](./docs/launch/Architecting_Agentic_Defense.pdf) — 12-slide deck (GitHub renders it inline) |

---

## License

MIT. See [LICENSE](./LICENSE).

Built by [Steppe Integrations](https://steppeintegrations.com).
Reach out: <derek@steppeintegrations.com>.
