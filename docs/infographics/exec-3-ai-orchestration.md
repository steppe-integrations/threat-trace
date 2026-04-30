# Exec Slide 3 · AI orchestration: same loop, no human in the middle.

## What the human did, the AI now does

In Stage 1, the user is the orchestrator. They copy a prompt, paste
it into a chat AI, paste the JSON reply back into the web app, watch
the expectations evaluate, read the conclusions, repeat for each of
three streams.

In the next stage, the same web app — same UI, same prompts, same
expectations — runs that loop **without the human in the middle**.

The user opens a settings drawer. Drops an Anthropic API key into a
memory-only field. Toggles the backend from "Manual (paste)" to
"Anthropic API." The paste textareas are replaced by Run buttons.
Click once. Three streams turn green in about ten seconds.

> Same flow. Same prompts. Same expectations. The only thing that
> changed is who's doing the pasting.

## The data flow, end to end

The same six-stage architecture that the human walked manually now
runs continuously:

```
Edge       ─┐
Identity   ─┼─→ Parse ─→ Hint agent ─→ Stream summary ─→ Trend ─→ Action items
API          ┘   (det.)   (model)        (model)            (model)    (model)
```

Every model call is a single completion. Every output is a typed
artifact. Every artifact carries the IDs of its parents. The
pipeline state is a graph by construction — no model has to
"remember" anything across calls.

A correlated finding produces a single ranked list:

> **P1 — Block 185.220.101.42 at the edge** *(spray attack from TOR
> exit, WAF in log mode for /u/login/*)* · **P1 — Audit affected
> users** *(30 distinct accounts hit)* · **P2 — Tighten WAF posture
> on /u/login/*** · **P3 — Monitor API for follow-up activity** *(no
> correlation in current window — token-expiry 401s explicitly
> excluded)*.

## Persistence: every investigation, replayable

A SQLite database stores every run. The schema mirrors the JSON
export format from Stage 1 — investigations saved manually replay
forward into the database without conversion.

What this enables that ad-hoc prompt chains cannot:

- **Audit.** Six months later, a finding is challenged. The full
  evidence chain — action item → trend → summary → hint → parsed
  event → raw log line — is reconstructible from a single graph
  traversal.
- **Reproducibility.** Same input, same provenance graph, every
  time. Bugs are findable.
- **Trust at scale.** Once the system is producing dozens of
  findings a week, manually verifying each one is impossible. With
  full provenance, spot-checking is enough.

## The trace explorer: one click, full chain

A reviewer clicks any action item in the dashboard. The UI expands
the entire evidence chain — trend, summaries, hints, parsed events,
and the literal raw log lines that justified each conclusion. No
extra API calls, no model "recollection." Just a graph walk.

This is the difference between "the AI told us to block this IP" and
"here are the 30 events from one TOR exit hitting 30 distinct
employees in 90 seconds, and here are the raw log lines they came
from." The second is defensible in a meeting. The first is not.

## The human's role moves up

| Stage | Role | What they do |
|---|---|---|
| 1 — Manual | Orchestrator | Drives the loop by hand. Sees how it works. |
| 2 — Automated | Reviewer | Confirms findings. Reads expectations. |
| 3 — Full pipeline | Auditor | Spot-checks. Investigates evidence chains. |

Same architecture, growing scope. Each stage proves the next.

> Trust earned, not assumed. The AI does what the human already
> verified the loop does. The human is freed to decide what to do
> about it.
