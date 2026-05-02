import { useCallback, useState } from "react";

import type { ParsedEvent, Source } from "../../contracts/artifacts";
import type { TrendComputation } from "../lib/pipeline";
import type { BackendMode, PerStreamRuntime } from "../state/store";
import { ExpectationList } from "./ExpectationList";

export interface TrendSectionProps {
  visible: boolean;
  promptText: string;
  computation: TrendComputation;
  perStream: PerStreamRuntime;
  backend: BackendMode;
  apiReady: boolean;
  parsedEventsBySource: Record<Source, ParsedEvent[]>;
  onResponseChange: (text: string) => void;
  onClear: () => void;
  onRun: () => void;
}

// Stage 3 — Cross-stream Trend section. Sits BELOW the three stream
// cards. Becomes visible when all three summaries have parse-good
// responses. Same Manual/API duality as StreamCard.
export function TrendSection(
  props: TrendSectionProps,
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
      const el = document.getElementById("trend-prompt");
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

  // Build a fake hint list for ExpectationList — the trend
  // expectations don't actually need hint or parsedEvent lookups
  // for offender display in the same way (the offender events
  // come from API parsed events). Pass empty arrays.
  const flattenedParsedEvents: ParsedEvent[] = [
    ...(props.parsedEventsBySource.edge ?? []),
    ...(props.parsedEventsBySource.identity ?? []),
    ...(props.parsedEventsBySource.api ?? []),
  ];

  return (
    <section className="cross-stream-section cross-stream-section--trend">
      <header className="cross-stream-section__header">
        <h2 className="cross-stream-section__title">Cross-stream Trend</h2>
        <span className="cross-stream-section__subtitle">
          The first cross-stream call. Composes the three per-stream
          summaries into time-aligned, actor-fingerprinted patterns.
        </span>
      </header>

      <div className="stream-card__panel">
        <div className="stream-card__panel-header">
          <span className="stream-card__panel-title">
            Trend prompt
          </span>
          <button
            type="button"
            className="stream-card__copy"
            onClick={handleCopy}
            aria-live="polite"
          >
            {copied ? "Copied" : "Copy trend prompt"}
          </button>
        </div>
        <textarea
          id="trend-prompt"
          className="stream-card__prompt"
          value={props.promptText}
          readOnly
          rows={8}
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
                  ? "Re-run trend"
                  : "Run trend"}
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
              ? "(empty — click Run above to fetch the cross-stream Trend)"
              : 'Paste the JSON object the chat AI returned, e.g.   {"trends": [...]}'
          }
          readOnly={isApiMode}
          rows={6}
          spellCheck={false}
        />

        {props.perStream.status === "running" ? (
          <p className="stream-card__working" role="status" aria-live="polite">
            <span className="stream-card__working-dot" aria-hidden>●</span>{" "}
            Working… Sonnet 4 is correlating across streams.
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

      {props.computation.trends.length > 0 ? (
        <div className="trend-list">
          {props.computation.trends.map((t) => (
            <div key={t.id} className="trend-card">
              <div className="trend-card__header">
                <span className="trend-card__confidence">
                  confidence: {(t.confidence * 100).toFixed(0)}%
                </span>
                <span className="trend-card__window">
                  {t.time_window_start} → {t.time_window_end}
                </span>
              </div>
              <p className="trend-card__description">{t.description}</p>
              <div className="trend-card__evidence">
                {t.evidence.map((ev) => (
                  <div key={ev.source} className="trend-card__evidence-row">
                    <span className="trend-card__evidence-source">
                      {ev.source}
                    </span>
                    <span className="trend-card__evidence-counts">
                      {ev.hint_ids.length} hint(s) ·{" "}
                      {ev.parsed_event_ids.length} event(s)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : props.computation.responseText &&
        props.computation.parseError === null ? (
        <p className="cross-stream-section__empty">
          The trend agent emitted no cross-stream trends. That can be a
          legitimate answer if no genuine pattern spans streams — but
          usually means the model missed something. Re-run if needed.
        </p>
      ) : null}

      {props.computation.expectations.length > 0 ? (
        <div className="stream-card__panel">
          <div className="stream-card__panel-header">
            <span className="stream-card__panel-title">
              Trend checks · what they tell you
            </span>
          </div>
          <ExpectationList
            results={props.computation.expectations}
            hints={[]}
            parsedEvents={flattenedParsedEvents}
          />
        </div>
      ) : null}
    </section>
  );
}
