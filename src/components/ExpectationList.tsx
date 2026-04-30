import { useState } from "react";

import type { AnomalyHint, ParsedEvent } from "../../contracts/artifacts";
import type { ExpectationResult } from "../../agents/expectations";

export interface ExpectationListProps {
  results: ExpectationResult[];
  hints: AnomalyHint[];
  parsedEvents: ParsedEvent[];
}

// Truncate so the failure detail row stays readable in the card.
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function eventOneLiner(event: ParsedEvent): string {
  const time =
    /T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(event.event_time)?.[1] ??
    event.event_time;
  const ip = event.actor.ip ?? "no-ip";
  const subj = event.subject.endpoint ?? event.subject.path ?? "?";
  return `[${event.raw_index}] ${time} ${event.event_type} ${ip} ${truncate(subj, 60)}`;
}

interface ExpectationRowProps {
  result: ExpectationResult;
  hints: AnomalyHint[];
  parsedEvents: ParsedEvent[];
}

function ExpectationRow(props: ExpectationRowProps): React.ReactElement {
  const { result, hints, parsedEvents } = props;
  const [open, setOpen] = useState(
    !result.passed && Boolean(result.loadBearing),
  );

  const offendingEvents = !result.passed
    ? collectOffendingEvents(result, hints, parsedEvents)
    : [];

  // Always-visible verdict summary, in plain English. Reads
  // differently for pass vs fail; reuses the same explanation +
  // contrast prose so the user learns the same lesson either way.
  const verdictPrefix = result.passed
    ? "Why this passed:"
    : "Why this failed:";

  return (
    <div
      className={`expectation expectation--${result.passed ? "pass" : "fail"} ${result.loadBearing ? "expectation--load-bearing" : ""}`.trim()}
    >
      <div className="expectation__row">
        <span className="expectation__badge">
          {result.passed ? "PASS" : "FAIL"}
        </span>
        <span className="expectation__label">{result.label}</span>
        {result.loadBearing ? (
          <span
            className="expectation__tag"
            title="A check that catches the AI inventing problems where there are none."
          >
            false-positive check
          </span>
        ) : null}
      </div>

      {result.detail ? (
        <p className="expectation__detail">{result.detail}</p>
      ) : null}

      {(result.explanation || result.contrast) && (
        <div className="expectation__teach">
          <p className="expectation__teach-prefix">{verdictPrefix}</p>
          {result.explanation ? (
            <p className="expectation__teach-line">{result.explanation}</p>
          ) : null}
          {result.contrast ? (
            <p className="expectation__teach-contrast">
              <span className="expectation__teach-tag">Contrast — </span>
              {result.contrast}
            </p>
          ) : null}
        </div>
      )}

      {(() => {
        const conclusion = result.passed
          ? result.passConclusion
          : result.failConclusion;
        if (!conclusion) return null;
        return (
          <div className="expectation__conclusion">
            <span className="expectation__conclusion-prefix">Conclusion:</span>{" "}
            <span className="expectation__conclusion-text">{conclusion}</span>
          </div>
        );
      })()}

      {!result.passed && offendingEvents.length > 0 ? (
        <div className="expectation__offenders">
          <div className="expectation__offenders-row">
            <p className="expectation__offenders-label">
              The AI cited these events as evidence:
            </p>
            <button
              type="button"
              className="expectation__toggle"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open ? "Hide" : "Show"}
            </button>
          </div>
          {open ? (
            <ul className="expectation__offenders-list">
              {offendingEvents.map((line, idx) => (
                <li key={idx}>
                  <code>{line}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// For failed checks, surface which events the offending hints cited so the
// user can see *why* the check failed rather than just *that* it did.
function collectOffendingEvents(
  result: ExpectationResult,
  hints: AnomalyHint[],
  parsedEvents: ParsedEvent[],
): string[] {
  if (result.passed) return [];

  const eventById = new Map(parsedEvents.map((e) => [e.id, e]));

  // Two failure shapes:
  //   1. Negative check (load-bearing): hints SHOULDN'T cite certain events
  //      but did. Show every event each hint cited.
  //   2. Positive check: hints SHOULD cite certain events but didn't. Hard to
  //      surface "what's missing" generically, so we instead show what each
  //      emitted hint *did* cite, so the user sees what the AI looked at.
  const lines: string[] = [];
  for (const hint of hints) {
    for (const eventId of hint.evidence_event_ids) {
      const event = eventById.get(eventId);
      if (event) lines.push(eventOneLiner(event));
    }
  }
  // Dedupe and cap so the panel doesn't explode for hints citing 30 events.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    if (!seen.has(line)) {
      seen.add(line);
      deduped.push(line);
      if (deduped.length >= 12) {
        deduped.push(`(+${lines.length - deduped.length} more)`);
        break;
      }
    }
  }
  return deduped;
}

export function ExpectationList(
  props: ExpectationListProps,
): React.ReactElement {
  if (props.results.length === 0) {
    return <p className="expectation-empty">No expectations evaluated yet.</p>;
  }
  return (
    <div className="expectation-list">
      {props.results.map((r, idx) => (
        <ExpectationRow
          key={`${r.label}-${idx}`}
          result={r}
          hints={props.hints}
          parsedEvents={props.parsedEvents}
        />
      ))}
    </div>
  );
}
