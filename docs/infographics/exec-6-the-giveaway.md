# Exec Slide 6 · Why this ships free

## The methodology that made it small

threat-trace was built fast. The pattern that made it fast is the
same pattern that makes it useful — and the same pattern any
serious defender's tooling already needs:

- **Deterministic skeleton.** Typed contracts, parsers, expectation
  checks, ID composition. Built once. Reusable across domains.
- **Model only where pattern-naming earns its keep.** The hint, the
  summary, the trend, the action — each is a discrete completion
  with a typed contract on the other side. Nothing about the
  skeleton requires the model to behave; the skeleton catches the
  model when it doesn't.
- **Observability first-order.** Every artifact carries provenance
  back to its source. There is no "the AI said so" without a chain
  of IDs that walks back to the raw log line.
- **Contracts at every seam.** The agent boundary is sharp. The
  model never sees raw logs; it sees parsed events. Cross-stream
  correlation happens at exactly one layer.

The skeleton is the multiplier. A new log source is a new fixture
plus a new prompt. A new agent stage is a new contract plus a new
prompt. The pipeline composes by construction, not by hope.

> Building this isn't the hard part. Knowing it needs to exist is.

## What this enables

Production-quality, defensible tooling at weekend speeds. Not
prototypes. Tooling that can sit next to a SOC analyst and earn its
seat: every finding is a typed artifact, every artifact carries
its provenance, every model call is bounded by a contract on
the other side.

The thing the field is mostly missing isn't the engineering
capacity to build this. It's the working pattern, demonstrated end
to end, with every seam visible.

## So this ships free

The world has shifted. Attackers run agentic, multi-stream
campaigns. Defenders need agentic, multi-stream tooling. The gap
is closing only as fast as people learn what's possible.

So threat-trace is given away. Not as a teaser for a paid product.
Not as marketing for a service. As **a working pattern, complete,
with every seam visible**, because every defender should already
have one of these.

> Everyone running a stack against the modern bot wave should have
> tooling that composes signals across systems and traces every
> finding back to a raw log line. Most don't. That's the gap this
> closes for anyone who walks it.

## Who this is for

- **Defenders** evaluating their stack against the agentic-era
  attacker. Walk the demo. If your existing tooling can't refuse
  the false-positive correlation the demo refuses, you have a
  measurable gap.
- **Builders** who want a working pattern, not a slide. The
  skeleton is portable. The fixtures are synthetic and replaceable.
  The agent prompts are tunable. The handoff guide walks an
  engineer through extending the pipeline one slice at a time.
- **Architects and directors** who need to know what the thing
  even looks like when it's built right. The demo is a teaching
  surface; walking it once, end to end, is faster than reading
  any specification.

## The invitation

Take it. Fork it. Fold it into your stack. Replace the synthetic
fixture with your own log shapes. Add a fourth stream. Swap the
model. Beat me to the next slice.

The handoff guide that ships with the source has the prompts an
engineer can paste into Claude Code or Cursor to revive the
full-pipeline UI, add SQLite persistence, or author a second
incident fixture. Each prompt is self-contained.

> The deliverable is the pattern, not the file. The file is just
> the cheapest way to put the pattern in your hands.
