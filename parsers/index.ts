import type { LogChunk, ParsedEvent, Source } from "../contracts/artifacts";
import * as edge from "./edge";
import * as identity from "./identity";
import * as api from "./api";

const PARSERS: Record<Source, (chunk: LogChunk) => ParsedEvent[]> = {
  edge: edge.parse,
  identity: identity.parse,
  api: api.parse,
};

export function parseChunk(chunk: LogChunk): ParsedEvent[] {
  return PARSERS[chunk.source](chunk);
}

export { edge, identity, api };
