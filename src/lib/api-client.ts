import Anthropic from "@anthropic-ai/sdk";

import { AnthropicBackend } from "../../agents/backends/anthropic";

// ============================================================
// Browser-side Anthropic adapter.
//
// Two surfaces:
//  - makeBrowserAnthropicBackend(): the hint-specific path. Used by
//    the per-stream Run buttons (Stage 2). Wraps the existing
//    AnthropicBackend with `dangerouslyAllowBrowser: true`.
//  - callAnthropic(): generic helper for Stage 3 stages (summary,
//    trend, action). Takes any system + user prompt, returns the
//    raw text response + token usage. Same model + max_tokens cap
//    as the hint backend so prompts tuned in one work in the other.
//
// `dangerouslyAllowBrowser: true` opts out of the SDK's runtime
// safety check that would otherwise reject a browser environment.
// The actual cross-origin gate is server-side at api.anthropic.com,
// which we verified accepts wildcard origins (CORS spike, Phase 0).
//
// CRITICAL: every function in here that touches an apiKey is the
// only place a key moves from React state into a network-bound
// object. The state store keeps apiKey in `state.runtime.apiKey`
// (in-memory only, structurally absent from InvestigationFile).
// ============================================================

const STAGE2_3_MODEL = "claude-sonnet-4-0";
const STAGE2_3_MAX_TOKENS = 1000;

export function makeBrowserAnthropicBackend(apiKey: string): AnthropicBackend {
  return new AnthropicBackend({
    client: new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    }),
  });
}

export interface CallAnthropicOutput {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<CallAnthropicOutput> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const message = await client.messages.create({
    model: STAGE2_3_MODEL,
    max_tokens: STAGE2_3_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlocks = message.content.filter(
    (b): b is Extract<(typeof message.content)[number], { type: "text" }> =>
      b.type === "text",
  );
  const rawText = textBlocks.map((b) => b.text).join("");

  return {
    rawText,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
