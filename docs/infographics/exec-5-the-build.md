# Exec Slide 5 · What the loop actually composes

## Three streams, one synthetic attack, and the test the demo is built around

threat-trace runs against three log streams from a fictional company
mid-attack:

- **Edge** (CDN / WAF tier; fixture shaped from Cloudflare logs).
  Sees a TOR-routed POST flood to a legacy login path that's still in
  log-only mode.
- **Identity** (login tier; fixture shaped from Auth0 logs). Sees
  thirty failed logins from the same IP across thirty distinct
  usernames in ninety seconds.
- **Azure App Insights** (api tier). Stack-agnostic on
  purpose: this is the same logging surface a Node service, a
  microservices stack, or a .NET monolith would emit. In this fixture
  it shows ordinary traffic and **two** isolated 401 responses from a
  legitimate user whose token expired.

The whole demo is built around one load-bearing test:

> **The two API token-expiration 401s must NOT be correlated with
> the password spray.** They share the time window, but they share
> nothing else — not the actor, not the IP, not the failure mode.
> A naïve correlator lumps them together. The pipeline has to not.

That negative check is the single most defensible thing a
multi-agent security pipeline can demonstrate. Catching real attacks
is the obvious win. Refusing to invent unrelated correlations is the
quiet win, and the one that earns trust.

## The pipeline composes in stages, each one typed

```
Raw Log → Parsed Event → Hint → Summary → Trend → Action Item
```

| Stage | Per stream or cross? | Where the work happens |
|---|---|---|
| Parse | Per stream | Deterministic. Same parser shape across all three. |
| Hint | Per stream | Model-backed. Names the pattern in one stream's data. |
| Summary | Per stream | Model-backed. ≤200-token narrative; names the actor. |
| Trend | Cross-stream | Model-backed. **Only** layer that composes evidence across sources. |
| Action | Cross-stream | Model-backed. Prioritized, owner-assigned, cites trends. |

The model only ever sees parsed events. It never sees raw logs. The
agent boundary is sharp. Cross-stream correlation lives at exactly
one layer — not smeared across every prompt — and that layer is
where the load-bearing negative check fires.

## Provenance is structural, not optional

Every artifact carries IDs back to its source:

- An action item cites the trend(s) it came from
- A trend cites the per-stream summaries it composed and the events
  in each stream it used as evidence
- A summary cites the hints it consolidated
- A hint cites the parsed events it flagged
- A parsed event cites the raw log line index

Click any final action item; walk back through the chain to the
specific raw log entries that justified it. **Defensible in any
post-mortem.**

## The director takeaway, made unmissable

After ~15 minutes walking the demo (manually pasting prompts into
any chat AI), or ~30 seconds running it automated through an API
key, the panel produces four sentences:

> **This is a password spray from 185.220.101.42 targeting 30 users.**
> **Block the IP at the edge.**
> **Audit the affected user accounts.**
> **Ignore the unrelated API token expirations.**

That last line is the demo's spine. Most tools don't have a
mechanism to say "ignore this." Most tools, asked the same
question with the same data, would have flagged the 401s. The
expectation panel beneath each stream evaluates the model's
output against that load-bearing rule and turns red the moment
it slips.

## Walking it yourself

The whole demo is **one self-contained HTML file** that opens in
any browser. No install. No server. No telemetry.

- **Phase 1 (free):** copy each stream's prompt, paste into
  Claude.ai / ChatGPT / Gemini, paste the JSON reply back into the
  page. The expectation panel evaluates each response in real time
  and explains in plain English what the AI got right or wrong.
- **Phase 2 (Anthropic API key, pennies per run):** click Run on
  each card; Sonnet 4 returns a JSON finding in about ten seconds.
  Same UI, same prompts, same expectations. Edit the prompt before
  running and watch the expectation panel react.

The teaching surface and the deliverable are the same surface. By
the time a director has walked the loop, they have seen exactly
what an agentic-defense pipeline does and why a single-prompt
scanner can't replicate it.
