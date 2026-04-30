# Exec Slide 4 · The asymmetry of the agentic era

## The gap that defines this moment

Attackers running campaigns against your stack right now are
**multi-step, multi-stream, adaptive**. They probe the edge,
pivot to the identity tier directly when the edge slows them down, rotate IPs,
swap user-agents, exploit legacy allowlists DevOps quietly accepted
two years ago. They orchestrate.

Defenders' AI tooling is still mostly: paste a log into Claude or
ChatGPT, ask "what stands out?" That is a **single-completion analyst
on a specialty task**. It is not a defense system.

> Single prompts catch single artifacts. Coordinated attackers
> compose signals across multiple systems. The defender working
> one prompt at a time is structurally outgunned.

That asymmetry is the defining condition of agentic-era security.
And it's invisible to anyone whose security tooling is still one
prompt at a time.

## Why single-prompt analysis fails the test that matters

A single prompt sees **one artifact**. The truth in a sophisticated
attack lives in **the relationship between artifacts**.

Three failure modes show up immediately:

- **No cross-stream evidence.** A bypass attack that walks past
  the edge to hit the identity tier directly leaves clean edge logs and
  a flood of identity failures with no obvious source. A single-stream
  prompt sees the flood; it never sees the bypass.
- **Hallucinated correlations.** Ask a single prompt to look at a
  30-minute window where a real attack and unrelated benign 4xx
  responses both happened, and it will reach for correlation. There
  is no native concept of "these signals are independent." That
  habit is the cross-stream false-positive trap.
- **No defensible chain.** When the AI says "block this IP," can
  you walk back to the specific log lines that justified the
  recommendation? Single-prompt outputs don't carry that provenance.
  In a post-mortem, you can't show your work.

> If your tooling can't say "here are the thirty raw log lines
> that prove it," your tooling can't be trusted in the room
> where decisions get made.

## What "agentic defense" actually means

The shape of the defense has to match the shape of the attack:

- **Typed contracts at every seam.** Parsers emit a single
  ParsedEvent shape regardless of source. Agents consume contracts,
  not raw logs. The next-slice agent gets parseable input by
  construction, not by hope.
- **Specialization per stream.** Each log source has its own agent
  reasoning over its own structure. The agent never speculates
  about what's happening in another stream.
- **A composition layer that earns its name.** Cross-stream
  correlation happens at exactly one designated layer — not
  bleeding across every prompt — and emits findings that cite
  evidence from each source it correlates.
- **Provenance from the deepest finding back to the raw line.**
  Every action item carries chain-of-IDs through the trend, the
  summary, the hint, the parsed event, to the specific log entry.
  Click any action; walk the chain.

## What changes once the shape changes

You stop asking the model the wrong question. "What stands out
in this log?" becomes "what does this stream look like, and only
this stream?" Cross-stream is a composition layer's job, not a
single prompt's. False-positive cascades become catchable by
construction.

> The defender working with composed signals is no longer
> outgunned. They're working at the same level of orchestration
> the attacker is.

The gap is closing only as fast as defenders learn what's
possible. That's why the next two beats of this deck show
exactly what possible looks like — running, in your browser, in
fifteen minutes.
