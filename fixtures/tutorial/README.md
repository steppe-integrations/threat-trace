# Tutorial fixture

Three log streams covering a 30-minute window
(`2026-04-28T14:00:00Z` to `2026-04-28T14:30:00Z`) for fictional company
**GasperCards**.

## Fixture data shapes (and what's vendor-specific vs. role-specific)

The pipeline operates on three abstract stream **roles** — `edge`,
`identity`, `api` — defined in `contracts/artifacts.ts`. Everything
above the parser layer is vendor-agnostic.

The fixture data ships in three well-documented public log shapes:

- **edge** uses Cloudflare's GraphQL Analytics
  `httpRequestsAdaptiveGroups` schema (`rayName`, `clientIP`, `clientASN`,
  `wafAction`, `botScore`, …). The parser `parsers/edge.ts` adapts to any
  CDN/WAF edge product — Fastly, Akamai, CloudFront, Bunny — by replacing
  the per-vendor field-mapping inside `parse` while keeping the output
  contract identical.
- **identity** uses Auth0's tenant log shape (short opaque event-type
  codes like `fp` / `s`, plus `connection` / `client_id` / `user_name`).
  The parser `parsers/identity.ts` adapts to Okta, Cognito, Keycloak,
  Entra ID, FusionAuth, or any provider that emits structured login
  events.
- **api** uses Azure App Insights' AppRequest envelope
  (`customDimensions`, `operation_Id`, `resultCode`, `duration`). This is
  the same shape a Node service, microservices stack, or .NET monolith
  emits via OpenTelemetry-style logging — same parser approach works
  across them.

Cloudflare / Auth0 / App Insights were chosen for the fixture data
because their schemas are the most well-documented and reviewable
public references at each tier — not because the pipeline is tied to
any of them.

## What's encoded

A password-spray attack against the GasperCards identity tenant. The
attacker (185.220.101.42, TOR exit, German geoIP) scraped 30 employee
names from LinkedIn and hits each one with a common password
(`Spring2026!`) at ~3-second intervals between 14:00:03 and 14:01:30 UTC.

GasperCards uses a custom identity-tenant domain
(`auth.gasper-cards.example`) fronted by an edge tier, so attack traffic
IS visible at the edge. No WAF rule fires because `/u/login/*` is in
`log` mode — that's the trade-off DevOps made. The identity stream
records 30 `fp` (Auth0's failed-password code; a different provider's
fixture would emit the equivalent of the same role) events from the
same IP. **The api tier records nothing related to the attack** — the
spray hasn't succeeded.

Background traffic includes three legitimate users (Alice, Bob, Carol),
health-check probes, static asset fetches, normal api calls, and two
unrelated 401s from a user with an expired token. These exist so the
pipeline has to *separate* the signal from the noise rather than just
read the only events present.

## Files

| File | Stream | Events | Notes |
|---|---|---:|---|
| `edge.json` | edge tier (Cloudflare GraphQL Analytics shape) | 50 | 30 attack POSTs + legit user web traffic + health checks + static assets |
| `identity.json` | identity tier (Auth0 tenant log shape) | 34 | 30 attack `fp` + 3 legit `s` + 1 legit `fp` (Carol typo) |
| `api.json` | api tier (Azure App Insights AppRequest shape) | 22 | All legit; 2 unrelated 401s from token expiration |

Each file has the shape:

```json
{
  "source": "edge" | "identity" | "api",
  "query": "<the query that produced this>",
  "time_range_start": "2026-04-28T14:00:00.000Z",
  "time_range_end":   "2026-04-28T14:30:00.000Z",
  "events": [ ... ]
}
```

## Expected pipeline output

This fixture is the canonical "did it work end-to-end" check. A correct
run should produce **one primary action item**, traceable through the
provenance chain to specific event IDs.

### What the trend agent should find

> **30 failed identity-tier logins from `185.220.101.42` between
> 14:00:03 and 14:01:30 UTC, all distinct usernames, with corresponding
> edge requests not blocked by the WAF (`wafAction: log`). Same actor
> identified by IP, ASN (TOR-EXIT, 4224), and user-agent
> (`HTTrack 3.0x / Windows 98`). api stream uncorrelated. Suspected
> password spray.**

### What the action agent should produce

1. **P1 — Block `185.220.101.42` at the edge.** Adversary actively
   targeting identity endpoints from a known TOR exit. Owner: devops.
2. **P1 — Audit affected users.** 30 distinct accounts hit; verify none
   succeeded and force password resets if any have weak passwords.
   Owner: security.
3. **P2 — Tighten WAF posture on `/u/login/*`.** Path is currently in
   `log` mode; promote to `block` for known TOR exits and HTTrack-class
   user agents. Owner: devops.
4. **P3 — Monitor api for follow-up.** Spray was unsuccessful in this
   window but the actor may pivot. Watch for elevated 401 rate or
   anomalous geo on `api.gasper-cards.example`. Owner: api.

### What the pipeline should NOT produce

- Any finding tying the api 401s to the attack. Those are legitimate
  token expiration (`FailureReason: TokenExpired`) for an authenticated
  user. If the trend agent flags them as related, the prompt is too
  aggressive about cross-stream correlation.
- Any finding tying Carol's single `fp` to the attack. She's on
  a different IP (`203.0.113.117`), different UA (Chrome), and gets in
  on the retry 15 seconds later. If the trend agent flags her, the
  prompt is matching on event type alone instead of actor fingerprint.

These two negative checks are the real validation. Finding the spray is
table stakes; *not* hallucinating beyond it is the test.

## Regenerating

```bash
python3 generate_tutorial_fixture.py
```

Edit the constants at the top of the script to vary the attacker IP,
target list, time window, or volume of background traffic.
