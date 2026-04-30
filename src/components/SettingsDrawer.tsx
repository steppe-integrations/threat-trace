import { useEffect, useRef, useState } from "react";

import { SEALED_KEY } from "../lib/sealed-key";
import type { BackendMode } from "../state/store";

export interface SettingsDrawerProps {
  open: boolean;
  backend: BackendMode;
  apiKey: string;
  onClose: () => void;
  onBackendChange: (mode: BackendMode) => void;
  onApiKeyChange: (key: string) => void;
  onForgetApiKey: () => void;
}

// Sliding settings panel: backend toggle, manual API-key paste,
// "Forget key" affordance, and a Stage 2 explainer.
//
// The sealed-key unlock UX lives in the prominent inline
// `UnlockPanel` between the intro and the stream stack — that's
// the happy path. This drawer is the fallback route: power
// users, recipients who'd rather use their own key, anyone who
// dismissed or scrolled past the inline panel.
//
// ESC and click-outside both dismiss.
export function SettingsDrawer(
  props: SettingsDrawerProps,
): React.ReactElement | null {
  const [showKey, setShowKey] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!props.open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <aside className="settings-drawer">
        <header className="settings-drawer__header">
          <h2 id="settings-title" className="settings-drawer__title">
            Settings · Stage 2
          </h2>
          <button
            type="button"
            className="settings-drawer__close"
            onClick={props.onClose}
            aria-label="Close settings"
            ref={closeBtnRef}
          >
            ✕
          </button>
        </header>

        <div className="settings-drawer__body">
          <section className="settings-section">
            <h3 className="settings-section__title">Backend</h3>
            <p className="settings-section__hint">
              Manual mode is the Stage 1 default — you paste prompts into
              a chat AI and paste replies back. Anthropic API mode runs
              the same prompts automatically using your key.
            </p>
            <div className="settings-radio-group">
              <label className="settings-radio">
                <input
                  type="radio"
                  name="backend"
                  value="manual"
                  checked={props.backend === "manual"}
                  onChange={() => props.onBackendChange("manual")}
                />
                <span className="settings-radio__label">
                  <strong>Manual (paste)</strong>
                  <span className="settings-radio__sublabel">
                    Stage 1 — copy/paste through any chat AI. No key needed.
                  </span>
                </span>
              </label>
              <label className="settings-radio">
                <input
                  type="radio"
                  name="backend"
                  value="anthropic"
                  checked={props.backend === "anthropic"}
                  onChange={() => props.onBackendChange("anthropic")}
                />
                <span className="settings-radio__label">
                  <strong>Anthropic API</strong>
                  <span className="settings-radio__sublabel">
                    Stage 2 — same prompts, runs automatically. Requires
                    a key (below).
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section
            className={`settings-section ${
              props.backend === "anthropic"
                ? ""
                : "settings-section--inactive"
            }`}
          >
            <h3 className="settings-section__title">
              {SEALED_KEY ? "Paste your own key" : "Anthropic API key"}
            </h3>
            <p className="settings-section__hint">
              {SEALED_KEY ? (
                <>
                  Use this only if the inline unlock at the top of the
                  page didn't work for you. <strong>Memory-only.</strong>{" "}
                </>
              ) : (
                <strong>Memory-only. </strong>
              )}
              Never saved to your browser, never written to exported
              investigation files, never sent anywhere except{" "}
              <code>api.anthropic.com</code>. Closing this tab clears it.
              Get a key at <code>console.anthropic.com/settings/keys</code>.
            </p>
            <div className="settings-key-row">
              <input
                type={showKey ? "text" : "password"}
                className="settings-key-input"
                value={props.apiKey}
                onChange={(e) => props.onApiKeyChange(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
                disabled={props.backend !== "anthropic"}
              />
              <button
                type="button"
                className="settings-key-toggle"
                onClick={() => setShowKey((v) => !v)}
                disabled={props.backend !== "anthropic"}
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="settings-key-forget"
                onClick={props.onForgetApiKey}
                disabled={
                  props.backend !== "anthropic" || props.apiKey === ""
                }
                title="Clear the key from memory"
              >
                Forget key
              </button>
            </div>
            {props.backend === "anthropic" && props.apiKey === "" ? (
              <p className="settings-section__warning">
                {SEALED_KEY
                  ? "No key set. Try the unlock at the top of the page, or paste one here."
                  : "No key set. The Run buttons on each stream will stay disabled until you paste one above."}
              </p>
            ) : null}
          </section>

          <section className="settings-section">
            <h3 className="settings-section__title">What does Stage 2 change?</h3>
            <ul className="settings-section__list">
              <li>
                Each stream card replaces its paste textarea with a{" "}
                <strong>Run</strong> button.
              </li>
              <li>
                Token usage shows per stream after each successful run.
              </li>
              <li>
                The expectations panel and conclusion blocks still render
                exactly the same way — Manual and Anthropic feed the same
                downstream pipeline.
              </li>
            </ul>
          </section>
        </div>

        <footer className="settings-drawer__footer">
          <button
            type="button"
            className="settings-drawer__done"
            onClick={props.onClose}
          >
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
