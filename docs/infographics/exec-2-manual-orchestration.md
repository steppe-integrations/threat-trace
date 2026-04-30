# Exec Slide 2 · Manual orchestration: use the AI you already have.

## The constraint that drives the design

Most security teams cannot install new tools, run new daemons, or
paste corporate data into new APIs. The IT-ticket time alone is the
end of any urgent investigation. **A locked-down corporate laptop
is the worst-case starting point — and it is the most common one.**

What every locked-down laptop *can* do: open a browser. Open
Claude.ai or ChatGPT or Gemini in another tab. Copy. Paste.

Stage 1 of threat-trace is built around exactly that constraint.

## How it ships

A single self-contained HTML file. Email attachment. Double-click.
Runs from `file://` directly — no install, no server, no
credentials, no API key. The web app is the runbook.

The browser tab shows three streams of logs (edge / Cloudflare,
identity / Auth0, Azure App Insights for the API tier). For each
stream, the app shows a fully-rendered prompt
with a copy button. The user pastes that prompt into a chat AI of
their choice. The chat AI replies with a JSON object describing
anomalies. The user pastes that JSON back into the web app. The
app validates the schema, runs expectation checks, and explains in
plain English what the AI found, what it should have found, and
what to conclude.

> The web app *is* the runbook. The human is the orchestrator.

## Model-agnostic by design

Whatever chat AI the user has access to works:

- **Claude.ai** — free tier with daily limits is enough.
- **ChatGPT** — free tier works; canvas mode improves the
  copy-paste flow.
- **Gemini** — copy JSON out of the chat reply.
- **Local models** — Ollama, LM Studio, anything that takes a
  prompt and returns text.

Same prompt body in every case. The web app doesn't care which
model produced the JSON — only that the JSON validates against
the schema.

## What the user actually sees

Three stream cards stacked on the page. For each one, three
numbered steps:

1. **Copy this prompt.** A button. The prompt is right there.
2. **Paste the AI's JSON reply here.** A textarea. Auto-validates.
3. **What the checks tell you.** Plain-English verdict — pass or
   fail — with explanation, contrast, and a one-sentence conclusion
   the user can take to a meeting.

When all three streams turn green, a synthesis block appears:

> **Attack identified: Password spray from 185.220.101.42 targeting
> 30 users.** Block IP at the edge. Audit affected user accounts.
> Ignore unrelated API token expirations.

That sentence is the deliverable. The director walks away with a
finding, not a tool.

## Why this is Stage 1, not the whole product

Stage 1 proves the loop. The user has now seen — by walking it
themselves — what the pipeline does, why each step exists, and why
the negative checks matter. They understand the loop because they
*were* the loop.

Stage 2 plugs in an API key and the AI runs the loop automatically.
The user still trusts it because they already saw it work by hand.

> You don't need a budget to start. You need a browser.
