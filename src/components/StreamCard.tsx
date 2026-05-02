import { useCallback, useEffect, useState } from "react";

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
  /**
   * Slot rendered INSIDE the card's <section> after Step 3, so Stage 3a
   * (per-stream summary) visually belongs to the same UI bracket as
   * Steps 1-3 instead of floating below as a sibling. App.tsx passes a
   * <SummaryPanel /> here once allStreamsParseGood.
   */
  children?: React.ReactNode;
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

  // Steps 1-3 collapse to a compact header once a run has produced
  // passing expectations. The synthesis below (Stage 3a/3b/3c) becomes
  // the visual focus; the raw work is one click away. User can toggle
  // manually via the "Show / Hide details" button in the card header.
  const [collapsed, setCollapsed] = useState(false);

  // Auto-expand the moment a run kicks off so the user can watch
  // progress in Step 2's response area.
  useEffect(() => {
    if (perStream.status === "running") {
      setCollapsed(false);
    }
  }, [perStream.status]);

  // Auto-collapse after a run lands AND its expectations all pass.
  // Delayed by 1500ms so the user has time to register the green PASS
  // pill (and read the conclusion line in Step 3) before Steps 1-3
  // fold up. The cleanup function cancels the timeout if dependencies
  // change before it fires — e.g., user clicks "Show details" or kicks
  // off a re-run. Idempotent: safe to fire on every recompute.
  useEffect(() => {
    if (
      perStream.status === "idle" &&
      computation.expectations.length > 0 &&
      computation.expectations.every((e) => e.passed)
    ) {
      const t = setTimeout(() => setCollapsed(true), 1500);
      return () => clearTimeout(t);
    }
  }, [perStream.status, computation.expectations]);

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

  // Whether the toggle button should be visible at all. Only meaningful
  // once there's actual content to collapse — otherwise the button
  // confuses the empty initial state.
  const hasRunOnce =
    computation.responseText.trim() !== "" || perStream.status === "running";

  return (
    <section
      className={`stream-card stream-card--${status}${
        collapsed ? " stream-card--collapsed" : ""
      }`}
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
        <div className="stream-card__header-right">
          <div className={`stream-card__status stream-card__status--${status}`}>
            {STATUS_COPY[status]}
          </div>
          {hasRunOnce ? (
            <button
              type="button"
              className="stream-card__toggle"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              title={
                collapsed
                  ? "Show prompt, response, and expectation details"
                  : "Hide prompt, response, and expectation details"
              }
            >
              {collapsed ? "▸ Show details" : "▾ Hide details"}
            </button>
          ) : null}
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

      {/* Stage 3a slot — typically a <SummaryPanel /> from App.tsx, kept
          INSIDE the stream-card section so it lives under the same UI
          bracket as Steps 1-3 (visually paired with the stream's own
          hint output). Children render after Step 3 regardless of the
          collapsed state — collapsing only hides Steps 1-3, never the
          synthesis content the user is meant to see. */}
      {props.children}
    </section>
  );
}
