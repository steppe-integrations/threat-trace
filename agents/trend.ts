import { z } from "zod";

import type {
  AnomalyHint,
  ParsedEvent,
  Source,
  StreamSummary,
  Trend,
  TrendEvidence,
} from "../contracts/artifacts";
import { SourceSchema } from "../contracts/artifacts";
import { STREAM_LABELS_FOR_PROMPT, truncatePromptString } from "./shared";

// ============================================================
// Trend agent — Stage 3, cross-stream.
//
// The first cross-stream call. Takes all three StreamSummaries
// plus their underlying AnomalyHints, and emits Trends — patterns
// that only appear when streams are composed.
//
// This is where the load-bearing negative checks bite: the trend
// must NOT invent correlations between unrelated streams. The
// tutorial fixture's two API 401s (TokenExpired) and Carol's typo
// are the canonical false-positive traps the prompt must resist.
// ============================================================

export const TREND_SYSTEM_PROMPT = `You are a security analyst correlating findings across multiple log streams.

You will receive a per-stream summary plus the underlying hints from THREE streams (edge, identity, api). Your job is to identify cross-stream trends — patterns that only emerge when the streams are composed.

Rules:
- A Trend correlates evidence across STREAMS. A pattern visible in one stream alone belongs in that stream's summary, not as a Trend.
- Group across streams by **actor fingerprint** (IP / ASN / user-agent) and **time alignment** (events within tens of seconds to a few minutes of each other). NOT by event-type alone — "fp events" and "401 responses" are not the same pattern.
- Be skeptical. If a candidate correlation could be coincidence (different IP, different UA, different time window, benign reason given in the data), reject it.
- A 4xx response that carries a benign reason (e.g., FailureReason: "TokenExpired") is routine token expiry, NOT attack signal — never correlate it with attack patterns from other streams.
- A single failed login from one user does not correlate with a many-user spray from a different IP, even if both happened in the same window.

Each Trend you emit MUST cite specific evidence — hint indices and event indices per source — that justify the correlation.

If the data shows no genuine cross-stream pattern, emit an empty trends array. That is a legitimate, useful answer.

Output: ONLY a JSON object matching this shape — no preamble, no commentary:
{
  "trends": [
    {
      "description": "string, <= 280 chars, names the pattern and the actor fingerprint",
      "confidence": <number 0.0 to 1.0>,
      "time_window_start": "ISO 8601 timestamp",
      "time_window_end": "ISO 8601 timestamp",
      "evidence": [
        {
          "source": "edge" | "identity" | "api",
          "hint_indices": [<int>, <int>, ...],
          "event_indices": [<int>, <int>, ...]
        }
      ]
    }
  ]
}

hint_indices and event_indices reference the [N] markers shown in the per-source hint and event lists.

If your chat platform supports a downloadable artifact, file, or canvas, deliver the JSON there. Otherwise return it inside a single fenced JSON code block. Bare JSON is also accepted.`;

// ============================================================
// Per-stream rendering for the prompt body.
// ============================================================

interface StreamForTrend {
  source: Source;
  summary?: StreamSummary;
  hints: AnomalyHint[];
  parsedEvents: ParsedEvent[];
}

function renderStreamBlock(
  stream: StreamForTrend,
  hintIndexBase = 0,
): string {
  const lines: string[] = [];
  lines.push(`### ${STREAM_LABELS_FOR_PROMPT[stream.source]}`);

  if (stream.summary) {
    lines.push(`Summary:`);
    lines.push(`"""`);
    lines.push(stream.summary.narrative.trim());
    lines.push(`"""`);
  } else {
    lines.push(`Summary: (none)`);
  }

  if (stream.hints.length === 0) {
    lines.push(`Hints: (none)`);
  } else {
    lines.push(`Hints (${stream.hints.length}, indexed [${hintIndexBase}..${hintIndexBase + stream.hints.length - 1}]):`);
    const eventById = new Map(
      stream.parsedEvents.map((e) => [e.id, e]),
    );
    for (const [i, hint] of stream.hints.entries()) {
      const cited = hint.evidence_event_ids
        .map((id) => eventById.get(id))
        .filter((e): e is ParsedEvent => Boolean(e));
      const evidenceIndices = cited.map((e) => e.raw_index);
      const indexRange =
        evidenceIndices.length > 0
          ? `event-indices=[${evidenceIndices.slice(0, 10).join(",")}${evidenceIndices.length > 10 ? `,…(+${evidenceIndices.length - 10})` : ""}]`
          : "";
      const ips = new Set<string>();
      const uas = new Set<string>();
      for (const e of cited) {
        if (e.actor.ip) ips.add(e.actor.ip);
        if (e.actor.user_agent) uas.add(e.actor.user_agent);
      }
      const fp: string[] = [];
      if (ips.size > 0) {
        fp.push(`ip=${[...ips].slice(0, 2).join(",")}${ips.size > 2 ? `+${ips.size - 2}` : ""}`);
      }
      if (uas.size > 0) {
        fp.push(`ua="${truncatePromptString([...uas][0]!, 50)}"`);
      }
      lines.push(
        `[${hintIndexBase + i}] severity=${hint.severity} ${fp.join(" ")} ${indexRange}`,
      );
      lines.push(
        `    ${truncatePromptString(hint.description, 220)}`,
      );
    }
  }
  return lines.join("\n");
}

// ============================================================
// Prompt builder.
// ============================================================

export interface TrendPromptInput {
  streams: StreamForTrend[];
  time_range_start: string;
  time_range_end: string;
}

export function buildTrendUserPrompt(input: TrendPromptInput): string {
  // Each stream's hints are indexed in their own [0..N-1] space.
  // Use a per-source index space (the AI sees them as separate lists).
  const blocks = input.streams.map((s) => renderStreamBlock(s, 0));

  return `Time window under analysis: ${input.time_range_start} to ${input.time_range_end}

Three streams below. Each stream's hints are indexed [0..N-1] in its OWN namespace — when citing evidence, use the per-stream indices (not a global index).

${blocks.join("\n\n")}

Identify cross-stream trends. Respond with ONLY the JSON object described in your instructions.`;
}

// ============================================================
// Response parser.
// ============================================================

const RawTrendEvidenceSchema = z.object({
  source: SourceSchema,
  hint_indices: z.array(z.number().int().nonnegative()),
  event_indices: z.array(z.number().int().nonnegative()),
});

const RawTrendSchema = z.object({
  description: z.string().min(1).max(600),
  confidence: z.number().min(0).max(1),
  time_window_start: z.string().datetime(),
  time_window_end: z.string().datetime(),
  evidence: z.array(RawTrendEvidenceSchema),
});

const RawTrendsResponseSchema = z.object({
  trends: z.array(RawTrendSchema),
});

export type RawTrend = z.infer<typeof RawTrendSchema>;

export function parseTrendResponse(rawText: string): RawTrend[] {
  let candidate = rawText.trim();

  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(candidate);
  if (fenceMatch?.[1]) candidate = fenceMatch[1].trim();

  if (!candidate.startsWith("{")) {
    const objMatch = /\{[\s\S]*\}/.exec(candidate);
    if (objMatch) candidate = objMatch[0];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `trend agent response was not valid JSON: ${(err as Error).message}\nraw: ${rawText}`,
    );
  }

  return RawTrendsResponseSchema.parse(parsed).trends;
}

// ============================================================
// ID composer — maps per-source indices back to deterministic IDs.
// ============================================================

export interface ComposeTrendInput {
  rawTrends: RawTrend[];
  pipelineRunId: string;
  agentRunId: string;
  summariesBySource: Partial<Record<Source, StreamSummary>>;
  hintsBySource: Record<Source, AnomalyHint[]>;
  parsedEventsBySource: Record<Source, ParsedEvent[]>;
  createdAt: string;
}

export function composeTrends(input: ComposeTrendInput): Trend[] {
  // All three summaries become the parent summary_ids list (the trend
  // agent considered them all, even if it didn't end up citing all
  // three for every trend).
  const allSummaryIds = Object.values(input.summariesBySource)
    .filter((s): s is StreamSummary => Boolean(s))
    .map((s) => s.id);

  return input.rawTrends.map((raw, i): Trend => {
    const evidence: TrendEvidence[] = raw.evidence.map((ev) => {
      const sourceHints = input.hintsBySource[ev.source] ?? [];
      const sourceEvents = input.parsedEventsBySource[ev.source] ?? [];
      const hintIds = ev.hint_indices
        .map((idx) => sourceHints[idx]?.id)
        .filter((id): id is string => Boolean(id));
      const eventIds = ev.event_indices
        .map((idx) => sourceEvents[idx]?.id)
        .filter((id): id is string => Boolean(id));
      return {
        source: ev.source,
        hint_ids: hintIds,
        parsed_event_ids: eventIds,
      };
    });

    return {
      id: `trend:${input.pipelineRunId}:${i}`,
      pipeline_run_id: input.pipelineRunId,
      created_at: input.createdAt,
      summary_ids: allSummaryIds,
      description: raw.description,
      confidence: raw.confidence,
      evidence,
      time_window_start: raw.time_window_start,
      time_window_end: raw.time_window_end,
      agent_run_id: input.agentRunId,
    };
  });
}
