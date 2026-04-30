// ============================================================
// Runtime loader for the sealed key.
//
// `src/sealed-key.json` always exists at build time — the
// `prebuild`/`predev` hook (`scripts/ensure-sealed-stub.ts`)
// creates a `{ "sealed": false }` stub if the file is absent.
// `npm run seal-key` overwrites that stub with a real sealed
// payload. Either way, this static import resolves.
//
// Vite inlines JSON imports synchronously; the bundle either
// carries the payload or carries the stub. We parse with a
// runtime shape check so a malformed file falls through to
// `null` rather than crashing the app.
// ============================================================

import sealedRaw from "../sealed-key.json";
import type { SealedKey } from "./seal-crypto";

function isSealed(v: unknown): v is SealedKey {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o["sealed"] !== true) return false;
  if (typeof o["question"] !== "string") return false;
  if (typeof o["kdf"] !== "object" || o["kdf"] === null) return false;
  if (typeof o["cipher"] !== "object" || o["cipher"] === null) return false;
  return true;
}

export const SEALED_KEY: SealedKey | null = isSealed(sealedRaw)
  ? sealedRaw
  : null;
