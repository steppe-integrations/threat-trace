import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import {
  LogChunkSchema,
  ParsedEventSchema,
  type LogChunk,
  type Source,
} from "../contracts/artifacts";
import { api, edge, identity } from "../parsers/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = resolve(__dirname, "..", "fixtures", "tutorial");

interface RawFile {
  source: Source;
  query: string;
  time_range_start: string;
  time_range_end: string;
  events: unknown[];
}

function loadFixture(filename: string): RawFile {
  const buf = readFileSync(resolve(FIXTURE_DIR, filename), "utf-8");
  return JSON.parse(buf) as RawFile;
}

function buildChunk(raw: RawFile, runId: string): LogChunk {
  const now = new Date().toISOString();
  const chunk: LogChunk = {
    id: `chunk-${raw.source}-${randomUUID()}`,
    pipeline_run_id: runId,
    created_at: now,
    source: raw.source,
    query_id: `tutorial-${raw.source}`,
    time_range_start: raw.time_range_start,
    time_range_end: raw.time_range_end,
    chunk_index: 0,
    raw: raw.events,
    pulled_at: now,
  };
  return LogChunkSchema.parse(chunk);
}

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  const tag = ok ? "[PASS]" : "[FAIL]";
  if (!ok) failures++;
  const suffix = detail ? `  (${detail})` : "";
  console.log(`  ${tag} ${label}${suffix}`);
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const runId = randomUUID();

// ============================================================
// Edge (fixture data shaped from Cloudflare logs)
// ============================================================

header("edge");
const edgeRaw = loadFixture("edge.json");
const edgeChunk = buildChunk(edgeRaw, runId);
const edgeParsed = edge.parse(edgeChunk);
console.log(`  raw=${edgeRaw.events.length}  parsed=${edgeParsed.length}`);

check(
  "1:1 raw -> parsed",
  edgeParsed.length === edgeRaw.events.length,
  `raw=${edgeRaw.events.length} parsed=${edgeParsed.length}`,
);

let edgeSchemaOk = true;
for (const p of edgeParsed) {
  const result = ParsedEventSchema.safeParse(p);
  if (!result.success) {
    edgeSchemaOk = false;
    console.log(`    schema error on ${p.id}: ${result.error.message}`);
  }
}
check("all edge ParsedEvents validate against ParsedEventSchema", edgeSchemaOk);

interface EdgeRawEvent {
  clientIP?: string;
  clientASN?: number;
}
const attackerRawIndices = (edgeRaw.events as EdgeRawEvent[])
  .map((e, i) => ({ ip: e.clientIP, i }))
  .filter((x) => x.ip === "185.220.101.42")
  .map((x) => x.i);

const attackerParsed = attackerRawIndices.map((i) => edgeParsed[i]);
check(
  "attacker IP appears in raw fixture",
  attackerRawIndices.length > 0,
  `count=${attackerRawIndices.length}`,
);
check(
  "every attacker raw event maps to a ParsedEvent at the same raw_index",
  attackerParsed.every((p) => p !== undefined),
);
check(
  "every attacker ParsedEvent has actor.ip === '185.220.101.42' and actor.asn === 4224",
  attackerParsed.every(
    (p) => p?.actor.ip === "185.220.101.42" && p?.actor.asn === 4224,
  ),
);

// ============================================================
// Identity (fixture data shaped from Auth0 logs)
// ============================================================

header("identity");
const idRaw = loadFixture("identity.json");
const idChunk = buildChunk(idRaw, runId);
const idParsed = identity.parse(idChunk);
console.log(`  raw=${idRaw.events.length}  parsed=${idParsed.length}`);

check(
  "1:1 raw -> parsed",
  idParsed.length === idRaw.events.length,
  `raw=${idRaw.events.length} parsed=${idParsed.length}`,
);

let idSchemaOk = true;
for (const p of idParsed) {
  const result = ParsedEventSchema.safeParse(p);
  if (!result.success) {
    idSchemaOk = false;
    console.log(`    schema error on ${p.id}: ${result.error.message}`);
  }
}
check("all identity ParsedEvents validate against ParsedEventSchema", idSchemaOk);

interface IdentityRawEvent {
  type?: string;
}
const fpRawIndices = (idRaw.events as IdentityRawEvent[])
  .map((e, i) => ({ type: e.type, i }))
  .filter((x) => x.type === "fp")
  .map((x) => x.i);

const fpParsed = fpRawIndices.map((i) => idParsed[i]);
check("fp events present in raw fixture", fpRawIndices.length > 0, `count=${fpRawIndices.length}`);
check(
  "every fp raw event maps to a ParsedEvent at the same raw_index",
  fpParsed.every((p) => p !== undefined),
);
check(
  "every fp ParsedEvent has event_type 'identity.login.failed' and outcome 'failure'",
  fpParsed.every(
    (p) =>
      p?.event_type === "identity.login.failed" && p?.outcome === "failure",
  ),
);

// ============================================================
// API (App Insights)
// ============================================================

header("api");
const apiRaw = loadFixture("api.json");
const apiChunk = buildChunk(apiRaw, runId);
const apiParsed = api.parse(apiChunk);
console.log(`  raw=${apiRaw.events.length}  parsed=${apiParsed.length}`);

check(
  "1:1 raw -> parsed",
  apiParsed.length === apiRaw.events.length,
  `raw=${apiRaw.events.length} parsed=${apiParsed.length}`,
);

let apiSchemaOk = true;
for (const p of apiParsed) {
  const result = ParsedEventSchema.safeParse(p);
  if (!result.success) {
    apiSchemaOk = false;
    console.log(`    schema error on ${p.id}: ${result.error.message}`);
  }
}
check("all api ParsedEvents validate against ParsedEventSchema", apiSchemaOk);

interface ApiRawEvent {
  resultCode?: string;
}
const unauth401RawIndices = (apiRaw.events as ApiRawEvent[])
  .map((e, i) => ({ resultCode: e.resultCode, i }))
  .filter((x) => x.resultCode === "401")
  .map((x) => x.i);

const unauth401Parsed = unauth401RawIndices.map((i) => apiParsed[i]);
check(
  "exactly two 401 events in api fixture (the documented token-expiry pair)",
  unauth401RawIndices.length === 2,
  `count=${unauth401RawIndices.length}`,
);
check(
  "every 401 raw event maps to a ParsedEvent at the same raw_index",
  unauth401Parsed.every((p) => p !== undefined),
);
check(
  "every 401 ParsedEvent has outcome 'failure' AND extra.FailureReason === 'TokenExpired'",
  unauth401Parsed.every(
    (p) =>
      p?.outcome === "failure" && p.extra?.["FailureReason"] === "TokenExpired",
  ),
);

// ============================================================
// Summary
// ============================================================

console.log();
if (failures > 0) {
  console.log(`FAILED: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("OK: all assertions passed");
