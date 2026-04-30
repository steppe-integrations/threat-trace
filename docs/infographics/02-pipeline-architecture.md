# 02 · Pipeline architecture

## Six stages, two regimes, one DAG

threat-trace is a six-stage directed pipeline. The first two stages are
deterministic code. The last four are model-backed agents. The line
between them is non-negotiable, and understanding why is the most
important architectural insight in the project.

```
Pull           → deterministic — fetch logs, paginate
Parse          → deterministic — regex, field extraction
Hint           → model         — anomaly candidates with severity
Stream Summary → model         — narrative with evidence citation
Trend          → model         — cross-stream pattern correlation
Action Items   → model         — ranked recommendations with rationale
```

> The model is never in the path between bytes and structured events.

## Why the deterministic/model split matters

A common mistake in early multi-agent systems is putting the model
inside the parsing path. It looks elegant — "the model is smart, let
it figure out the structure" — but it destroys traceability. When
findings are challenged, the evidence chain ends at a model
interpretation rather than at the raw log line. You cannot debug what
you cannot reproduce.

threat-trace draws the line explicitly:

**Deterministic stages own the data.**
Pulling logs and extracting structured events is a regex problem. The
output is identical on every run for the same input. Bugs are findable.
Behavior is testable.

**Model-backed stages own the meaning.**
Naming patterns, summarizing context, correlating across streams,
ranking severity — these are reasoning tasks where the model genuinely
adds value. The model never modifies an event; it only reads them.

This single discipline makes everything downstream possible: stable
provenance, reproducible test cases, prompts that can be tuned without
breaking the system underneath.

## The six stages, in detail

**Pull** — connectors per source (edge / Cloudflare GraphQL Analytics;
identity / Auth0 tenant logs; api / Azure App Insights AppRequest).
Each emits a `LogChunk` containing raw events plus query metadata.
Deterministic.

**Parse** — one parser per source. Extracts a normalized
`ParsedEvent` from each raw event, preserving source-specific
context in an `extra` field. Deterministic.

**Hint** — a model call per chunk. Reviews structured events and
emits `AnomalyHint` records with severity 1-5 and a list of
"smoking gun" event IDs. Pattern-naming, not reasoning across time.

**Stream Summary** — a model call per stream. Reads the prior chunk's
summary as additional context (the only place feedback context lives
in the system) and emits a narrative ≤200 tokens with cited hint IDs.
This is progressive summarization done deliberately.

**Trend** — a model call across all three stream summaries. Aligns by
time window, correlates patterns across sources, emits `Trend` records
with confidence scores and per-source evidence references.

**Action Items** — a final model call. Converts trends into ranked,
owner-assigned recommendations with rationale that cites specific
trend IDs.

## The artifact contract

Every stage emits typed artifacts. The full set:

- `LogChunk` — raw events + query metadata
- `ParsedEvent` — normalized event + chunk reference
- `AnomalyHint` — candidate finding + evidence event IDs
- `StreamSummary` — narrative + cited hints + prior summary link
- `Trend` — cross-stream pattern + confidence + evidence
- `ActionItem` — recommendation + priority + owner + rationale

Six artifacts. Six stages. One-to-one. Each artifact carries its
parent IDs, which means the entire pipeline state is a traversable
graph by construction.

## Constraints we work within

The pipeline ships as a React artifact running inside Claude.ai, which
imposes hard limits:

- Each model call capped at 1000 max_tokens
- Single model available (`claude-sonnet-4-20250514`)
- No tool use within agents — each agent is one completion
- No persistent trace IDs

These constraints sharpen the design rather than weaken it. Forced
brevity makes the prompts crisper. Forced singularity of role makes
the agents more orthogonal. The migration path to a backend (CLI +
SQLite + Langfuse) loosens the constraints later, but the
architecture works inside them today.

> A pipeline whose constraints inform its shape ages better than one
> that fights its environment.
