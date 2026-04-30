import { z } from "zod";

// ============================================================
// Enums
// ============================================================

// "edge"     — fixture data shaped from Cloudflare GraphQL Analytics; the
//              parser contract adapts to any edge / CDN / WAF provider
//              (Fastly, Akamai, CloudFront, Bunny, …).
// "identity" — fixture data shaped from Auth0 tenant logs; the parser
//              contract adapts to any identity provider that emits
//              structured login events (Okta, Cognito, Keycloak, Entra
//              ID, FusionAuth, …).
// "api"      — fixture data shaped from Azure App Insights; deliberately
//              chosen because the AppRequest envelope (and customDimensions)
//              is what a Node service, microservices stack, or .NET monolith
//              would all emit through equivalent OpenTelemetry-style logging.
export const SourceSchema = z.enum(["edge", "identity", "api"]);
export type Source = z.infer<typeof SourceSchema>;

export const OutcomeSchema = z.enum([
  "success",
  "failure",
  "blocked",
  "challenged",
]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const PrioritySchema = z.enum(["P1", "P2", "P3"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const OwnerSchema = z.enum(["devops", "security", "api", "platform"]);
export type Owner = z.infer<typeof OwnerSchema>;

// ============================================================
// Sub-objects
// ============================================================

export const ActorSchema = z.object({
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  user_id: z.string().optional(),
  asn: z.number().int().optional(),
});
export type Actor = z.infer<typeof ActorSchema>;

export const SubjectSchema = z.object({
  path: z.string().optional(),
  endpoint: z.string().optional(),
  resource: z.string().optional(),
});
export type Subject = z.infer<typeof SubjectSchema>;

// ============================================================
// Base Artifact (id / pipeline_run_id / created_at)
//
// `id` is intentionally `z.string().min(1)` rather than `.uuid()`.
// Harness-created artifacts use crypto.randomUUID(); parser-emitted
// ParsedEvents use a deterministic key like `${chunk.id}:${source}:${i}`.
// Both are valid strings; both pass.
// ============================================================

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  pipeline_run_id: z.string().min(1),
  created_at: z.string().datetime(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

// ============================================================
// Stage 1 — LogChunk (raw stream pull)
// ============================================================

export const LogChunkSchema = ArtifactSchema.extend({
  source: SourceSchema,
  query_id: z.string().min(1),
  time_range_start: z.string().datetime(),
  time_range_end: z.string().datetime(),
  chunk_index: z.number().int().nonnegative(),
  raw: z.array(z.unknown()),
  pulled_at: z.string().datetime(),
});
export type LogChunk = z.infer<typeof LogChunkSchema>;

// ============================================================
// Stage 2 — ParsedEvent (deterministic field extraction)
// ============================================================

export const ParsedEventSchema = ArtifactSchema.extend({
  chunk_id: z.string().min(1),
  source: SourceSchema,
  event_time: z.string().datetime(),
  event_type: z.string().min(1),
  actor: ActorSchema,
  subject: SubjectSchema,
  outcome: OutcomeSchema,
  raw_index: z.number().int().nonnegative(),
  extra: z.record(z.unknown()).optional(),
});
export type ParsedEvent = z.infer<typeof ParsedEventSchema>;

// ============================================================
// Stage 3 — AnomalyHint (per-chunk, model-backed)
// ============================================================

export const AnomalyHintSchema = ArtifactSchema.extend({
  chunk_id: z.string().min(1),
  parsed_event_ids: z.array(z.string().min(1)),
  evidence_event_ids: z.array(z.string().min(1)),
  description: z.string().min(1),
  severity: z.number().int().min(1).max(5),
  agent_run_id: z.string().min(1),
});
export type AnomalyHint = z.infer<typeof AnomalyHintSchema>;

// ============================================================
// Stage 4 — StreamSummary (progressive context within a stream)
// ============================================================

export const StreamSummarySchema = ArtifactSchema.extend({
  source: SourceSchema,
  time_range_start: z.string().datetime(),
  time_range_end: z.string().datetime(),
  hint_ids: z.array(z.string().min(1)),
  prior_summary_id: z.string().min(1).optional(),
  narrative: z.string().min(1),
  cited_hint_ids: z.array(z.string().min(1)),
  agent_run_id: z.string().min(1),
});
export type StreamSummary = z.infer<typeof StreamSummarySchema>;

// ============================================================
// Stage 5 — Trend (cross-stream, time-correlated)
// ============================================================

export const TrendEvidenceSchema = z.object({
  source: SourceSchema,
  hint_ids: z.array(z.string().min(1)),
  parsed_event_ids: z.array(z.string().min(1)),
});
export type TrendEvidence = z.infer<typeof TrendEvidenceSchema>;

export const TrendSchema = ArtifactSchema.extend({
  summary_ids: z.array(z.string().min(1)),
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(TrendEvidenceSchema),
  time_window_start: z.string().datetime(),
  time_window_end: z.string().datetime(),
  agent_run_id: z.string().min(1),
});
export type Trend = z.infer<typeof TrendSchema>;

// ============================================================
// Stage 6 — ActionItem (ranked, owner-assigned, fully cited)
// ============================================================

export const ActionItemSchema = ArtifactSchema.extend({
  trend_ids: z.array(z.string().min(1)),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: PrioritySchema,
  suggested_owner: OwnerSchema,
  rationale: z.string().min(1),
  agent_run_id: z.string().min(1),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;
