import { z } from "zod";

import type {
  AnomalyHint,
  ParsedEvent,
  Source,
} from "../contracts/artifacts";

// ============================================================
// System prompt — shared across all three streams.
//
// The system prompt is the one piece of input that's identical
// across every hint-agent call in a run, so it's the right place
// to put a cache_control breakpoint. On Sonnet 4 the minimum
// cacheable prefix is 1024 tokens; this prompt sits well under
// that, so caching won't actually trigger today. The marker is
// a forward-compat signal: if the prompt grows past the threshold
// (more rules, examples, etc.), caching kicks in automatically.
// ============================================================

export const SYSTEM_PROMPT = `You are a security analyst reviewing a single log stream for anomalies.

Group findings by **actor fingerprint** — the combination of IP, ASN, and user-agent — not by event type alone. A single failed login is not evidence of an attack; many failures from one fingerprint hitting distinct usernames in a tight window is the canonical password-spray signature.

A 4xx response that carries a benign reason in its customDims (e.g., FailureReason: "TokenExpired") is routine token expiry, not attack signal — do not flag it.

You see only ONE stream. Do not speculate about activity in other streams. Do not invent cross-stream correlations.

If nothing in this stream is anomalous, return {"hints": []}.

Respond with ONLY a JSON object matching this shape — no preamble, no commentary:
{
  "hints": [
    {
      "description": "string, <= 200 chars",
      "severity": <integer 1-5>,
      "evidence_indices": [<int>, <int>, ...]
    }
  ]
}

evidence_indices reference the [N] indices shown in the event list. Severity scale: 1=informational, 3=suspicious, 5=active attack.

If your chat platform supports a downloadable artifact, file, or canvas, deliver the JSON there. Otherwise return it inside a single fenced JSON code block. Bare JSON is also accepted.`;

// ============================================================
// Per-source event renderers — pure, deterministic.
// ============================================================

function isoToHms(iso: string): string {
  // "2026-04-28T14:00:03.000Z" -> "14:00:03"
  // "2026-04-28T14:00:03.120Z" -> "14:00:03.120"
  const match = /T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(iso);
  return match?.[1] ?? iso;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function renderEdgeEvent(p: ParsedEvent, i: number): string {
  const t = isoToHms(p.event_time);
  const ip = p.actor.ip ?? "?";
  const asn = p.actor.asn ?? "?";
  const asnDesc = (p.extra?.["clientASNDescription"] as string | undefined) ?? "";
  const asnLabel = asnDesc ? `${asn}(${asnDesc})` : `${asn}`;
  const ua = truncate(p.actor.user_agent ?? "?", 80);
  const path = p.subject.path ?? "?";
  const host = p.subject.resource ?? "?";
  const status = (p.extra?.["edgeResponseStatus"] as number | undefined) ?? "?";
  const waf = (p.extra?.["wafAction"] as string | undefined) ?? "?";
  const bot = (p.extra?.["botScore"] as number | undefined);
  const botStr = bot === undefined ? "" : ` bot=${bot}`;
  const method = p.subject.endpoint?.split(" ")[0] ?? "?";
  return `[${i}] ${t}  ip=${ip} asn=${asnLabel}  ${method} ${path} (${host}) -> ${status}  waf=${waf}${botStr}  ua="${ua}"`;
}

function renderIdentityEvent(p: ParsedEvent, i: number): string {
  const t = isoToHms(p.event_time);
  const rawType = (p.extra?.["type"] as string | undefined) ?? "?";
  const ip = p.actor.ip ?? "?";
  const ua = truncate(p.actor.user_agent ?? "?", 80);
  const userName =
    (p.extra?.["user_name"] as string | undefined) ?? p.actor.user_id ?? "?";
  const outcome = p.outcome;
  return `[${i}] ${t}  type=${rawType}(${p.event_type}/${outcome})  user=${userName}  ip=${ip}  ua="${ua}"`;
}

function renderApiEvent(p: ParsedEvent, i: number): string {
  const t = isoToHms(p.event_time);
  const path = p.subject.path ?? "?";
  const endpoint = p.subject.endpoint ?? "?";
  const status = (p.extra?.["resultCode"] as string | undefined) ?? "?";
  const user = truncate(p.actor.user_id ?? "anonymous", 48);
  const ua = truncate(p.actor.user_agent ?? "?", 40);
  const dur = p.extra?.["duration"];
  const durStr = typeof dur === "number" ? ` dur=${dur}ms` : "";

  // Surface customDimensions inline — this is what carries
  // FailureReason: TokenExpired, the signal the hint agent must
  // see clearly to NOT flag the two 401s as malicious.
  const customDimKeys = [
    "FailureReason",
    "TenantId",
    "AuthScheme",
    "Probe",
  ] as const;
  const customDims: string[] = [];
  for (const key of customDimKeys) {
    const v = p.extra?.[key];
    if (v !== undefined && v !== null) {
      customDims.push(`${key}:"${String(v)}"`);
    }
  }
  const cdStr =
    customDims.length > 0 ? `  customDims={${customDims.join(", ")}}` : "";

  return `[${i}] ${t}  ${endpoint || path} -> ${status}  user=${user}  ua="${ua}"${durStr}${cdStr}`;
}

const RENDERERS: Record<Source, (p: ParsedEvent, i: number) => string> = {
  edge: renderEdgeEvent,
  identity: renderIdentityEvent,
  api: renderApiEvent,
};

// Per-source labels shown to the model. Each names the role of the
// stream first; the parenthetical names the specific log shape the
// fixture data was modeled after, so the model has the right mental
// model for the field-level details it sees in the events.
const STREAM_LABELS: Record<Source, string> = {
  edge: "edge (CDN / WAF tier; fixture data shaped from Cloudflare logs)",
  identity: "identity (login / authentication tier; fixture data shaped from Auth0 logs)",
  api: "api (application tier; fixture data shaped from Azure App Insights AppRequest)",
};

// ============================================================
// Prompt builders — pure.
// ============================================================

export interface HintPromptInput {
  source: Source;
  events: ParsedEvent[];
  time_range_start: string;
  time_range_end: string;
}

export function buildUserPrompt(input: HintPromptInput): string {
  const renderer = RENDERERS[input.source];
  const lines = input.events.map((p, i) => renderer(p, i));
  return `Stream: ${STREAM_LABELS[input.source]}
Time range: ${input.time_range_start} to ${input.time_range_end}
Events (${input.events.length} total):
${lines.join("\n")}

Identify any anomalies in this stream. Respond with ONLY the JSON object described in your instructions.`;
}

// ============================================================
// Response parsing — pure, robust to leading/trailing whitespace
// or accidental code-fence wrapping (model habit).
// ============================================================

const RawHintSchema = z.object({
  description: z.string().min(1).max(400),
  severity: z.number().int().min(1).max(5),
  evidence_indices: z.array(z.number().int().nonnegative()),
});

const RawHintsResponseSchema = z.object({
  hints: z.array(RawHintSchema),
});

export type RawHint = z.infer<typeof RawHintSchema>;

export function parseHintResponse(rawText: string): RawHint[] {
  let candidate = rawText.trim();

  // Strip ```json ... ``` fences if present.
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(candidate);
  if (fenceMatch?.[1]) {
    candidate = fenceMatch[1].trim();
  }

  // If the text isn't a clean object, try to extract the first { ... } block.
  if (!candidate.startsWith("{")) {
    const objMatch = /\{[\s\S]*\}/.exec(candidate);
    if (objMatch) candidate = objMatch[0];
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `hint agent response was not valid JSON: ${(err as Error).message}\nraw: ${rawText}`,
    );
  }

  const validated = RawHintsResponseSchema.parse(parsedJson);
  return validated.hints;
}

// ============================================================
// ID composer — stitches RawHints into AnomalyHints with full
// provenance. Pure; takes the chunk + parsed events + agent_run_id.
// ============================================================

export interface ComposeHintsInput {
  rawHints: RawHint[];
  chunkId: string;
  pipelineRunId: string;
  agentRunId: string;
  parsedEvents: ParsedEvent[];
  createdAt: string;
}

export function composeHints(input: ComposeHintsInput): AnomalyHint[] {
  const allEventIds = input.parsedEvents.map((p) => p.id);
  return input.rawHints.map((raw, i): AnomalyHint => {
    const evidenceIds: string[] = [];
    for (const idx of raw.evidence_indices) {
      const evt = input.parsedEvents[idx];
      if (evt) evidenceIds.push(evt.id);
    }
    return {
      id: `${input.chunkId}:hint:${i}`,
      pipeline_run_id: input.pipelineRunId,
      created_at: input.createdAt,
      chunk_id: input.chunkId,
      parsed_event_ids: allEventIds,
      evidence_event_ids: evidenceIds,
      description: raw.description,
      severity: raw.severity,
      agent_run_id: input.agentRunId,
    };
  });
}
