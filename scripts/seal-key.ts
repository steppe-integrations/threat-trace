// ============================================================
// CLI: bake an Anthropic API key into the bundle.
//
// Usage:  npm run seal-key
//
// Interactively prompts for a question, an answer, and an API
// key. Encrypts the key with PBKDF2(answer) → AES-GCM and writes
// `src/sealed-key.json`. The next `npm run build` inlines that
// file into the standalone HTML.
//
// The answer is normalized at unlock time (trim + lowercase).
// Both sides of the seal use the same `normalizeAnswer` helper
// in `src/lib/seal-crypto.ts` — keep them in sync.
//
// Reminder before shipping:
//   - Cap your spend at console.anthropic.com → Plans & Billing.
//   - The sealed bundle is the only copy that holds this key —
//     keep `src/sealed-key.json` out of git (it's gitignored).
//   - You can revoke the key at any time from the console; the
//     bundle keeps "working" up to the next API call, which then
//     401s. Surface that to the recipient up front.
// ============================================================

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";

import { normalizeAnswer, sealApiKey } from "../src/lib/seal-crypto";

const here = dirname(fileURLToPath(import.meta.url));
const SEALED_PATH = resolve(here, "..", "src", "sealed-key.json");

// Control codes referenced by askHidden(). Compared via
// charCodeAt to avoid embedding raw control characters in source.
const CC_LF = 0x0a;
const CC_CR = 0x0d;
const CC_ETX = 0x03; // Ctrl-C
const CC_EOT = 0x04; // Ctrl-D
const CC_BS = 0x08;
const CC_DEL = 0x7f;

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) => {
    rl.question(prompt, (answer) => {
      rl.close();
      res(answer);
    });
  });
}

// Read a line without echoing the keystrokes — the API key
// shouldn't appear in screen recordings or terminal scrollback.
function askHidden(prompt: string): Promise<string> {
  return new Promise<string>((res) => {
    process.stdout.write(prompt);
    let input = "";
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (data: string) => {
      for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (code === CC_LF || code === CC_CR || code === CC_EOT) {
          // Enter or Ctrl-D — accept the line
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          res(input);
          return;
        } else if (code === CC_ETX) {
          // Ctrl-C — abort
          process.stdout.write("\n");
          process.exit(1);
        } else if (code === CC_BS || code === CC_DEL) {
          // Backspace / DEL
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          input += ch;
          process.stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  console.log(
    "=== threat-trace · seal an Anthropic key into the bundle ===\n",
  );
  console.log(
    "Answer is normalized at unlock time: trimmed and lowercased.",
  );
  console.log(
    "Pick a question with a definite, single-word answer for best UX.\n",
  );

  const question = (
    await ask("Question (only your recipient should know the answer): ")
  ).trim();
  if (!question) {
    console.error("Question cannot be empty.");
    process.exit(1);
  }
  const answer = (await ask("Answer: ")).trim();
  if (!answer) {
    console.error("Answer cannot be empty.");
    process.exit(1);
  }
  const normalized = normalizeAnswer(answer);
  console.log(`(stored normalized as: "${normalized}")\n`);

  const apiKey = (
    await askHidden("Anthropic API key (sk-ant-..., hidden): ")
  ).trim();
  if (!apiKey.startsWith("sk-ant-")) {
    console.error(
      `That doesn't look like an Anthropic key. Got prefix: ${apiKey.slice(
        0,
        Math.min(8, apiKey.length),
      )}...`,
    );
    process.exit(1);
  }

  const sealed = await sealApiKey({ question, answer, apiKey });
  writeFileSync(SEALED_PATH, JSON.stringify(sealed, null, 2) + "\n");
  console.log(`\n✓ Sealed key written to ${SEALED_PATH}`);
  console.log(`  PBKDF2 iterations: ${sealed.kdf.iterations}`);
  console.log(`  AES-GCM, 256-bit key, 12-byte IV`);
  console.log(
    `\nNext: \`npm run build\` and ship dist/threat-trace.html.`,
  );
  console.log(
    `\nReminder: cap your spend in console.anthropic.com (Plans &`,
  );
  console.log(
    `Billing) before sending. To ship an UNsealed bundle later,`,
  );
  console.log(
    `delete src/sealed-key.json (or replace with {"sealed": false}).`,
  );
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
