import type { Source } from "../contracts/artifacts";

// ============================================================
// Shared helpers across the model-backed agents (hint, summary,
// trend, action). The per-stream display labels we want IN THE
// PROMPT are slightly more descriptive than the UI labels in
// src/lib/pipeline.ts — keep them here so the prompt body stays
// consistent across all agents.
// ============================================================

export const STREAM_LABELS_FOR_PROMPT: Record<Source, string> = {
  edge: "edge (CDN / WAF tier; fixture data shaped from Cloudflare logs)",
  identity: "identity (login / authentication tier; fixture data shaped from Auth0 logs)",
  api: "api (application tier; fixture data shaped from Azure App Insights AppRequest)",
};

export function truncatePromptString(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function isoToHms(iso: string): string {
  const match = /T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(iso);
  return match?.[1] ?? iso;
}
