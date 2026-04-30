# 07 · Summary

## What threat-trace is, in one paragraph

A six-stage pipeline that ingests three log streams (edge / Cloudflare,
identity / Auth0, Azure App Insights for the API tier), parses them
deterministically, runs four
specialized model-backed agents over the structured events, and
produces ranked, evidence-anchored action items. Every output traces
back to specific raw log lines through a typed provenance graph.
Ships as a React artifact runnable inside Claude.ai. Built to teach,
designed to be tuned, structured to grow.

## The throughline, recapped

**Document 1** — A real bot attack exposed the gap between prompt
engineering and multi-agent orchestration. A single-threaded defense
cannot match a multi-stream attack.

**Document 2** — The pipeline is six stages, split cleanly between
deterministic data handling (pull, parse) and model-backed reasoning
(hint, summary, trend, action). The line between the two regimes is
non-negotiable.

**Document 3** — Three log streams give partial views; the truth
lives in their intersection. Cross-stream correlation by time bucket
is what makes the architecture worth building.

**Document 4** — Provenance is not a logging convention; it is the
shape of the data. Every artifact carries parent IDs. Every finding
walks back to bytes.

**Document 5** — Fixtures come before prompts. Negative checks (what
the system must refuse to find) are as important as positive
findings. The discipline cascades through every layer of the
pipeline.

**Document 6** — The methodology that produced threat-trace is
itself multi-agent. Human strategy, architectural AI, execution AI,
each at the level where it adds the most value. The handoff document
is the connective tissue.

## The migration path

threat-trace is designed to grow with its user. The same architecture
supports three increasingly sophisticated deployments:

| Stage | Substrate | Persistence | Connectors | Observability |
|---|---|---|---|---|
| **v1 — Artifact** | React in Claude.ai | In-memory + JSON file | Manual paste | None |
| **v2 — CLI** | Python, local | SQLite | Real APIs | Langfuse |
| **v3 — Service** | Backend daemon | Postgres | Streaming | Full telemetry |

The contracts do not change between stages. The JSON file format from
v1 deserializes directly into v2's SQLite schema. The connectors in v2
become event consumers in v3. Each upgrade is earned by usage, not
imposed by ambition.

> Ship the smallest version that delivers the lesson. Earn the next.

## Where to start

For someone picking up threat-trace as a working project:

1. **Read `HANDOFF.md`** — full context, decisions, pivots, contracts,
   roadmap
2. **Inspect `fixtures/tutorial/`** — read the README, scan the JSON
   files, understand the encoded pattern
3. **Build the contracts** — Zod schemas matching the TypeScript
   interfaces in the handoff
4. **Build the parsers** — three deterministic functions, one per
   source, validated against the tutorial fixture
5. **Iterate prompts against the fixture** — hint, summary, trend,
   action, in that order
6. **Wrap in a React skeleton** — single page, three input panels,
   pipeline status, trace explorer
7. **Author the incident fixture** — recreate the original bot
   attack scenario as the demo case

Each step has a defined success criterion. Each artifact has a
defined contract. Each transition has a defined handoff.

## The lesson, distilled

Multi-agent systems work when:

- Each agent has one job
- Each artifact has a defined shape
- Evidence is external to the model
- Discipline is encoded in fixtures
- The architecture is small enough to hold in one head

Multi-agent systems fail when:

- Agents do too much
- Outputs are unstructured text
- Evidence lives only in model memory
- Tests are added after the fact
- The architecture grows faster than the design can absorb

threat-trace is a small example of the first list. It exists to make
the pattern legible.

## What this collection is for

Eight documents. One pipeline. One methodology. One narrative arc.

For NotebookLM: each document produces a focused infographic that
captures one facet of the system.

For the slide deck: the documents in order map to deck chapters; the
sections within each map to individual slides.

For the team: a complete reference for what was built, why it was
built that way, and how to extend it.

For the practitioner: a worked example of multi-agent architecture
that makes the pattern reproducible at any scale.

> The pipeline catches threats. The collection teaches the pattern.
> Both matter.
