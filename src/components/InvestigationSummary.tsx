import { TUTORIAL_INVESTIGATION_SUMMARY } from "../lib/pipeline";

export interface InvestigationSummaryProps {
  /** True when all three streams have parseable JSON. NOT gated on pass. */
  visible: boolean;
}

// Rendered at the bottom of the streams area the moment all three
// responses parse. It is the truth the Director should walk away with —
// independent of whether the AI's expectations passed or failed. The
// per-stream conclusion blocks already encode this truth in pieces;
// this is the cross-stream synthesis.
export function InvestigationSummary(
  props: InvestigationSummaryProps,
): React.ReactElement | null {
  if (!props.visible) return null;
  return (
    <section
      className="investigation-summary"
      aria-label="Investigation summary"
    >
      <h2 className="investigation-summary__headline">
        {TUTORIAL_INVESTIGATION_SUMMARY.headline}
      </h2>
      <p className="investigation-summary__actions-label">Actions</p>
      <ul className="investigation-summary__actions-list">
        {TUTORIAL_INVESTIGATION_SUMMARY.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    </section>
  );
}
