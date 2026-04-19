// Quick visual snapshot: stop detail BEFORE and AFTER granting location.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "screenshots-snap");
await mkdir(dir, { recursive: true });

const browser = await chromium.launch();

// BEFORE — no permission granted
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/stops/8579`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Reynolds Club");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(dir, "stop-before.png"), fullPage: true });
  await ctx.close();
  console.log("✓ wrote stop-before.png (no location)");
}

// AFTER — location granted
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    geolocation: { latitude: 41.789, longitude: -87.6 },
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  page.on("console", (msg) => console.log(`  [browser] ${msg.type()}: ${msg.text().slice(0, 200)}`));
  page.on("pageerror", (err) => console.log(`  [pageerror] ${String(err).slice(0, 200)}`));
  await page.goto(`${BASE}/stops/8579`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Reynolds Club");
  await page.waitForTimeout(2000); // let hydration finish
  const btnCount = await page.getByRole("button", { name: /Use my location/ }).count();
  console.log(`  'Use my location' buttons found: ${btnCount}`);
  if (btnCount > 0) {
    await page.getByRole("button", { name: /Use my location/ }).click();
    console.log("  clicked button");
  }
  // Wait for geolocation callback to fire, React to rerender, and paint.
  await page.waitForTimeout(3000);
  const geoInfo = await page.evaluate(() => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ supported: false });
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ supported: true, lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => resolve({ supported: true, error: err.message }),
      );
    });
  });
  console.log(`  navigator.geolocation says: ${JSON.stringify(geoInfo)}`);
  const storage = await page.evaluate(() => sessionStorage.getItem("uchicago-shuttle-eta:location"));
  console.log(`  sessionStorage[location] = ${storage}`);
  const rowDebug = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll("li"));
    return lis.slice(0, 5).map((li) => li.innerText);
  });
  console.log("--- first 5 <li> inner texts ---");
  for (const t of rowDebug) console.log("  " + t.replace(/\n/g, " | "));
  await page.screenshot({ path: resolve(dir, "stop-after.png"), fullPage: true });
  const visibleText = await page.locator("body").innerText();
  const interestingLines = visibleText
    .split("\n")
    .filter((l) => /Walk|arrive|Leave|no live bus|min|bus \d|🏃|🚶/.test(l))
    .slice(0, 20);
  console.log("✓ wrote stop-after.png (location granted)");
  console.log("relevant lines on page:");
  for (const l of interestingLines) console.log(`  ${l.trim()}`);
  await ctx.close();
}

await browser.close();
