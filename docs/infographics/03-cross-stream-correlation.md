# 03 · Cross-stream correlation

## Three streams, one truth

threat-trace observes a system through three independent log streams:

- **Edge** (CDN / WAF tier; fixture shaped from Cloudflare logs) — what arrives at the perimeter
- **Identity** (login / authentication tier; fixture shaped from Auth0 logs) — what authenticates
- **API** (application tier; fixture shaped from Azure App Insights) — what gets served

Each stream is partial. Each stream lies by omission. Only the
intersection tells the truth.

> A single stream is a single point of view. A single point of view is
> always a story, not a record.

## What each stream knows

**Edge knows traffic.** Every HTTP request, every WAF action,
every IP, every ASN, every user-agent. It does not know whether an
authentication succeeded, what API endpoint was eventually hit, or
whether the user was who they claimed.

**Identity knows authentication.** Every login attempt, every failure reason,
every user ID, every connection used. It does not know whether the
traffic that produced the login attempt came through the edge, hit
the API, or even reached an application surface.

**API knows business outcomes.** Every endpoint hit, every status
code, every authenticated user, every customDimension. It does not
know whether the request came through the front door or skipped the
identity check entirely.

No stream is wrong. Each is incomplete. The work of the trend agent is
to compose them.

## What single-stream analysis misses

Consider the attack pattern from the originating story: an attacker
bypassing the edge to hit the identity tenant directly.

**Looking at the edge alone:** clean. No suspicious traffic. The WAF
shows nothing because no traffic ever crossed the edge.

**Looking at the identity stream alone:** confusing. A spike of failed logins from
unfamiliar IPs. Could be a misconfiguration, a load test, a developer
debugging — or an attack. Without context, you cannot tell.

**Looking at the API alone:** misleading. Either nothing at all
(attack hasn't succeeded yet) or unrelated 401s from token expirations
that look superficially similar to attack signal.

**Looking at all three together:** the truth is obvious. Identity
attempts without corresponding edge ingress is, by definition, a
direct origin hit. That correlation is invisible to any single-stream
view.

This is the point of the architecture. Not to look at more data — to
look at the *relationships* between data sources.

## Time-bucketed correlation

The trend agent's core operation is alignment by time window. Default
bucket: 5 minutes. For each bucket, the agent compares:

- What did the edge see?
- What did the identity tier see?
- What did the API see?

And asks the diagnostic questions:

- Are the volumes proportional? Edge 1000, identity 50, API 50 is
  expected. Edge 0, identity 50, API 0 is suspicious.
- Are the actors aligned? Same IPs, same ASNs, same UAs across
  streams?
- Are the outcomes consistent? Identity failures should produce no API
  activity. Identity successes should produce some.

These are mechanical checks. The model does not need to be brilliant to
perform them — it only needs the right structured input. This is why
parsing is deterministic and stream summaries are short. Both choices
free the trend agent to focus on the correlation, not the extraction.

## The five killer signals

The incident fixture (still to be authored) will encode five patterns
that emerge only from cross-stream correlation:

1. **Identity web-flow events without edge ingress** — direct origin
   hit (the attack from the originating story)
2. **Edge-blocked IPs successfully authenticating in the identity tier
   minutes later** — bypass succeeding in real time
3. **API 401 spike without identity failure spike** — token
   forgery/replay, validation happening locally against signing keys
4. **Whitelisted edge path receiving 50× baseline traffic** —
   a forgotten allowlist becoming the attack surface
5. **IP rotation across all three streams over time** — adaptive bot
   behavior, single fingerprint reappearing under different
   identities

None of these is detectable from one stream. All of them are obvious
in three.

> The streams disagree by design. The defender's job is to compose
> them.
