// Interactive clickthrough: browse /stops → click a stop row → verify we
// arrive at /stops/<id> and the timetable + mini-map are rendered.
// Same for /routes → click a row → /routes/<id>.
// Also smoke-tests the "📍 Use my location" button by injecting a fake
// geolocation into the browser context.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const here = dirname(fileURLToPath(import.meta.url));
const screenshotDir = resolve(here, "screenshots-click");
await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch();
// UChicago campus — 41.789, -87.600
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 41.789, longitude: -87.6 },
  permissions: ["geolocation"],
});

const errors = [];

function expect(ok, label) {
  const mark = ok ? "✓" : "✗";
  const msg = `${mark} ${label}`;
  console.log(msg);
  if (!ok) errors.push(label);
}

async function run() {
  // 0) Directly to a known-active stop (Reynolds Club) and verify leave-by
  {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror /stops/8579: ${String(e).slice(0, 150)}`));
    await page.goto(`${BASE}/stops/8579`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Reynolds Club", { timeout: 10_000 });
    await page.getByRole("button", { name: /Use my location/ }).click();
    try {
      await page.waitForSelector("text=/min walk/", { timeout: 5_000 });
      expect(true, "walking-time chip renders on /stops/8579");
    } catch {
      expect(false, "walking-time chip missing on /stops/8579");
    }
    try {
      await page.waitForSelector(
        "text=/Leave (now|in \\d+m|by \\d)/i",
        { timeout: 6_000 },
      );
      expect(true, "leave-by label renders on /stops/8579 with live arrivals");
    } catch {
      console.log("   (no live arrivals at Reynolds Club right now — check worker)");
    }
    await page.screenshot({ path: resolve(screenshotDir, "c00-reynolds-leave-by.png"), fullPage: true });
    await page.close();
  }

  // 1) /stops → click the first stop row → detail page
  {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror /stops: ${String(e).slice(0, 150)}`));
    await page.goto(`${BASE}/stops`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a[href^="/stops/"]', { timeout: 10_000 });
    const firstStopLink = await page.locator('a[href^="/stops/"]').first();
    const href = await firstStopLink.getAttribute("href");
    await page.screenshot({ path: resolve(screenshotDir, "c01-stops-list.png"), fullPage: true });
    await firstStopLink.click();
    await page.waitForURL(/\/stops\/\w+/, { timeout: 10_000 });
    await page.waitForSelector("text=Upcoming arrivals", { timeout: 10_000 });
    const url = page.url();
    expect(url.includes("/stops/"), `navigated to ${url} from /stops list (${href})`);
    // Walking-time feature: click the geolocation prompt, verify chip appears
    const locBtn = page.getByRole("button", { name: /Use my location/ });
    if (await locBtn.count() > 0) {
      await locBtn.click();
      try {
        await page.waitForSelector("text=/min walk/", { timeout: 5_000 });
        expect(true, "walking-time chip renders after granting location");
      } catch {
        expect(false, "walking-time chip did not appear after location grant");
      }
    } else {
      expect(false, "no 'Use my location' button found on stop detail");
    }
    // Leave-by feature: should appear next to the walking-time chip if
    // there's a live arrival for this stop.
    try {
      await page.waitForSelector(
        "text=/Leave (now|in \\d+m|by \\d)/i",
        { timeout: 4_000 },
      );
      expect(true, "'Leave by' message appears alongside walking chip");
    } catch {
      // If the stop has no live arrivals right now, the leave-by won't render.
      // That's expected behavior, not a failure — but note it in output.
      console.log("   (no live arrivals at this stop → leave-by skipped)");
    }
    // Upcoming arrivals check
    const arrivalsText = await page.locator("h2", { hasText: "Upcoming arrivals" }).count();
    expect(arrivalsText > 0, "'Upcoming arrivals' section rendered");
    await page.screenshot({ path: resolve(screenshotDir, "c02-stop-detail-with-walk.png"), fullPage: true });
    await page.close();
  }

  // 2) /routes → click first route row → route detail with nearest-stop card
  {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror /routes: ${String(e).slice(0, 150)}`));
    await page.goto(`${BASE}/routes`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a[href^="/routes/"]', { timeout: 10_000 });
    const firstRouteLink = page.locator('a[href^="/routes/"]').first();
    const href = await firstRouteLink.getAttribute("href");
    await page.screenshot({ path: resolve(screenshotDir, "c03-routes-list.png"), fullPage: true });
    await firstRouteLink.click();
    await page.waitForURL(/\/routes\/\w+/, { timeout: 10_000 });
    await page.waitForSelector("text=Next arrivals by stop", { timeout: 10_000 });
    expect(page.url().includes("/routes/"), `navigated to ${page.url()} from /routes (${href})`);
    const nearestBtn = page.getByRole("button", { name: /Find my nearest stop on this route/ });
    if (await nearestBtn.count() > 0) {
      await nearestBtn.click();
      try {
        await page.waitForSelector("text=Nearest stop on this route", { timeout: 5_000 });
        expect(true, "nearest-stop card renders after geolocation");
      } catch {
        expect(false, "nearest-stop card did not appear");
      }
    } else {
      expect(false, "no 'Find my nearest stop' button found on route detail");
    }
    await page.screenshot({ path: resolve(screenshotDir, "c04-route-detail-with-nearest.png"), fullPage: true });
    await page.close();
  }

  // 3) Home (signed-out) — verify Sign in CTA visible
  {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror /: ${String(e).slice(0, 150)}`));
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const signIn = page.getByRole("link", { name: /Sign in/ });
    expect(await signIn.count() > 0, "signed-out home shows Sign in link");
    await page.screenshot({ path: resolve(screenshotDir, "c05-home-signed-out.png"), fullPage: true });
    await page.close();
  }

  // 4) /map — verify stop markers show up on the leaflet map
  {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror /map: ${String(e).slice(0, 150)}`));
    await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".leaflet-container", { timeout: 10_000 });
    // Stop markers are small CircleMarkers (filled SVGs in the leaflet layer).
    await page.waitForTimeout(2_000); // let leaflet paint
    const markerCount = await page.locator(".leaflet-interactive").count();
    expect(markerCount > 50, `leaflet shows ${markerCount} interactive markers (stops + buses)`);
    await page.screenshot({ path: resolve(screenshotDir, "c06-map.png"), fullPage: true });
    await page.close();
  }
}

try {
  await run();
} finally {
  await browser.close();
}

console.log("\n================ SUMMARY ================");
if (errors.length === 0) {
  console.log("All clickthrough assertions passed.");
} else {
  console.log(`${errors.length} failures:`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
