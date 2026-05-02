import { useCallback, useState } from "react";

import type { ActionComputation } from "../lib/pipeline";
import type { BackendMode, PerStreamRuntime } from "../state/store";
import { ExpectationList } from "./ExpectationList";

export interface ActionSectionProps {
  visible: boolean;
  promptText: string;
  computation: ActionComputation;
  perStream: PerStreamRuntime;
  backend: BackendMode;
  apiReady: boolean;
  onResponseChange: (text: string) => void;
  onClear: () => void;
  onRun: () => void;
}

// Stage 3 — Action items section. Sits below TrendSection. Visible
// when the trend stage has a parse-good response. Renders the action
// items as priority-tagged cards with rationale.
export function ActionSection(
  props: ActionSectionProps,
): React.ReactElement | null {
  // All hooks MUST run before the visibility-based early return below,
  // otherwise hook-call order changes when `visible` flips and React
  // throws error #310 ("Rendered more hooks than during the previous
  // render"). Keep useState + useCallback here, conditional rendering
  // happens after.
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(props.promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById("action-prompt");
      if (el && el instanceof HTMLTextAreaElement) {
        el.focus();
        el.select();
      }
    }
  }, [props.promptText]);

  if (!props.visible) return null;

  const isApiMode = props.backend === "anthropic";
  const runDisabled =
    !props.apiReady || props.perStream.status === "running";

  return (
    <section className="cross-stream-section cross-stream-section--action">
      <header className="cross-stream-section__header">
        <h2 className="cross-stream-section__title">Recommended Actions</h2>
        <span className="cross-stream-section__subtitle">
          Translate the cross-stream trends into prioritized,
          owner-assigned action items with rationale.
        </span>
      </header>

      <div className="stream-card__panel">
        <div className="stream-card__panel-header">
          <span className="stream-card__panel-title">
            Action prompt
          </span>
          <button
            type="button"
            className="stream-card__copy"
            onClick={handleCopy}
            aria-live="polite"
          >
            {copied ? "Copied" : "Copy action prompt"}
          </button>
        </div>
        <textarea
          id="action-prompt"
          className="stream-card__prompt"
          value={props.promptText}
          readOnly
          rows={6}
          spellCheck={false}
        />
        {isApiMode ? (
          <div className="stream-card__run-row">
            <button
              type="button"
              className={`stream-card__run-btn ${
                !runDisabled ? "stream-card__run-btn--primary" : ""
              }`}
              onClick={props.onRun}
              disabled={runDisabled}
            >
              {props.perStream.status === "running"
                ? "Running…"
                : props.computation.responseText.length > 0
                  ? "Re-run action items"
                  : "Run action items"}
            </button>
            {props.perStream.inputTokens !== null &&
            props.perStream.outputTokens !== null ? (
              <span className="stream-card__tokens">
                in: {props.perStream.inputTokens} · out:{" "}
                {props.perStream.outputTokens} tokens
              </span>
            ) : null}
            {props.computation.responseText.length > 0 ? (
              <button
                type="button"
                className="stream-card__copy stream-card__copy--ghost"
                onClick={props.onClear}
                disabled={props.perStream.status === "running"}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        <textarea
          className="stream-card__response"
          value={props.computation.responseText}
          onChange={(e) => props.onResponseChange(e.target.value)}
          placeholder={
            isApiMode
              ? "(empty — click Run above to fetch ranked Action items)"
              : 'Paste the JSON object the chat AI returned, e.g.   {"actions": [...]}'
          }
          readOnly={isApiMode}
          rows={6}
          spellCheck={false}
        />

        {props.perStream.status === "running" ? (
          <p className="stream-card__working" role="status" aria-live="polite">
            <span className="stream-card__working-dot" aria-hidden>●</span>{" "}
            Working… Sonnet 4 is ranking actions and assigning owners.
          </p>
        ) : null}

        {props.perStream.status === "error" && props.perStream.error ? (
          <p className="stream-card__error">
            <strong>Run failed:</strong> {props.perStream.error}
          </p>
        ) : null}

        {props.computation.parseError ? (
          <p className="stream-card__error">
            <strong>Parse error:</strong> {props.computation.parseError}
          </p>
        ) : null}
      </div>

      {props.computation.actions.length > 0 ? (
        <div className="action-list">
          {props.computation.actions.map((a) => (
            <div
              key={a.id}
              className={`action-card action-card--${a.priority.toLowerCase()}`}
            >
              <div className="action-card__header">
                <span
                  className={`action-card__priority action-card__priority--${a.priority.toLowerCase()}`}
                >
                  {a.priority}
                </span>
                <span className="action-card__owner">
                  {a.suggested_owner}
                </span>
                <h3 className="action-card__title">{a.title}</h3>
              </div>
              <p className="action-card__description">{a.description}</p>
              <p className="action-card__rationale">
                <span className="action-card__rationale-label">
                  Rationale —{" "}
                </span>
                {a.rationale}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {props.computation.expectations.length > 0 ? (
        <div className="stream-card__panel">
          <div className="stream-card__panel-header">
            <span className="stream-card__panel-title">
              Action checks · what they tell you
            </span>
          </div>
          <ExpectationList
            results={props.computation.expectations}
            hints={[]}
            parsedEvents={[]}
          />
        </div>
      ) : null}
    </section>
  );
}
