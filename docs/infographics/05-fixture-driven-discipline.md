# 05 · Fixture-driven discipline

## The test data is the real spec

threat-trace ships with fixtures before it ships with prompts. This is
not an accident. The fixtures encode what the system must find — and,
just as importantly, what the system must refuse to find.

> Finding the spray is table stakes. Not over-correlating is the test.

## The tutorial fixture

A 30-minute window of synthetic GasperCards traffic. Three log files,
106 events total:

- `edge.json` — 50 events
- `identity.json` — 34 events
- `api.json` — 22 events

Inside the noise sits one deliberate pattern: a password spray attack
from a single TOR exit IP (`185.220.101.42`, ASN 4224) hitting 30
GasperCards employees with a common password between 14:00:03 and
14:01:30 UTC. The attacker scraped the employee list from LinkedIn —
all 30 users actually exist in the tenant.

The pattern is visible in two streams:

- The edge stream records 30 POSTs to `/u/login/password` from the attack
  IP (fixture shaped from Cloudflare logs). The WAF is in `log` mode
  for this path (a trade-off the fictional DevOps team made), so
  nothing is blocked.
- The identity stream records 30 `fp` (failed password) events from
  the same IP, same user-agent, distinct usernames (the fixture uses
  Auth0's `fp` code).

The API tier (Azure App Insights) records nothing related — the spray hasn't succeeded.

## The expected finding

A correct pipeline run produces one primary trend:

> "30 failed identity logins from `185.220.101.42` between 14:00:03 and
> 14:01:30 UTC, all distinct usernames, with corresponding edge
> requests not blocked by WAF. API stream uncorrelated. Suspected
> password spray."

And four ranked action items:

- **P1** — Block `185.220.101.42` at the edge
- **P1** — Audit affected users (force password resets)
- **P2** — Tighten WAF posture on `/u/login/*`
- **P3** — Monitor API for follow-up activity

This is the *floor*. Any competent prompt finds this. The discipline
lives in what happens around the obvious finding.

## The two negative checks

The fixture deliberately includes two traps. The pipeline must produce
the correct findings *without* triggering on either.

**Trap one: Carol's typo.**

Carol Diaz, a legitimate user, mistypes her password at 14:18:00 from
her home IP (`203.0.113.117`), Chrome user-agent. The identity stream
records a single `fp` event (Auth0's failed-password code). Fifteen
seconds later she retries successfully and the session proceeds
normally — API calls follow.

A naive trend agent looks at "identity fp events" as a category and lumps
Carol in with the spray. That is wrong. The spray attempts share a
fingerprint (TOR IP, ASN 4224, HTTrack UA). Carol shares none of them.
Distinguishing them requires *actor fingerprinting*, not event-type
matching.

**Trap two: the API 401s.**

A different legitimate user, already authenticated before the
fixture's window opened, hits the API at 14:09:33 and 14:09:44 with
an expired token. App Insights records two 401s with the
customDimension `FailureReason: "TokenExpired"`.

A naive trend agent sees "API 401 spike" and reaches for cross-stream
correlation. That is also wrong. The 401s are seconds apart from a
single user with an explicit token-expiration reason. Distinguishing
them requires *reading the preserved `extra` field*, which means the
parser had to preserve it in the first place. The discipline cascades
backward through the pipeline.

## Why this is prompt design, not just testing

Most teams treat test fixtures as a downstream artifact — write the
prompt, then test it. threat-trace inverts this. The fixture comes
first. Every prompt is written to satisfy *both* the positive
finding *and* the negative checks.

This forces specific prompt engineering choices:

- The hint agent prompt must reference actor fingerprint (IP + ASN +
  UA) explicitly, not just event types
- The trend agent prompt must require time-bucketed correlation, not
  cross-stream lumping
- Both prompts must instruct the model to consult the `extra` field
  when present
- The action agent prompt must require evidence_event_ids on every
  recommendation

Without the negative checks, none of these choices have a forcing
function. The prompts would work on the obvious case and quietly fail
on the subtle one.

> A prompt that finds the right thing for the wrong reasons will
> eventually find the wrong thing for the right reasons.

## Two fixtures, two pedagogies

**Tutorial fixture** — one obvious pattern, two clean traps. Validates
that the pipeline works end-to-end and that the negative checks hold.
This is the developer's "did I break anything" run.

**Incident fixture** (still to be authored) — five patterns layered,
multiple actors, IP rotation, cross-stream gaps that look like attack
surface. Validates that the pipeline scales to realistic incidents.
This is the "would this have caught the real attack" run.

The tutorial fixture is the test harness. The incident fixture is the
demo. Both are first-class engineering artifacts.

> Build the test before you build the thing. Then never let the test
> become optional.
