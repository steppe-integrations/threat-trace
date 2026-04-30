# 00 · Preface

## What this collection is

Eight short documents that describe the architecture and design
philosophy of **threat-trace** — a multi-agent log analysis pipeline
built to demonstrate, in working code, what real multi-agent
orchestration looks like beyond simple prompt chaining.

Each document is self-contained and makes one focused argument. Read in
order, they tell a single story: from the operational pain that
motivated the tool, through the architecture that solves it, to the
methodology that produced it.

## Who this is for

Three audiences, in roughly this order:

- **Engineering leaders** evaluating whether their organization should
  adopt multi-agent patterns or stick with prompt engineering
- **Practitioners** who have been "throwing Claude at" problems and
  want to understand the next rung of the ladder
- **Anyone** trying to make sense of where AI-assisted development is
  actually going, separated from the marketing

No prior multi-agent experience required. The documents assume you can
read code but not that you've built an orchestration system.

## The throughline

A bot attack at a real company exposed a gap that prompt engineering
cannot cross alone. The defenders had access to powerful AI tools but
no framework for using them at the scale the incident demanded.
threat-trace is what closes that gap — a small, opinionated,
fixture-driven multi-agent pipeline that turns three streams of log
data into traceable, evidence-anchored findings.

The architecture is deliberately small. The discipline is deliberately
strict. The lesson is deliberately concrete.

## How to use these docs

Each document is structured for both reading and visual extraction:

- A clear thesis at the top
- 3-5 supporting sections, each anchored by specific numbers, named
  entities, or comparisons
- Quotable lines marked with blockquotes
- A closing observation that links to the next document

For NotebookLM infographics, each document produces one focused
visual. For a slide deck, sections within a document map to individual
slides; the documents in order map to deck chapters.

## The eight documents

| File | Topic |
|---|---|
| 00 · Preface | This document |
| 01 · The problem | The attack, the gap, the opportunity |
| 02 · Pipeline architecture | Six stages, two regimes, one DAG |
| 03 · Cross-stream correlation | Why three log streams beat one |
| 04 · Provenance and traceability | The evidence chain that makes findings trustworthy |
| 05 · Fixture-driven discipline | Why the test data is the real spec |
| 06 · The mech suit meta | How the project itself was built |
| 07 · Summary | The migration path forward |
