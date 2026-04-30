import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import {
  AnomalyHintSchema,
  LogChunkSchema,
  type AnomalyHint,
  type LogChunk,
  type ParsedEvent,
  type Source,
} from "../contracts/artifacts";
import { api, edge, identity } from "../parsers/index";
import { ManualBackend } from "../agents/backends/manual";
import { evaluateExpectations } from "../agents/expectations";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const FIXTURE_DIR = resolve(ROOT, "fixtures", "tutorial");
const PROMPTS_DIR = resolve(ROOT, "cli-manual", "prompts");
const RESPONSES_DIR = resolve(ROOT, "cli-manual", "responses");

interface RawFile {
  source: Source;
  query: string;
  time_range_start: string;
  time_range_end: string;
  events: unknown[];
}

function loadFixture(filename: string): RawFile {
  return JSON.parse(
    readFileSync(resolve(FIXTURE_DIR, filename), "utf-8"),
  ) as RawFile;
}

function buildChunk(raw: RawFile, runId: string): LogChunk {
  const now = new Date().toISOString();
  return LogChunkSchema.parse({
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
  });
}

const PARSERS: Record<Source, (chunk: LogChunk) => ParsedEvent[]> = {
  edge: edge.parse,
  identity: identity.parse,
  api: api.parse,
};

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

function describeHints(hints: AnomalyHint[]): void {
  if (hints.length === 0) {
    console.log("  (no hints emitted)");
    return;
  }
  for (const h of hints) {
    console.log(
      `  [sev=${h.severity}] ${h.description}\n    evidence: ${h.evidence_event_ids.length} event(s)`,
    );
  }
}

const backend = new ManualBackend({
  promptsDir: PROMPTS_DIR,
  responsesDir: RESPONSES_DIR,
});

const runId = randomUUID();
console.log(`pipeline_run_id=${runId}  backend=${backend.name}`);
console.log("Reading hint responses for all three tutorial streams...");

const streams: Array<{ source: Source; filename: string }> = [
  { source: "edge", filename: "edge.json" },
  { source: "identity", filename: "identity.json" },
  { source: "api", filename: "api.json" },
];

interface StreamResult {
  source: Source;
  parsed: ParsedEvent[];
  hints: AnomalyHint[];
}

const results: StreamResult[] = [];
let setupErrors = 0;

for (const stream of streams) {
  const raw = loadFixture(stream.filename);
  const chunk = buildChunk(raw, runId);
  const parsed = PARSERS[stream.source](chunk);

  header(stream.source);
  console.log(`  raw=${raw.events.length}  parsed=${parsed.length}`);

  let out;
  try {
    out = await backend.run({
      chunk,
      parsedEvents: parsed,
      pipelineRunId: runId,
    });
  } catch (err) {
    console.error(`  [SETUP ERROR] ${(err as Error).message}`);
    setupErrors++;
    continue;
  }

  describeHints(out.hints);

  let schemaOk = true;
  for (const h of out.hints) {
    const r = AnomalyHintSchema.safeParse(h);
    if (!r.success) {
      schemaOk = false;
      console.log(`    schema error on ${h.id}: ${r.error.message}`);
    }
  }
  check(
    `every ${stream.source} AnomalyHint validates against AnomalyHintSchema`,
    schemaOk,
  );

  results.push({ source: stream.source, parsed, hints: out.hints });
}

if (setupErrors > 0) {
  console.log(
    `\n${setupErrors} stream(s) skipped — set up the missing response files and rerun.`,
  );
  process.exit(2);
}

header("expectations");
for (const r of results) {
  for (const exp of evaluateExpectations({
    source: r.source,
    parsed: r.parsed,
    hints: r.hints,
  })) {
    check(exp.label, exp.passed, exp.detail);
  }
}

console.log();
if (failures > 0) {
  console.log(`FAILED: ${failures} expectation(s) failed`);
  process.exit(1);
}
console.log("OK: all expectations met");
