import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { z } from "zod";

import {
  buildActionPromptText,
  buildSummaryPromptText,
  buildTrendPromptText,
  computeAction,
  computeStream,
  computeStreamSummary,
  computeTrend,
  prepareStreams,
  SOURCES,
  type ActionComputation,
  type AnomalyHint,
  type ParsedEvent,
  type PreparedStream,
  type StreamComputation,
  type StreamSummary,
  type StreamSummaryComputation,
  type Trend,
  type TrendComputation,
} from "../lib/pipeline";
import {
  callAnthropic,
  makeBrowserAnthropicBackend,
} from "../lib/api-client";
import type { Source } from "../../contracts/artifacts";
import { composeHints, parseHintResponse } from "../../agents/hint";
import {
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  composeStreamSummary,
  parseSummaryResponse,
} from "../../agents/summary";
import {
  TREND_SYSTEM_PROMPT,
  buildTrendUserPrompt,
  composeTrends,
  parseTrendResponse,
} from "../../agents/trend";
import { ACTION_SYSTEM_PROMPT, buildActionUserPrompt } from "../../agents/action";

// ============================================================
// Persisted state (InvestigationFile) — minimal by design.
// Everything observable (parsed events, hints, expectation results)
// is derived at runtime from fixture + pipelineRunId + responseText,
// so the only things worth persisting are:
//   - pipelineRunId / createdAt (stable identity for the run)
//   - responseText per stream (the only true user input)
//   - firstSuccessfulRunModalShown (avoids re-prompting after dismiss)
//
// In-memory-only state (RuntimeState) — Stage 2 additions:
//   - backend mode (manual | anthropic)
//   - apiKey (NEVER persisted, NEVER exported)
//   - perStream {status, error, tokens} (in-flight call status)
//
// `schemaVersion` is the load-bearing forward-compat anchor on the
// PERSISTED shape only. RuntimeState changes never bump it because
// runtime state isn't in the file.
// ============================================================

export const SCHEMA_VERSION = 2 as const;

const StreamSliceSchema = z.object({
  responseText: z.string(),
});

// Stage 3 additions — all optional, additive only. v1 files (without
// these fields) load fine via Zod's default-strip behavior. New files
// remain readable by older consumers (Zod ignores unknown keys by
// default on `.object()`). No `schemaVersion` bump needed.
const Stage3StreamSliceSchema = z.object({
  responseText: z.string(),
});

const Stage3SummariesSchema = z
  .object({
    edge: Stage3StreamSliceSchema.optional(),
    identity: Stage3StreamSliceSchema.optional(),
    api: Stage3StreamSliceSchema.optional(),
  })
  .optional();

const Stage3SingletonSchema = z
  .object({
    responseText: z.string(),
  })
  .optional();

export const InvestigationFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  pipelineRunId: z.string().min(1),
  createdAt: z.string().datetime(),
  streams: z.object({
    edge: StreamSliceSchema,
    identity: StreamSliceSchema,
    api: StreamSliceSchema,
  }),
  firstSuccessfulRunModalShown: z.boolean().optional().default(false),
  // Stage 3
  summaries: Stage3SummariesSchema,
  trend: Stage3SingletonSchema,
  action: Stage3SingletonSchema,
});

export type InvestigationFile = z.infer<typeof InvestigationFileSchema>;

// ============================================================
// Stage 2 runtime types — explicitly NOT in InvestigationFile.
// ============================================================

export type BackendMode = "manual" | "anthropic";

export interface PerStreamRuntime {
  status: "idle" | "running" | "error";
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface RuntimeState {
  backend: BackendMode;
  /**
   * Memory-only API key. **Never** written to localStorage, **never**
   * included in the export payload, **never** part of InvestigationFile.
   * The reducer + serializers enforce this structurally — see
   * buildExportPayload and the localStorage useEffect below.
   */
  apiKey: string;
  /**
   * Per-stream user-prompt overrides. Memory-only, never persisted,
   * never exported. Empty string == no override (canonical prompt
   * sent on Run). Cleared on RESET_INVESTIGATION, LOAD_INVESTIGATION,
   * and tab close.
   *
   * The override is the user-message portion only; the system prompt
   * stays canonical (it carries the load-bearing JSON contract and
   * "TokenExpired is benign" rule that protects the demo).
   */
  promptOverrides: Record<Source, string>;
  /** Stage 1/2 hint stage status per source. */
  perStream: Record<Source, PerStreamRuntime>;
  /** Stage 3 summary stage status per source. */
  summary: { perStream: Record<Source, PerStreamRuntime> };
  /** Stage 3 trend stage status (single, cross-stream). */
  trend: PerStreamRuntime;
  /** Stage 3 action stage status (single, cross-stream). */
  action: PerStreamRuntime;
}

export interface InvestigationState extends InvestigationFile {
  localStorageEnabled: boolean;
  /** True if any user-driven mutation has happened since the last successful export. */
  hasUnsavedChanges: boolean;
  runtime: RuntimeState;
}

const LOCAL_STORAGE_KEY = "threat-trace.investigation.v2";
const LOCAL_STORAGE_PREF_KEY = "threat-trace.localStorage.v2";

function emptyInvestigation(): InvestigationFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    pipelineRunId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    streams: {
      edge: { responseText: "" },
      identity: { responseText: "" },
      api: { responseText: "" },
    },
    firstSuccessfulRunModalShown: false,
    // Stage 3 fields start undefined — Zod treats undefined as missing
    // optional, so the export payload is identical to v1 until the
    // user actually runs Stage 3.
  };
}

function emptyPerStream(): Record<Source, PerStreamRuntime> {
  const out: Partial<Record<Source, PerStreamRuntime>> = {};
  for (const source of SOURCES) {
    out[source] = {
      status: "idle",
      error: null,
      inputTokens: null,
      outputTokens: null,
    };
  }
  return out as Record<Source, PerStreamRuntime>;
}

function emptyPerStreamRuntime(): PerStreamRuntime {
  return {
    status: "idle",
    error: null,
    inputTokens: null,
    outputTokens: null,
  };
}

function emptyPromptOverrides(): Record<Source, string> {
  const out: Partial<Record<Source, string>> = {};
  for (const source of SOURCES) out[source] = "";
  return out as Record<Source, string>;
}

function emptyRuntime(): RuntimeState {
  return {
    backend: "manual",
    apiKey: "",
    promptOverrides: emptyPromptOverrides(),
    perStream: emptyPerStream(),
    summary: { perStream: emptyPerStream() },
    trend: emptyPerStreamRuntime(),
    action: emptyPerStreamRuntime(),
  };
}

function hasAnyContent(state: {
  streams: InvestigationFile["streams"];
  summaries?: InvestigationFile["summaries"];
  trend?: InvestigationFile["trend"];
  action?: InvestigationFile["action"];
}): boolean {
  if (
    SOURCES.some(
      (source) => state.streams[source].responseText.trim() !== "",
    )
  ) {
    return true;
  }
  if (
    state.summaries &&
    SOURCES.some((s) => state.summaries?.[s]?.responseText.trim() !== "")
  ) {
    return true;
  }
  if (state.trend?.responseText.trim() !== "" && state.trend?.responseText) {
    return true;
  }
  if (state.action?.responseText.trim() !== "" && state.action?.responseText) {
    return true;
  }
  return false;
}

// ============================================================
// Reducer
// ============================================================

type Action =
  | { type: "SET_RESPONSE"; source: Source; text: string }
  | { type: "CLEAR_RESPONSE"; source: Source }
  | { type: "RESET_INVESTIGATION" }
  | { type: "LOAD_INVESTIGATION"; payload: InvestigationFile }
  | { type: "SET_LOCAL_STORAGE_ENABLED"; enabled: boolean }
  | { type: "MARK_EXPORTED" }
  | { type: "MARK_FIRST_RUN_MODAL_SHOWN" }
  | { type: "SET_PROMPT_OVERRIDE"; source: Source; text: string }
  // Stage 2 actions
  | { type: "SET_BACKEND"; backend: BackendMode }
  | { type: "SET_API_KEY"; key: string }
  | { type: "FORGET_API_KEY" }
  | { type: "STREAM_RUN_START"; source: Source }
  | {
      type: "STREAM_RUN_OK";
      source: Source;
      rawText: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "STREAM_RUN_ERROR"; source: Source; error: string }
  // Stage 3 actions
  | { type: "SET_SUMMARY_RESPONSE"; source: Source; text: string }
  | { type: "CLEAR_SUMMARY_RESPONSE"; source: Source }
  | { type: "SUMMARY_RUN_START"; source: Source }
  | {
      type: "SUMMARY_RUN_OK";
      source: Source;
      rawText: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "SUMMARY_RUN_ERROR"; source: Source; error: string }
  | { type: "SET_TREND_RESPONSE"; text: string }
  | { type: "CLEAR_TREND_RESPONSE" }
  | { type: "TREND_RUN_START" }
  | {
      type: "TREND_RUN_OK";
      rawText: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "TREND_RUN_ERROR"; error: string }
  | { type: "SET_ACTION_RESPONSE"; text: string }
  | { type: "CLEAR_ACTION_RESPONSE" }
  | { type: "ACTION_RUN_START" }
  | {
      type: "ACTION_RUN_OK";
      rawText: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "ACTION_RUN_ERROR"; error: string };

function reducer(
  state: InvestigationState,
  action: Action,
): InvestigationState {
  switch (action.type) {
    case "SET_RESPONSE": {
      const next = {
        ...state,
        streams: {
          ...state.streams,
          [action.source]: { responseText: action.text },
        },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "CLEAR_RESPONSE": {
      const next = {
        ...state,
        streams: {
          ...state.streams,
          [action.source]: { responseText: "" },
        },
        runtime: {
          ...state.runtime,
          perStream: {
            ...state.runtime.perStream,
            [action.source]: {
              status: "idle" as const,
              error: null,
              inputTokens: null,
              outputTokens: null,
            },
          },
        },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "RESET_INVESTIGATION":
      // Reset wipes pasted responses (Stage 1, 2, AND 3), gets a new
      // pipeline_run_id, clears all in-flight runtime state including
      // prompt overrides. Preserves the user's backend mode + apiKey
      // so they don't have to re-enter their key for a fresh investigation.
      return {
        ...emptyInvestigation(),
        localStorageEnabled: state.localStorageEnabled,
        hasUnsavedChanges: false,
        runtime: {
          ...state.runtime,
          promptOverrides: emptyPromptOverrides(),
          perStream: emptyPerStream(),
          summary: { perStream: emptyPerStream() },
          trend: emptyPerStreamRuntime(),
          action: emptyPerStreamRuntime(),
        },
      };
    case "LOAD_INVESTIGATION":
      // Imported state matches a file on disk, so nothing is "unsaved"
      // *yet* — but if the user edits, it'll go true on next mutation.
      // All in-flight runtime resets, including prompt overrides
      // (which aren't in the file). Backend + apiKey preserved.
      return {
        ...action.payload,
        localStorageEnabled: state.localStorageEnabled,
        hasUnsavedChanges: false,
        runtime: {
          ...state.runtime,
          promptOverrides: emptyPromptOverrides(),
          perStream: emptyPerStream(),
          summary: { perStream: emptyPerStream() },
          trend: emptyPerStreamRuntime(),
          action: emptyPerStreamRuntime(),
        },
      };
    case "SET_LOCAL_STORAGE_ENABLED":
      return { ...state, localStorageEnabled: action.enabled };
    case "MARK_EXPORTED":
      return { ...state, hasUnsavedChanges: false };
    case "MARK_FIRST_RUN_MODAL_SHOWN":
      return { ...state, firstSuccessfulRunModalShown: true };
    case "SET_PROMPT_OVERRIDE":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          promptOverrides: {
            ...state.runtime.promptOverrides,
            [action.source]: action.text,
          },
        },
      };
    case "SET_BACKEND":
      return {
        ...state,
        runtime: { ...state.runtime, backend: action.backend },
      };
    case "SET_API_KEY":
      return {
        ...state,
        runtime: { ...state.runtime, apiKey: action.key },
      };
    case "FORGET_API_KEY":
      return {
        ...state,
        runtime: { ...state.runtime, apiKey: "" },
      };
    case "STREAM_RUN_START":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          perStream: {
            ...state.runtime.perStream,
            [action.source]: {
              status: "running",
              error: null,
              inputTokens: null,
              outputTokens: null,
            },
          },
        },
      };
    case "STREAM_RUN_OK": {
      // Successful API run: write the model's rawText into the same
      // streams[source].responseText slot Manual mode populates, so
      // computeStream + ExpectationList work identically. Update
      // perStream with idle status + token usage. Mark unsaved.
      const next: InvestigationState = {
        ...state,
        streams: {
          ...state.streams,
          [action.source]: { responseText: action.rawText },
        },
        runtime: {
          ...state.runtime,
          perStream: {
            ...state.runtime.perStream,
            [action.source]: {
              status: "idle",
              error: null,
              inputTokens: action.inputTokens,
              outputTokens: action.outputTokens,
            },
          },
        },
        hasUnsavedChanges: false, // recomputed below
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "STREAM_RUN_ERROR":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          perStream: {
            ...state.runtime.perStream,
            [action.source]: {
              status: "error",
              error: action.error,
              inputTokens: null,
              outputTokens: null,
            },
          },
        },
      };
    // ==========================================================
    // Stage 3 — Summary stage (per-source)
    // ==========================================================
    case "SET_SUMMARY_RESPONSE": {
      const next: InvestigationState = {
        ...state,
        summaries: {
          ...(state.summaries ?? {}),
          [action.source]: { responseText: action.text },
        },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "CLEAR_SUMMARY_RESPONSE": {
      const nextSummaries = { ...(state.summaries ?? {}) };
      delete nextSummaries[action.source];
      const next: InvestigationState = {
        ...state,
        summaries:
          Object.keys(nextSummaries).length === 0 ? undefined : nextSummaries,
        runtime: {
          ...state.runtime,
          summary: {
            perStream: {
              ...state.runtime.summary.perStream,
              [action.source]: emptyPerStreamRuntime(),
            },
          },
        },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "SUMMARY_RUN_START":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          summary: {
            perStream: {
              ...state.runtime.summary.perStream,
              [action.source]: {
                status: "running",
                error: null,
                inputTokens: null,
                outputTokens: null,
              },
            },
          },
        },
      };
    case "SUMMARY_RUN_OK": {
      const next: InvestigationState = {
        ...state,
        summaries: {
          ...(state.summaries ?? {}),
          [action.source]: { responseText: action.rawText },
        },
        runtime: {
          ...state.runtime,
          summary: {
            perStream: {
              ...state.runtime.summary.perStream,
              [action.source]: {
                status: "idle",
                error: null,
                inputTokens: action.inputTokens,
                outputTokens: action.outputTokens,
              },
            },
          },
        },
        hasUnsavedChanges: false,
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "SUMMARY_RUN_ERROR":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          summary: {
            perStream: {
              ...state.runtime.summary.perStream,
              [action.source]: {
                status: "error",
                error: action.error,
                inputTokens: null,
                outputTokens: null,
              },
            },
          },
        },
      };
    // ==========================================================
    // Stage 3 — Trend stage (single, cross-stream)
    // ==========================================================
    case "SET_TREND_RESPONSE": {
      const next: InvestigationState = {
        ...state,
        trend: { responseText: action.text },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "CLEAR_TREND_RESPONSE": {
      const next: InvestigationState = {
        ...state,
        trend: undefined,
        runtime: { ...state.runtime, trend: emptyPerStreamRuntime() },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "TREND_RUN_START":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          trend: {
            status: "running",
            error: null,
            inputTokens: null,
            outputTokens: null,
          },
        },
      };
    case "TREND_RUN_OK": {
      const next: InvestigationState = {
        ...state,
        trend: { responseText: action.rawText },
        runtime: {
          ...state.runtime,
          trend: {
            status: "idle",
            error: null,
            inputTokens: action.inputTokens,
            outputTokens: action.outputTokens,
          },
        },
        hasUnsavedChanges: false,
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "TREND_RUN_ERROR":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          trend: {
            status: "error",
            error: action.error,
            inputTokens: null,
            outputTokens: null,
          },
        },
      };
    // ==========================================================
    // Stage 3 — Action stage (single, cross-stream)
    // ==========================================================
    case "SET_ACTION_RESPONSE": {
      const next: InvestigationState = {
        ...state,
        action: { responseText: action.text },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "CLEAR_ACTION_RESPONSE": {
      const next: InvestigationState = {
        ...state,
        action: undefined,
        runtime: { ...state.runtime, action: emptyPerStreamRuntime() },
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "ACTION_RUN_START":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          action: {
            status: "running",
            error: null,
            inputTokens: null,
            outputTokens: null,
          },
        },
      };
    case "ACTION_RUN_OK": {
      const next: InvestigationState = {
        ...state,
        action: { responseText: action.rawText },
        runtime: {
          ...state.runtime,
          action: {
            status: "idle",
            error: null,
            inputTokens: action.inputTokens,
            outputTokens: action.outputTokens,
          },
        },
        hasUnsavedChanges: false,
      };
      next.hasUnsavedChanges = hasAnyContent(next);
      return next;
    }
    case "ACTION_RUN_ERROR":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          action: {
            status: "error",
            error: action.error,
            inputTokens: null,
            outputTokens: null,
          },
        },
      };
  }
}

// ============================================================
// Initialization — read prefs from localStorage; if user has
// previously enabled persistence, hydrate the saved investigation
// too. Otherwise start with an empty investigation.
//
// Runtime state always starts fresh — no carry-over from prior
// sessions. The apiKey in particular MUST start empty.
// ============================================================

function initialState(): InvestigationState {
  let localStorageEnabled = false;
  let persisted: InvestigationFile | null = null;

  try {
    localStorageEnabled =
      localStorage.getItem(LOCAL_STORAGE_PREF_KEY) === "true";
    if (localStorageEnabled) {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = InvestigationFileSchema.safeParse(JSON.parse(raw));
        if (parsed.success) persisted = parsed.data;
      }
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through.
  }

  const base = persisted ?? emptyInvestigation();
  return {
    ...base,
    localStorageEnabled,
    hasUnsavedChanges: false,
    runtime: emptyRuntime(),
  };
}

// ============================================================
// Public hook
// ============================================================

export interface UseInvestigationReturn {
  state: InvestigationState;
  streams: PreparedStream[];
  computations: Record<Source, StreamComputation>;
  // Stage 3 derived computations
  summaryComputations: Record<Source, StreamSummaryComputation>;
  trendComputation: TrendComputation;
  actionComputation: ActionComputation;
  // Per-stage prompt text (for the paste-mode UI in Manual)
  summaryPromptText: Record<Source, string>;
  trendPromptText: string;
  actionPromptText: string;
  /** True when all three streams have parseable JSON responses. */
  allStreamsParseGood: boolean;
  /** True when all three Stage 3 summaries have parseable responses. */
  allSummariesParseGood: boolean;
  /** True when the trend stage has a parseable response. */
  trendParseGood: boolean;
  /** True when the action stage has a parseable response. */
  actionParseGood: boolean;
  /** True when API mode is selected AND a non-empty key is set. */
  apiReady: boolean;
  /** True if any agent stage (hint/summary/trend/action) is in flight. */
  anyStageRunning: boolean;
  setResponse: (source: Source, text: string) => void;
  clearResponse: (source: Source) => void;
  resetInvestigation: () => void;
  loadInvestigation: (file: InvestigationFile) => void;
  setLocalStorageEnabled: (enabled: boolean) => void;
  markExported: () => void;
  markFirstRunModalShown: () => void;
  // Stage 2
  setBackend: (backend: BackendMode) => void;
  setApiKey: (key: string) => void;
  forgetApiKey: () => void;
  /**
   * Set or clear the per-stream user-prompt override. Pass an empty
   * string to clear (Run will fall back to canonical). API mode only;
   * Manual mode ignores overrides because the prompt textarea is
   * informational there.
   */
  setPromptOverride: (source: Source, text: string) => void;
  runStream: (source: Source) => Promise<void>;
  runAllStreams: () => Promise<void>;
  // Stage 3 dispatchers
  setSummaryResponse: (source: Source, text: string) => void;
  clearSummaryResponse: (source: Source) => void;
  setTrendResponse: (text: string) => void;
  clearTrendResponse: () => void;
  setActionResponse: (text: string) => void;
  clearActionResponse: () => void;
  // Stage 3 async runners
  runSummary: (source: Source) => Promise<void>;
  runAllSummaries: () => Promise<void>;
  runTrend: () => Promise<void>;
  runAction: () => Promise<void>;
  /**
   * Orchestrate the full pipeline end-to-end: hints → summaries → trend →
   * action. Parallel within stages, sequential across stages. Bails early
   * if any stage fails to produce a parseable response (the failing stage's
   * runner has already dispatched its error to per-stream UI). API mode only;
   * a no-op in Manual mode.
   */
  runFullInvestigation: () => Promise<void>;
}

export function useInvestigation(): UseInvestigationReturn {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Hold a ref to the latest state so async run helpers always read
  // the current backend/apiKey/streams without stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;

  const streams = useMemo(
    () => prepareStreams(state.pipelineRunId, state.createdAt),
    [state.pipelineRunId, state.createdAt],
  );

  // Hold the prepared-stream array in a ref too, so async helpers can
  // read the chunk + parsedEvents for any source without depending on
  // a closure that pre-dates a re-render.
  const streamsRef = useRef(streams);
  streamsRef.current = streams;

  const agentRunId = useMemo(
    () =>
      state.runtime.backend === "anthropic"
        ? `anthropic-${state.pipelineRunId}`
        : `manual-${state.pipelineRunId}`,
    [state.runtime.backend, state.pipelineRunId],
  );

  const computations = useMemo(() => {
    const out: Partial<Record<Source, StreamComputation>> = {};
    for (const stream of streams) {
      out[stream.source] = computeStream(
        stream,
        state.streams[stream.source].responseText,
        state.pipelineRunId,
        state.createdAt,
        agentRunId,
      );
    }
    return out as Record<Source, StreamComputation>;
  }, [
    streams,
    state.streams,
    state.pipelineRunId,
    state.createdAt,
    agentRunId,
  ]);

  const allStreamsParseGood = useMemo(
    () =>
      SOURCES.every((source) => {
        const c = computations[source];
        return (
          c.responseText.trim() !== "" &&
          c.parseError === null &&
          c.hints.length >= 0
        );
      }),
    [computations],
  );

  // ============================================================
  // Stage 3 — derived computations: summaries, trend, action.
  //
  // Each downstream stage gates on the previous: summaries need
  // hints, trend needs all summaries, action needs trend. The
  // computation memos compute regardless (for cheap re-renders);
  // the runners enforce the prereq gates.
  // ============================================================

  const summaryComputations = useMemo(() => {
    const out: Partial<Record<Source, StreamSummaryComputation>> = {};
    for (const stream of streams) {
      const responseText = state.summaries?.[stream.source]?.responseText ?? "";
      const hints = computations[stream.source].hints;
      out[stream.source] = computeStreamSummary(
        stream,
        hints,
        responseText,
        state.pipelineRunId,
        state.createdAt,
        agentRunId,
      );
    }
    return out as Record<Source, StreamSummaryComputation>;
  }, [
    streams,
    computations,
    state.summaries,
    state.pipelineRunId,
    state.createdAt,
    agentRunId,
  ]);

  const allSummariesParseGood = useMemo(
    () =>
      SOURCES.every((source) => {
        const c = summaryComputations[source];
        return c.responseText.trim() !== "" && c.parseError === null;
      }),
    [summaryComputations],
  );

  const summaryPromptText = useMemo(() => {
    const out: Partial<Record<Source, string>> = {};
    for (const stream of streams) {
      const hints = computations[stream.source].hints;
      out[stream.source] = buildSummaryPromptText(stream, hints);
    }
    return out as Record<Source, string>;
  }, [streams, computations]);

  const trendStageInputs = useMemo(() => {
    const summariesBySource: Partial<Record<Source, StreamSummary>> = {};
    const hintsBySource: Record<Source, AnomalyHint[]> = {} as Record<
      Source,
      AnomalyHint[]
    >;
    const parsedEventsBySource: Record<Source, ParsedEvent[]> = {} as Record<
      Source,
      ParsedEvent[]
    >;
    for (const stream of streams) {
      const sc = summaryComputations[stream.source];
      if (sc.summary) summariesBySource[stream.source] = sc.summary;
      hintsBySource[stream.source] = computations[stream.source].hints;
      parsedEventsBySource[stream.source] = stream.parsedEvents;
    }
    const first = streams[0];
    return {
      streams,
      summariesBySource,
      hintsBySource,
      parsedEventsBySource,
      timeRangeStart: first?.chunk.time_range_start ?? "",
      timeRangeEnd: first?.chunk.time_range_end ?? "",
    };
  }, [streams, computations, summaryComputations]);

  const trendComputation = useMemo(
    () =>
      computeTrend(
        state.trend?.responseText ?? "",
        state.pipelineRunId,
        state.createdAt,
        agentRunId,
        trendStageInputs,
      ),
    [
      state.trend?.responseText,
      state.pipelineRunId,
      state.createdAt,
      agentRunId,
      trendStageInputs,
    ],
  );

  const trendParseGood = useMemo(
    () =>
      trendComputation.responseText.trim() !== "" &&
      trendComputation.parseError === null,
    [trendComputation],
  );

  const trendPromptText = useMemo(
    () => buildTrendPromptText(trendStageInputs),
    [trendStageInputs],
  );

  const actionStageInputs = useMemo(() => {
    const first = streams[0];
    return {
      trends: trendComputation.trends,
      timeRangeStart: first?.chunk.time_range_start ?? "",
      timeRangeEnd: first?.chunk.time_range_end ?? "",
    };
  }, [streams, trendComputation.trends]);

  const actionComputation = useMemo(
    () =>
      computeAction(
        state.action?.responseText ?? "",
        state.pipelineRunId,
        state.createdAt,
        agentRunId,
        actionStageInputs,
      ),
    [
      state.action?.responseText,
      state.pipelineRunId,
      state.createdAt,
      agentRunId,
      actionStageInputs,
    ],
  );

  const actionParseGood = useMemo(
    () =>
      actionComputation.responseText.trim() !== "" &&
      actionComputation.parseError === null,
    [actionComputation],
  );

  const actionPromptText = useMemo(
    () => buildActionPromptText(actionStageInputs),
    [actionStageInputs],
  );

  const apiReady = useMemo(
    () =>
      state.runtime.backend === "anthropic" &&
      state.runtime.apiKey.trim() !== "",
    [state.runtime.backend, state.runtime.apiKey],
  );

  /**
   * True if ANY stage is currently running — hint, summary, trend,
   * or action. Used by App.tsx to gate the first-run save modal so it
   * doesn't open while a per-stage Run is mid-flight.
   */
  const anyStageRunning = useMemo(() => {
    for (const source of SOURCES) {
      if (state.runtime.perStream[source].status === "running") return true;
      if (state.runtime.summary.perStream[source].status === "running")
        return true;
    }
    if (state.runtime.trend.status === "running") return true;
    if (state.runtime.action.status === "running") return true;
    return false;
  }, [state.runtime]);

  // Persist localStorage preference on toggle.
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_PREF_KEY,
        state.localStorageEnabled ? "true" : "false",
      );
    } catch {
      /* noop */
    }
  }, [state.localStorageEnabled]);

  // Persist investigation on every state change, but only if opt-in is
  // on. The payload deliberately excludes `runtime` — apiKey would leak.
  useEffect(() => {
    if (!state.localStorageEnabled) {
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        /* noop */
      }
      return;
    }
    const file: InvestigationFile = {
      schemaVersion: SCHEMA_VERSION,
      pipelineRunId: state.pipelineRunId,
      createdAt: state.createdAt,
      streams: state.streams,
      firstSuccessfulRunModalShown: state.firstSuccessfulRunModalShown,
      summaries: state.summaries,
      trend: state.trend,
      action: state.action,
      // NOTE: state.runtime is intentionally NOT included.
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(file));
    } catch {
      /* noop */
    }
  }, [
    state.localStorageEnabled,
    state.pipelineRunId,
    state.createdAt,
    state.streams,
    state.firstSuccessfulRunModalShown,
    state.summaries,
    state.trend,
    state.action,
  ]);

  const setResponse = useCallback((source: Source, text: string) => {
    dispatch({ type: "SET_RESPONSE", source, text });
  }, []);

  const clearResponse = useCallback((source: Source) => {
    dispatch({ type: "CLEAR_RESPONSE", source });
  }, []);

  const resetInvestigation = useCallback(() => {
    dispatch({ type: "RESET_INVESTIGATION" });
  }, []);

  const loadInvestigation = useCallback((file: InvestigationFile) => {
    dispatch({ type: "LOAD_INVESTIGATION", payload: file });
  }, []);

  const setLocalStorageEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: "SET_LOCAL_STORAGE_ENABLED", enabled });
  }, []);

  const markExported = useCallback(() => {
    dispatch({ type: "MARK_EXPORTED" });
  }, []);

  const markFirstRunModalShown = useCallback(() => {
    dispatch({ type: "MARK_FIRST_RUN_MODAL_SHOWN" });
  }, []);

  const setBackend = useCallback((backend: BackendMode) => {
    dispatch({ type: "SET_BACKEND", backend });
  }, []);

  const setApiKey = useCallback((key: string) => {
    dispatch({ type: "SET_API_KEY", key });
  }, []);

  const forgetApiKey = useCallback(() => {
    dispatch({ type: "FORGET_API_KEY" });
  }, []);

  const setPromptOverride = useCallback((source: Source, text: string) => {
    dispatch({ type: "SET_PROMPT_OVERRIDE", source, text });
  }, []);

  // Async helper: run one stream against the Anthropic API.
  // Reads from refs so that runAllStreams can call this in sequence
  // without each call seeing a stale closure of state/streams.
  const runStream = useCallback(async (source: Source): Promise<void> => {
    const current = stateRef.current;
    if (current.runtime.backend !== "anthropic") {
      dispatch({
        type: "STREAM_RUN_ERROR",
        source,
        error: "Backend is set to Manual. Switch to Anthropic API to Run.",
      });
      return;
    }
    const apiKey = current.runtime.apiKey.trim();
    if (!apiKey) {
      dispatch({
        type: "STREAM_RUN_ERROR",
        source,
        error: "No API key set. Open the settings drawer and add your key.",
      });
      return;
    }
    const stream = streamsRef.current.find((s) => s.source === source);
    if (!stream) {
      dispatch({
        type: "STREAM_RUN_ERROR",
        source,
        error: `No prepared stream for source ${source}.`,
      });
      return;
    }

    // Pull the user's prompt override (if any) out of runtime state.
    // Empty string == no override, send canonical. Whitespace-only is
    // treated as no override too — a textarea full of spaces would
    // otherwise produce a useless API call.
    const rawOverride = current.runtime.promptOverrides[source] ?? "";
    const userPromptOverride =
      rawOverride.trim() === "" ? undefined : rawOverride;

    dispatch({ type: "STREAM_RUN_START", source });

    try {
      const backend = makeBrowserAnthropicBackend(apiKey);
      const out = await backend.run({
        chunk: stream.chunk,
        parsedEvents: stream.parsedEvents,
        pipelineRunId: current.pipelineRunId,
        userPromptOverride,
      });
      dispatch({
        type: "STREAM_RUN_OK",
        source,
        rawText: out.rawText,
        inputTokens: out.usage?.input_tokens ?? 0,
        outputTokens: out.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      dispatch({
        type: "STREAM_RUN_ERROR",
        source,
        error: (err as Error).message ?? String(err),
      });
    }
  }, []);

  // Sequential by design — each stream finishes before the next starts.
  // Sequential is gentler on rate limits and easier to reason about
  // when one fails. The user can still kick a single stream via the
  // per-card Run button if they want to retry just one.
  const runAllStreams = useCallback(async (): Promise<void> => {
    for (const source of SOURCES) {
      await runStream(source);
    }
  }, [runStream]);

  // ============================================================
  // Stage 3 dispatchers
  // ============================================================

  const setSummaryResponse = useCallback(
    (source: Source, text: string) => {
      dispatch({ type: "SET_SUMMARY_RESPONSE", source, text });
    },
    [],
  );
  const clearSummaryResponse = useCallback((source: Source) => {
    dispatch({ type: "CLEAR_SUMMARY_RESPONSE", source });
  }, []);
  const setTrendResponse = useCallback((text: string) => {
    dispatch({ type: "SET_TREND_RESPONSE", text });
  }, []);
  const clearTrendResponse = useCallback(() => {
    dispatch({ type: "CLEAR_TREND_RESPONSE" });
  }, []);
  const setActionResponse = useCallback((text: string) => {
    dispatch({ type: "SET_ACTION_RESPONSE", text });
  }, []);
  const clearActionResponse = useCallback(() => {
    dispatch({ type: "CLEAR_ACTION_RESPONSE" });
  }, []);

  // ============================================================
  // Stage 3 async runners — pattern matches runStream:
  //   1. Validate prereqs (apiKey set + upstream stage parse-good)
  //   2. Dispatch START
  //   3. Build system+user prompt for the stage
  //   4. Call Anthropic via callAnthropic
  //   5. Dispatch OK with rawText (or ERROR with message)
  //
  // The reducer then writes the rawText into the persisted slot
  // (state.summaries[source]/state.trend/state.action) and the
  // memoized compute functions take it from there.
  // ============================================================

  // Reads hint state inline from stateRef rather than the `computations`
  // memo closure. The memo would be stale across an `await` chain (e.g.,
  // when runFullInvestigation calls this immediately after a hint dispatch),
  // because useCallback captures the closure at render time. Reading from
  // refs + parsing inline is a few extra lines for closure-safety across
  // async stages.
  const runSummary = useCallback(async (source: Source): Promise<void> => {
    const current = stateRef.current;
    if (current.runtime.backend !== "anthropic") {
      dispatch({
        type: "SUMMARY_RUN_ERROR",
        source,
        error: "Backend is set to Manual. Switch to Anthropic API to Run.",
      });
      return;
    }
    const apiKey = current.runtime.apiKey.trim();
    if (!apiKey) {
      dispatch({
        type: "SUMMARY_RUN_ERROR",
        source,
        error: "No API key set. Open the settings drawer and add your key.",
      });
      return;
    }
    const stream = streamsRef.current.find((s) => s.source === source);
    if (!stream) {
      dispatch({
        type: "SUMMARY_RUN_ERROR",
        source,
        error: `No prepared stream for source ${source}.`,
      });
      return;
    }

    // Parse hint response inline from latest persisted state.
    const hintRawText = current.streams[source].responseText;
    if (hintRawText.trim() === "") {
      dispatch({
        type: "SUMMARY_RUN_ERROR",
        source,
        error: `Hint stage for ${source} hasn't produced a response yet. Run the hint stage first.`,
      });
      return;
    }
    const agentRunIdLocal = `anthropic-${current.pipelineRunId}`;
    let hints: AnomalyHint[];
    try {
      const rawHints = parseHintResponse(hintRawText);
      hints = composeHints({
        rawHints,
        chunkId: stream.chunk.id,
        pipelineRunId: current.pipelineRunId,
        agentRunId: agentRunIdLocal,
        parsedEvents: stream.parsedEvents,
        createdAt: current.createdAt,
      });
    } catch (err) {
      dispatch({
        type: "SUMMARY_RUN_ERROR",
        source,
        error: `Hint response for ${source} is malformed JSON: ${(err as Error).message}`,
      });
      return;
    }

    dispatch({ type: "SUMMARY_RUN_START", source });

    try {
      const userPrompt = buildSummaryUserPrompt({
        source,
        hints,
        parsedEvents: stream.parsedEvents,
        time_range_start: stream.chunk.time_range_start,
        time_range_end: stream.chunk.time_range_end,
      });
      const out = await callAnthropic(
        apiKey,
        SUMMARY_SYSTEM_PROMPT,
        userPrompt,
      );
      dispatch({
        type: "SUMMARY_RUN_OK",
        source,
        rawText: out.rawText,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
      });
    } catch (err) {
      dispatch({
        type: "SUMMARY_RUN_ERROR",
        source,
        error: (err as Error).message ?? String(err),
      });
    }
  }, []);

  const runAllSummaries = useCallback(async (): Promise<void> => {
    for (const source of SOURCES) {
      await runSummary(source);
    }
  }, [runSummary]);

  // Reads hint + summary state inline from stateRef. Same closure-safety
  // rationale as runSummary above.
  const runTrend = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.runtime.backend !== "anthropic") {
      dispatch({
        type: "TREND_RUN_ERROR",
        error: "Backend is set to Manual. Switch to Anthropic API to Run.",
      });
      return;
    }
    const apiKey = current.runtime.apiKey.trim();
    if (!apiKey) {
      dispatch({
        type: "TREND_RUN_ERROR",
        error: "No API key set. Open the settings drawer and add your key.",
      });
      return;
    }

    const agentRunIdLocal = `anthropic-${current.pipelineRunId}`;

    // Build per-stream { hints, summary } inline from latest persisted state.
    const perStreamForPrompt: Array<{
      source: Source;
      summary: StreamSummary | undefined;
      hints: AnomalyHint[];
      parsedEvents: ParsedEvent[];
    }> = [];
    for (const source of SOURCES) {
      const stream = streamsRef.current.find((s) => s.source === source);
      if (!stream) {
        dispatch({
          type: "TREND_RUN_ERROR",
          error: `No prepared stream for source ${source}.`,
        });
        return;
      }
      const hintRawText = current.streams[source].responseText;
      if (hintRawText.trim() === "") {
        dispatch({
          type: "TREND_RUN_ERROR",
          error: `Hint stage for ${source} hasn't produced a response yet.`,
        });
        return;
      }
      let hints: AnomalyHint[];
      try {
        const rawHints = parseHintResponse(hintRawText);
        hints = composeHints({
          rawHints,
          chunkId: stream.chunk.id,
          pipelineRunId: current.pipelineRunId,
          agentRunId: agentRunIdLocal,
          parsedEvents: stream.parsedEvents,
          createdAt: current.createdAt,
        });
      } catch (err) {
        dispatch({
          type: "TREND_RUN_ERROR",
          error: `Hint response for ${source} is malformed: ${(err as Error).message}`,
        });
        return;
      }

      const summaryRawText = current.summaries?.[source]?.responseText ?? "";
      if (summaryRawText.trim() === "") {
        dispatch({
          type: "TREND_RUN_ERROR",
          error:
            "Trend stage requires all three stream summaries first. Run the summary stage on each stream.",
        });
        return;
      }
      let summary: StreamSummary;
      try {
        const rawSummary = parseSummaryResponse(summaryRawText);
        summary = composeStreamSummary({
          raw: rawSummary,
          chunkId: stream.chunk.id,
          source,
          pipelineRunId: current.pipelineRunId,
          agentRunId: agentRunIdLocal,
          hints,
          timeRangeStart: stream.chunk.time_range_start,
          timeRangeEnd: stream.chunk.time_range_end,
          createdAt: current.createdAt,
        });
      } catch (err) {
        dispatch({
          type: "TREND_RUN_ERROR",
          error: `Summary response for ${source} is malformed: ${(err as Error).message}`,
        });
        return;
      }

      perStreamForPrompt.push({
        source,
        summary,
        hints,
        parsedEvents: stream.parsedEvents,
      });
    }

    const first = streamsRef.current[0];
    const timeRangeStart = first?.chunk.time_range_start ?? "";
    const timeRangeEnd = first?.chunk.time_range_end ?? "";

    dispatch({ type: "TREND_RUN_START" });

    try {
      const userPrompt = buildTrendUserPrompt({
        streams: perStreamForPrompt,
        time_range_start: timeRangeStart,
        time_range_end: timeRangeEnd,
      });
      const out = await callAnthropic(
        apiKey,
        TREND_SYSTEM_PROMPT,
        userPrompt,
      );
      dispatch({
        type: "TREND_RUN_OK",
        rawText: out.rawText,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
      });
    } catch (err) {
      dispatch({
        type: "TREND_RUN_ERROR",
        error: (err as Error).message ?? String(err),
      });
    }
  }, []);

  // Reads trend (and hint/summary provenance) inline from stateRef. Same
  // closure-safety rationale as runSummary / runTrend above.
  const runAction = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.runtime.backend !== "anthropic") {
      dispatch({
        type: "ACTION_RUN_ERROR",
        error: "Backend is set to Manual. Switch to Anthropic API to Run.",
      });
      return;
    }
    const apiKey = current.runtime.apiKey.trim();
    if (!apiKey) {
      dispatch({
        type: "ACTION_RUN_ERROR",
        error: "No API key set. Open the settings drawer and add your key.",
      });
      return;
    }

    const trendRawText = current.trend?.responseText ?? "";
    if (trendRawText.trim() === "") {
      dispatch({
        type: "ACTION_RUN_ERROR",
        error: "Action stage requires the Trend stage to run first.",
      });
      return;
    }

    const agentRunIdLocal = `anthropic-${current.pipelineRunId}`;

    // Best-effort provenance maps for composeTrends. composeTrends maps
    // raw evidence indices to actual hint/event IDs; missing entries
    // degrade gracefully (empty arrays). The action prompt only consumes
    // counts and confidence, so partial provenance is acceptable.
    const hintsBySource: Record<Source, AnomalyHint[]> = {} as Record<
      Source,
      AnomalyHint[]
    >;
    const summariesBySource: Partial<Record<Source, StreamSummary>> = {};
    const parsedEventsBySource: Record<Source, ParsedEvent[]> = {} as Record<
      Source,
      ParsedEvent[]
    >;

    for (const source of SOURCES) {
      const stream = streamsRef.current.find((s) => s.source === source);
      if (!stream) continue;
      parsedEventsBySource[source] = stream.parsedEvents;

      const hintText = current.streams[source].responseText;
      if (hintText.trim() !== "") {
        try {
          const rawHints = parseHintResponse(hintText);
          hintsBySource[source] = composeHints({
            rawHints,
            chunkId: stream.chunk.id,
            pipelineRunId: current.pipelineRunId,
            agentRunId: agentRunIdLocal,
            parsedEvents: stream.parsedEvents,
            createdAt: current.createdAt,
          });
        } catch {
          hintsBySource[source] = [];
        }
      } else {
        hintsBySource[source] = [];
      }

      const summaryText = current.summaries?.[source]?.responseText ?? "";
      if (summaryText.trim() !== "") {
        try {
          const rawSummary = parseSummaryResponse(summaryText);
          summariesBySource[source] = composeStreamSummary({
            raw: rawSummary,
            chunkId: stream.chunk.id,
            source,
            pipelineRunId: current.pipelineRunId,
            agentRunId: agentRunIdLocal,
            hints: hintsBySource[source] ?? [],
            timeRangeStart: stream.chunk.time_range_start,
            timeRangeEnd: stream.chunk.time_range_end,
            createdAt: current.createdAt,
          });
        } catch {
          /* provenance degrades gracefully */
        }
      }
    }

    let trends: Trend[];
    try {
      const rawTrends = parseTrendResponse(trendRawText);
      trends = composeTrends({
        rawTrends,
        pipelineRunId: current.pipelineRunId,
        agentRunId: agentRunIdLocal,
        summariesBySource,
        hintsBySource,
        parsedEventsBySource,
        createdAt: current.createdAt,
      });
    } catch (err) {
      dispatch({
        type: "ACTION_RUN_ERROR",
        error: `Trend response is malformed: ${(err as Error).message}`,
      });
      return;
    }

    const first = streamsRef.current[0];
    const timeRangeStart = first?.chunk.time_range_start ?? "";
    const timeRangeEnd = first?.chunk.time_range_end ?? "";

    dispatch({ type: "ACTION_RUN_START" });

    try {
      const userPrompt = buildActionUserPrompt({
        trends,
        time_range_start: timeRangeStart,
        time_range_end: timeRangeEnd,
      });
      const out = await callAnthropic(
        apiKey,
        ACTION_SYSTEM_PROMPT,
        userPrompt,
      );
      dispatch({
        type: "ACTION_RUN_OK",
        rawText: out.rawText,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
      });
    } catch (err) {
      dispatch({
        type: "ACTION_RUN_ERROR",
        error: (err as Error).message ?? String(err),
      });
    }
  }, []);

  // ============================================================
  // Full pipeline orchestrator — the "Run investigation" button.
  //
  // Depth-first sequential by stream: each stream's hint AND summary
  // complete before the next stream starts. Then cross-stream trend.
  // Then action items. One thing happens at a time so the demo reads
  // as a clean sequence; no parallel races, no "did three things just
  // happen?" feeling. Total wall ~20-25s, traded against clarity.
  //
  // The setTimeout(0) yields between stages let React commit the
  // prior dispatches so the next stage's runner sees up-to-date
  // stateRef when it reads upstream artifacts.
  //
  // Per-stream gating: if a stream's hint fails to parse, skip its
  // summary and continue to the next stream (so one bad stream
  // doesn't poison the whole run). Cross-stream trend still requires
  // all 3 summaries — partial input would invalidate the correlation.
  //
  // No new effects added — this is button-triggered, not auto-fired.
  // ============================================================
  const runFullInvestigation = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.runtime.backend !== "anthropic") return;
    if (current.runtime.apiKey.trim() === "") return;

    // Per-stream depth-first: hint → summary, fully done before next stream.
    for (const source of SOURCES) {
      await runStream(source);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Skip this stream's summary if its hint didn't parse — but keep
      // going so the other streams still get processed.
      const hintText = stateRef.current.streams[source].responseText;
      if (hintText.trim() === "") continue;
      try {
        parseHintResponse(hintText);
      } catch {
        continue;
      }

      await runSummary(source);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Trend requires all three summaries — partial inputs would skew
    // the correlation. Bail if any stream's summary didn't land.
    const summariesAllParsed = SOURCES.every((s) => {
      const text = stateRef.current.summaries?.[s]?.responseText ?? "";
      if (text.trim() === "") return false;
      try {
        parseSummaryResponse(text);
        return true;
      } catch {
        return false;
      }
    });
    if (!summariesAllParsed) return;

    // Cross-stream trend, then action items.
    await runTrend();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const trendText = stateRef.current.trend?.responseText ?? "";
    if (trendText.trim() === "") return;
    try {
      parseTrendResponse(trendText);
    } catch {
      return;
    }

    await runAction();
  }, [runStream, runSummary, runTrend, runAction]);

  return {
    state,
    streams,
    computations,
    summaryComputations,
    trendComputation,
    actionComputation,
    summaryPromptText,
    trendPromptText,
    actionPromptText,
    allStreamsParseGood,
    allSummariesParseGood,
    trendParseGood,
    actionParseGood,
    apiReady,
    anyStageRunning,
    setResponse,
    clearResponse,
    resetInvestigation,
    loadInvestigation,
    setLocalStorageEnabled,
    markExported,
    markFirstRunModalShown,
    setBackend,
    setApiKey,
    forgetApiKey,
    setPromptOverride,
    runStream,
    runAllStreams,
    setSummaryResponse,
    clearSummaryResponse,
    setTrendResponse,
    clearTrendResponse,
    setActionResponse,
    clearActionResponse,
    runSummary,
    runAllSummaries,
    runTrend,
    runAction,
    runFullInvestigation,
  };
}

// ============================================================
// Export / import file helpers — Zod-validated round trip.
// `runtime` is structurally absent from InvestigationFile, so the
// apiKey cannot leak through this path even by accident.
// ============================================================

export function buildExportPayload(
  state: InvestigationState,
): InvestigationFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    pipelineRunId: state.pipelineRunId,
    createdAt: state.createdAt,
    streams: state.streams,
    firstSuccessfulRunModalShown: state.firstSuccessfulRunModalShown,
    summaries: state.summaries,
    trend: state.trend,
    action: state.action,
    // NOTE: state.runtime is intentionally NOT included.
  };
}

export function parseImportPayload(rawText: string): InvestigationFile {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch (err) {
    throw new Error(
      `Investigation file is not valid JSON: ${(err as Error).message}`,
    );
  }
  const result = InvestigationFileSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Investigation file failed schema validation: ${result.error.message}`,
    );
  }
  return result.data;
}
