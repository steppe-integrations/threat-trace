import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { loadEnvFile } from "./_env";
loadEnvFile();

import {
  AnomalyHintSchema,
  LogChunkSchema,
  type AnomalyHint,
  type LogChunk,
  type ParsedEvent,
  type Source,
} from "../contracts/artifacts";
import { api, edge, identity } from "../parsers/index";
import { AnthropicBackend } from "../agents/backends/anthropic";
import { evaluateExpectations } from "../agents/expectations";

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
  return JSON.parse(
    readFileSync(resolve(FIXTURE_DIR, filename), "utf-8"),
  ) as RawFile;
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

if (!process.env["ANTHROPIC_API_KEY"]) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Set it and rerun, or use the manual path:",
  );
  console.error("  export ANTHROPIC_API_KEY=sk-ant-...   (bash)");
  console.error("  $env:ANTHROPIC_API_KEY = 'sk-ant-...' (PowerShell)");
  console.error("  npm run hint:render                   (no key needed)");
  process.exit(2);
}

const backend = new AnthropicBackend();
const runId = randomUUID();

console.log(`pipeline_run_id=${runId}  backend=${backend.name}`);
console.log("Running hint agent against all three tutorial streams...");

const streams: Array<{ source: Source; filename: string }> = [
  { source: "edge", filename: "edge.json" },
  { source: "identity", filename: "identity.json" },
  { source: "api", filename: "api.json" },
];

interface StreamResult {
  source: Source;
  parsed: ParsedEvent[];
  hints: AnomalyHint[];
  rawText: string;
  inputTokens: number;
  outputTokens: number;
}

const results: StreamResult[] = [];

for (const stream of streams) {
  const raw = loadFixture(stream.filename);
  const chunk = buildChunk(raw, runId);
  const parsed = PARSERS[stream.source](chunk);

  header(stream.source);
  console.log(`  raw=${raw.events.length}  parsed=${parsed.length}`);
  process.stdout.write(`  calling hint agent... `);

  const t0 = Date.now();
  const out = await backend.run({
    chunk,
    parsedEvents: parsed,
    pipelineRunId: runId,
  });
  const ms = Date.now() - t0;
  const inputTokens = out.usage?.input_tokens ?? 0;
  const outputTokens = out.usage?.output_tokens ?? 0;
  console.log(`done in ${ms}ms  (in=${inputTokens} out=${outputTokens} tokens)`);

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

  results.push({
    source: stream.source,
    parsed,
    hints: out.hints,
    rawText: out.rawText,
    inputTokens,
    outputTokens,
  });
}

// Per-stream raw model output — printed unconditionally so a single
// run yields enough signal to apply targeted prompt fixes without a
// second round-trip.
header("model raw responses");
for (const r of results) {
  console.log(`\n--- ${r.source} ---`);
  console.log(r.rawText.trim());
}

header("expectations");
for (const r of results) {
  const expectations = evaluateExpectations({
    source: r.source,
    parsed: r.parsed,
    hints: r.hints,
  });
  for (const exp of expectations) {
    check(exp.label, exp.passed, exp.detail);
    // On failure, surface the offending evidence_indices and event
    // one-liners so we can see *which* events the model wrongly
    // cited, not just *that* it did.
    if (!exp.passed) {
      const eventById = new Map(r.parsed.map((p) => [p.id, p]));
      const offenderEvents = new Set<string>();
      for (const hint of r.hints) {
        for (const eid of hint.evidence_event_ids) {
          const ev = eventById.get(eid);
          if (!ev) continue;
          const time =
            /T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(ev.event_time)?.[1] ??
            ev.event_time;
          const subj = ev.subject.endpoint ?? ev.subject.path ?? "?";
          offenderEvents.add(
            `[${ev.raw_index}] ${time} ${ev.event_type} ip=${ev.actor.ip ?? "-"} ${subj.slice(0, 60)}`,
          );
        }
      }
      for (const line of [...offenderEvents].slice(0, 15)) {
        console.log(`         · ${line}`);
      }
      if (offenderEvents.size > 15) {
        console.log(`         · (+${offenderEvents.size - 15} more)`);
      }
    }
  }
}

const totalIn = results.reduce((s, r) => s + r.inputTokens, 0);
const totalOut = results.reduce((s, r) => s + r.outputTokens, 0);
console.log(`\n  total tokens: in=${totalIn}  out=${totalOut}`);

console.log();
if (failures > 0) {
  console.log(`FAILED: ${failures} expectation(s) failed`);
  process.exit(1);
}
console.log("OK: all expectations met");
