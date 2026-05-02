# ADR-005: Collapse UX — Step 4 nested, Steps 1–3 auto-minimize with delay

## Status

Accepted (Sprint 1, 2026-05-01)

## Context

The pre-Sprint-1 layout placed the three `StreamCard` instances in `app__streams`, with `InvestigationSummary` and Stage 3 components rendered as siblings underneath. After wiring Stage 3, two visual problems emerged:

1. **Step 4 (per-stream summary) appeared in its own UI bracket below the headline**, visually disconnected from the stream it summarized. The user had to scroll past three streams + a headline before seeing the three summaries stacked together.
2. **Steps 1–3 stayed expanded forever**, each with a multi-row prompt textarea and response textarea. After completion, the synthesis (Step 4, Trend, Actions) was buried under hundreds of pixels of "raw work" the user had already seen.

User feedback during testing made the requirements explicit: Step 4 belongs in the same UI bracket as Steps 1–3, and Steps 1–3 should minimize after a successful run (not disappear — minimize, with the section structure still visible and re-expandable).

## Decision

Three coordinated UX rules:

1. **Step 4 nests inside StreamCard via a `children` prop.** App.tsx passes `<SummaryPanel />` as children to each `<StreamCard />`. StreamCard renders `{props.children}` after Step 3, inside the same `<section>`. The two visually belong to the same card.
2. **Auto-collapse Steps 1–3 after expectations pass, with a 1.5s delay.** A `useState(collapsed)` plus two `useEffect`s in StreamCard: one expands on `perStream.status === "running"`, the other collapses 1.5s after expectations all pass (cleanup cancels if deps change). The 1.5s gives the user time to register the green PASS pill and read the conclusion line before Steps 1–3 fold up.
3. **Collapsed mode minimizes, doesn't hide.** CSS rule: `.stream-card--collapsed .stream-card__panel:not(.stream-card__panel--summary) > *:not(.stream-card__panel-header) { display: none; }`. Each step's gold title bar stays visible (showing "STEP 1 · ...", "STEP 2 · ...", "STEP 3 · ..."), with action buttons hidden and bodies hidden. The `:not(.stream-card__panel--summary)` predicate keeps Step 4 fully expanded regardless of collapsed state. A "Show details" toggle in the StreamCard header re-expands manually.

Visual hierarchy reinforces the structure: section-level titles (`stream-card__title`, `cross-stream-section__title`, `investigation-summary__headline`) all use gold (`var(--warn)`) — same color as the "Local memory only" badge. Sub-section titles (`stream-card__panel-title`) stay muted grey.

## Consequences

- The user reads each stream as a single card top-to-bottom: hint → summary, then collapses to the gold title bar.
- Synthesis (Trend, Action items) remains the visual focus once the per-stream work is collapsed.
- "Show details" is always available; nothing is permanently hidden.
- Pulsing "Working…" banners in SummaryPanel/TrendSection/ActionSection during their respective runs make the in-flight state unmissable.
- The 1.5s delay is a magic number tuned by feel; if user feedback says it's too fast/slow, this is the dial to turn.

## Alternatives considered

- **Render Step 4 as a sibling below each StreamCard**: rejected — still requires a wrapper div and doesn't visually belong to the same UI bracket.
- **Don't auto-collapse, leave it to the user**: rejected — defeats the purpose; the user shouldn't have to manually fold up six panels per stream.
- **Animate the collapse with CSS transitions**: deferred — `display: none` doesn't animate, would require `max-height` gymnastics. Sprint 2 polish if requested.
- **Hide Steps 1–3 entirely (no title bars)**: rejected after user feedback — explicit ask was "minimized, not disappeared."

## See also

- [src/components/StreamCard.tsx](../../src/components/StreamCard.tsx) — collapsed state, useEffects, toggle button.
- [src/styles.css](../../src/styles.css) — collapsed-mode CSS, gold hierarchy, working banner.
- [src/App.tsx](../../src/App.tsx) — children-slot wiring of SummaryPanel into StreamCard.
