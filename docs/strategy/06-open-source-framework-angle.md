# 06 — Open-source framework angle

## Purpose

The founder's stated leverage is **"knowledge, connections, historic proof of being ahead of the curve."** That points toward an OSS or open-core play where threat-trace's pattern becomes a public framework: contracts-first, deterministic skeleton, model where it earns its keep, expectation-driven evaluation. The question: does OSS **amplify** the bet (compounding mindshare, attracting design partners, lowering CAC) or **commoditize** it (giving competitors the pattern for free, undermining willingness to pay)?

## Key questions

- Would a permissively-licensed `agent-rehearsal-kit` (parsers + expectation framework + traceability spine + reference fixtures) drive faster adoption than a closed product?
- What's the right OSS shape — MIT-licensed library, Apache framework, open-core with paid cloud, source-available?
- Who's the right OSS analog — **LangChain** (won mindshare, struggled to monetize), **DSPy** (academic / Stanford-led), **CrewAI** (commercial-first), **Pydantic** (foundation-first then enterprise), **dlt** (open-core that actually works)?
- Does OSS commoditize the founder's edge or amplify it (via being the trusted teacher of the framework)?
- What part is **inherently free** and what part can credibly stay paid — content, certification, hosted version, support, audit reports?

## Mech Suit Methodology angle

The pattern itself — contracts-first, deterministic skeleton, model where it earns its keep — is essentially what an OSS framework would teach. The pitch isn't "use our SaaS." It's **"build agent products this way; here's the reference implementation and the expectation-driven testing kit."**

That makes the OSS pitch unusually well-aligned with how the founder already builds.

## Who to talk to

- 1 OSS founder who went open-core successfully (Marc Klingen / Langfuse, the Pydantic team, the dlt team)
- 1 OSS founder who got commoditized (LangChain pre-Series A vibe; talk to anyone who shipped an "AI tooling" repo that hit 10K stars but couldn't sell)
- 1 enterprise buyer who chose **closed over OSS** — what was the deciding factor?
- 1 developer in target verticals (security, AML compliance engineering) — would they adopt this if open?
- 1 advisor who has watched the LangChain / DSPy / CrewAI / LlamaIndex arc and can compare

## Talking prompts

- **To enterprise buyer**: "If we open-sourced the rehearsal framework + reference parsers + expectation kit, would your team adopt it for an internal tool, or would procurement / security veto OSS for this use case?"
- **To developer**: "Where would you spend money even if the framework was free?"
- **To OSS founder who succeeded**: "What did you protect (content, hosted version, integrations, support) vs. what did you give away?"
- **To OSS founder who got commoditized**: "Looking back, what's the one thing you should have *not* open-sourced?"
- **To advisor**: "Is the framework category for AI agent governance / rehearsal already crowded, or is there a wedge?"

## Decision tree

| Path | Shape |
|---|---|
| **OSS framework + paid consulting + paid certification** | Fits founder's stated leverage best. Low capital. Slow but compounding. Bet on knowledge + reputation. |
| **OSS framework + paid cloud / managed service** | Traditional open-core. Needs more capital + engineering. Higher upside. Standard VC path. |
| **Closed-source SaaS only** | Highest defensibility on paper, lowest leverage given founder profile. Probably wrong fit. |
| **Source-available + paid hosted** | Middle ground. Lets you control distribution. Some communities reject it. |

## What to keep closed even if OSS

Possible levers (verify with conversations):
- Vertical-specific **content packs** (AML scenarios, radiology fixtures) — substantial work, sells separately
- **Certification / training program** — credentialing is a paid product even when the framework is free
- **Hosted version** with auth, multi-user, audit logs, SSO
- **Audit reports** as a service — overlaps with brief 10
- **Custom design-partner engagements** — the framework is free; building it for *your* domain is paid

## Starter steps (this week)

1. **Audit threat-trace** for what's already abstract enough to extract as a library. The recon (briefs section) suggests the contracts in `contracts/artifacts.ts`, `agents/expectations.ts`, and the parser interface are extraction-ready.
2. **Sketch an `agent-rehearsal-kit` README** — does it make sense to a stranger? Show it to one developer outside Steppe.
3. Watch what's happening in the **LangChain / DSPy / CrewAI / Langfuse** corner around expectation-driven testing and evaluation — is anyone already shipping this pattern as a library?
4. Decide one commitment:
   - Ship threat-trace publicly as the OSS reference + sell consulting/certification, **or**
   - Hold private, sell SaaS, lower mindshare ceiling.
   That decision drives the launch posture in brief 09.
5. If leaning OSS: pick license now (MIT default; Apache if patent concerns matter).

## Risks / caveats

- **OSS doesn't pay rent.** It needs a monetization layer that isn't undermined by the OSS itself. Common failure: OSS is great, paid layer is bolted on, customers don't see the gap.
- **Open-source acquihire** is a frequent exit and not always at good multiples. Knowing this in advance shapes how much capital to take.
- Could give competitors (Prophet / Dropzone) the **rehearsal pattern for free** — but if they were going to build it anyway, you've at least seeded the discourse and become the reference.
- "Just-OSS" plays often **over-index on stars** as a metric. Stars ≠ revenue. Track design partner conversions instead.
- If the framework becomes *too* generic, it loses the teaching/pedagogy edge that makes threat-trace good. Resist the urge to abstract everything — keep opinionated defaults.
