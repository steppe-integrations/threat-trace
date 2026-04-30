import type {
  LogChunk,
  Outcome,
  ParsedEvent,
} from "../contracts/artifacts";

interface ApiEvent {
  timestamp: string;
  name?: string;
  id?: string;
  url?: string;
  resultCode: string;
  duration?: number;
  operation_Name?: string;
  operation_Id?: string;
  user_Id?: string | null;
  user_AuthenticatedId?: string | null;
  client_IP?: string | null;
  client_Browser?: string | null;
  appName?: string;
  cloud_RoleName?: string;
  customDimensions?: Record<string, unknown>;
}

function eventTypeFromResultCode(code: string): string {
  const n = Number.parseInt(code, 10);
  if (Number.isNaN(n)) return "api.request.unknown";
  if (n >= 200 && n < 300) return "api.request.success";
  if (n === 401) return "api.request.unauthorized";
  if (n === 403) return "api.request.forbidden";
  if (n === 404) return "api.request.not_found";
  if (n === 429) return "api.request.rate_limited";
  if (n >= 400 && n < 500) return "api.request.client_error";
  if (n >= 500) return "api.request.server_error";
  return "api.request.unknown";
}

function outcomeFromResultCode(code: string): Outcome {
  const n = Number.parseInt(code, 10);
  if (!Number.isNaN(n) && n >= 200 && n < 300) return "success";
  return "failure";
}

function pathFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function parse(chunk: LogChunk): ParsedEvent[] {
  if (chunk.source !== "api") {
    throw new Error(
      `api parser invoked on '${chunk.source}' chunk (id=${chunk.id})`,
    );
  }
  const events = chunk.raw as ApiEvent[];
  return events.map((evt, i): ParsedEvent => {
    const customDims = evt.customDimensions ?? {};
    return {
      id: `${chunk.id}:api:${i}`,
      pipeline_run_id: chunk.pipeline_run_id,
      created_at: chunk.created_at,
      chunk_id: chunk.id,
      source: "api",
      event_time: evt.timestamp,
      event_type: eventTypeFromResultCode(evt.resultCode),
      actor: {
        ip: evt.client_IP ?? undefined,
        user_agent: evt.client_Browser ?? undefined,
        user_id: evt.user_AuthenticatedId ?? evt.user_Id ?? undefined,
      },
      subject: {
        path: pathFromUrl(evt.url) ?? evt.name,
        endpoint: evt.operation_Name,
        resource: evt.appName ?? evt.cloud_RoleName,
      },
      outcome: outcomeFromResultCode(evt.resultCode),
      raw_index: i,
      // Spread customDimensions at the top level so consumers (and the
      // hint agent prompt) can read FailureReason / TenantId / etc.
      // directly without nested lookups.
      extra: {
        ...customDims,
        request_id: evt.id,
        name: evt.name,
        url: evt.url,
        resultCode: evt.resultCode,
        duration: evt.duration,
        operation_Id: evt.operation_Id,
        appName: evt.appName,
        cloud_RoleName: evt.cloud_RoleName,
      },
    };
  });
}
