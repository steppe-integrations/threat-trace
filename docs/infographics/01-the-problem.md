# 01 · The problem

## A week that exposed everything

A SaaS company hit its 40-hour weekly capacity by Tuesday noon.

The bot attack started Saturday night and ran intermittently through
the entire week. Every defense the team raised, the attacker countered.
At one point the attacker bypassed the edge entirely and hit the
identity tenant directly. DevOps had quietly whitelisted endpoints months
earlier — those whitelists became the attack surface.

The defenders had AI tools. One engineer pointed Claude at the
edge configuration and immediately surfaced real holes that
DevOps acknowledged but had filed under "we know, we whitelisted that."
But the AI work was happening one prompt at a time, against one
artifact at a time, by one person at a time.

The attack was multi-stream. The defense was single-threaded.

> The defenders had AI tools. The attack required AI orchestration.

## The gap between prompt engineering and multi-agent

"Throwing Claude at" a configuration file is real, useful work. It is
also fundamentally limited.

**What single-prompt analysis does well:**

- Examines one artifact at a time
- Finds problems within that artifact's scope
- Explains its reasoning when asked
- Catches things humans missed

**What single-prompt analysis cannot do:**

- Correlate signals across systems that don't share schemas
- Maintain a stable view of evidence across many inputs
- Produce findings that trace back to specific events
- Distinguish what the model concluded from what the data actually shows

A bot attack that bypasses the edge to hit the identity tier directly is invisible
to anyone looking at one log stream. The edge logs are clean —
nothing got through, because nothing was sent. The identity logs show a
flood — but without the missing edge context, an analyst reading
the identity stream alone cannot tell whether they're looking at a misconfiguration,
a load test, or an active intrusion.

The truth lives in the gap between the streams.

## What "multi-agent" actually means

The phrase gets used loosely. In threat-trace, it means something
specific:

- **Specialized roles.** Each agent does one thing. A hint agent finds
  candidate anomalies. A trend agent correlates across streams. An
  action agent produces ranked recommendations. None of them does
  another's job.
- **Typed inputs and outputs.** Every agent's output is a structured
  artifact with a defined schema, not free-form text. Downstream
  agents consume those artifacts as data, not as conversation.
- **Provenance at every seam.** Each artifact carries the IDs of its
  parents. The chain from a final action item back to the original log
  line is a traversable graph, not a model's recollection.
- **Deterministic where deterministic works.** The model is not
  invoked for tasks that regular code can do reliably. Parsing log
  events is a regex problem, not a reasoning problem.

This is the difference between asking Claude to read your logs and
building a system that reads logs at scale, with discipline, and shows
its work.

## The opportunity

The defenders in our story did not need a smarter prompt. They needed
a small, well-shaped tool that:

- Pulled three log streams and parsed them deterministically
- Used the model only for pattern-naming, never for evidence handling
- Produced findings that traced back to specific events
- Ran on a locked-down corporate machine with zero install
- Could be handed off, tuned, and learned from

threat-trace is that tool. The next document explains its shape.

> The right question isn't "how do I prompt better." It's "what is the
> smallest system I can build that puts each model call where it earns
> its keep."
