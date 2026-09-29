#!/usr/bin/env node
/**
 * Style equality: the proof that a change to the stylesheets or to the markup moved nothing on screen
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.5 and step 1.2).
 *
 *   node tooling/scripts/checks/style-equality.mjs record <file.json> [--against <before.json>] [--limit N]
 *   node tooling/scripts/checks/style-equality.mjs compare <before.json> <after.json> [--limit N]
 *   node tooling/scripts/checks/style-equality.mjs self-test
 *
 * `corepack pnpm check:style-equality -- …` is the same. A step that must look the same records the tree before its
 * change and after it, and compares; `--against` records and compares in one command. A bare file name is written to
 * and read from the system's temporary directory, and a path inside the repository is refused: recordings stay out
 * of it.
 *
 * `record` starts the e2e harness (tooling/scripts/e2e-harness/server.mjs) for each of its records at one fixed
 * moment, and opens each route of PAGES and each scene of SCENES (a route and a press or two, for what is drawn only
 * after one: a menu, a confirm, a toast, a sheet, a fold, a combobox's list, a control in its hovered, focused, picked
 * or on state, a tooltip) at a desk width and at a phone's with a coarse pointer,
 * in the dark theme and the light one. Every animation and transition is stopped before the page draws, and the
 * page's clock stands still: it moves only when the recorder steps it, the same simulated seconds on every route, so
 * what a timer draws is in every recording or in none. Then it writes every element's edges and every computed
 * longhand, each ::before, ::after, ::marker and ::placeholder's too, into one table of styles that the elements
 * point at; and which rules of each stylesheet the pages drew. It refuses a page that did not draw what it opened.
 *
 * `compare` exits 0 when two recordings are equal and 1 when they differ, listing what is gone or new before what
 * moved; either way it names the rules the change touched that neither recording drew, which it cannot vouch for.
 * Two recordings not made alike (another browser, other pages or longhands) are not compared: exit 2, as for a
 * crash or a bad command. `self-test` records twice and a third time with one token moved one step (`--radius-md`,
 * planted in the page, never on disk), and exits 0 only when the first two agree and the third does not.
 *
 * It runs a browser, so it is a tool a person runs, not part of `pnpm test`; the comparison it makes is tested there
 * (tooling/scripts/tests/styles/style-equality.test.mjs). docs/runbook.md, "Prove a style change", says what it
 * cannot prove.
 */
/* global document, getComputedStyle, window, KeyboardEvent, location -- walk() and the few lines handed to
   page.evaluate() run in the page, where these are the browser's own. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** What a recording is shaped like; a recording of another shape is not compared. */
const FORMAT = 2;

/** The moment every record is built at and every page's clock stands at: a Monday afternoon, 28 September 2026. */
export const FIXED_NOW = Date.UTC(2026, 8, 28, 20, 2, 0);

/** The pipeline record's third person (scenarios.mjs `uuidOf`): a proposal out, a conversation, a number. */
const PERSON = "clients/5c0e0000-0000-4000-8000-000000000003";

/**
 * The harness's records and the routes each is opened at (the address after `#/`). The salon draws the mockup's
 * pages, a seeded person and every Settings pane; the pipeline the real People, Pipeline and person's page; the
 * nightly its empty Business pane (its other pages are the salon's own, element for element); the kit its gallery,
 * which draws every class of the kit (e2e-harness/kit-gallery.mjs) and has no routes, so its one is a name.
 */
export const PAGES = {
  salon: [
    ...["today", "inbox", "clients", "clients/c-aisha", "calendar", "outbound", "broadcasts", "messages", "reports"],
    // Settings: Business is the bare route, and then each pane in the rail (settings.jsx SET_TABS).
    "admin",
    ...["profile", "partner", "team", "autonomy", "integrations", "notifications", "billing", "activity"].map(
      (pane) => `admin/${pane}`,
    ),
  ],
  pipeline: ["clients", "clients/pipeline", "clients/leads", PERSON],
  nightly: ["today", "admin"],
  kit: ["kit"],
};

/**
 * What is drawn only after a press, each recorded as a page of its own: the record and route it opens, its presses
 * (`click`, `hover` or `focus` on the first element a selector finds, or `key`, the key named third pressed there),
 * and what must then be on screen. A record's scenes run after its routes, in this order: the tooltip's node stays in
 * the page once made, so it goes last.
 *
 * Most of the kit is drawn only in a state: the record kit's fold in place on a desk (the person's page) and as a
 * sheet (Settings › Business, and every fold on a phone), a combobox's list, a segmented control with its picked
 * segment, a switch that is on, a menu's danger item under the pointer, and a button focused as a keyboard focuses it.
 */
export const SCENES = {
  "a menu": {
    record: "pipeline",
    route: PERSON,
    steps: [["click", '[data-testid="person-more"]']],
    sees: ".more-menu",
  },
  "a confirm": {
    record: "pipeline",
    route: PERSON,
    steps: [
      ["click", '[data-testid="person-more"]'],
      ["click", '.more-menu [role="menuitem"]:has-text("Delete person")'],
    ],
    sees: ".confirm",
  },
  "a toast": {
    record: "pipeline",
    route: PERSON,
    steps: [
      ["click", '[data-testid="person-more"]'],
      ["click", '.more-menu [role="menuitem"]:has-text("Copy number")'],
    ],
    sees: ".pp-toast",
  },
  "a fold in place": {
    record: "pipeline",
    route: PERSON,
    steps: [["click", '[data-testid="rec-row-act-person-receptionist"]']],
    sees: '[data-testid="rec-fold-person-receptionist"]',
  },
  "a danger item under the pointer": {
    record: "pipeline",
    route: PERSON,
    steps: [
      ["click", '[data-testid="person-more"]'],
      ["hover", ".more-menu .more-item.danger"],
    ],
    sees: ".more-menu .more-item.danger",
  },
  // Focused by a key, as a keyboard focuses it: once the pointer has pressed anything, `focus` alone is not :focus-visible.
  "a focused button": {
    record: "pipeline",
    route: PERSON,
    steps: [["key", '[data-testid="person-open-thread"]', "Shift"]],
    sees: '[data-testid="person-open-thread"]:focus-visible',
  },
  "a record sheet": {
    record: "salon",
    route: "admin",
    steps: [["click", '[data-testid="rec-row-act-services"]']],
    sees: ".rec-sheet",
  },
  "a combobox open in a fold": {
    record: "salon",
    route: "admin",
    steps: [
      ["click", '[data-testid="rec-row-act-languages"]'],
      ["key", '[data-testid="rec-fold-languages"] .rec-combo-input', "ArrowDown"],
    ],
    sees: '[data-testid="rec-fold-languages"] .rec-combo-list',
  },
  "a segmented control": {
    record: "salon",
    route: "admin",
    steps: [["click", '[data-testid="rec-row-act-phone_display"]']],
    sees: '[data-testid="rec-inline-phone_display"] .rec-seg-btn[aria-checked="true"]',
  },
  "a switch that is on": {
    record: "salon",
    route: "admin",
    steps: [["click", '[data-testid="rec-row-act-guardrails"]']],
    sees: '[data-testid="rec-fold-guardrails"] .rec-switch[aria-checked="true"]',
  },
  "a tooltip": { record: "salon", route: "today", steps: [["hover", ".tb-bell"]], sees: ".ui-tip.show" },
};

/** A desk and a phone. The phone is a touch screen, so the shell's 44px floor under a coarse pointer is drawn. */
export const VIEWPORTS = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

export const THEMES = ["dark", "light"];

/**
 * The longhands the browser resolves from layout, not from the rules (CSSOM's resolved values): an element's are its
 * edges, so they are not read again, and a pseudo-element has no edges, so its are.
 */
const LAID_OUT = (
  "width height inline-size block-size top right bottom left inset-block-start inset-block-end inset-inline-start " +
  "inset-inline-end margin-top margin-right margin-bottom margin-left margin-block-start margin-block-end " +
  "margin-inline-start margin-inline-end transform-origin perspective-origin grid-template-columns grid-template-rows"
).split(" ");

/** Elements no stylesheet can draw. */
const SKIPPED = ["script", "style", "link", "template", "noscript", "meta", "base", "title"];

/**
 * How finely an edge is written: 1/64 of a pixel, as finely as the browser lays a box out. And how far an edge, or a
 * length the layout decides for a pseudo-element (LAID_OUT), may move and still be where it was: an eighth of a pixel.
 * The browser does not always lay one line of text out to the same 1/64: two recordings of one tree put the phone
 * People page's `.cl-decision-narr`, beside a column as wide as its words, 2/64 of a pixel apart. An edge a person
 * could see move moves a pixel.
 */
const EDGE_STEP = 1 / 64;
export const EDGE_TOLERANCE = 1 / 8;

/**
 * The simulated seconds each route is given, one at a time, letting the requests each second started finish in real
 * time before the next: ten, past the longest wait a route has (app-shell.jsx: a surface that never lands is said to
 * be unavailable after 8s), so the Inbox's strip that a 1s interval brings in, and Leads' unavailable pane, are there
 * in every recording.
 */
const SETTLE_SECONDS = 10;
const SECOND_MS = 1000;
/**
 * Quiet: nothing in flight, and the last request done this long ago, in real time. A request a response starts is
 * made within a task or two of it; one a timer starts waits for the next step.
 */
const QUIET_MS = 150;
/** A page that is not quiet by then is refused: a request that never ends would make each recording its own. */
const NETWORK_CAP_MS = 30_000;
const POLL_MS = 50;
/** The clock is installed this long before FIXED_NOW and paused at it, because a paused clock only moves forward. */
const CLOCK_LEAD_MS = 10 * 60_000;
/** The theme's switch, in simulated time: a React state and the effect that writes `data-theme`. */
const THEME_MS = 500;
/** How long a scene's press may wait for its element, in real time. */
const PRESS_TIMEOUT_MS = 10_000;
/**
 * How long a record's first page may take to load, in real time: it fetches React and Babel and compiles the shell,
 * which took eight seconds on a machine busy with other work. Waiting longer changes nothing recorded.
 */
const LOAD_TIMEOUT_MS = 60_000;
/** How many differences and rules `compare` lists unless told otherwise; the count is always exact. */
const LIMIT = 25;
const RULE_SHOWN = 160;

/** Stops what moves, before the page draws: animations, transitions and the caret. The kit's gallery spec adds it too. */
export const STILL =
  "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";

/** The planted fault self-test uses: one token, one step. */
export const PLANT = ":root, [data-theme] { --radius-md: 9px !important; }";

/** In the page, before its scripts run: the stylesheet that holds it still (and a plant), added as the parse ends. */
function holdStill(css) {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  });
}

/** In the page: every standard longhand the browser computes, in its order. A custom property is a token's name. */
function longhands() {
  const cs = getComputedStyle(document.documentElement);
  const out = [];
  for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith("--")) out.push(cs[i]);
  return out;
}

/**
 * In the page: every element's path, edges and style, and each pseudo-element's that draws, in document order. The
 * styles are a table of distinct value lists, and each entry points at one.
 */
function walk({ names, laidOut, skipped, step }) {
  const laid = names.map((n) => laidOut.includes(n));
  const skip = new Set(skipped);
  const at = (v) => Math.round(v / step) * step;
  const table = new Map();
  const styles = [];
  const styleOf = (cs, pseudo) => {
    const values = names.map((n, i) => (laid[i] && !pseudo ? null : cs.getPropertyValue(n)));
    const key = values.map((v) => (v === null ? "\u0000" : v)).join("\u0001");
    let id = table.get(key);
    if (id === undefined) {
      id = styles.length;
      styles.push(values);
      table.set(key, id);
    }
    return id;
  };
  const paths = new Map([[document.documentElement, "html"]]);
  const pathOf = (el) => {
    let i = 1;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === el.tagName) i++;
    const own = `${el.tagName.toLowerCase()}:${i}`;
    const parent = el.parentElement === document.documentElement ? "" : `${paths.get(el.parentElement)}>`;
    paths.set(el, parent + own);
    return parent + own;
  };
  // A ::before or ::after draws when it has content; a list item draws its ::marker, and an empty field with a
  // placeholder its ::placeholder.
  const drawn = (content) => content !== "none" && content !== "normal";
  const extras = (el, cs) =>
    [cs.display.includes("list-item") && "::marker", el.placeholder && !el.value && "::placeholder"].filter(Boolean);
  const elements = [];
  for (const el of [document.body, ...document.body.querySelectorAll("*")]) {
    const p = pathOf(el);
    if (skip.has(el.localName)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    elements.push([p, [at(r.left), at(r.top), at(r.right), at(r.bottom)], styleOf(cs, false)]);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (drawn(ps.getPropertyValue("content"))) elements.push([`${p}${pseudo}`, null, styleOf(ps, true)]);
    }
    for (const pseudo of extras(el, cs))
      elements.push([`${p}${pseudo}`, null, styleOf(getComputedStyle(el, pseudo), true)]);
  }
  const root = getComputedStyle(document.documentElement);
  const r = document.documentElement.getBoundingClientRect();
  elements.unshift(["html", [at(r.left), at(r.top), at(r.right), at(r.bottom)], styleOf(root, false)]);
  return { styles, elements };
}

/** Where a string that opens at `i` closes. */
const closingQuote = (css, i) => {
  let j = i + 1;
  while (j < css.length && css[j] !== css[i]) j += css[j] === "\\" ? 2 : 1;
  return j;
};

/** The at-rules whose blocks hold style rules; any other at-rule's block (@keyframes, @font-face) holds none. */
const GROUP = /^@(media|supports|container|layer|scope|starting-style|document)\b/i;

/**
 * Each style rule a stylesheet holds, in order: its words (the group rules around it, then its selector and its
 * declarations, spaced once, comments dropped), which name it in both trees, and where its `{` stands, which a range
 * of the browser's coverage holds when a page drew the rule.
 */
export function rulesOf(css) {
  const flat = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const out = [];
  const open = [];
  let from = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    const inside = open.length ? open[open.length - 1].kind : "group";
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
    } else if (c === '"' || c === "'") {
      i = closingQuote(css, i);
    } else if (c === "{") {
      const head = flat(css.slice(from, i));
      const kind = inside !== "group" ? "skip" : GROUP.test(head) ? "group" : head.startsWith("@") ? "skip" : "style";
      open.push({ head, kind, at: i });
      from = i + 1;
    } else if (c === "}") {
      const block = open.pop();
      if (block && block.kind === "style") {
        const around = open.map((b) => `${b.head} {`);
        out.push({
          text: [...around, `${block.head} { ${flat(css.slice(block.at + 1, i))} }`].join(" "),
          open: block.at,
        });
      }
      from = i + 1;
    } else if (c === ";" && inside === "group") {
      from = i + 1; // an @import, @charset or @layer statement ends here
    }
  }
  return out;
}

/** A stylesheet the tree serves, by its path from the page (`styles/tokens.css`); null for anyone else's. */
function sheetName(url) {
  const u = new URL(url);
  if (u.hostname !== "localhost" || !u.pathname.endsWith(".css")) return null;
  return u.pathname.replace(/^\/w\/[^/]+\//, "").replace(/^\//, "");
}

/**
 * The page's requests, counted from before it opens, and a wait from now until none has been in flight for QUIET_MS:
 * so what a step's timers asked for, and what its answers asked for in turn, lands before the next step's timers.
 */
function watchNetwork(page) {
  const open = new Set();
  let last = 0;
  page.on("request", (r) => {
    open.add(r);
    last = Date.now();
  });
  const done = (r) => {
    open.delete(r);
    last = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return async (what) => {
    const start = Date.now();
    while (open.size > 0 || Date.now() - Math.max(last, start) < QUIET_MS) {
      if (Date.now() - start > NETWORK_CAP_MS) {
        const waiting = [...open].map((r) => r.url()).slice(0, 3);
        throw new Error(
          `${what}: the network was not quiet after ${NETWORK_CAP_MS / SECOND_MS}s (${waiting.join(", ")})`,
        );
      }
      await page.waitForTimeout(POLL_MS);
    }
  };
}

/**
 * Steps the page's clock `seconds` simulated seconds, one at a time, letting the network go quiet after each. A step
 * fires each timer that fell due in it once (fastForward), not each frame of the second: the three's canvas asks for
 * sixty a second, and walking them all cost more than the rest of a recording.
 */
async function settle(page, quiet, what, seconds = SETTLE_SECONDS) {
  for (let i = 0; i < seconds; i++) {
    await page.clock.fastForward(SECOND_MS);
    await quiet(what);
  }
  await page.evaluate(() => document.fonts.ready);
}

/** Throws unless the page drew what it opened: a root, no "No surface at …" card, the theme asked for, no error. */
async function refuseUndrawn(page, what, theme, errors) {
  if (errors.length) throw new Error(`${what}: the page threw: ${errors[0]}`);
  const why = await page.evaluate((asked) => {
    const root = document.getElementById("root");
    if (!root || !root.firstElementChild) return "#root is empty: the page never drew";
    const soon = document.querySelector(".soon-title");
    if (soon) return `it drew "${soon.textContent.trim()}" instead`;
    const theme = document.documentElement.getAttribute("data-theme");
    return theme === asked ? null : `its theme is ${theme}, not ${asked}`;
  }, theme);
  if (why) throw new Error(`${what}: ${why}`);
}

/** Opens a route in the page that is already open: the shell follows its hash. */
const go = (page, route) => page.evaluate((r) => (location.hash = `#/${r}`), route);

/** One press of a scene, on the first element its selector finds: a `key` press names its key third. */
async function press(page, [act, selector, key], what) {
  const target = page.locator(selector).first();
  const acts = {
    click: () => target.click(),
    hover: () => target.hover(),
    focus: () => target.focus(),
    key: () => target.press(key),
  };
  if (!acts[act] || (act === "key") !== (key !== undefined)) {
    throw new Error(`${what}: a scene presses by click, hover, focus or key (with its key), not ${act} ${key ?? ""}`);
  }
  try {
    await acts[act]();
  } catch (e) {
    throw new Error(`${what}: could not ${act} ${selector}: ${e.message.split("\n")[0]}`, { cause: e });
  }
}

/** One scene: from a page of nothing (so the route is drawn afresh), its route, its presses, and what they drew. */
async function playScene(page, quiet, { key, scene, theme, errors }) {
  await go(page, "_");
  await settle(page, quiet, key, 1);
  await go(page, scene.route);
  await settle(page, quiet, key);
  await refuseUndrawn(page, key, theme, errors);
  for (const step of scene.steps) await press(page, step, key);
  await settle(page, quiet, key, 1);
  if (!(await page.locator(scene.sees).first().isVisible())) throw new Error(`${key}: nothing matches ${scene.sees}`);
  await refuseUndrawn(page, key, theme, errors);
}

/** Every route and scene of one record, at one width, in one theme, in a context of its own. */
async function recordContext(browser, job) {
  const { harness, slug, name, device, theme, routes, scenes, plant, take, fold, walkArgs } = job;
  const context = await browser.newContext({
    ...VIEWPORTS[device],
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    // A toast's scene copies a number; a browser that refused the clipboard would throw in the page.
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PRESS_TIMEOUT_MS);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const quiet = watchNetwork(page);
    await page.clock.install({ time: FIXED_NOW - CLOCK_LEAD_MS });
    await page.clock.pauseAt(FIXED_NOW);
    await page.addInitScript(holdStill, STILL + (plant ?? ""));
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    const where = `${name} ${device} ${theme}`;
    await page.goto(`${harness.url}/w/${slug}/#/${routes[0] ?? scenes[0][1].route}`, {
      waitUntil: "load",
      timeout: LOAD_TIMEOUT_MS,
    });
    await settle(page, quiet, where);
    // The standalone document starts dark and turns on the `t` key (legacy/Chanlytics.html).
    if (theme !== "dark") {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" })));
      await page.clock.fastForward(THEME_MS);
      await quiet(where);
    }
    for (const [i, route] of routes.entries()) {
      const key = `${where} #/${route}`;
      // The first route is the one the page opened at, and has had its seconds.
      if (i > 0) await go(page, route);
      if (i > 0) await settle(page, quiet, key);
      await refuseUndrawn(page, key, theme, errors);
      take(key, await page.evaluate(walk, walkArgs));
    }
    for (const [scene, s] of scenes) {
      const key = `${where} scene: ${scene}`;
      await playScene(page, quiet, { key, scene: s, theme, errors });
      take(key, await page.evaluate(walk, walkArgs));
    }
    fold(await page.coverage.stopCSSCoverage());
  } finally {
    await context.close();
  }
}

/** What must be the same of two recordings for them to be compared at all. */
const SETUP = ["format", "pages", "scenes", "viewports", "themes", "edgeStep", "laidOut", "properties", "browser"];

/** The setup a recording of `pages` and `scenes` is made with, all but what only the browser knows. */
const setupOf = (pages, scenes) => ({
  format: FORMAT,
  pages,
  scenes,
  viewports: VIEWPORTS,
  themes: THEMES,
  edgeStep: EDGE_STEP,
  laidOut: LAID_OUT,
});

/**
 * Record every page of every record at both widths and in both themes, and every scene: `{ meta, styles, pages,
 * rules }`, where each page lists `[path, edges, style]` (edges null for a pseudo-element, style an index into
 * `styles`) and `rules` lists each stylesheet's rules with whether any page drew it. `plant` is CSS added to every
 * page.
 */
export async function record({ pages = PAGES, scenes = SCENES, plant = null, log = () => {} } = {}) {
  const { startHarness } = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/e2e-harness/server.mjs")).href);
  const { WORKSPACE } = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/e2e-harness/scenarios.mjs")).href);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const probe = await browser.newPage();
    const names = await probe.evaluate(longhands);
    await probe.close();
    const out = {
      meta: { ...setupOf(pages, scenes), properties: names, browser: browser.version(), at: FIXED_NOW, planted: plant },
      styles: [],
      pages: {},
      rules: {},
    };
    const walkArgs = { names, laidOut: LAID_OUT, skipped: SKIPPED, step: EDGE_STEP };
    const ids = new Map();
    const take = (key, { styles, elements }) => {
      const global = styles.map((values) => {
        const k = values.map((v) => (v === null ? "\u0000" : v)).join("\u0001");
        if (!ids.has(k)) ids.set(k, out.styles.push(values) - 1);
        return ids.get(k);
      });
      out.pages[key] = elements.map(([p, edges, style]) => [p, edges, global[style]]);
      log(`${key}: ${elements.length} elements`);
    };
    const sheets = new Map();
    const fold = (entries) => {
      for (const { url, text, ranges } of entries) {
        const name = sheetName(url);
        if (!name) continue;
        if (!sheets.has(name)) sheets.set(name, { text, rules: rulesOf(text).map((r) => ({ ...r, used: false })) });
        const sheet = sheets.get(name);
        if (sheet.text !== text) throw new Error(`${name} changed while it was being recorded`);
        for (const r of sheet.rules) r.used = r.used || ranges.some((x) => x.start <= r.open && r.open < x.end);
      }
    };
    const records = [...new Set([...Object.keys(pages), ...Object.values(scenes).map((s) => s.record)])];
    for (const name of records) {
      const harness = await startHarness({ name, now: FIXED_NOW });
      try {
        const routes = pages[name] ?? [];
        const own = Object.entries(scenes).filter(([, s]) => s.record === name);
        for (const device of Object.keys(VIEWPORTS)) {
          for (const theme of THEMES) {
            const job = { harness, slug: WORKSPACE.slug, name, device, theme, routes, scenes: own, plant };
            await recordContext(browser, { ...job, take, fold, walkArgs });
          }
        }
      } finally {
        await harness.close();
      }
    }
    for (const [name, sheet] of [...sheets].sort(([a], [b]) => a.localeCompare(b))) {
      out.rules[name] = sheet.rules.map((r) => [r.text, r.used ? 1 : 0]);
    }
    return out;
  } finally {
    await browser.close();
  }
}

/** The parts of the setup two recordings do not share; none, when they can be compared. */
export function setupMismatch(a = {}, b = {}) {
  return SETUP.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) =>
    k === "browser" ? `the browser (${a.browser} and ${b.browser})` : `the ${k}`,
  );
}

const within = (a, b) => Math.abs(Number(a) - Number(b)) <= EDGE_TOLERANCE + Number.EPSILON;

/** Two sets of edges are one when each edge is within EDGE_TOLERANCE; a pseudo-element has none, and two agree. */
const sameEdges = (a, b) =>
  a === null || b === null ? a === b : a.length === b.length && a.every((v, i) => within(v, b[i]));

/** Two laid-out values that say the same but for lengths within EDGE_TOLERANCE of each other ("12.5px 8px"). */
const sameLaidOut = (a, b) => {
  const x = a.split(/(-?\d*\.?\d+)px/);
  const y = b.split(/(-?\d*\.?\d+)px/);
  return x.length === y.length && x.every((s, i) => (i % 2 ? within(s, y[i]) : s === y[i]));
};

/** The rules the two trees' stylesheets do not hold alike, by their words in each sheet, and whether a run drew each. */
function changedRules(a = {}, b = {}) {
  const tally = (rules) => {
    const m = new Map();
    for (const [sheet, list] of Object.entries(rules)) {
      for (const [text, used] of list) {
        const k = `${sheet}\n${text}`;
        const e = m.get(k) ?? { sheet, rule: text, n: 0, drawn: false };
        e.n++;
        e.drawn = e.drawn || used === 1;
        m.set(k, e);
      }
    }
    return m;
  };
  const was = tally(a);
  const is = tally(b);
  const out = [];
  for (const k of new Set([...was.keys(), ...is.keys()])) {
    const x = was.get(k);
    const y = is.get(k);
    if ((x?.n ?? 0) === (y?.n ?? 0)) continue;
    const { sheet, rule } = x ?? y;
    out.push({ sheet, rule, change: (y?.n ?? 0) > (x?.n ?? 0) ? "added" : "removed", drawn: !!(x?.drawn || y?.drawn) });
  }
  return out;
}

/** What is missing on one side: listed before any edge or value that moved. */
const STRUCTURAL = new Set([
  "the page is missing after",
  "the page is missing before",
  "the element is gone after",
  "the element is new after",
]);

/**
 * Two recordings compared: `{ equal, mismatch, pages, elements, count, differences, changedRules, unseen }`. Each
 * difference names its page, its element (by path) and what differs: a longhand, the edges, or the element or page
 * itself, missing on one side; those come first. `limit` caps the list; `count` is exact. `mismatch` names what the
 * two were not recorded alike with, and then nothing is compared. `unseen` lists the rules that changed between the
 * two trees' stylesheets and that no page of either drew.
 */
export function compareRecordings(before, after, limit = LIMIT) {
  const changed = changedRules(before.rules, after.rules);
  const mismatch = setupMismatch(before.meta, after.meta);
  const unseen = changed.filter((r) => !r.drawn);
  const result = {
    equal: false,
    mismatch,
    pages: 0,
    elements: 0,
    count: 0,
    differences: [],
    changedRules: changed.length,
    unseen,
  };
  if (mismatch.length) return result;
  const names = before.meta.properties;
  const lists = { structural: [], moved: [] };
  const differ = (d) => {
    result.count++;
    const list = STRUCTURAL.has(d.what) ? lists.structural : lists.moved;
    if (list.length < limit) list.push(d);
  };
  // Many elements share a pair of styles, so each pair is compared once. A value the layout decides (a pseudo-element's
  // LAID_OUT longhands; an element's are null, its edges standing for them) is held to EDGE_TOLERANCE, as edges are.
  const laid = names.map((n) => (before.meta.laidOut ?? []).includes(n));
  const same = (v, w, n) => v === w || (laid[n] && v !== null && w !== null && sameLaidOut(v, w));
  const seen = new Map();
  const apart = (x, y) => names.flatMap((_, n) => (same(x[n], y[n], n) ? [] : [n]));
  const valuesApart = (i, j) => {
    if (!seen.has(`${i},${j}`)) seen.set(`${i},${j}`, apart(before.styles[i], after.styles[j]));
    return seen.get(`${i},${j}`);
  };
  const keys = [...new Set([...Object.keys(before.pages), ...Object.keys(after.pages)])].sort();
  for (const page of keys) {
    const a = before.pages[page];
    const b = after.pages[page];
    if (!a || !b) {
      differ({ page, element: null, what: a ? "the page is missing after" : "the page is missing before" });
      continue;
    }
    const right = new Map(b.map((e) => [e[0], e]));
    result.elements += a.length;
    for (const [p, edges, style] of a) {
      const y = right.get(p);
      if (!y) differ({ page, element: p, what: "the element is gone after" });
      if (!y) continue;
      if (!sameEdges(edges, y[1])) differ({ page, element: p, what: "edges", before: edges, after: y[1] });
      for (const n of valuesApart(style, y[2])) {
        differ({ page, element: p, what: names[n], before: before.styles[style][n], after: after.styles[y[2]][n] });
      }
    }
    const left = new Set(a.map((e) => e[0]));
    for (const [p] of b) if (!left.has(p)) differ({ page, element: p, what: "the element is new after" });
  }
  result.pages = keys.length;
  result.equal = result.count === 0;
  result.differences = [...lists.structural, ...lists.moved].slice(0, limit);
  return result;
}

const describe = (d) =>
  `  ${d.page}${d.element ? `\n    ${d.element}` : ""}\n    ${d.what}${"before" in d ? `: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}` : ""}`;

/** Says what a comparison found, and answers the exit code: 0 equal, 1 different, 2 not comparable. */
function report(result, limit) {
  if (result.mismatch.length) {
    console.log(`not compared: the two recordings differ in ${result.mismatch.join(", ")}.`);
    console.log("Record both with this tool as it stands, on one machine, in one sitting.");
    return 2;
  }
  if (result.equal) console.log(`equal: ${result.pages} pages, ${result.elements} elements`);
  else {
    console.log(`${result.count} differences in ${result.pages} pages; the first ${result.differences.length}:`);
    for (const d of result.differences) console.log(describe(d));
  }
  if (result.changedRules > 0) {
    const n = result.unseen.length;
    console.log(
      `${result.changedRules} rules differ between the two trees' stylesheets; ${n} drawn in neither${n ? ":" : "."}`,
    );
    for (const r of result.unseen.slice(0, limit))
      console.log(`  ${r.sheet}, ${r.change}: ${r.rule.slice(0, RULE_SHOWN)}`);
    if (n) console.log("Nothing recorded draws those, so this comparison says nothing about them.");
  }
  return result.equal ? 0 : 1;
}

/** Where a recording goes or comes from: a bare file name in the system's temporary directory, never the repository. */
function recordingPath(file) {
  const target = /[\\/]/.test(file) ? path.resolve(file) : path.join(os.tmpdir(), file);
  const inside = path.relative(ROOT, target);
  if (!inside.startsWith("..") && !path.isAbsolute(inside)) {
    throw new Error(
      `${target} is inside the repository; a recording stays out of it (a bare name goes to ${os.tmpdir()})`,
    );
  }
  return target;
}

function readRecording(file) {
  const where = recordingPath(file);
  const recording = JSON.parse(fs.readFileSync(where, "utf8"));
  if (!recording.meta || !recording.pages) throw new Error(`${where} is not a recording`);
  return recording;
}

/** The command's words and its two flags; null when it is not a command this tool takes. */
function parseArgs(argv) {
  const words = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    const flag = /^--(limit|against)(?:=(.*))?$/.exec(a);
    if (flag) flags[flag[1]] = flag[2] ?? argv[++i] ?? "";
    else if (a.startsWith("-")) return null;
    else words.push(a);
  }
  const limit = "limit" in flags ? Number(flags.limit || NaN) : LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || flags.against === "") return null;
  return { words, limit, against: flags.against };
}

async function recordTo(file, against, limit) {
  const out = recordingPath(file);
  fs.accessSync(path.dirname(out), fs.constants.W_OK);
  if (against && recordingPath(against) === out)
    throw new Error(`${out} would be written over the recording it is compared with`);
  const before = against ? readRecording(against) : null;
  // What of this run's setup is known before the browser starts; the browser's own part is compared after.
  const apart = before ? setupMismatch(before.meta, { ...before.meta, ...setupOf(PAGES, SCENES) }) : [];
  if (apart.length) {
    console.log(`not recorded: ${against} differs from this tool in ${apart.join(", ")}; record it again first.`);
    return 2;
  }
  const started = Date.now();
  const recording = await record({ log: (line) => console.log(line) });
  fs.writeFileSync(out, JSON.stringify(recording));
  const n = Object.values(recording.pages).reduce((sum, list) => sum + list.length, 0);
  const took = Math.round((Date.now() - started) / SECOND_MS);
  console.log(`recorded ${Object.keys(recording.pages).length} pages, ${n} elements, in ${took}s, to ${out}`);
  return before ? report(compareRecordings(before, recording, limit), limit) : 0;
}

async function selfTest() {
  const pages = { salon: ["today", "clients"] };
  const log = (line) => console.log(`  ${line}`);
  console.log("two recordings of one tree, then a third with --radius-md moved one step");
  const first = await record({ pages, scenes: {}, log });
  const second = await record({ pages, scenes: {}, log });
  const planted = await record({ pages, scenes: {}, plant: PLANT, log });
  const same = compareRecordings(first, second);
  const moved = compareRecordings(first, planted);
  console.log(`two recordings of one tree: ${same.equal ? "equal" : `${same.count} differences`}`);
  console.log(`one token moved one step: ${moved.equal ? "equal" : `${moved.count} differences`}`);
  if (!same.equal) for (const d of same.differences.slice(0, 10)) console.log(describe(d));
  return same.equal && !moved.equal ? 0 : 1;
}

const USAGE = `usage: style-equality.mjs record <file.json> [--against <before.json>] [--limit N]
       style-equality.mjs compare <before.json> <after.json> [--limit N]
       style-equality.mjs self-test
Record the tree before a change and after it, then compare. A bare file name is in ${os.tmpdir()}.`;

async function main(argv) {
  const args = parseArgs(argv);
  const [command, ...files] = args ? args.words : [];
  if (command === "record" && files.length === 1) return recordTo(files[0], args.against, args.limit);
  if (command === "compare" && files.length === 2 && !args.against) {
    return report(compareRecordings(readRecording(files[0]), readRecording(files[1]), args.limit), args.limit);
  }
  if (command === "self-test" && files.length === 0 && !args.against) return selfTest();
  console.log(USAGE);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`style-equality: ${e.message}`);
      process.exit(2);
    },
  );
}
