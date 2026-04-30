# Exec Slide 1 · Bots evolve. Defense must too.

## The asymmetry

A bot attack at a SaaS company started Saturday night and ran
intermittently for a week. Every defense the team raised, the
attacker countered. The attacker rotated IPs. Switched user-agents.
Probed for whitelisted paths. At one point bypassed the edge
entirely to hit the identity tenant directly — DevOps had quietly
allowlisted endpoints months earlier, and those allowlists became
the attack surface.

> By Tuesday noon, the company had burned its 40-hour weekly
> capacity. The attack continued through Friday.

The attacker was **multi-stream, multi-phase, adaptive**. The
defense was **single-threaded, single-prompt, reactive**.

That asymmetry is now the rule, not the exception.

## Why "throwing Claude at it" wasn't enough

The defenders had AI tools. One engineer pointed Claude at the
edge configuration and surfaced real holes that DevOps had
quietly accepted. That work was real. It was also fundamentally
limited.

Single-prompt analysis examines **one artifact at a time, by one
person at a time**. A bot attack that bypasses the edge to hit
the identity tier directly is invisible to anyone looking at one log stream
alone. The edge logs look clean. The identity logs look like a
flood without context. The truth lives in the gap between them —
and a single prompt can only see one side of the gap.

The defenders had AI tools. The attack required **AI orchestration**.

## What evolving scanning actually means

The shape of the defense has to match the shape of the attack:

- **Multi-stream.** Every system the attacker touches produces a
  partial view. Looking at one stream is a story; looking at the
  intersection is a record.
- **Continuous.** Static rules age out the moment an attacker probes
  past them. Scanning has to refresh as the attack mutates.
- **Traceable.** When you flag something, you have to be able to
  walk back to the exact log line that justified the flag —
  otherwise the finding can't be defended in a meeting.
- **Composable.** The defense built today should be the foundation
  for the defense built tomorrow, not a bespoke artifact thrown
  away after the incident.

> Bots don't sit still. The defense that sits still loses.

## The shape of the rest of this deck

Slide 2 — how a single locked-down machine with no API budget can
run this kind of scanning today, using any chat AI in the browser.

Slide 3 — what it looks like when an API key plugs in and the
loop runs without a human in the middle, with full evidence
persisted for audit.

Same architecture, same prompts, growing scope.

> Build defense the same way attackers build offense: in stages,
> learning forward, never throwing the previous rung away.
