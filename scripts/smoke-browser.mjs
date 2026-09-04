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
// HF 01's route_color — the line we expect to see drawn
const EXPECT_RGB = [140, 198, 65];

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

  const png = PNG.sync.read(readFileSync("/tmp/mbp-smoke-map.png"));
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i] - EXPECT_RGB[0]) < 26 &&
        Math.abs(png.data[i + 1] - EXPECT_RGB[1]) < 26 &&
        Math.abs(png.data[i + 2] - EXPECT_RGB[2]) < 26) hits++;
  }
  console.log(`route-line pixels: ${hits}`);
  if (hits < 200) { console.error("FAIL: the route shape is not drawn on the map"); failed = true; }
  else console.log("OK: route shape renders");
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
