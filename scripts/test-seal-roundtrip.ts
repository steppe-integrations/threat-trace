// Quick smoke test: seal a fake key, unseal with the right answer
// (success), unseal with the wrong answer (WRONG_ANSWER thrown).
//
// Run with:  npx tsx scripts/test-seal-roundtrip.ts

import { sealApiKey, unsealApiKey } from "../src/lib/seal-crypto";

const FAKE_KEY = "sk-ant-api03-test-1234567890abcdefghijklmnop";
const QUESTION = "what was the cat's name";
const ANSWER = "Midnight";
const WRONG = "Smudge";

async function main(): Promise<void> {
  const sealed = await sealApiKey({
    question: QUESTION,
    answer: ANSWER,
    apiKey: FAKE_KEY,
  });
  console.log("[seal] ok");
  console.log("  question:", sealed.question);
  console.log("  iterations:", sealed.kdf.iterations);
  console.log("  salt bytes (b64):", sealed.kdf.salt);
  console.log("  iv bytes (b64):", sealed.cipher.iv);
  console.log("  ciphertext length (b64):", sealed.cipher.ciphertext.length);

  // Right answer
  const recovered = await unsealApiKey(sealed, ANSWER);
  if (recovered !== FAKE_KEY) {
    console.error("FAIL: unseal returned wrong value");
    console.error("  expected:", FAKE_KEY);
    console.error("  got:     ", recovered);
    process.exit(1);
  }
  console.log("[unseal correct answer] ok");

  // Right answer with whitespace + different case (normalization test)
  const recoveredNormalized = await unsealApiKey(sealed, "  MIDNIGHT  ");
  if (recoveredNormalized !== FAKE_KEY) {
    console.error("FAIL: normalization broke");
    process.exit(1);
  }
  console.log("[unseal whitespace+case-variant] ok");

  // Wrong answer
  try {
    await unsealApiKey(sealed, WRONG);
    console.error("FAIL: wrong answer did not throw");
    process.exit(1);
  } catch (err) {
    if ((err as Error).message !== "WRONG_ANSWER") {
      console.error("FAIL: wrong answer threw unexpected error:", err);
      process.exit(1);
    }
  }
  console.log("[unseal wrong answer] correctly rejected");

  console.log("\nOK: all assertions passed");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
