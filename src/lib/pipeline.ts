// Browser-side composition of the existing pure pipeline functions.
// All of these modules are already browser-safe (no node:fs, no node:crypto):
//   - contracts/artifacts.ts (Zod schemas + types)
//   - parsers/*              (pure event-shape transforms)
//   - agents/hint.ts         (system prompt + buildUserPrompt + parseHintResponse + composeHints)
//   - agents/expectations.ts (evaluateExpectations)
//
// This file is the single seam between those modules and the React UI.

import {
  LogChunkSchema,
  type ActionItem,
  type AnomalyHint,
  type LogChunk,
  type ParsedEvent,
  type Source,
  type StreamSummary,
  type Trend,
} from "../../contracts/artifacts";
import { api, edge, identity } from "../../parsers/index";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  composeHints,
  parseHintResponse,
  type RawHint,
} from "../../agents/hint";
import {
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  composeStreamSummary,
  parseSummaryResponse,
  type RawSummary,
} from "../../agents/summary";
import {
  TREND_SYSTEM_PROMPT,
  buildTrendUserPrompt,
  composeTrends,
  parseTrendResponse,
  type RawTrend,
} from "../../agents/trend";
import {
  ACTION_SYSTEM_PROMPT,
  buildActionUserPrompt,
  composeActionItems,
  parseActionResponse,
  type RawActionItem,
} from "../../agents/action";
import {
  evaluateActionExpectations,
  evaluateExpectations,
  evaluateSummaryExpectations,
  evaluateTrendExpectations,
  type ExpectationResult,
} from "../../agents/expectations";

import edgeJson from "../../fixtures/tutorial/edge.json";
import identityJson from "../../fixtures/tutorial/identity.json";
import apiJson from "../../fixtures/tutorial/api.json";

interface RawFile {
  source: Source;
  query: string;
  time_range_start: string;
  time_range_end: string;
  events: unknown[];
}

const FIXTURES: Record<Source, RawFile> = {
  edge: edgeJson as RawFile,
  identity: identityJson as RawFile,
  api: apiJson as RawFile,
};

const PARSERS: Record<Source, (chunk: LogChunk) => ParsedEvent[]> = {
  edge: edge.parse,
  identity: identity.parse,
  api: api.parse,
};

export const SOURCES: ReadonlyArray<Source> = ["edge", "identity", "api"];

export const STREAM_LABELS: Record<Source, string> = {
  edge: "Edge",
  identity: "Identity",
  api: "API",
};

// Native UI callouts approved verbatim by the director-side review.
// Do not paraphrase these without sign-off — they're load-bearing for trust.
export const STREAM_CALLOUTS: Record<Source, string> = {
  edge:
    "Shows what reached the edge / WAF tier and whether it allowed, logged, challenged, or blocked the request.",
  identity:
    "Shows authentication outcomes and whether failures cluster by actor fingerprint.",
  api:
    "Shows whether application traffic confirms the attack or is unrelated noise.",
};

// Investigation-level takeaway, rendered at the bottom of the streams
// the moment all three responses parse (regardless of pass/fail). This
// is the demystification payoff: synthesizes the per-stream conclusions
// into the headline + actions a Director walks away with.
//
// Verbatim from the director-side acceptance message — DO NOT paraphrase.
// When the incident fixture lands, add INCIDENT_INVESTIGATION_SUMMARY
// alongside this constant and select based on the active fixture.
export const TUTORIAL_INVESTIGATION_SUMMARY = {
  headline:
    "Attack identified: Password spray from 185.220.101.42 targeting 30 users",
  actions: [
    "Block IP at the edge",
    "Audit affected user accounts",
    "Ignore unrelated api token expirations",
  ],
} as const;

export interface PreparedStream {
  source: Source;
  chunk: LogChunk;
  parsedEvents: ParsedEvent[];
  /** Combined system + user prompt — used by Manual mode (paste-into-
   *  chat-AI) and as the "Copy prompt" target. Read-only display. */
  promptText: string;
  /** User-message portion only — this is what gets sent in
   *  `messages: [{role: "user", content}]`. In API mode the textarea
   *  is bound to this and is editable; the user's edits become the
   *  `userPromptOverride` threaded through `runStream`. */
  userPromptText: string;
  rawEventCount: number;
}

// Build all three streams in one pass at session start. Pure given the
// pipelineRunId — chunk.id is derived from `chunk-${source}-${pipelineRunId}`
// so the same run id produces the same chunk ids and therefore the same
// ParsedEvent ids on every render. Important for export/import round-trip.
export function prepareStreams(
  pipelineRunId: string,
  createdAt: string,
): PreparedStream[] {
  return SOURCES.map((source) => {
    const raw = FIXTURES[source];
    const chunk: LogChunk = LogChunkSchema.parse({
      id: `chunk-${source}-${pipelineRunId}`,
      pipeline_run_id: pipelineRunId,
      created_at: createdAt,
      source,
      query_id: `tutorial-${source}`,
      time_range_start: raw.time_range_start,
      time_range_end: raw.time_range_end,
      chunk_index: 0,
      raw: raw.events,
      pulled_at: createdAt,
    });
    const parsedEvents = PARSERS[source](chunk);
    const userPrompt = buildUserPrompt({
      source,
      events: parsedEvents,
      time_range_start: raw.time_range_start,
      time_range_end: raw.time_range_end,
    });
    const promptText = `${SYSTEM_PROMPT}\n\n${userPrompt}`;
    return {
      source,
      chunk,
      parsedEvents,
      promptText,
      userPromptText: userPrompt,
      rawEventCount: raw.events.length,
    };
  });
}

// Per-stream result of running the parse → compose pipeline against
// whatever JSON the user pasted. All fields beyond input are optional
// because parsing can fail.
export interface StreamComputation {
  responseText: string;
  parseError: string | null;
  rawHints: RawHint[];
  hints: AnomalyHint[];
  expectations: ExpectationResult[];
}

const EMPTY_COMPUTATION_FIELDS = {
  rawHints: [] as RawHint[],
  hints: [] as AnomalyHint[],
  expectations: [] as ExpectationResult[],
};

export function computeStream(
  stream: PreparedStream,
  responseText: string,
  pipelineRunId: string,
  createdAt: string,
  agentRunId: string,
): StreamComputation {
  if (responseText.trim() === "") {
    return {
      responseText,
      parseError: null,
      ...EMPTY_COMPUTATION_FIELDS,
    };
  }

  let rawHints: RawHint[];
  try {
    rawHints = parseHintResponse(responseText);
  } catch (err) {
    return {
      responseText,
      parseError: (err as Error).message,
      ...EMPTY_COMPUTATION_FIELDS,
    };
  }

  const hints = composeHints({
    rawHints,
    chunkId: stream.chunk.id,
    pipelineRunId,
    agentRunId,
    parsedEvents: stream.parsedEvents,
    createdAt,
  });

  const expectations = evaluateExpectations({
    source: stream.source,
    parsed: stream.parsedEvents,
    hints,
  });

  return {
    responseText,
    parseError: null,
    rawHints,
    hints,
    expectations,
  };
}

// ============================================================
// Stage 3 — Summary stage compute + prompt
// ============================================================

export interface StreamSummaryComputation {
  responseText: string;
  parseError: string | null;
  raw: RawSummary | null;
  summary: StreamSummary | null;
  expectations: ExpectationResult[];
}

const EMPTY_SUMMARY_COMPUTATION = {
  raw: null,
  summary: null,
  expectations: [] as ExpectationResult[],
};

export function buildSummaryPromptText(
  stream: PreparedStream,
  hints: AnomalyHint[],
  priorSummary?: StreamSummary,
): string {
  const userPrompt = buildSummaryUserPrompt({
    source: stream.source,
    hints,
    parsedEvents: stream.parsedEvents,
    time_range_start: stream.chunk.time_range_start,
    time_range_end: stream.chunk.time_range_end,
    priorSummary,
  });
  return `${SUMMARY_SYSTEM_PROMPT}\n\n${userPrompt}`;
}

export function computeStreamSummary(
  stream: PreparedStream,
  hints: AnomalyHint[],
  responseText: string,
  pipelineRunId: string,
  createdAt: string,
  agentRunId: string,
): StreamSummaryComputation {
  if (responseText.trim() === "") {
    return {
      responseText,
      parseError: null,
      ...EMPTY_SUMMARY_COMPUTATION,
    };
  }

  let raw: RawSummary;
  try {
    raw = parseSummaryResponse(responseText);
  } catch (err) {
    return {
      responseText,
      parseError: (err as Error).message,
      ...EMPTY_SUMMARY_COMPUTATION,
    };
  }

  const summary = composeStreamSummary({
    raw,
    chunkId: stream.chunk.id,
    source: stream.source,
    pipelineRunId,
    agentRunId,
    hints,
    timeRangeStart: stream.chunk.time_range_start,
    timeRangeEnd: stream.chunk.time_range_end,
    createdAt,
  });

  const expectations = evaluateSummaryExpectations({
    source: stream.source,
    summary,
    parsedEvents: stream.parsedEvents,
  });

  return {
    responseText,
    parseError: null,
    raw,
    summary,
    expectations,
  };
}

// ============================================================
// Stage 3 — Trend stage compute + prompt
// ============================================================

export interface TrendComputation {
  responseText: string;
  parseError: string | null;
  rawTrends: RawTrend[];
  trends: Trend[];
  expectations: ExpectationResult[];
}

const EMPTY_TREND_COMPUTATION = {
  rawTrends: [] as RawTrend[],
  trends: [] as Trend[],
  expectations: [] as ExpectationResult[],
};

export interface TrendStageInputs {
  streams: PreparedStream[];
  summariesBySource: Partial<Record<Source, StreamSummary>>;
  hintsBySource: Record<Source, AnomalyHint[]>;
  parsedEventsBySource: Record<Source, ParsedEvent[]>;
  timeRangeStart: string;
  timeRangeEnd: string;
}

export function buildTrendPromptText(input: TrendStageInputs): string {
  const userPrompt = buildTrendUserPrompt({
    streams: SOURCES.map((source) => ({
      source,
      summary: input.summariesBySource[source],
      hints: input.hintsBySource[source] ?? [],
      parsedEvents: input.parsedEventsBySource[source] ?? [],
    })),
    time_range_start: input.timeRangeStart,
    time_range_end: input.timeRangeEnd,
  });
  return `${TREND_SYSTEM_PROMPT}\n\n${userPrompt}`;
}

export function computeTrend(
  responseText: string,
  pipelineRunId: string,
  createdAt: string,
  agentRunId: string,
  inputs: TrendStageInputs,
): TrendComputation {
  if (responseText.trim() === "") {
    return {
      responseText,
      parseError: null,
      ...EMPTY_TREND_COMPUTATION,
    };
  }

  let rawTrends: RawTrend[];
  try {
    rawTrends = parseTrendResponse(responseText);
  } catch (err) {
    return {
      responseText,
      parseError: (err as Error).message,
      ...EMPTY_TREND_COMPUTATION,
    };
  }

  const trends = composeTrends({
    rawTrends,
    pipelineRunId,
    agentRunId,
    summariesBySource: inputs.summariesBySource,
    hintsBySource: inputs.hintsBySource,
    parsedEventsBySource: inputs.parsedEventsBySource,
    createdAt,
  });

  const expectations = evaluateTrendExpectations({
    trends,
    parsedEventsBySource: inputs.parsedEventsBySource,
  });

  return {
    responseText,
    parseError: null,
    rawTrends,
    trends,
    expectations,
  };
}

// ============================================================
// Stage 3 — Action stage compute + prompt
// ============================================================

export interface ActionComputation {
  responseText: string;
  parseError: string | null;
  rawActions: RawActionItem[];
  actions: ActionItem[];
  expectations: ExpectationResult[];
}

const EMPTY_ACTION_COMPUTATION = {
  rawActions: [] as RawActionItem[],
  actions: [] as ActionItem[],
  expectations: [] as ExpectationResult[],
};

export interface ActionStageInputs {
  trends: Trend[];
  timeRangeStart: string;
  timeRangeEnd: string;
}

export function buildActionPromptText(input: ActionStageInputs): string {
  const userPrompt = buildActionUserPrompt({
    trends: input.trends,
    time_range_start: input.timeRangeStart,
    time_range_end: input.timeRangeEnd,
  });
  return `${ACTION_SYSTEM_PROMPT}\n\n${userPrompt}`;
}

export function computeAction(
  responseText: string,
  pipelineRunId: string,
  createdAt: string,
  agentRunId: string,
  inputs: ActionStageInputs,
): ActionComputation {
  if (responseText.trim() === "") {
    return {
      responseText,
      parseError: null,
      ...EMPTY_ACTION_COMPUTATION,
    };
  }

  let rawActions: RawActionItem[];
  try {
    rawActions = parseActionResponse(responseText);
  } catch (err) {
    return {
      responseText,
      parseError: (err as Error).message,
      ...EMPTY_ACTION_COMPUTATION,
    };
  }

  const actions = composeActionItems({
    raws: rawActions,
    pipelineRunId,
    agentRunId,
    trends: inputs.trends,
    createdAt,
  });

  const expectations = evaluateActionExpectations({ actions });

  return {
    responseText,
    parseError: null,
    rawActions,
    actions,
    expectations,
  };
}

export type {
  ExpectationResult,
  AnomalyHint,
  ParsedEvent,
  RawHint,
  Source,
  StreamSummary,
  Trend,
  ActionItem,
  RawSummary,
  RawTrend,
  RawActionItem,
};
