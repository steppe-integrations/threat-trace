import { useCallback, useEffect, useRef, useState } from "react";

import type { SealedKey } from "../lib/seal-crypto";
import { unsealApiKey } from "../lib/seal-crypto";
import type { BackendMode } from "../state/store";

export interface UnlockPanelProps {
  sealedKey: SealedKey;
  apiKey: string;
  backend: BackendMode;
  onApiKeyChange: (key: string) => void;
  onBackendChange: (mode: BackendMode) => void;
}

type UnlockState = "idle" | "unlocking" | "wrong" | "error" | "unlocked";

// ============================================================
// UnlockPanel — the sealed-user happy path.
//
// Lives between the intro and the stream stack, visible only
// when the bundle has a sealed payload. Director arrives, reads
// one paragraph of intro, sees this panel, types their answer,
// hits Enter or clicks Unlock. The panel transitions to a small
// success row that stays visible as ongoing confirmation; the
// director's eye moves naturally down to the first stream's
// Run button, which is now lit.
//
// Why local "unlocked" state instead of just gating on
// `apiKey !== ""`: we want the success state to persist after
// the unlock, so the director sees confirmation. We tie the
// state back to apiKey via a useEffect — if a "Forget key"
// click in the drawer clears the apiKey, this resets so the
// director can unlock again.
// ============================================================

export function UnlockPanel(props: UnlockPanelProps): React.ReactElement {
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState<UnlockState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input on mount. Director starts typing
  // without having to find the field.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // If the apiKey gets cleared (Forget key, Reset, etc.) after
  // we already unlocked, drop back to the form so the user can
  // re-unlock without a page reload.
  useEffect(() => {
    if (props.apiKey === "" && state === "unlocked") {
      setState("idle");
    }
  }, [props.apiKey, state]);

  const handleUnlock = useCallback(async () => {
    if (!answer.trim()) return;
    setState("unlocking");
    try {
      const decryptedKey = await unsealApiKey(props.sealedKey, answer);
      props.onApiKeyChange(decryptedKey);
      if (props.backend !== "anthropic") {
        props.onBackendChange("anthropic");
      }
      setState("unlocked");
      setAnswer("");
    } catch (err) {
      if ((err as Error).message === "WRONG_ANSWER") {
        setState("wrong");
      } else {
        setState("error");
      }
    }
  }, [answer, props]);

  if (state === "unlocked") {
    return (
      <section
        className="unlock-panel unlock-panel--unlocked"
        role="region"
        aria-label="Phase 2 unlocked"
        aria-live="polite"
      >
        <span className="unlock-panel__check" aria-hidden>
          ✓
        </span>
        <span className="unlock-panel__success-text">
          <strong>Unlocked.</strong> Phase 2 is ready — the Run buttons
          below are live.
        </span>
      </section>
    );
  }

  return (
    <section
      className="unlock-panel"
      role="region"
      aria-label="Unlock Phase 2"
    >
      <div className="unlock-panel__header">
        <span className="unlock-panel__icon" aria-hidden>
          🔓
        </span>
        <h2 className="unlock-panel__title">Unlock Phase 2</h2>
      </div>

      <p className="unlock-panel__intro">
        The Anthropic key is sealed against a question only you would
        answer. It lives in browser memory only — closing the tab
        clears it.
      </p>

      <blockquote className="unlock-panel__question">
        <span className="unlock-panel__question-label">Question</span>
        {props.sealedKey.question}
      </blockquote>

      <div className="unlock-panel__row">
        <input
          ref={inputRef}
          type="text"
          className="unlock-panel__input"
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            if (state === "wrong" || state === "error") {
              setState("idle");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && answer.trim() && state !== "unlocking") {
              void handleUnlock();
            }
          }}
          placeholder="Type your answer and hit Enter"
          autoComplete="off"
          spellCheck={false}
          disabled={state === "unlocking"}
          aria-label="Answer to the unlock question"
        />
        <button
          type="button"
          className="unlock-panel__btn"
          onClick={handleUnlock}
          disabled={!answer.trim() || state === "unlocking"}
        >
          {state === "unlocking" ? "Unlocking…" : "Unlock"}
        </button>
      </div>

      {state === "wrong" ? (
        <p className="unlock-panel__error" role="alert">
          That doesn't match. Try again — or use the gear icon
          (top-right) for the manual paste path.
        </p>
      ) : null}
      {state === "error" ? (
        <p className="unlock-panel__error" role="alert">
          Couldn't unlock — your browser may not support Web Crypto.
          Use the gear icon to paste a key directly.
        </p>
      ) : null}

      <p className="unlock-panel__hint">
        Don't have the answer? The gear icon lets you paste your own
        Anthropic key (pennies per run). See{" "}
        <code>(2a)_getting_an_API_key.md</code> for the walkthrough.
      </p>
    </section>
  );
}
