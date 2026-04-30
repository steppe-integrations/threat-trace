export interface UnsavedBannerProps {
  visible: boolean;
  onSave: () => void;
}

// Persistent across the top of the page whenever there's content
// not yet exported. Goes away the moment Save (export) succeeds.
// Visual: high contrast warning so it's hard to miss.
export function UnsavedBanner(
  props: UnsavedBannerProps,
): React.ReactElement | null {
  if (!props.visible) return null;
  return (
    <div className="unsaved-banner" role="status" aria-live="polite">
      <span className="unsaved-banner__text">
        <strong>Unsaved investigation.</strong> Memory only — closing this
        tab loses your work.
      </span>
      <button
        type="button"
        className="unsaved-banner__btn"
        onClick={props.onSave}
      >
        Save now
      </button>
    </div>
  );
}
