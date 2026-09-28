#!/usr/bin/env node
/**
 * Style equality: the proof that a change to the stylesheets or to the markup moved nothing on screen
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.5 and step 1.2).
 *
 *   node tooling/scripts/checks/style-equality.mjs record <file.json>              the pages as the tree draws them now
 *   node tooling/scripts/checks/style-equality.mjs compare <before.json> <after.json>
 *   node tooling/scripts/checks/style-equality.mjs self-test                       two recordings agree, a planted one does not
 *
 * A step that must look the same records before its change and after it, and compares; the recordings stay out of the
 * repository. `record` starts the e2e harness (tooling/scripts/e2e-harness/server.mjs) for each of its records at one
 * fixed moment, and opens each route at a desk width and at a phone width with a coarse pointer, in the dark theme and
 * in the light one, with the browser's clock fixed and every animation and transition stopped. Then it writes, for
 * every element in document order and for each `::before` and `::after` that draws, its box and its computed style
 * (PROPERTIES). The harness reads the stylesheets and the pages from disk on every request, so what is recorded is the
 * working tree as it stands.
 *
 * `compare` exits 0 when two recordings are equal and 1 otherwise, printing the first differences by page, element
 * and property. `self-test` records twice and a third time with one token moved by one step (`--radius-md`, planted
 * in the page, never on disk), and exits 0 only when the first two agree and the third does not.
 *
 * It runs a browser, so it is a tool a person runs, not part of `pnpm test`; the comparison it makes is tested there
 * (tooling/scripts/tests/styles/style-equality.test.mjs).
 */
/* global document, getComputedStyle, window, KeyboardEvent, location -- walk() and the few lines handed to
   page.evaluate() run in the page, where these are the browser's own. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The moment every record is built at and every page's clock is held to: a Monday afternoon, 28 September 2026. */
export const FIXED_NOW = Date.UTC(2026, 8, 28, 20, 2, 0);

/** The harness's records, and the routes each is opened at (the address after `#/`). */
export const PAGES = {
  salon: ["today", "inbox", "clients", "calendar", "outbound", "broadcasts", "messages", "reports", "settings"],
  pipeline: ["clients", "clients/pipeline", "clients/leads"],
  nightly: ["today", "inbox", "clients", "settings"],
};

/** A desk and a phone. The phone is a touch screen, so the shell's 44px floor under a coarse pointer is drawn. */
export const VIEWPORTS = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

export const THEMES = ["dark", "light"];

/** What is recorded of each element: what a look can change, and what places it. */
export const PROPERTIES = [
  "display",
  "position",
  "visibility",
  "opacity",
  "z-index",
  "transform",
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "outline-color",
  "outline-width",
  "filter",
  "backdrop-filter",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-decoration-line",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "gap",
  "fill",
  "stroke",
  "content",
];

/** Stops what moves, so two recordings of one tree are one recording: animations, transitions and the caret. */
const STILL =
  "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";

/**
 * How far a box may move and still be the same box: half a pixel. Layout lands on fractions, and one recording of a
 * tree can round a text box's width to 181.8px where the next rounds it to 181.7; a change a person can see moves a box
 * a pixel or more, and every style value is compared exactly.
 */
export const BOX_TOLERANCE = 0.5;

/** The planted fault self-test uses: one token, one step. */
const PLANT = ":root, [data-theme] { --radius-md: 9px !important; }";

/** In the page: every element's path, box and style, and each drawing pseudo-element's, in document order. */
function walk(properties) {
  const round = (n) => Math.round(n * 10) / 10;
  const out = [];
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      let i = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      parts.push(`${n.tagName.toLowerCase()}:${i}`);
    }
    return parts.reverse().join(">");
  };
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const box = [round(r.x), round(r.y), round(r.width), round(r.height)];
    const cs = getComputedStyle(el);
    const p = pathOf(el);
    out.push([p, box, properties.map((k) => cs.getPropertyValue(k))]);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.getPropertyValue("content");
      if (content && content !== "none" && content !== "normal") {
        out.push([`${p}${pseudo}`, null, properties.map((k) => ps.getPropertyValue(k))]);
      }
    }
  }
  return out;
}

/** Wait until the page has made no request for `quiet` ms, or `cap` ms have passed. */
async function settle(page, quiet = 700, cap = 12000) {
  let last = Date.now();
  const bump = () => (last = Date.now());
  page.on("request", bump);
  page.on("requestfinished", bump);
  page.on("requestfailed", bump);
  const start = Date.now();
  while (Date.now() - start < cap && Date.now() - last < quiet) await page.waitForTimeout(100);
  page.off("request", bump);
  page.off("requestfinished", bump);
  page.off("requestfailed", bump);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** Record every page of every record at both widths and in both themes. `plant` moves one token in every page. */
export async function record({ plant = false, pages = PAGES, log = () => {} } = {}) {
  const harnessUrl = pathToFileURL(path.join(ROOT, "tooling/scripts/e2e-harness/server.mjs")).href;
  const scenariosUrl = pathToFileURL(path.join(ROOT, "tooling/scripts/e2e-harness/scenarios.mjs")).href;
  const { startHarness } = await import(harnessUrl);
  const { WORKSPACE } = await import(scenariosUrl);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const out = { meta: { at: FIXED_NOW, properties: PROPERTIES, planted: plant }, pages: {} };
  try {
    for (const [name, routes] of Object.entries(pages)) {
      const harness = await startHarness({ name, now: FIXED_NOW });
      try {
        for (const [device, options] of Object.entries(VIEWPORTS)) {
          for (const theme of THEMES) {
            const context = await browser.newContext({ ...options, deviceScaleFactor: 1, reducedMotion: "reduce" });
            const page = await context.newPage();
            await page.clock.setFixedTime(FIXED_NOW);
            await page.goto(`${harness.url}/w/${WORKSPACE.slug}/#/${routes[0]}`, { waitUntil: "load" });
            await settle(page);
            await page.addStyleTag({ content: STILL });
            if (plant) await page.addStyleTag({ content: PLANT });
            // The standalone document starts dark and turns on the `t` key (legacy/Chanlytics.html).
            if (theme === "light") {
              await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" })));
              await page.waitForTimeout(300);
            }
            for (const route of routes) {
              await page.evaluate((r) => (location.hash = `#/${r}`), route);
              await settle(page);
              const key = `${name} ${device} ${theme} #/${route}`;
              out.pages[key] = await page.evaluate(walk, PROPERTIES);
              log(`${key}: ${out.pages[key].length} elements`);
            }
            await context.close();
          }
        }
      } finally {
        await harness.close();
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}

/** Two boxes are one when every edge is within BOX_TOLERANCE; a pseudo-element has no box, and two nothings agree. */
const sameBox = (a, b) =>
  a === null || b === null ? a === b : a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= BOX_TOLERANCE);

/**
 * Two recordings compared: `{ equal, pages, elements, differences }`, where each difference names its page, its
 * element (by path) and what differs (a property, the box, or the element itself: missing on one side). `limit` caps
 * the differences kept; the count of them is exact.
 */
export function compareRecordings(before, after, limit = 25) {
  const properties = before.meta?.properties ?? PROPERTIES;
  const kept = [];
  let count = 0;
  let elements = 0;
  const differ = (d) => {
    count++;
    if (kept.length < limit) kept.push(d);
  };
  const keys = [...new Set([...Object.keys(before.pages), ...Object.keys(after.pages)])].sort();
  for (const page of keys) {
    const a = before.pages[page];
    const b = after.pages[page];
    if (!a || !b) {
      differ({ page, element: null, what: a ? "the page is missing after" : "the page is missing before" });
      continue;
    }
    const byPath = (list) => new Map(list.map(([p, box, values]) => [p, { box, values }]));
    const left = byPath(a);
    const right = byPath(b);
    elements += left.size;
    for (const [p, x] of left) {
      const y = right.get(p);
      if (!y) {
        differ({ page, element: p, what: "the element is gone after" });
        continue;
      }
      if (!sameBox(x.box, y.box)) differ({ page, element: p, what: "box", before: x.box, after: y.box });
      x.values.forEach((v, i) => {
        if (v !== y.values[i]) differ({ page, element: p, what: properties[i], before: v, after: y.values[i] });
      });
    }
    for (const p of right.keys()) if (!left.has(p)) differ({ page, element: p, what: "the element is new after" });
  }
  return { equal: count === 0, pages: keys.length, elements, count, differences: kept };
}

const describe = (d) =>
  `  ${d.page}${d.element ? `\n    ${d.element}` : ""}\n    ${d.what}${"before" in d ? `: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}` : ""}`;

async function main([command, ...args]) {
  if (command === "record" && args[0]) {
    const out = await record({ log: (line) => console.log(line) });
    fs.writeFileSync(args[0], JSON.stringify(out));
    const n = Object.values(out.pages).reduce((a, list) => a + list.length, 0);
    console.log(`recorded ${Object.keys(out.pages).length} pages, ${n} elements, to ${args[0]}`);
    return 0;
  }
  if (command === "compare" && args[0] && args[1]) {
    const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
    const result = compareRecordings(read(args[0]), read(args[1]));
    if (result.equal) {
      console.log(`equal: ${result.pages} pages, ${result.elements} elements`);
      return 0;
    }
    console.log(`${result.count} differences across ${result.pages} pages; the first ${result.differences.length}:`);
    for (const d of result.differences) console.log(describe(d));
    return 1;
  }
  if (command === "self-test") {
    const pages = { salon: ["today", "clients"] };
    const first = await record({ pages });
    const second = await record({ pages });
    const planted = await record({ pages, plant: true });
    const same = compareRecordings(first, second);
    const moved = compareRecordings(first, planted);
    console.log(`two recordings of one tree: ${same.equal ? "equal" : `${same.count} differences`}`);
    console.log(`one token moved one step: ${moved.equal ? "equal" : `${moved.count} differences`}`);
    if (!same.equal) for (const d of same.differences.slice(0, 10)) console.log(describe(d));
    return same.equal && !moved.equal ? 0 : 1;
  }
  console.log(
    "usage: style-equality.mjs record <file.json> | compare <before.json> <after.json> | self-test\n" +
      "Record before a change and after it, then compare; the recordings stay out of the repository.",
  );
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
