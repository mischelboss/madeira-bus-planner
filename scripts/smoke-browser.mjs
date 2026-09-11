/**
 * Production smoke test: builds are checked in a REAL browser.
 *
 * jsdom can't run MapLibre (no WebGL), so unit tests cannot catch bundler-level
 * map failures — e.g. maplibre-gl v6 resolving its parsing worker from a bare
 * runtime string, which 404s in a production build and leaves every GeoJSON
 * layer silently empty while the basemap still draws.
 *
 *   npm run build && npm run smoke:browser
 *   npm run smoke:browser -- https://mischelboss.github.io/madeira-bus-planner/
 *
 * Uses the system Chrome (no Playwright browser download needed).
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const BASE_PATH = "/madeira-bus-planner";
const PORT = 4180;

/** Serve dist/ the way GitHub Pages does: .gz as an opaque body, no Content-Encoding.
 *  (`vite preview` sets Content-Encoding: gzip, which breaks the app's own gunzip.) */
function serveDist() {
  const root = resolve("dist");
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
    ".png": "image/png", ".webmanifest": "application/manifest+json" };
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length) || "/";
    let f = join(root, p);
    if (!existsSync(f) || statSync(f).isDirectory()) {
      // SPA fallback only for routes; a missing real file must 404 like Pages does
      if (extname(p)) { res.statusCode = 404; res.end("not found"); return; }
      f = join(root, "index.html");
    }
    res.setHeader("Content-Type", types[extname(f)] ?? "application/octet-stream");
    res.end(readFileSync(f));
  });
  return new Promise((ok) => srv.listen(PORT, () => ok(srv)));
}

const target = process.argv[2];
const srv = target ? null : await serveDist();
const url = target ?? `http://localhost:${PORT}${BASE_PATH}/`;

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const problems = [];
const ignorable = (u) => u.includes("tile.openstreetmap.org");
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => {
  if (!ignorable(r.url())) problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`);
});
page.on("response", (r) => {
  if (r.status() >= 400 && !ignorable(r.url())) problems.push(`HTTP ${r.status()}: ${r.url()}`);
});
// block basemap tiles so the only coloured pixels on the canvas are our overlay
await page.route("**tile.openstreetmap.org**", (r) => r.abort());

let failed = false;
try {
  await page.goto(url, { waitUntil: "networkidle" });

  await page.getByRole("textbox", { name: "From" }).fill("AV Mar");
  await page.locator(".ftf-suggest-row").first().click({ timeout: 15_000 });
  await page.getByRole("textbox", { name: "To" }).fill("Ilma");
  await page.locator(".ftf-suggest-row").first().click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await page.getByRole("button", { name: "Map", exact: true }).click({ timeout: 20_000 });
  await page.waitForTimeout(7000);
  await page.locator(".mapview-canvas").screenshot({ path: "/tmp/mbp-smoke-map.png" });

  // "Leave now" picks whichever itinerary is fastest right now, so its route
  // colour varies by time of day — don't hardcode one. Basemap tiles are
  // blocked, so any saturated (non-grey) pixel can only be our own line/dot
  // layers; a flat grey canvas has R≈G≈B everywhere.
  const png = PNG.sync.read(readFileSync("/tmp/mbp-smoke-map.png"));
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, bl] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.max(r, g, bl) - Math.min(r, g, bl) > 30) hits++;
  }
  console.log(`coloured (route/stop) pixels: ${hits}`);
  if (hits < 200) { console.error("FAIL: the route shape is not drawn on the map"); failed = true; }
  else console.log("OK: route shape renders");
} catch (e) {
  console.error("FAIL:", e.message);
  failed = true;
}

// --- Differential per-leg color check -------------------------------------
// jsdom can't render MapLibre, so this is the only place that can catch a
// per-leg-coloring regression: a transfer itinerary's map must show
// strictly more distinct line hues than a direct itinerary's, since each
// leg gets its own color (lib/legColors.ts) instead of every transit leg
// sharing the route feed's own (often shared/corridor) color.
function distinctHueBuckets(pngPath) {
  const png = PNG.sync.read(readFileSync(pngPath));
  const buckets = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    if (chroma <= 30) continue; // skip greys/near-greys (basemap tiles are blocked anyway)
    let hue;
    if (max === r) hue = ((g - b) / chroma) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
    hue = ((hue * 60) + 360) % 360;
    buckets.add(Math.floor(hue / 20)); // 18 buckets around the wheel
  }
  return buckets;
}

try {
  // Direct itinerary (control): the "AV Mar" -> "Ilma" search above.
  const controlBuckets = distinctHueBuckets("/tmp/mbp-smoke-map.png");
  console.log(`control (direct) distinct hues: ${controlBuckets.size} [${[...controlBuckets].join(",")}]`);

  // Transfer itinerary: the exact reported Funchal -> Porto Moniz scenario,
  // loaded directly via the app's own URL-as-state so the result is
  // deterministic rather than depending on "leave now" timing. This corridor
  // returns both a direct itinerary and a transfer one — find the card with
  // 2+ line badges (i.e. an actual transfer) rather than assuming index 0,
  // expand it, and screenshot its own inline map (same shapeLayers.ts code
  // path as the full Map tab, just scoped to one card).
  const transferUrl =
    `${url}?f=s%3Astop-funchal-5d05ad&fl=Funchal&t=s%3Astop-porto-moniz-4ca23b&tl=Porto%20Moniz` +
    `&d=2026-09-12T09%3A35%3A00%2B01%3A00&go=1`;
  await page.goto(transferUrl, { waitUntil: "networkidle" });
  const transferCard = page
    .locator(".itin.card")
    .filter({ has: page.locator(".line-badge").nth(1) })
    .first();
  await transferCard.waitFor({ timeout: 15_000 });
  await transferCard.locator(".itin-summary").click();
  await page.waitForTimeout(7000);
  await transferCard.locator(".itin-map-canvas").screenshot({ path: "/tmp/mbp-smoke-map-transfer.png" });

  const transferBuckets = distinctHueBuckets("/tmp/mbp-smoke-map-transfer.png");
  console.log(`transfer distinct hues: ${transferBuckets.size} [${[...transferBuckets].join(",")}]`);

  if (transferBuckets.size <= controlBuckets.size) {
    console.error(
      "FAIL: transfer itinerary's map does not show more distinct line colours than a direct itinerary's " +
        "— per-leg coloring may not be wired up",
    );
    failed = true;
  } else {
    console.log("OK: transfer itinerary's legs render in distinct colours");
  }
} catch (e) {
  console.error("FAIL:", e.message);
  failed = true;
}

if (problems.length) {
  console.error("FAIL: network / page errors:\n  " + problems.join("\n  "));
  failed = true;
} else {
  console.log("OK: no failed requests or page errors");
}

await browser.close();
srv?.close();
process.exit(failed ? 1 : 0);
