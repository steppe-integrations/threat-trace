import Anthropic from "@anthropic-ai/sdk";

import type {
  HintAgentBackend,
  HintBackendInput,
  HintBackendOutput,
} from "../backend";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  composeHints,
  parseHintResponse,
} from "../hint";

// ============================================================
// Model + token caps mirror the Claude.ai artifact runtime exactly.
// HANDOFF.md pins the artifact-side API to claude-sonnet-4-20250514
// (alias: claude-sonnet-4-0) with max_tokens=1000. Tuning the prompt
// against any other model risks silent regression when it ships
// inside the artifact.
// ============================================================

export const HINT_MODEL = "claude-sonnet-4-0";
export const HINT_MAX_TOKENS = 1000;

export interface AnthropicBackendOptions {
  client?: Anthropic;
  model?: string;
  maxTokens?: number;
}

export class AnthropicBackend implements HintAgentBackend {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicBackendOptions = {}) {
    this.client = opts.client ?? new Anthropic();
    this.model = opts.model ?? HINT_MODEL;
    this.maxTokens = opts.maxTokens ?? HINT_MAX_TOKENS;
  }

  async run(input: HintBackendInput): Promise<HintBackendOutput> {
    // The user-message content: either the canonical event-list
    // prompt built from chunk+parsedEvents, or the override the
    // user typed into the editable textarea. The system prompt
    // (carrying the JSON contract + load-bearing rules) stays
    // canonical either way.
    const userPrompt =
      input.userPromptOverride ??
      buildUserPrompt({
        source: input.chunk.source,
        events: input.parsedEvents,
        time_range_start: input.chunk.time_range_start,
        time_range_end: input.chunk.time_range_end,
      });

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
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

    const rawHints = parseHintResponse(rawText);
    // Use global Web Crypto API (available in browser and Node 19+).
    // Avoids importing node:crypto, which would prevent this file
    // from being bundled into the browser standalone HTML.
    const agentRunId = crypto.randomUUID();
    const now = new Date().toISOString();

    const hints = composeHints({
      rawHints,
      chunkId: input.chunk.id,
      pipelineRunId: input.pipelineRunId,
      agentRunId,
      parsedEvents: input.parsedEvents,
      createdAt: now,
    });

    return {
      rawText,
      rawHints,
      hints,
      agentRunId,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens,
      },
    };
  }
}
