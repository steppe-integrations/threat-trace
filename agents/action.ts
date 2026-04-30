import { z } from "zod";

import type {
  ActionItem,
  Owner,
  Priority,
  Trend,
} from "../contracts/artifacts";
import { OwnerSchema, PrioritySchema } from "../contracts/artifacts";
import { truncatePromptString } from "./shared";

// ============================================================
// Action agent — Stage 3, final stage.
//
// Takes Trends and emits prioritized, owner-assigned ActionItems
// with rationales that cite trend_ids. Smallest of the four
// model-backed agents: each ActionItem is title + description +
// rationale + priority + owner.
//
// Tutorial fixture target: 4 ActionItems
//   P1 — Block 185.220.101.42 at the edge (devops)
//   P1 — Audit affected users (security)
//   P2 — Tighten WAF posture on /u/login/* (devops)
//   P3 — Monitor api for follow-up (api)
// ============================================================

export const ACTION_SYSTEM_PROMPT = `You are a security analyst translating identified trends into prioritized, actionable recommendations for the team.

You will receive a list of cross-stream trends. For each genuine trend, emit one or more ActionItems — concrete steps the team should take, with priority, owner, and rationale.

Rules:
- Each ActionItem MUST cite the trend(s) that justify it via trend_indices.
- Priorities:
  - P1 — active threat or live exposure that requires immediate response
  - P2 — known weakness exploited or about to be; remediate this week
  - P3 — improvement / monitoring / hardening; schedule
- Owners (pick one per ActionItem):
  - devops — edge / WAF / network / IaC / deployment
  - security — incident response, audit, user account safety
  - api — application backend, business-logic owners
  - platform — shared infra, observability, identity providers
- Rationale should reference the trend evidence. Be terse — one sentence is plenty.
- Description should be one short paragraph naming the action concretely (block which IP, audit which users, tighten which path).
- Do not invent ActionItems unrelated to the trends provided. If a trend is weak (low confidence, sparse evidence), you may still emit a P3 monitoring action — but never a P1 or P2 that the evidence doesn't justify.

Output: ONLY a JSON object matching this shape — no preamble, no commentary:
{
  "actions": [
    {
      "title": "string, <= 80 chars, imperative voice",
      "description": "string, <= 400 chars, one paragraph",
      "priority": "P1" | "P2" | "P3",
      "suggested_owner": "devops" | "security" | "api" | "platform",
      "rationale": "string, <= 240 chars, references the trend",
      "trend_indices": [<int>, <int>, ...]
    }
  ]
}

trend_indices reference the [N] markers shown in the trend list.

If your chat platform supports a downloadable artifact, file, or canvas, deliver the JSON there. Otherwise return it inside a single fenced JSON code block. Bare JSON is also accepted.`;

// ============================================================
// Trend renderer for prompt input.
// ============================================================

function renderTrend(trend: Trend, i: number): string {
  const evidenceSummary = trend.evidence
    .map(
      (ev) =>
        `${ev.source}: ${ev.hint_ids.length} hint(s) / ${ev.parsed_event_ids.length} event(s)`,
    )
    .join("; ");

  return `[${i}] confidence=${trend.confidence.toFixed(2)} window=${trend.time_window_start} → ${trend.time_window_end}
    Evidence: ${evidenceSummary || "(no evidence cited)"}
    ${truncatePromptString(trend.description, 400)}`;
}

// ============================================================
// Prompt builder.
// ============================================================

export interface ActionPromptInput {
  trends: Trend[];
  time_range_start: string;
  time_range_end: string;
}

export function buildActionUserPrompt(input: ActionPromptInput): string {
  const lines = input.trends.map((t, i) => renderTrend(t, i));
  const block = lines.length > 0 ? lines.join("\n") : "(no trends provided)";

  return `Time window: ${input.time_range_start} to ${input.time_range_end}

Trends (${input.trends.length} total):
${block}

Translate each genuine trend into prioritized, owner-assigned ActionItems. Respond with ONLY the JSON object described in your instructions.`;
}

// ============================================================
// Response parser.
// ============================================================

const RawActionItemSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(800),
  priority: PrioritySchema,
  suggested_owner: OwnerSchema,
  rationale: z.string().min(1).max(480),
  trend_indices: z.array(z.number().int().nonnegative()),
});

const RawActionsResponseSchema = z.object({
  actions: z.array(RawActionItemSchema),
});

export type RawActionItem = z.infer<typeof RawActionItemSchema>;

export function parseActionResponse(rawText: string): RawActionItem[] {
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
      `action agent response was not valid JSON: ${(err as Error).message}\nraw: ${rawText}`,
    );
  }

  return RawActionsResponseSchema.parse(parsed).actions;
}

// ============================================================
// ID composer — maps trend_indices to trend IDs.
// ============================================================

export interface ComposeActionsInput {
  raws: RawActionItem[];
  pipelineRunId: string;
  agentRunId: string;
  trends: Trend[];
  createdAt: string;
}

export function composeActionItems(
  input: ComposeActionsInput,
): ActionItem[] {
  return input.raws.map((raw, i): ActionItem => {
    const trendIds: string[] = [];
    for (const idx of raw.trend_indices) {
      const t = input.trends[idx];
      if (t) trendIds.push(t.id);
    }
    return {
      id: `action:${input.pipelineRunId}:${i}`,
      pipeline_run_id: input.pipelineRunId,
      created_at: input.createdAt,
      trend_ids: trendIds,
      title: raw.title,
      description: raw.description,
      priority: raw.priority as Priority,
      suggested_owner: raw.suggested_owner as Owner,
      rationale: raw.rationale,
      agent_run_id: input.agentRunId,
    };
  });
}
