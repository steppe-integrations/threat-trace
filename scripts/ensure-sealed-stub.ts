// ============================================================
// Prebuild / predev hook: guarantee `src/sealed-key.json` exists.
//
// The runtime loader in `src/lib/sealed-key.ts` does a static
// JSON import; a fresh clone won't have the file (it's
// gitignored). This script creates a `{ "sealed": false }` stub
// so the import resolves. `npm run seal-key` overwrites the stub
// with a real sealed payload when the user wants to bake a key
// in.
//
// Idempotent: existing files (whether stub or real) are left
// alone.
// ============================================================

import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(here, "..", "src", "sealed-key.json");

if (existsSync(path)) {
  process.exit(0);
}

writeFileSync(path, JSON.stringify({ sealed: false }, null, 2) + "\n");
console.log("[seal] no src/sealed-key.json — wrote unsealed stub");
