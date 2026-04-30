# 04 · Provenance and traceability

## Findings without evidence are guesses

A multi-agent system that cannot show its work is just a slower way to
guess. The defining feature of threat-trace is not the agents — it is
the evidence chain underneath them.

Every output the system produces is anchored to specific log lines.
Every step in between is reconstructible. Every claim is checkable.

> If you cannot walk an action item back to a raw event, you cannot
> trust it.

## The chain

Six artifacts, each carrying the IDs of its parents:

```
ActionItem    — references trend_ids
   ↓
Trend         — references summary_ids
   ↓
StreamSummary — references hint_ids
   ↓
AnomalyHint   — references parsed_event_ids
   ↓
ParsedEvent   — references chunk_id + raw_index
   ↓
LogChunk.raw[raw_index] — the original log line
```

A single graph traversal — five hops, all in memory — reconstructs the
full path from a recommendation back to the bytes that justified it.

This is not a logging convention. It is the shape of the data itself.
Provenance is not added on top; it is what the data is.

## byte-level traceback

The ParsedEvent contract carries two fields that make the chain
forensic-grade:

- `chunk_id` — the identifier of the source LogChunk
- `raw_index` — the offset into that chunk's raw event array

Together they pinpoint the exact event in the exact pull. Not an
approximation, not a regenerated query, not "the kind of event that
matched" — *the* event.

This becomes meaningful when an action item is challenged. A
stakeholder reading "block IP 185.220.101.42" and asking "based on
what?" can be walked back through the trend, through the summaries,
through the hints, through the parsed events, to the literal log lines
the recommendation was built on.

The challenge is no longer "do I trust the AI." The challenge is "do
I trust the evidence." That is a much better question.

## The "extra" field — preserving context

ParsedEvent carries an `extra` field that holds source-specific
context the normalized schema does not capture. App Insights
customDimensions are the canonical case.

Consider the tutorial fixture. It contains two API requests that
return 401. They are not part of the attack — they are token
expirations from a legitimate user. The customDimension that
distinguishes them is:

```json
"customDimensions": {
  "FailureReason": "TokenExpired"
}
```

If the parser drops this field — converting only to the normalized
schema — the hint agent has no way to distinguish these legitimate
401s from attack signal. The model is forced to guess, and given
ambiguity it will hallucinate correlation.

By preserving `extra`, the parser pushes the disambiguating context
forward intact. The hint agent reads it, the prompt instructs it to
weigh it, and the negative-check passes: the API 401s are correctly
labeled as unrelated to the attack.

This is what "evidence-anchored" looks like in practice. Not a
property of the prompt — a property of the data.

## Why this beats "trust the model"

Modern LLMs are good at reasoning over context. They are not good at
reliably remembering what they were told three steps earlier. A
multi-agent system that relies on the model to maintain a stable view
of evidence across many calls will drift. Every call is a re-roll.

Provenance fixes this by making evidence external to the model. The
model never has to remember what it saw — the system knows what it
saw, and can replay any portion of it on demand. The model's job
shrinks to the thing it is actually good at: reading structured input
and producing structured output.

This is not a limitation of the model. It is a respect for what the
model is.

> The way to trust an AI system is to build a system whose evidence
> the AI does not control.

## What this enables

A pipeline with first-class provenance unlocks things that ad-hoc
prompt chains cannot:

- **Reproducibility** — the same input produces the same provenance
  graph. Bugs are findable.
- **Auditability** — every finding has a defensible chain.
- **Iterative tuning** — when a prompt produces a wrong finding, the
  evidence chain shows whether the data, the parser, or the prompt is
  at fault. Each layer is debuggable independently.
- **Trust at scale** — once you have ten findings a day, manually
  verifying each one is impossible. With provenance, spot-checking is
  enough.

The next document is about the discipline that turns this
infrastructure into a reliable signal.
