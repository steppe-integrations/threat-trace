import { useEffect, useRef } from "react";

export interface SaveInvestigationModalProps {
  open: boolean;
  onSave: () => void;
  onLater: () => void;
}

// Blocking modal shown after the user's first successful run.
// Copy is verbatim from HANDOFF.md "Modal copy" section — do not
// soften it. The point is to make the in-memory persistence
// model unmissable before the user can lose work.
export function SaveInvestigationModal(
  props: SaveInvestigationModalProps,
): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!props.open) return;
    saveBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onLater();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.open, props.onLater]);

  if (!props.open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-modal-title"
      onClick={(e) => {
        // Click outside the dialog dismisses (treated as 'later').
        if (e.target === e.currentTarget) props.onLater();
      }}
    >
      <div className="modal" ref={dialogRef}>
        <h2 id="save-modal-title" className="modal__title">
          Save your investigation now.
        </h2>
        <p className="modal__body">
          This tool keeps everything in browser memory only. If you close
          this tab without exporting, every parsed event, hint, and
          expectation result is lost.
        </p>
        <p className="modal__body">
          Click <strong>Save investigation</strong> to download a JSON file
          you can re-open later or share with a colleague.
        </p>
        <div className="modal__actions">
          <button
            type="button"
            className="modal__btn modal__btn--ghost"
            onClick={props.onLater}
          >
            I'll save later
          </button>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            onClick={props.onSave}
            ref={saveBtnRef}
          >
            Save investigation
          </button>
        </div>
      </div>
    </div>
  );
}
