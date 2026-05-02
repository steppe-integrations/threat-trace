# ADR-002: BYOK-only — no auth, no proxy, no billing

## Status

Accepted (Sprint 1, 2026-05-01)

## Context

The hosted reference deployment ([ADR-001](001-path-c-open-framework-hosted-reference.md)) needs an Anthropic API call path. Three options:

1. **BYOK (bring your own key)** — user pastes their Anthropic key; browser calls `api.anthropic.com` directly.
2. **Proxy + managed key** — server-side proxy that authenticates the user, calls Anthropic with a Steppe-owned key, charges the user (or absorbs the cost).
3. **Hybrid** — BYOK by default, paid tier with managed key.

Option 2/3 require: auth (Clerk/Auth0/Supabase Auth), DB (user accounts), Stripe, rate limiting, abuse mitigation, key rotation, on-call for the proxy, refund policy. Substantial product surface. Substantial recurring cost.

Option 1 has none of that. The user pays Anthropic directly. Steppe pays nothing for usage. There's nothing to break that has Steppe's name on the pager.

The hosted reference's primary job is **demonstration**, not transaction. Target user is a technical adopter who already has (or can easily get) an Anthropic key. They're not going to balk at pasting one.

## Decision

BYOK only for the hosted reference. No auth system. No proxy. No billing. The user pastes a key into the gear-icon settings drawer; the key lives in browser memory only (never persisted to localStorage, never included in exports). All API calls go browser → `api.anthropic.com` directly using `dangerouslyAllowBrowser: true`.

## Consequences

- Zero ongoing cost for Steppe to run the hosted reference (Cloudflare Pages free tier covers it indefinitely).
- Zero abuse surface — no shared key to drain.
- Zero downtime risk from a managed-key outage.
- Users who don't have an Anthropic key can't try the hosted version (acceptable for the technical-adopter target; non-technical onboarding is out of scope for Sprint 1).
- The "key in browser memory" architecture is structural — `state.runtime.apiKey` is excluded from `InvestigationFile`, `buildExportPayload`, and the localStorage write. Cannot leak through any export path even by accident.
- If we ever need a managed-key path (enterprise sale, regulated deploy), it's a clean additive path: build a proxy alongside, leave the BYOK flow intact for everyone else.

## Alternatives considered

- **Proxy + managed key**: rejected for Sprint 1 — too much operational surface for a demo. Reconsider once a paid customer requests it.
- **Hybrid**: rejected — adds the SaaS complexity without removing the BYOK complexity. Pick one for now.
- **Sealed-key bundle**: a separate distribution path (the `npm run seal-key` flow) lets the founder ship a single-file build with a key sealed against a question. That's for personal handoffs, not the hosted reference.

## See also

- [src/lib/api-client.ts](../../src/lib/api-client.ts) — the only place a key crosses from React state to a network-bound object.
- [docs/strategy/01-feature-vs-product-validation.md](../strategy/01-feature-vs-product-validation.md) — the buyer research that informs whether BYOK is enough.
