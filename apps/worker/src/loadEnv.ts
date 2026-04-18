// Load .env.local from the monorepo root on dev, if present. Must be imported
// before any module that reads process.env.
//
// In production (Railway), env vars come from the platform, not a file — if
// nothing is found we silently move on.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// apps/worker/src → repo root is three levels up.
const candidates = [
  resolve(here, "../../../.env.local"),
  resolve(here, "../../../.env"),
];

for (const p of candidates) {
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {
      // Ignore — fall back to whatever process.env already has.
    }
  }
}
