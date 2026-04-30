# 06 · The mech suit meta

## A multi-agent project built with multi-agent methods

threat-trace is a multi-agent pipeline. It is also the product of a
multi-agent development methodology. The same pattern that runs in the
tool runs in its construction.

This is not coincidence. It is the **Mech Suit Methodology** —
a deliberate division of cognitive labor between human, architectural
AI, and execution AI, each operating at the level where it adds the
most value.

> The same discipline that makes the pipeline work makes the
> development of the pipeline work.

## Three layers, three roles

**Layer 1 — Human.**
The human owns intent, strategy, and architectural judgment. In
threat-trace, that meant deciding what problem to solve (the bot
attack), who the audience is (a colleague with limited AI experience),
what constraints matter (zero install, browser-only), and which
trade-offs to accept (synthetic data over real, in-memory over SQLite,
artifact over CLI).

These decisions cannot be delegated. They require context the AI does
not have — relationships, history, organizational politics, taste.
They are the most valuable five percent of the work.

**Layer 2 — Architectural AI.**
A reasoning model used as a thinking partner for design decisions.
Loaded with relevant context, used in conversational mode, asked to
critique proposals, push back on weak choices, and sketch
alternatives. The output is design documents, contracts, and clear
specifications — not code.

For threat-trace, this layer produced the pipeline shape, the
deterministic/model split, the contract definitions, the fixture
scenarios, and the handoff document. Every architectural choice in
this collection was negotiated here before any code was written.

**Layer 3 — Execution AI.**
A code-generation agent (Claude Code or equivalent) handed
fully-specified work units. It does not need to make architectural
decisions because the architectural decisions are already made. It
does not need broad context because the handoff document carries the
context it needs.

The execution layer translates schemas into Zod, parsers into
TypeScript, prompts into runnable strings, and React skeletons into
working components. It executes against fixtures the architecture
layer authored.

## Why the layers matter

The temptation is to skip the middle layer. Hand the LLM a problem
description and let it solve everything. This works for small,
self-contained tasks. It fails for anything that needs to make
trade-offs across multiple constraints because the model has no
durable mental model of the problem — every prompt is a fresh start.

The temptation in the other direction is to skip the execution layer.
Have the architectural AI also write the code. This works briefly but
the conversation grows unmanageable as implementation details
accumulate. The architectural reasoning gets diluted by syntax
debugging.

The three-layer split isolates the failure modes. Architectural
decisions live in one channel, written down. Execution lives in
another, taking specifications as input. The human sits above both,
moving work between them.

> Specialization is for the agents, not just for the agent system.

## What the handoff looks like

The transition between layer 2 and layer 3 in threat-trace is a
single document: `HANDOFF.md`. It contains:

- The origin (why the project exists)
- The architecture (what was decided)
- The pivots (what was tried and abandoned, and why)
- The stack philosophy (defaults to respect)
- The constraints (artifact API limits, etc.)
- The contracts (every type the system uses)
- The fixture status (what's authored, what isn't)
- The roadmap (ordered list of remaining work)

Plus a kickstart prompt that explicitly tells the execution AI:

- Read the handoff first
- Do these specific items
- Stop and report back
- Flag anything that smells wrong before coding

The execution AI does not need to be brilliant — it needs to be
disciplined. The handoff makes discipline easy by making the next
action obvious.

## The pattern generalizes

The Mech Suit Methodology is not specific to threat-trace. It is a
general pattern for any non-trivial AI-assisted build:

- Use the architectural AI for *thinking* — design, critique,
  synthesis
- Use the execution AI for *doing* — code, tests, scaffolding
- Use the human for *deciding* — what to build, what to ship, when
  to stop
- Use written handoffs at every layer transition

The cost of writing the handoff is repaid every time the execution AI
asks a question it doesn't need to ask, or makes an assumption that
turns out wrong, or fails to respect a constraint. The handoff is
both a specification and an alignment mechanism.

threat-trace is a small example. The pattern works at any scale where
the cost of misalignment exceeds the cost of writing the handoff.

> Build the system that builds the system, then build with both.

## What this collection is, viewed from above

The eight documents you are reading were themselves produced as part
of this methodology — generated as part of the architectural layer's
output, designed to feed into both NotebookLM (an additional
synthesis tool) and a slide deck (a presentation artifact). Each
transition is explicit. Each output is reusable.

The deliverable is not just the pipeline. The deliverable is the
trail.
