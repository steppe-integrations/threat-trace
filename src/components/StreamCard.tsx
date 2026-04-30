import { useCallback, useState } from "react";

import { SYSTEM_PROMPT } from "../../agents/hint";
import {
  STREAM_CALLOUTS,
  STREAM_LABELS,
  type PreparedStream,
  type StreamComputation,
} from "../lib/pipeline";
import type { BackendMode, PerStreamRuntime } from "../state/store";
import { ExpectationList } from "./ExpectationList";

export interface StreamCardProps {
  stream: PreparedStream;
  computation: StreamComputation;
  backend: BackendMode;
  apiReady: boolean;
  perStream: PerStreamRuntime;
  /**
   * Per-stream user-prompt override. Empty string == no override
   * (canonical sent on Run). Only meaningful in API mode; Manual
   * mode ignores this and shows the canonical full prompt.
   */
  userPromptOverride: string;
  onPromptOverrideChange: (text: string) => void;
  onResponseChange: (text: string) => void;
  onClear: () => void;
  onRun: () => void;
}

type CardStatus = "empty" | "parse-error" | "passed" | "failed" | "running";

function classifyStatus(
  computation: StreamComputation,
  perStream: PerStreamRuntime,
): CardStatus {
  if (perStream.status === "running") return "running";
  if (computation.responseText.trim() === "") return "empty";
  if (computation.parseError) return "parse-error";
  if (computation.expectations.length === 0) return "empty";
  return computation.expectations.every((e) => e.passed) ? "passed" : "failed";
}

const STATUS_COPY: Record<CardStatus, string> = {
  empty: "Awaiting response",
  running: "Calling Sonnet 4…",
  "parse-error": "JSON parse error",
  passed: "Expectations passed",
  failed: "Expectation failed",
};

export function StreamCard(props: StreamCardProps): React.ReactElement {
  const { stream, computation, backend, perStream } = props;
  const [copied, setCopied] = useState(false);

  const status = classifyStatus(computation, perStream);

  const isApiMode = backend === "anthropic";
  const runDisabled = !props.apiReady || perStream.status === "running";

  // In API mode, the editable textarea is bound to the override if
  // the user has typed anything; otherwise to the canonical user
  // prompt. An empty override resolves back to canonical (no useless
  // "send empty prompt" trap).
  const isOverrideActive = props.userPromptOverride !== "";
  const userTextareaValue = isOverrideActive
    ? props.userPromptOverride
    : stream.userPromptText;

  // Copy prompt copies the FULL effective prompt — system + whatever
  // user-message content would be sent on the next Run. This way a
  // user comparing against a chat AI side by side sees exactly what
  // Sonnet 4 sees, including any edits.
  const effectivePrompt = isApiMode
    ? `${SYSTEM_PROMPT}\n\n${userTextareaValue}`
    : stream.promptText;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(effectivePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById(`prompt-${stream.source}`);
      if (el && el instanceof HTMLTextAreaElement) {
        el.focus();
        el.select();
      }
    }
  }, [effectivePrompt, stream.source]);

  const handleResetPrompt = useCallback(() => {
    props.onPromptOverrideChange("");
  }, [props]);

  return (
    <section
      className={`stream-card stream-card--${status}`}
      aria-labelledby={`stream-${stream.source}-title`}
    >
      <header className="stream-card__header">
        <div className="stream-card__heading">
          <h2
            id={`stream-${stream.source}-title`}
            className="stream-card__title"
          >
            {STREAM_LABELS[stream.source]}
          </h2>
          <span className="stream-card__count">
            {stream.parsedEvents.length} parsed events ({stream.rawEventCount}{" "}
            raw)
          </span>
        </div>
        <div className={`stream-card__status stream-card__status--${status}`}>
          {STATUS_COPY[status]}
        </div>
      </header>

      <p className="stream-card__callout">{STREAM_CALLOUTS[stream.source]}</p>

      {/* ============================================================
          Step 1 — the prompt.
            Manual mode: full system+user, read-only, copy → chat AI.
            API mode:    system in a collapsible <details>; user prompt
                         in an EDITABLE textarea. Edit → click Run sends
                         your edited version. Reset snaps back to canonical.
                         The system prompt stays canonical either way.
          ============================================================ */}
      <div className="stream-card__panel">
        <div className="stream-card__panel-header">
          <span className="stream-card__panel-title">
            {isApiMode
              ? isOverrideActive
                ? "Step 1 · Your edited user prompt"
                : "Step 1 · The user prompt — edit before Run if you want"
              : "Step 1 · Copy this prompt"}
            {isApiMode && isOverrideActive ? (
              <span
                className="stream-card__modified-badge"
                title="The prompt has been edited from canonical. Click Reset to restore."
              >
                Modified
              </span>
            ) : null}
          </span>
          <span className="stream-card__panel-actions">
            {isApiMode && isOverrideActive ? (
              <button
                type="button"
                className="stream-card__copy stream-card__copy--ghost"
                onClick={handleResetPrompt}
                title="Restore the canonical user prompt for this stream"
              >
                Reset to canonical
              </button>
            ) : null}
            <button
              type="button"
              className="stream-card__copy"
              onClick={handleCopy}
              aria-live="polite"
            >
              {copied ? "Copied" : "Copy prompt"}
            </button>
          </span>
        </div>

        {isApiMode ? (
          <>
            <details className="stream-card__system-prompt">
              <summary className="stream-card__system-prompt-summary">
                System instructions (sent to Sonnet 4 separately — read-only)
              </summary>
              <pre className="stream-card__system-prompt-body">
                {SYSTEM_PROMPT}
              </pre>
            </details>
            <textarea
              id={`prompt-${stream.source}`}
              className="stream-card__prompt stream-card__prompt--editable"
              value={userTextareaValue}
              onChange={(e) => props.onPromptOverrideChange(e.target.value)}
              rows={12}
              spellCheck={false}
              aria-label="User prompt — editable"
            />
            <p className="stream-card__hint">
              {isOverrideActive
                ? "Edited. Click Run to send what's in the box. Reset above to go back to canonical."
                : "Click Run to send this to Sonnet 4. Or edit it first — try weakening a check, removing an event, or asking for a different output shape, and watch the expectation panel notice."}
            </p>
          </>
        ) : (
          <>
            <textarea
              id={`prompt-${stream.source}`}
              className="stream-card__prompt"
              value={stream.promptText}
              readOnly
              rows={10}
              spellCheck={false}
            />
            <p className="stream-card__hint">
              Open Claude.ai, ChatGPT, or any chat AI in another tab. Paste
              the entire prompt above as a single message. The AI will reply
              with a JSON object describing what it found.
            </p>
          </>
        )}
      </div>

      {/* ============================================================
          Step 2 — the response. Mode-dependent:
            Manual: editable textarea (paste here).
            Anthropic API: Run button + status row + read-only textarea
                            populated by the API result.
          ============================================================ */}
      <div className="stream-card__panel">
        <div className="stream-card__panel-header">
          <span className="stream-card__panel-title">
            Step 2 ·{" "}
            {isApiMode
              ? "Run against the Anthropic API"
              : "Paste the AI's JSON reply here"}
          </span>
          {!isApiMode && computation.responseText.length > 0 ? (
            <button
              type="button"
              className="stream-card__copy stream-card__copy--ghost"
              onClick={props.onClear}
            >
              Clear
            </button>
          ) : null}
          {isApiMode && computation.responseText.length > 0 ? (
            <button
              type="button"
              className="stream-card__copy stream-card__copy--ghost"
              onClick={props.onClear}
              disabled={perStream.status === "running"}
            >
              Clear
            </button>
          ) : null}
        </div>

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
                  : perStream.status === "running"
                    ? "Already running…"
                    : isOverrideActive
                      ? "Send your edited user prompt to Sonnet 4 via api.anthropic.com"
                      : "Send the canonical prompt to Sonnet 4 via api.anthropic.com"
              }
            >
              {perStream.status === "running"
                ? "Running…"
                : computation.responseText.length > 0
                  ? `Re-run ${STREAM_LABELS[stream.source]}`
                  : `Run ${STREAM_LABELS[stream.source]}`}
            </button>
            {perStream.inputTokens !== null &&
            perStream.outputTokens !== null ? (
              <span className="stream-card__tokens">
                in: {perStream.inputTokens} · out: {perStream.outputTokens} tokens
              </span>
            ) : null}
          </div>
        ) : null}

        <textarea
          className="stream-card__response"
          value={computation.responseText}
          onChange={(e) => props.onResponseChange(e.target.value)}
          placeholder={
            isApiMode
              ? "(empty — click Run above to fetch a Sonnet 4 response)"
              : 'Paste the JSON object the chat AI returned, e.g.   {"hints": [...]}'
          }
          readOnly={isApiMode}
          rows={8}
          spellCheck={false}
        />

        {perStream.status === "error" && perStream.error ? (
          <p className="stream-card__error">
            <strong>Run failed:</strong> {perStream.error}{" "}
            <em>(Click Run to retry, or switch to Manual mode in Settings.)</em>
          </p>
        ) : null}

        {computation.parseError ? (
          <p className="stream-card__error">
            <strong>Parse error:</strong> {computation.parseError}{" "}
            <em>
              (Tip: the response should be a JSON object starting with{" "}
              <code>{`{`}</code>. Code-fence wrappers like{" "}
              <code>```json</code> are okay; surrounding prose is not.)
            </em>
          </p>
        ) : null}

        {!isApiMode && computation.responseText.length === 0 ? (
          <p className="stream-card__hint">
            Once you paste valid JSON here, the checks below evaluate
            automatically — no Run button to press.
          </p>
        ) : null}
      </div>

      {/* ============================================================
          Step 3 — expectations panel. Mode-independent. The same
          downstream pipeline reads from streams[source].responseText
          regardless of how that text got there.
          ============================================================ */}
      {computation.expectations.length > 0 ? (
        <div className="stream-card__panel">
          <div className="stream-card__panel-header">
            <span className="stream-card__panel-title">
              Step 3 · What the checks tell you
            </span>
          </div>
          <ExpectationList
            results={computation.expectations}
            hints={computation.hints}
            parsedEvents={stream.parsedEvents}
          />
        </div>
      ) : null}
    </section>
  );
}
