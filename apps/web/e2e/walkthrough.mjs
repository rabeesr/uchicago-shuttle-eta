// Full end-to-end walkthrough of the signed-out surfaces against the live dev
// server. Captures console errors (including hydration warnings), HTTP
// status, page title, and a screenshot for each route.
//
// Run (with dev server already up on :3001):
//   node e2e/walkthrough.mjs
//
// Prints a compact summary + exits non-zero if anything failed.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const here = dirname(fileURLToPath(import.meta.url));
const screenshotDir = resolve(here, "screenshots");
await mkdir(screenshotDir, { recursive: true });

const steps = [
  { name: "01-home-signed-out", path: "/", wait: "Sign in" },
  { name: "02-routes-list",     path: "/routes", wait: "Route East" },
  { name: "03-routes-detail",   path: "/routes/38736", wait: "Next arrivals by stop" },
  { name: "04-stops-list",      path: "/stops", wait: "Browse stops" },
  { name: "05-stops-detail",    path: "/stops/8579", wait: "Reynolds Club" },
  { name: "06-map",             path: "/map", wait: "Live map" },
  { name: "07-signin",          path: "/sign-in", wait: "Sign in" },
  { name: "08-signup",          path: "/sign-up", wait: "Create your account" },
];

function summaryLine({ name, path, status, title, consoleErrors, hydration, wait, pageErrors }) {
  const ok = status === 200 && consoleErrors.length === 0 && pageErrors.length === 0 && !hydration;
  const mark = ok ? "✓" : "✗";
  return `${mark} ${name.padEnd(20)} HTTP ${status}  title="${title?.slice(0, 40) ?? ""}"  console:${consoleErrors.length}  pageErr:${pageErrors.length}  hydration:${hydration ? "YES" : "no"}  wait="${wait}"`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const results = [];

for (const s of steps) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  let hydration = false;

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (/Hydration|hydration mismatch|server rendered text didn't match/i.test(text)) hydration = true;
      consoleErrors.push(text.slice(0, 200));
    }
  });
  page.on("pageerror", (err) => {
    const text = String(err);
    if (/Hydration|hydration mismatch/i.test(text)) hydration = true;
    pageErrors.push(text.slice(0, 200));
  });

  let status = 0;
  try {
    const resp = await page.goto(`${BASE}${s.path}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    status = resp?.status() ?? 0;
    // Wait for a known token if available. Non-fatal if not found.
    if (s.wait) {
      try {
        await page.waitForFunction((t) => document.body.innerText.includes(t), s.wait, { timeout: 8_000 });
      } catch {
        // ok, just means the token didn't render — still captures errors
      }
    }
    // Give client JS a moment to hydrate so hydration warnings can surface.
    await page.waitForTimeout(1500);
  } catch (err) {
    pageErrors.push(String(err).slice(0, 200));
  }

  const title = await page.title().catch(() => "");
  const filename = `${s.name}.png`;
  await page.screenshot({ path: resolve(screenshotDir, filename), fullPage: true }).catch(() => null);

  results.push({ ...s, status, title, consoleErrors, pageErrors, hydration });
  console.log(summaryLine(results.at(-1)));
  await page.close();
}

await browser.close();

const failed = results.filter((r) => r.status !== 200 || r.consoleErrors.length > 0 || r.pageErrors.length > 0 || r.hydration);
console.log("\n================ SUMMARY ================");
console.log(`${results.length - failed.length}/${results.length} steps clean`);
for (const f of failed) {
  console.log(`\n✗ ${f.name} (${f.path})`);
  if (f.hydration) console.log("  HYDRATION MISMATCH DETECTED");
  for (const e of f.consoleErrors) console.log(`  console: ${e}`);
  for (const e of f.pageErrors) console.log(`  pageerror: ${e}`);
}
process.exit(failed.length > 0 ? 1 : 0);
