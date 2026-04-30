import type {
  LogChunk,
  Outcome,
  ParsedEvent,
} from "../contracts/artifacts";

// ============================================================
// Edge stream parser.
//
// The fixture data this parser consumes is shaped from
// Cloudflare's GraphQL Analytics httpRequestsAdaptiveGroups
// schema (rayName / clientIP / clientASN / wafAction / botScore
// fields). The parser is named for the *role* the stream plays
// (the edge / WAF / CDN tier) rather than the vendor — the
// output ParsedEvent contract is identical regardless of which
// edge product produced the input.
//
// To adapt this for a different edge product (Fastly, Akamai,
// CloudFront, Bunny, …): replace the `CloudflareEvent` interface
// with that vendor's record shape and rewrite the field-mapping
// inside `parse`. Keep the output contract (`source: "edge"`,
// the deterministic id derivation, the actor / subject / outcome
// / extra structure). Everything downstream is shape-agnostic.
// ============================================================

interface CloudflareEvent {
  datetime: string;
  rayName?: string;
  clientIP?: string;
  clientASN?: number;
  clientASNDescription?: string;
  clientCountryName?: string;
  clientRequestHTTPHost?: string;
  clientRequestPath?: string;
  clientRequestMethod?: string;
  clientRequestBytes?: number;
  edgeResponseStatus?: number;
  edgeResponseBytes?: number;
  userAgent?: string;
  wafAction?: string;
  botScore?: number;
  botScoreSrcName?: string;
}

function eventTypeFromWafAction(action: string | undefined): string {
  switch (action) {
    case "block":
      return "edge.request.blocked";
    case "challenge":
      return "edge.request.challenged";
    case "log":
      return "edge.request.logged";
    case "allow":
    default:
      return "edge.request.allowed";
  }
}

function outcomeFromWafAction(action: string | undefined): Outcome {
  switch (action) {
    case "block":
      return "blocked";
    case "challenge":
      return "challenged";
    case "log":
    case "allow":
    default:
      return "success";
  }
}

export function parse(chunk: LogChunk): ParsedEvent[] {
  if (chunk.source !== "edge") {
    throw new Error(
      `edge parser invoked on '${chunk.source}' chunk (id=${chunk.id})`,
    );
  }
  const events = chunk.raw as CloudflareEvent[];
  return events.map((evt, i): ParsedEvent => {
    const method = evt.clientRequestMethod;
    const path = evt.clientRequestPath;
    return {
      id: `${chunk.id}:edge:${i}`,
      pipeline_run_id: chunk.pipeline_run_id,
      created_at: chunk.created_at,
      chunk_id: chunk.id,
      source: "edge",
      event_time: evt.datetime,
      event_type: eventTypeFromWafAction(evt.wafAction),
      actor: {
        ip: evt.clientIP,
        user_agent: evt.userAgent,
        asn: evt.clientASN,
      },
      subject: {
        path,
        endpoint: method && path ? `${method} ${path}` : path,
        resource: evt.clientRequestHTTPHost,
      },
      outcome: outcomeFromWafAction(evt.wafAction),
      raw_index: i,
      extra: {
        rayName: evt.rayName,
        wafAction: evt.wafAction,
        botScore: evt.botScore,
        botScoreSrcName: evt.botScoreSrcName,
        clientCountryName: evt.clientCountryName,
        clientASNDescription: evt.clientASNDescription,
        edgeResponseStatus: evt.edgeResponseStatus,
        edgeResponseBytes: evt.edgeResponseBytes,
        clientRequestBytes: evt.clientRequestBytes,
      },
    };
  });
}
