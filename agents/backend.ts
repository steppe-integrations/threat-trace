import type {
  AnomalyHint,
  LogChunk,
  ParsedEvent,
} from "../contracts/artifacts";
import type { RawHint } from "./hint";

// ============================================================
// HintAgentBackend — the seam between "what we want from a hint
// agent" and "how we get the model to do it." Anthropic SDK,
// manual copy-paste, local Ollama, and anything else we add later
// all implement this same interface and return identical shapes.
// Everything downstream (composer, harness, eventual React UI)
// reads only HintBackendOutput; it cannot tell which backend ran.
// ============================================================

export interface HintBackendInput {
  chunk: LogChunk;
  parsedEvents: ParsedEvent[];
  pipelineRunId: string;
  /**
   * If present, this string is sent as the user-message content
   * verbatim instead of being built from `chunk + parsedEvents`.
   * The system prompt stays canonical regardless. Used by the
   * web app's API-mode editable prompt textarea — director can
   * weaken a check or rewrite the events list, click Run, watch
   * the expectation panel react. Absent for canonical runs.
   */
  userPromptOverride?: string;
}

export interface HintBackendUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface HintBackendOutput {
  rawText: string;
  rawHints: RawHint[];
  hints: AnomalyHint[];
  agentRunId: string;
  usage?: HintBackendUsage;
}

export interface HintAgentBackend {
  readonly name: string;
  run(input: HintBackendInput): Promise<HintBackendOutput>;
}
