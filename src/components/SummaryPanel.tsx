import { useCallback, useState } from "react";

import type { Source } from "../../contracts/artifacts";
import { STREAM_LABELS, type StreamSummaryComputation } from "../lib/pipeline";
import type { BackendMode, PerStreamRuntime } from "../state/store";
import { ExpectationList } from "./ExpectationList";

export interface SummaryPanelProps {
  source: Source;
  promptText: string;
  computation: StreamSummaryComputation;
  parsedEventsForExpectations: import("../../contracts/artifacts").ParsedEvent[];
  hintsForExpectations: import("../../contracts/artifacts").AnomalyHint[];
  backend: BackendMode;
  apiReady: boolean;
  perStream: PerStreamRuntime;
  onResponseChange: (text: string) => void;
  onClear: () => void;
  onRun: () => void;
}

// Stage 3 — Step 4 of the per-stream card. Mirrors the Step 2 pattern:
// Manual mode shows prompt + paste textarea, API mode shows a Run
// button + status row + read-only response. Expectations rendered
// below as soon as the response parses.
export function SummaryPanel(props: SummaryPanelProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const isApiMode = props.backend === "anthropic";
  const runDisabled =
    !props.apiReady || props.perStream.status === "running";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(props.promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById(`summary-prompt-${props.source}`);
      if (el && el instanceof HTMLTextAreaElement) {
        el.focus();
        el.select();
      }
    }
  }, [props.promptText, props.source]);

  return (
    <div className="stream-card__panel stream-card__panel--summary">
      <div className="stream-card__panel-header">
        <span className="stream-card__panel-title">
          Step 4 · Summarize this stream
        </span>
        <button
          type="button"
          className="stream-card__copy"
          onClick={handleCopy}
          aria-live="polite"
        >
          {copied ? "Copied" : "Copy summary prompt"}
        </button>
      </div>

      <p className="stream-card__hint">
        The summary agent reads this stream's hints and writes a focused
        narrative — ≤200 tokens — capturing the actor fingerprint and the
        dominant pattern. {isApiMode ? "" : "Paste this prompt into the same chat AI you used for Step 1, then paste the JSON reply below."}
      </p>

      <textarea
        id={`summary-prompt-${props.source}`}
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
            title={
              !props.apiReady
                ? "Set an API key in Settings first."
                : props.perStream.status === "running"
                  ? "Already running…"
                  : "Send the summary prompt to Sonnet 4 via api.anthropic.com"
            }
          >
            {props.perStream.status === "running"
              ? "Running…"
              : props.computation.responseText.length > 0
                ? `Re-run ${STREAM_LABELS[props.source]} summary`
                : `Run ${STREAM_LABELS[props.source]} summary`}
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
            ? "(empty — click Run above to fetch a Sonnet 4 summary)"
            : 'Paste the JSON object the chat AI returned, e.g.   {"narrative": "...", "cited_hint_indices": [0]}'
        }
        readOnly={isApiMode}
        rows={5}
        spellCheck={false}
      />

      {!isApiMode && props.computation.responseText.length > 0 ? (
        <button
          type="button"
          className="stream-card__copy stream-card__copy--ghost"
          onClick={props.onClear}
          style={{ alignSelf: "flex-end", marginTop: 4 }}
        >
          Clear
        </button>
      ) : null}

      {props.perStream.status === "running" ? (
        <p className="stream-card__working" role="status" aria-live="polite">
          <span className="stream-card__working-dot" aria-hidden>●</span>{" "}
          Working… Sonnet 4 is composing this stream's narrative.
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

      {props.computation.summary ? (
        <div className="stream-card__summary-narrative">
          <p className="stream-card__panel-title stream-card__panel-title--inline">
            Narrative
          </p>
          <blockquote className="stream-card__narrative-quote">
            {props.computation.summary.narrative}
          </blockquote>
        </div>
      ) : null}

      {props.computation.expectations.length > 0 ? (
        <div className="stream-card__expectations-substack">
          <ExpectationList
            results={props.computation.expectations}
            hints={props.hintsForExpectations}
            parsedEvents={props.parsedEventsForExpectations}
          />
        </div>
      ) : null}
    </div>
  );
}
