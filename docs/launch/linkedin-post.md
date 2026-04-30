# LinkedIn post — threat-trace launch

**Char count: ~1900 / 3000 LinkedIn limit. The first two lines (~130 chars) sit above the "see more" fold and carry the hook.**

---

Your AI security tooling is probably one prompt at a time.

The attackers running campaigns against your stack are not.

threat-trace is what the composed-signals version looks like. Three log streams under attack — an edge tier (CDN / WAF; fixture shaped from Cloudflare logs, contract adapts to Fastly / Akamai / CloudFront), an identity tier (logins; fixture shaped from Auth0 logs, contract adapts to Okta / Cognito / Keycloak / Entra ID), an api tier (application traffic; Azure App Insights AppRequest shape, the same surface a Node service / microservices stack / .NET monolith all emit). Three discrete agents reasoning over each in isolation. A cross-stream layer that catches the false-positive trap a naïve scanner walks straight into: two routine token-expiration 401s in the api tier MUST NOT be lumped in with the unrelated password spray happening at the same time. Catching the real attack is the obvious win. Refusing to invent the correlation is the quiet win — and the one that earns trust in a post-mortem.

The architectural claim: deterministic skeleton, model only where pattern-naming earns its keep. Typed contracts at every seam. Every recommended action carries its evidence chain back to the specific raw log lines that justified it.

It ships free. As a working pattern, complete, with every seam visible. Building this isn't the hard part — knowing it needs to exist is. Every defender running a stack against the modern bot wave should already have one. Most don't. That's the gap this closes for anyone who walks the demo.

→ Live demo (single self-contained HTML, no install, ~15 minutes start to finish): steppeintegrations.com/articles/threat-trace

→ Source (MIT): github.com/steppe-integrations/threat-trace

→ Deck (~5 minute read): attached

Take it. Fork it. Fold it into your stack. Beat me to the next slice.

---

## Attachment for the post

`docs/launch/Architecting_Agentic_Defense.pdf` — ~13 MB, 12 slides. LinkedIn renders PDFs as native swipeable carousels. Upload it as a "Document" attachment when composing the post.

(To regenerate from a fresh pptx: `npx tsx scripts/pptx-to-pdf.ts <new-pptx> docs/launch/Architecting_Agentic_Defense.pdf`. The script extracts one PNG per slide from the pptx and stacks them into a PDF — NotebookLM's native PDF export works too if you'd rather skip the script, but the script keeps the result reproducible from the source pptx.)

## Hashtag suggestions (optional)

If you want them, conservative picks aligned with your existing posts: `#AppSec` `#AIEngineering` `#SOC` `#MultiAgent` `#Cybersecurity`. LinkedIn's algorithm slightly favors 3-5 tags. Skip them entirely if you'd rather not — the post stands on its own.

## Comment-pin candidates (for after publishing)

A self-comment pinned to the top of the thread can carry context without bloating the original post. Two options worth considering:

> *"For anyone who'd rather paste their own log shapes than walk the synthetic fixture: the three parsers (`parsers/edge.ts`, `parsers/identity.ts`, `parsers/api.ts`) emit a normalized `ParsedEvent` contract. Stream roles are abstract — bring Fastly or Akamai or CloudFront for the edge tier, Okta or Cognito or Keycloak or Entra ID for the identity tier, OpenTelemetry-style application logs for the api tier. Everything above the parsers is shape-agnostic."*

> *"The 'compose, don't smear' rule: cross-stream correlation happens at exactly one designated layer (the trend agent), not bleeding across every prompt. That's the structural guard against the false-positive cascade. The expectation panel's load-bearing negative check fires the moment a model output slips."*

Either of these works as a follow-up depth-add for engineers who scroll into the comments. Skip if it'd feel like over-explaining.
