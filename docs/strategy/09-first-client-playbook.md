# 09 — First client playbook

## Purpose

The user just pivoted to "I hadn't considered selling this." The first client is the hardest one — and **it determines everything**: positioning, product shape, references, terms, what the second client looks like. This needs a deliberate playbook, not "spray and pray." This brief lays out the **design-partner motion** as the right shape for client #1.

## Key questions

- What's the first client **profile** (vertical, size, persona, pain, budget, regulatory pressure)?
- What's the **offer** — software license? Pilot? Consulting engagement with software included? Free design partnership?
- What's the **price** — free pilot? $25K? $100K? $250K?
- What do we ask **in return** — case study, testimonial, design partnership, co-marketing rights, public reference?
- How do we **find them** — warm intros, content/inbound, conferences, cold outbound?
- What does **success of the first engagement** look like, concretely?

## The "design partner" framing

The first sale should not be a finished product. It should be:

> "We have a working reference implementation in security ([threat-trace](../README.md)). We want to port it to **your domain** with you as a design partner. **You** get the working tool, your team gets to rehearse the AI agent's role before [vendor X] arrives, and your name on a regulator-ready competency artifact. **We** get to publicly cite you, learn your domain, and build the second vertical."

Key terms of a design partnership:
- 4–6 hours of their time over 30 days, in 2-hour blocks
- Discounted or free price (the case study is the consideration)
- Public-reference rights (get this in writing upfront, not after)
- 90-day exclusivity in their sub-vertical (we don't sell to direct competitor during build)
- Written scope of what's portable (kept) vs what's bespoke (left in their fork)

## Ideal first-client profile

- **Mid-market** ($500M–$5B revenue) — faster decisions than F500, more budget than startups, less procurement theater
- In a vertical we have a **strong thesis on** — AML (brief 02) or radiology (brief 03) most likely; insurance claims is a credible third
- Has a **champion** — mid-level leader (BSA Officer, Director of Compliance, Risk Management VP) who's already pushing AI internally and getting heat
- Has a **regulatory deadline or audit on the horizon** in next 6–12 months (urgency)
- Willing to be a **public reference** — without that, the engagement isn't worth doing for free
- **Underserved by current vendors** — frustrated with vendor lock-in, distrustful of AI vendor claims

## GTM motion options (ranked by founder-leverage fit)

1. **Warm intros via Steppe network** — highest yield per hour, plays directly to stated leverage ("knowledge, connections"). Build a list of 30 people who could intro to a relevant CCO/CISO/Chief Claims/CMO. Send 30 personalized asks.
2. **Public artifacts that draw inbound** — publish threat-trace publicly with a strong narrative (LinkedIn post, HN post, Substack, conference talk, infographic series — note: `docs/infographics/` already exists, leverage it). Inbound from the *right* people will come naturally. Compounds over time.
3. **Vertical conferences as design-partner hunting ground** — ACAMS (AML), RSNA (radiology), RIMS (insurance risk), Black Hat / Defcon / RSA (security). Walk the floor with a clear ask, not a generic pitch.
4. **Cold outbound** — lowest-yield given founder leverage profile. Deprioritize unless other channels stall.

## Talking prompts (design partner pitch)

- **Opener**: "We're building a tool that lets your team experience what an AI [agent role] will do, before you deploy it — clicking through the workflow with full traceability, learning to spot where the AI gets it wrong. We have a working reference in security. We want to port it to [your domain] with a design partner who'll help us shape it for your reality."
- **The qualifier**: "Is your team currently being asked to evaluate AI agents in [domain]? What's painful about that?"
- **The ask**: "Would you spend 4 hours over the next month with my team — 2 sessions, 2 hours each — to shape the first build? In exchange you get the working tool for your team, plus we publicly cite you when we ship."
- **Pre-empt the "what's the catch"**: "We're discounting / waiving the price because the case study is what we need. We're not asking for product feedback in exchange for nothing — we're trading the build for the reference."
- **Close**: "If this isn't a fit for you, who at [your network] would you point me to?"

## Decision tree

| 30 days from now | Read |
|---|---|
| 1–2 design partners signed | Ship MVP, run the engagements, publish 1 case study by day 90, then commercial sales motion |
| 0 design partners after 4 weeks of active outreach | Diagnose: wrong vertical, wrong pitch, or wrong premise. Don't push harder; iterate. |
| Many "interested but not now" | Probably a real signal that **timing is off** — buyers see the value but it's not Q3 priority. Revisit briefs 01 and 05. |
| 1 partner who keeps moving the goalposts | Pull out gracefully. First clients can swallow founder-time and still not deliver the case study. Cap losses. |

## Starter steps (this week)

1. Build the **30-person warm-intro list** — names + how you know them + who they could intro you to. Spreadsheet.
2. Draft the **1-page pitch** (value, ask, timeline) — keep it printable and shareable.
3. **Publish threat-trace publicly** with a sharp narrative — leverage existing `docs/infographics/` and `docs/launch/linkedin-post.md`. Post on LinkedIn and HN within 7 days.
4. Identify **1 vertical conference** in next 90 days — register, plan the 1-on-1 ask.
5. **Ship Stage 3 in threat-trace UI** — the demo needs to be undeniable. The recon noted Stage 3 is built but not wired. This is the highest-leverage product work for first-client conversion.
6. Decide who's the **champion-finder** — the person whose job for the next 30 days is "get me 5 booked calls with directors-or-above in [vertical]." If it's the founder solo, scope accordingly.

## Risks / caveats

- **Design-partner motion can swallow founder-time** — cap at 2 partners for the first cohort. More than 2 = no progress on the framework.
- **"Free pilot" trains buyers to expect free product.** Use *design partner* language with explicit case-study consideration; don't say "free pilot."
- **First client biases the product** toward their idiosyncrasies. Compensate with a deliberate "what's portable, what's bespoke" review at the end of the build.
- **The case study isn't valuable unless they'll go on the record** — get publicity rights signed upfront, before any work starts. After-the-fact permission is a coin flip.
- **Public launch before the demo is undeniable** wastes the launch. Ship Stage 3 first, then post.
- The right first client is **not** the most enthusiastic — it's the one with the clearest **regulatory deadline** and the **director-level decision authority**. Filter for those.
