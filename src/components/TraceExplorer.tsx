import { useMemo, useState } from "react";

import type {
  ActionItem,
  AnomalyHint,
  ParsedEvent,
  Source,
  StreamSummary,
  Trend,
} from "../../contracts/artifacts";

export interface TraceExplorerProps {
  visible: boolean;
  actions: ActionItem[];
  trends: Trend[];
  summariesBySource: Partial<Record<Source, StreamSummary>>;
  hintsBySource: Record<Source, AnomalyHint[]>;
  parsedEventsBySource: Record<Source, ParsedEvent[]>;
  rawEventsBySource: Record<Source, unknown[]>;
}

interface IndexMaps {
  trendById: Map<string, Trend>;
  summaryById: Map<string, StreamSummary>;
  hintById: Map<string, AnomalyHint>;
  eventById: Map<string, ParsedEvent>;
}

function buildIndex(props: TraceExplorerProps): IndexMaps {
  return {
    trendById: new Map(props.trends.map((t) => [t.id, t])),
    summaryById: new Map(
      Object.values(props.summariesBySource)
        .filter((s): s is StreamSummary => Boolean(s))
        .map((s) => [s.id, s]),
    ),
    hintById: new Map(
      Object.values(props.hintsBySource)
        .flat()
        .map((h) => [h.id, h]),
    ),
    eventById: new Map(
      Object.values(props.parsedEventsBySource)
        .flat()
        .map((e) => [e.id, e]),
    ),
  };
}

// Stage 3 — Trace Explorer.
//
// Click any ActionItem header to expand its full provenance chain:
// Trend → StreamSummary → Hint → ParsedEvent → raw log line.
//
// Pure in-memory graph traversal via Map<id, artifact> indexes built
// on every render. Cheap at the scale of the tutorial fixture
// (hundreds of artifacts max). No async, no extra API calls.
export function TraceExplorer(
  props: TraceExplorerProps,
): React.ReactElement | null {
  if (!props.visible) return null;
  if (props.actions.length === 0) return null;

  const idx = useMemo(() => buildIndex(props), [props]);

  return (
    <section className="trace-explorer">
      <header className="cross-stream-section__header">
        <h2 className="cross-stream-section__title">Trace Explorer</h2>
        <span className="cross-stream-section__subtitle">
          Click any action item to walk back through its evidence
          chain — trend → summary → hint → parsed event → raw log line.
          The full provenance is always one click away.
        </span>
      </header>

      <div className="trace-list">
        {props.actions.map((action) => (
          <ActionTraceTree
            key={action.id}
            action={action}
            idx={idx}
            rawEventsBySource={props.rawEventsBySource}
          />
        ))}
      </div>
    </section>
  );
}

interface ActionTraceTreeProps {
  action: ActionItem;
  idx: IndexMaps;
  rawEventsBySource: Record<Source, unknown[]>;
}

function ActionTraceTree(
  props: ActionTraceTreeProps,
): React.ReactElement {
  const [open, setOpen] = useState(false);
  const trends = props.action.trend_ids
    .map((id) => props.idx.trendById.get(id))
    .filter((t): t is Trend => Boolean(t));

  return (
    <div className="trace-node trace-node--action">
      <button
        type="button"
        className="trace-node__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`trace-node__chevron ${open ? "trace-node__chevron--open" : ""}`}>
          ▶
        </span>
        <span
          className={`trace-node__priority trace-node__priority--${props.action.priority.toLowerCase()}`}
        >
          {props.action.priority}
        </span>
        <span className="trace-node__title">{props.action.title}</span>
        <span className="trace-node__owner">[{props.action.suggested_owner}]</span>
      </button>
      {open ? (
        <div className="trace-node__children">
          {trends.length === 0 ? (
            <p className="trace-node__empty">
              No upstream trends linked to this action item.
            </p>
          ) : (
            trends.map((t) => (
              <TrendTraceNode
                key={t.id}
                trend={t}
                idx={props.idx}
                rawEventsBySource={props.rawEventsBySource}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

interface TrendTraceNodeProps {
  trend: Trend;
  idx: IndexMaps;
  rawEventsBySource: Record<Source, unknown[]>;
}

function TrendTraceNode(
  props: TrendTraceNodeProps,
): React.ReactElement {
  const [open, setOpen] = useState(true); // open one level down by default
  return (
    <div className="trace-node trace-node--trend">
      <button
        type="button"
        className="trace-node__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`trace-node__chevron ${open ? "trace-node__chevron--open" : ""}`}>
          ▶
        </span>
        <span className="trace-node__type">trend</span>
        <span className="trace-node__title">{props.trend.description}</span>
        <span className="trace-node__meta">
          confidence {(props.trend.confidence * 100).toFixed(0)}%
        </span>
      </button>
      {open ? (
        <div className="trace-node__children">
          {props.trend.evidence.map((ev) => {
            const summaryId = Array.from(props.idx.summaryById.values()).find(
              (s) => s.source === ev.source,
            )?.id;
            const summary = summaryId
              ? props.idx.summaryById.get(summaryId)
              : undefined;
            return (
              <SummaryTraceNode
                key={ev.source}
                source={ev.source}
                summary={summary}
                hintIds={ev.hint_ids}
                eventIds={ev.parsed_event_ids}
                idx={props.idx}
                rawEventsBySource={props.rawEventsBySource}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

interface SummaryTraceNodeProps {
  source: Source;
  summary: StreamSummary | undefined;
  hintIds: string[];
  eventIds: string[];
  idx: IndexMaps;
  rawEventsBySource: Record<Source, unknown[]>;
}

function SummaryTraceNode(
  props: SummaryTraceNodeProps,
): React.ReactElement {
  const [open, setOpen] = useState(false);
  const hints = props.hintIds
    .map((id) => props.idx.hintById.get(id))
    .filter((h): h is AnomalyHint => Boolean(h));

  return (
    <div className="trace-node trace-node--summary">
      <button
        type="button"
        className="trace-node__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`trace-node__chevron ${open ? "trace-node__chevron--open" : ""}`}>
          ▶
        </span>
        <span className="trace-node__type">{props.source}</span>
        <span className="trace-node__title">
          {props.summary?.narrative
            ? props.summary.narrative.length > 140
              ? `${props.summary.narrative.slice(0, 137)}…`
              : props.summary.narrative
            : "(no summary attached)"}
        </span>
        <span className="trace-node__meta">
          {hints.length} hint(s) · {props.eventIds.length} event(s)
        </span>
      </button>
      {open ? (
        <div className="trace-node__children">
          {hints.map((h) => (
            <HintTraceNode
              key={h.id}
              hint={h}
              source={props.source}
              idx={props.idx}
              rawEventsBySource={props.rawEventsBySource}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface HintTraceNodeProps {
  hint: AnomalyHint;
  source: Source;
  idx: IndexMaps;
  rawEventsBySource: Record<Source, unknown[]>;
}

function HintTraceNode(
  props: HintTraceNodeProps,
): React.ReactElement {
  const [open, setOpen] = useState(false);
  const events = props.hint.evidence_event_ids
    .map((id) => props.idx.eventById.get(id))
    .filter((e): e is ParsedEvent => Boolean(e));

  return (
    <div className="trace-node trace-node--hint">
      <button
        type="button"
        className="trace-node__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`trace-node__chevron ${open ? "trace-node__chevron--open" : ""}`}>
          ▶
        </span>
        <span className="trace-node__type">hint</span>
        <span className="trace-node__title">
          {props.hint.description.length > 140
            ? `${props.hint.description.slice(0, 137)}…`
            : props.hint.description}
        </span>
        <span className="trace-node__meta">
          severity {props.hint.severity} · {events.length} event(s)
        </span>
      </button>
      {open ? (
        <div className="trace-node__children">
          {events.slice(0, 50).map((e) => (
            <EventTraceLeaf
              key={e.id}
              event={e}
              rawEvent={props.rawEventsBySource[props.source]?.[e.raw_index]}
            />
          ))}
          {events.length > 50 ? (
            <p className="trace-node__empty">
              (+{events.length - 50} more events not shown)
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface EventTraceLeafProps {
  event: ParsedEvent;
  rawEvent: unknown;
}

function EventTraceLeaf(
  props: EventTraceLeafProps,
): React.ReactElement {
  const [open, setOpen] = useState(false);
  const time = /T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(
    props.event.event_time,
  )?.[1] ?? props.event.event_time;
  const subj =
    props.event.subject.endpoint ??
    props.event.subject.path ??
    "?";
  const oneLiner = `[${props.event.raw_index}] ${time} ${props.event.event_type} ip=${props.event.actor.ip ?? "-"} ${subj}`;

  return (
    <div className="trace-node trace-node--event">
      <button
        type="button"
        className="trace-node__toggle trace-node__toggle--leaf"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`trace-node__chevron ${open ? "trace-node__chevron--open" : ""}`}>
          ▶
        </span>
        <code className="trace-node__event-line">{oneLiner}</code>
      </button>
      {open ? (
        <div className="trace-node__raw">
          <p className="trace-node__raw-label">Raw log line:</p>
          <pre className="trace-node__raw-pre">
            {JSON.stringify(props.rawEvent, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
