import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import {
  LogChunkSchema,
  type LogChunk,
  type ParsedEvent,
  type Source,
} from "../contracts/artifacts";
import { api, edge, identity } from "../parsers/index";
import { ManualBackend } from "../agents/backends/manual";

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

const STREAMS: Array<{ source: Source; filename: string }> = [
  { source: "edge", filename: "edge.json" },
  { source: "identity", filename: "identity.json" },
  { source: "api", filename: "api.json" },
];

const backend = new ManualBackend({
  promptsDir: PROMPTS_DIR,
  responsesDir: RESPONSES_DIR,
});

const runId = randomUUID();
console.log(`Rendering hint prompts for tutorial fixture`);
console.log(`pipeline_run_id=${runId}\n`);

for (const stream of STREAMS) {
  const raw = loadFixture(stream.filename);
  const chunk = buildChunk(raw, runId);
  const parsed = PARSERS[stream.source](chunk);
  const path = backend.renderPrompt({
    chunk,
    parsedEvents: parsed,
    pipelineRunId: runId,
  });
  const rel = path.split(/[\\/]/).slice(-3).join("/");
  console.log(`  [${stream.source}] ${parsed.length} parsed events -> ${rel}`);
}

console.log("\nNext steps (CLI regression flow — the web app is the primary product surface):");
console.log("  1. Open each file under cli-manual/prompts/");
console.log("  2. Paste it into Claude.ai, ChatGPT, or any chat AI");
console.log("  3. Save the AI's JSON reply to cli-manual/responses/hint-{edge|identity|api}.json");
console.log("  4. Run: npm run hint:verify");
