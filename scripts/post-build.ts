import { copyFileSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================
// Post-build wiring.
//
// 1. Vite emits dist/index.html. Copy to dist/threat-trace.html —
//    same content, friendlier filename for the email / USB-stick
//    handoff.
// 2. ALSO copy into package/(2)_threat-trace.html so the package
//    folder always reflects the freshly-built bundle. Zipping
//    `package/` is then the only step between `npm run build` and
//    the email.
// 3. Detect whether the build is sealed (by reading
//    src/sealed-key.json) and print an appropriate next-step
//    block — sealed builds get a "ship" reminder; unsealed get a
//    "this is a public/dev build, run seal-key to bundle a key"
//    nudge.
// ============================================================

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "dist", "index.html");
const DIST_DST = resolve(ROOT, "dist", "threat-trace.html");
const PACKAGE_DST = resolve(ROOT, "package", "(2)_threat-trace.html");
const SEALED_PATH = resolve(ROOT, "src", "sealed-key.json");

copyFileSync(SRC, DIST_DST);
copyFileSync(SRC, PACKAGE_DST);

const sizeKb = (statSync(DIST_DST).size / 1024).toFixed(1);

// Read the sealed-key.json to figure out which build mode this was.
// Tolerate parse errors / missing file — both fall back to "unsealed."
let isSealed = false;
let sealedQuestion: string | null = null;
try {
  const raw = readFileSync(SEALED_PATH, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed["sealed"] === true && typeof parsed["question"] === "string") {
    isSealed = true;
    sealedQuestion = parsed["question"];
  }
} catch {
  // No sealed file or unreadable — treated as unsealed.
}

console.log("");
console.log(`[ok] ${DIST_DST}`);
console.log(`     ${sizeKb} KB · self-contained · no server required`);
console.log(`[ok] ${PACKAGE_DST}`);
console.log("     (mirrored into package/ for one-step ship)");
console.log("");

if (isSealed) {
  console.log("=== SEALED BUILD ===");
  console.log(`Question baked in: ${JSON.stringify(sealedQuestion)}`);
  console.log("");
  console.log("Before sending:");
  console.log("  1. Cap your Anthropic spend at console.anthropic.com");
  console.log("     → Plans & Billing → spending limit.");
  console.log("  2. Open dist/threat-trace.html yourself. Type the");
  console.log("     answer in the unlock card on the page, hit Enter.");
  console.log("     Verify the Run buttons light up and one returns OK.");
  console.log("  3. Zip the package/ folder. Send.");
  console.log("");
  console.log("To ship UNsealed instead: delete src/sealed-key.json and");
  console.log("rebuild. (The unlock UI disappears when no seal is present.)");
} else {
  console.log("=== UNSEALED BUILD ===");
  console.log("This bundle has no key embedded. The recipient will need");
  console.log("to bring their own Anthropic key (the manual paste path");
  console.log("in the gear panel). This is what gets shipped via github.");
  console.log("");
  console.log("To bake a key for personal handoff: `npm run seal-key`,");
  console.log("then `npm run build` again.");
}
console.log("");
console.log("Open it directly:");
console.log("  - Mac: double-click in Finder");
console.log("  - Windows: double-click in Explorer (defaults to your browser)");
console.log("  - Linux: xdg-open threat-trace.html");
