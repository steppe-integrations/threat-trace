# 05 — Six-month window pressure-test

## Purpose

The founder's working frame is: **"~6 months until turnkey AI agents commoditize this."** That window sets urgency, GTM tempo, fundraising posture, hiring plan, and whether to chase product or framework. If wrong in either direction, the strategy needs to change. The window is also probably **different per vertical** — security ≠ AML ≠ radiology — so the pressure-test should be vertical-specific, not global.

## Key questions

- **Security**: is "turnkey agentic SOC analyst" really 6 months out, or is it already shipping (Prophet / Dropzone / Torq in production today)? What % of alerts are agents *actually* adjudicating end-to-end vs. assisting?
- **AML / KYC**: when will tier-1 banks have agentic systems autonomously handling alert dispositions? FinCEN's 2026 rule is a forcing function — but how does that map to vendor production timelines?
- **Radiology**: AI has been "6 months out" for 5 years. What does adoption *actually* look like — tool present in workflow vs tool driving the read decision?
- In which domains is the window genuinely **12–24 months** (giving more runway and a calmer GTM)?

## Who to talk to

- 2 security analysts at firms that have **piloted** Prophet / Dropzone (real adoption status, not vendor claims)
- 1 SOC manager who killed an AI agent pilot — why?
- 1 AML analytics leader at a tier-1 bank
- 1 academic at a radiology AI adoption research center (Mass General Brigham AI, Stanford AIMI, MD Anderson)
- 1 industry analyst (Gartner, Forrester, IDC) covering AI agents in regulated industries

## Talking prompts

- **The "in production" probe**: "When you say [Prophet/Dropzone/Innovaccer] is in production, what % of alerts/cases is the agent actually adjudicating end-to-end without a human? What's the human-in-the-loop %?"
- **Trust-to-action gap**: "If I deployed [vendor] tomorrow, would your analysts trust it enough to act on its findings without re-investigating?"
- **Pilot-to-production gradient**: "What's the gap between 'works in pilot' and 'replaces FTEs'? How long does that gap take to close?"
- **Killed-pilot probe**: "If you ran a pilot that didn't go to production, what was the actual reason? Cost, accuracy, trust, integration, change management?"

## Decision tree

| Window finding | Implication |
|---|---|
| **Security: 6–12 months real**, vendors closing the gap fast | Urgency mode. Land first client (brief 09) by Q3 2026. Standalone product play has a clock. |
| **Security: already closed**, Prophet/Dropzone are production-real | Race to consulting + framework + audit (briefs 06, 10). Skip standalone product in security. |
| **AML: 12–18 months** | Time to do this right. Prioritize design-partner motion (09). FinCEN finalization is the catalyst. |
| **Radiology: 18–36 months for true autonomy** despite shipped tools | Carrier angle (03) is the right wedge — solves the *adoption gap*, not the *technology gap*. |
| **Per-vertical windows differ widely** | Pick the vertical where the window matches your build-and-sell capacity. Don't generalize. |

## Starter steps (this week)

1. Read latest Gartner / Forrester / IDC reports on agentic AI in security, AML, and radiology. Note publication date — anything older than 6 months is potentially stale.
2. Find one **production deployment datapoint per vendor** — Prophet, Dropzone, Torq, Unit21, Lucinity, Aidoc, Lunit. Discount marketing claims; look for ARR, named customer counts, NPS.
3. Track the **adoption gradient** for each vendor: seats deployed, % of decisions automated, override rate, contract size. Build a 1-page table.
4. Note where **vendor narrative diverges from buyer reality** — that's where the window thesis is most testable.
5. Schedule one call with an analyst who covers this space (Gartner inquiry hour if you have access; otherwise informal).

## Risks / caveats

- **Vendors systematically overstate production status.** Discount marketing claims by 50%+ as a default. "In production" usually means "deployed but supervised."
- The "window" framing is **itself a story**. Actual displacement is messy, uneven, and rarely a discrete event. Use it for tempo, not for binary decisions.
- Different domains have **wildly different windows**. Don't apply security's reading to AML or radiology — the dynamics differ on regulation, integration, and adoption friction.
- Founder bias: it's tempting to want the window to be "just right" — long enough to build, short enough to be urgent. Pressure-test against your own incentives.
- The window may **never close in some verticals** because regulation forces a permanent human in the loop. That's actually good for the audit play (10) — different bet, longer life.
