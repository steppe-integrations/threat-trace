import { z } from "zod";

import type {
  AnomalyHint,
  ParsedEvent,
  Source,
  StreamSummary,
} from "../contracts/artifacts";
import { STREAM_LABELS_FOR_PROMPT } from "./shared";

// ============================================================
// Stream Summary agent — Stage 3, per-stream.
//
// Takes the AnomalyHints emitted by the Stage-2 hint agent for a
// SINGLE stream and writes a focused narrative (<=200 tokens) that
// captures the dominant pattern. Optionally carries forward context
// from a prior chunk's summary (progressive context — the only
// place feedback context lives in the system).
//
// This is the only Stage 3 agent that runs per-stream. Trend and
// Action both run once per pipeline run.
// ============================================================

export const SUMMARY_SYSTEM_PROMPT = `You are a security analyst writing a focused per-stream summary.

You will receive a list of anomaly hints from a SINGLE log stream. Write a brief narrative — 200 tokens or fewer — that captures the key pattern across these hints, with explicit reference to actor fingerprint (IP / ASN / user-agent) where the hints provide it.

Rules:
- Group findings by **actor fingerprint**, not by event type alone. A coordinated burst from one IP across many users is one finding, not many.
- Stay within ONE stream. Do not speculate about activity in other streams. Do not invent cross-stream correlations.
- A 4xx response that carries a benign reason in its customDims (e.g., FailureReason: "TokenExpired") is routine — name it as such and move on, rather than flagging it as attack signal.
- If no hints rise above noise (or the hints array is empty), emit a short "No notable activity in this stream" narrative.
- Cite which hints your narrative actually draws from. Hints are addressed by index (the [N] markers in the hint list).

If a prior chunk's summary is provided, treat it as context for any continuing pattern. Reference it briefly only when it materially changes what you'd say about THIS chunk.

Output: ONLY a JSON object matching this shape — no preamble, no commentary:
{
  "narrative": "string, <= 200 tokens",
  "cited_hint_indices": [<int>, <int>, ...]
}

If your chat platform supports a downloadable artifact, file, or canvas, deliver the JSON there. Otherwise return it inside a single fenced JSON code block. Bare JSON is also accepted.`;

// ============================================================
// Hint renderer for prompt input — keeps it terse.
// ============================================================

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function renderHint(
  hint: AnomalyHint,
  parsedEvents: ParsedEvent[],
  i: number,
): string {
  // Show severity, description, and a compact summary of cited evidence
  // (count + first-event time + sample IPs). Don't dump every event —
  // the summary agent doesn't need that volume.
  const eventById = new Map(parsedEvents.map((e) => [e.id, e]));
  const cited = hint.evidence_event_ids
    .map((id) => eventById.get(id))
    .filter((e): e is ParsedEvent => Boolean(e));

  const ips = new Set<string>();
  const uas = new Set<string>();
  for (const e of cited) {
    if (e.actor.ip) ips.add(e.actor.ip);
    if (e.actor.user_agent) uas.add(e.actor.user_agent);
  }

  const fingerprint: string[] = [];
  if (ips.size > 0) {
    const sample = [...ips].slice(0, 2).join(", ");
    fingerprint.push(`ip=${sample}${ips.size > 2 ? ` (+${ips.size - 2} more)` : ""}`);
  }
  if (uas.size > 0) {
    const ua = [...uas][0]!;
    fingerprint.push(`ua="${truncate(ua, 60)}"`);
  }

  const fpStr = fingerprint.length > 0 ? ` ${fingerprint.join(" ")}` : "";

  return `[${i}] severity=${hint.severity} (cites ${cited.length} events${fpStr}) — ${truncate(hint.description, 220)}`;
}

// ============================================================
// Prompt builder.
// ============================================================

export interface SummaryPromptInput {
  source: Source;
  hints: AnomalyHint[];
  parsedEvents: ParsedEvent[];
  time_range_start: string;
  time_range_end: string;
  priorSummary?: StreamSummary;
}

export function buildSummaryUserPrompt(input: SummaryPromptInput): string {
  const lines = input.hints.map((h, i) =>
    renderHint(h, input.parsedEvents, i),
  );
  const hintBlock =
    lines.length > 0
      ? lines.join("\n")
      : "(no hints emitted for this stream)";

  const priorBlock = input.priorSummary
    ? `\nPrior chunk's summary for context:\n"""\n${input.priorSummary.narrative.trim()}\n"""\n`
    : "";
  return `Stream: ${STREAM_LABELS_FOR_PROMPT[input.source]}
Time range: ${input.time_range_start} to ${input.time_range_end}

Hints (${input.hints.length} total):
${hintBlock}
${priorBlock}
Now write the summary for this stream. Respond with ONLY the JSON object described in your instructions.`;
}

// ============================================================
// Response parser.
// ============================================================

const RawSummarySchema = z.object({
  narrative: z.string().min(1).max(2000),
  cited_hint_indices: z.array(z.number().int().nonnegative()),
});

export type RawSummary = z.infer<typeof RawSummarySchema>;

export function parseSummaryResponse(rawText: string): RawSummary {
  let candidate = rawText.trim();

  // Strip ```json ... ``` fences if present.
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(candidate);
  if (fenceMatch?.[1]) candidate = fenceMatch[1].trim();

  // If the text isn't a clean object, try to extract the first { ... } block.
  if (!candidate.startsWith("{")) {
    const objMatch = /\{[\s\S]*\}/.exec(candidate);
    if (objMatch) candidate = objMatch[0];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `summary agent response was not valid JSON: ${(err as Error).message}\nraw: ${rawText}`,
    );
  }

  return RawSummarySchema.parse(parsed);
}

// ============================================================
// ID composer — same pattern as composeHints. Stitches RawSummary
// into a typed StreamSummary with full provenance.
// ============================================================

export interface ComposeSummaryInput {
  raw: RawSummary;
  chunkId: string;
  source: Source;
  pipelineRunId: string;
  agentRunId: string;
  hints: AnomalyHint[];
  priorSummary?: StreamSummary;
  timeRangeStart: string;
  timeRangeEnd: string;
  createdAt: string;
}

export function composeStreamSummary(
  input: ComposeSummaryInput,
): StreamSummary {
  const allHintIds = input.hints.map((h) => h.id);
  const citedHintIds: string[] = [];
  for (const idx of input.raw.cited_hint_indices) {
    const h = input.hints[idx];
    if (h) citedHintIds.push(h.id);
  }

  return {
    id: `${input.chunkId}:summary`,
    pipeline_run_id: input.pipelineRunId,
    created_at: input.createdAt,
    source: input.source,
    time_range_start: input.timeRangeStart,
    time_range_end: input.timeRangeEnd,
    hint_ids: allHintIds,
    cited_hint_ids: citedHintIds,
    narrative: input.raw.narrative,
    agent_run_id: input.agentRunId,
    ...(input.priorSummary
      ? { prior_summary_id: input.priorSummary.id }
      : {}),
  };
}
