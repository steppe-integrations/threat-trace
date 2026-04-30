import type {
  LogChunk,
  Outcome,
  ParsedEvent,
} from "../contracts/artifacts";

// ============================================================
// Identity stream parser.
//
// The fixture data this parser consumes is shaped from Auth0's
// tenant log format (date / type / connection / client_id /
// user_name fields, plus the short opaque event-type codes
// like "fp" and "s"). The parser is named for the *role* the
// stream plays (the identity / authentication tier) rather than
// the vendor — the output ParsedEvent contract is identical
// regardless of which identity provider produced the input.
//
// To adapt this for a different identity provider (Okta,
// Cognito, Keycloak, Entra ID, FusionAuth, …): replace the
// `Auth0Event` interface and the `TYPE_MAP` lookup with the
// vendor's equivalents (Okta's `eventType`, Cognito's
// `eventName`, Keycloak's `type`, etc.) and rewrite the
// field-mapping inside `parse`. Keep the output contract
// (`source: "identity"`, the deterministic id derivation, the
// actor / subject / outcome / extra structure). Everything
// downstream is shape-agnostic.
// ============================================================

interface Auth0Event {
  _id?: string;
  log_id?: string;
  date: string;
  type: string;
  description?: string | null;
  connection?: string | null;
  connection_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  tenant_name?: string | null;
  details?: unknown;
}

interface TypeMapping {
  event_type: string;
  outcome: Outcome;
}

// The fixture uses Auth0's short opaque event-type codes (documented
// at https://auth0.com/docs/deploy-monitor/logs/log-event-type-codes).
// Only the codes the tutorial fixture uses are mapped explicitly;
// anything else falls back to a passthrough event_type and a
// best-effort outcome. The output event_type is normalized to
// `identity.login.{failed|success}` regardless of which provider's
// codes the fixture happens to use.
const TYPE_MAP: Record<string, TypeMapping> = {
  fp: { event_type: "identity.login.failed", outcome: "failure" },
  f: { event_type: "identity.login.failed", outcome: "failure" },
  s: { event_type: "identity.login.success", outcome: "success" },
  fu: { event_type: "identity.login.failed", outcome: "failure" },
};

function mapType(type: string): TypeMapping {
  const hit = TYPE_MAP[type];
  if (hit) return hit;
  return {
    event_type: `identity.${type}`,
    outcome: type.startsWith("f") ? "failure" : "success",
  };
}

export function parse(chunk: LogChunk): ParsedEvent[] {
  if (chunk.source !== "identity") {
    throw new Error(
      `identity parser invoked on '${chunk.source}' chunk (id=${chunk.id})`,
    );
  }
  const events = chunk.raw as Auth0Event[];
  return events.map((evt, i): ParsedEvent => {
    const mapped = mapType(evt.type);
    const userId = evt.user_id ?? evt.user_name ?? undefined;
    return {
      id: `${chunk.id}:identity:${i}`,
      pipeline_run_id: chunk.pipeline_run_id,
      created_at: chunk.created_at,
      chunk_id: chunk.id,
      source: "identity",
      event_time: evt.date,
      event_type: mapped.event_type,
      actor: {
        ip: evt.ip ?? undefined,
        user_agent: evt.user_agent ?? undefined,
        user_id: userId,
      },
      subject: {
        endpoint: evt.connection ?? undefined,
        resource: evt.client_name ?? evt.client_id ?? undefined,
      },
      outcome: mapped.outcome,
      raw_index: i,
      extra: {
        log_id: evt.log_id,
        type: evt.type,
        description: evt.description,
        connection: evt.connection,
        connection_id: evt.connection_id,
        client_id: evt.client_id,
        tenant_name: evt.tenant_name,
        user_name: evt.user_name,
        details: evt.details,
      },
    };
  });
}
