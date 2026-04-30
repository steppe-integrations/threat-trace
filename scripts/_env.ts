import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Tiny .env loader so we don't take a runtime dep on `dotenv` for one
// API key. Node's native `--env-file` flag isn't reliable across the
// tsx/Node-20.9 combination this project uses, so we just parse the
// file ourselves.
//
// Behaviour:
// - Looks for .env at the project root.
// - Skips blank lines and # comments.
// - Strips one matched pair of surrounding quotes around values.
// - Does NOT overwrite a value already set in the process environment
//   (so an explicit `export FOO=...` in the shell wins), but it WILL
//   overwrite an empty-string slot (which is what Claude Code's env
//   leaves ANTHROPIC_API_KEY at by default).

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), "..");

export function loadEnvFile(filename = ".env"): void {
  const path = resolve(PROJECT_ROOT, filename);
  if (!existsSync(path)) return;

  const text = readFileSync(path, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!key) continue;
    const existing = process.env[key];
    if (existing === undefined || existing === "") {
      process.env[key] = value;
    }
  }
}
