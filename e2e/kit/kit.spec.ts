import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import {
  KIT_SKIP_REASON,
  PRESSES,
  kitChecks,
  type KitAnswer,
  type KitAsk,
  type SeenSelector,
  type Width,
} from "./kit-checks";

/**
 * The kit's gallery, checked in a browser (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, step 2.3): the
 * page the local harness draws for its `kit` record (tooling/scripts/e2e-harness/kit-gallery.mjs), every class of the
 * kit in the app's own stylesheets.
 *
 *   corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit
 *
 * 1. Every class in classes.json is drawn by an entry.
 * 2. Every selector of every rule of kit.css is drawn by an entry, each selector of a list alone, a press's (:hover,
 *    :active, a :focus) with the presses forced on every entry: in every width, theme and look, and with reduced motion.
 * 3. Each entry reads its tokens: a token planted where the entry stands moves every longhand it feeds, in the same
 *    runs, a press rule's with the presses forced.
 * 4. Each new primitive computes every longhand its source computes, and so do their pseudo-elements, pressed or not,
 *    dark and light, under Classic: a source reads the theme's colours where the kit reads a look's roles, so under
 *    Glass the two part by design.
 * And each fails when what it checks is broken, shown on faults planted in the page, never on disk. The functions that
 * run in the page are e2e/kit/kit-checks.ts, which says what they cannot see. Motion is stopped as the recorder stops
 * it (STILL), and read with it off. The presses are forced by the browser's own devtools protocol
 * (CSS.forcePseudoState), so this runs in Chromium, the config's one browser.
 *
 * Production has no gallery: the nightly skips this with a reason its skip ceiling does not count (skip-ceiling.ts).
 */
test.skip(process.env.E2E_SCENARIO !== "kit", KIT_SKIP_REASON);

const KIT_SHEET = "surfaces/kit/kit.css";
const STILL_ID = "kit-still";
const REGISTRY: string[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../apps/dashboard/src/surfaces/kit/classes.json"), "utf8"),
).classes;

/**
 * The recorder's still stylesheet, its two widths, its tolerance for an edge and its laid-out longhands
 * (tooling/scripts/checks/style-equality.mjs), so the gallery is held and measured as every recorded page is. Imported
 * as a test runs: Playwright compiles a static import into CommonJS, which an .mjs is not.
 */
const recorder = () => import("../../tooling/scripts/checks/style-equality.mjs");

type Theme = "dark" | "light";
type Look = "classic" | "glass";
type Run = { width: Width; theme: Theme; look: Look; reduced: boolean };

const label = (r: Run) => `${r.width} ${r.theme} ${r.look}${r.reduced ? " reduced-motion" : ""}`;
/** Every width, theme and look, and a desk with reduced motion: where a rule of the kit may hold. */
const EVERY: Run[] = [
  ...(["desk", "phone"] as const).flatMap((width) =>
    (["dark", "light"] as const).flatMap((theme) =>
      (["classic", "glass"] as const).map((look) => ({ width, theme, look, reduced: false })),
    ),
  ),
  { width: "desk", theme: "dark", look: "classic", reduced: true },
];
/** Where a twin is compared with its source: both widths and themes, under Classic. */
const CLASSIC = EVERY.filter((r) => r.look === "classic" && !r.reduced);

async function open(browser: Browser, baseURL: string | undefined, width: Width, reduced = false) {
  const { VIEWPORTS } = await recorder();
  const context: BrowserContext = await browser.newContext({
    ...VIEWPORTS[width],
    baseURL,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  return { context, page: await context.newPage() };
}

/** The gallery in a theme and a look, held still, its fonts in. */
async function show(page: Page, theme: Theme = "dark", look: Look = "classic") {
  const { STILL } = await recorder();
  await page.goto(`/?theme=${theme}&look=${look}`);
  const still = await page.addStyleTag({ content: STILL });
  await still.evaluate((el, id) => {
    el.id = id;
  }, STILL_ID);
  await page.evaluate(() => document.fonts.ready);
}

/** Each run in a browser context of its width and motion, the gallery shown afresh in its theme and look. */
async function eachRun(
  browser: Browser,
  baseURL: string | undefined,
  runs: Run[],
  visit: (page: Page, run: Run) => Promise<void>,
) {
  const groups = new Map<string, Run[]>();
  for (const run of runs)
    groups.set(`${run.width} ${run.reduced}`, [...(groups.get(`${run.width} ${run.reduced}`) ?? []), run]);
  for (const [first, ...rest] of groups.values()) {
    const { context, page } = await open(browser, baseURL, first.width, first.reduced);
    try {
      for (const run of [first, ...rest]) {
        await show(page, run.theme, run.look);
        await visit(page, run);
      }
    } finally {
      await context.close();
    }
  }
}

/**
 * Every element of every entry pointed at, pressed and focused at once, as the browser's devtools force a state
 * (CDP CSS.forcePseudoState), for as long as `run` takes: the page then draws every rule a press's selector names.
 */
async function pressing<T>(page: Page, run: () => Promise<T>): Promise<T> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: "[data-entry] > .gx-stage *",
    });
    await Promise.all(
      nodeIds.map((nodeId) => cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: PRESSES })),
    );
    return await run();
  } finally {
    await cdp.detach();
  }
}

const ask = (page: Page, question: KitAsk): Promise<KitAnswer> => page.evaluate(kitChecks, question);
const rulesQ = (pressed: boolean): KitAsk => ({ check: "rules", sheet: KIT_SHEET, presses: PRESSES, pressed });
const tokensQ = (width: Width, pressed: boolean): KitAsk => ({
  check: "tokens",
  sheet: KIT_SHEET,
  presses: PRESSES,
  pressed,
  width,
  still: STILL_ID,
});
const twinsQ = async (width: Width): Promise<KitAsk> => {
  const { EDGE_TOLERANCE, LAID_OUT } = await recorder();
  return { check: "twins", sheet: KIT_SHEET, width, still: STILL_ID, tolerance: EDGE_TOLERANCE, laidOut: LAID_OUT };
};

/**
 * Check 2 across its runs: a selector is drawn when an entry matched it in any run that judged it (a press's, those
 * with the presses forced). What is left is each selector no run drew, named with its media and the list it is in.
 */
function tally(seen: SeenSelector[][]) {
  const byKey = new Map<string, SeenSelector>();
  for (const s of seen.flat()) {
    if (!s.judged) continue;
    const was = byKey.get(s.key);
    byKey.set(s.key, was ? { ...was, drawn: was.drawn || s.drawn } : s);
  }
  const all = [...byKey.values()];
  return { all, missed: all.filter((s) => !s.drawn) };
}
const named = (s: SeenSelector) =>
  `${s.selector}${s.media ? ` in ${s.media}` : ""}${s.rule !== s.selector ? ` (of ${s.rule})` : ""}: no entry draws it`;

test("every class in classes.json is drawn by an entry", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    await show(page);
    const a = await ask(page, { check: "classes", classes: REGISTRY });
    console.log(
      `the gallery: ${a.families} families, ${a.entries} entries (${a.kitEntries} of the kit, ${a.twins} with a ` +
        `twin, ${a.entries - a.kitEntries} sources), drawing the ${REGISTRY.length} classes of classes.json`,
    );
    expect(a.missing, "classes of the kit no entry draws").toEqual([]);
  } finally {
    await context.close();
  }
});

test("every selector of every rule of kit.css is drawn by an entry, a press's with the presses forced, in every run", async ({
  browser,
  baseURL,
}) => {
  const seen: SeenSelector[][] = [];
  const unread = new Set<string>();
  let rules = 0;
  await eachRun(browser, baseURL, EVERY, async (page) => {
    const plain = await ask(page, rulesQ(false));
    const held = await pressing(page, () => ask(page, rulesQ(true)));
    seen.push(plain.selectors, held.selectors);
    rules = plain.rules;
    for (const f of [...plain.failures, ...held.failures]) unread.add(f);
  });
  const { all, missed } = tally(seen);
  const press = all.filter((s) => s.press);
  console.log(
    `kit rules: ${rules} in kit.css, ${all.length} selectors, ${all.length - missed.length} drawn in ${EVERY.length} ` +
      `runs; ${press.length} of them a press's, judged with the presses forced`,
  );
  expect([...unread], "rules of kit.css the checks cannot read").toEqual([]);
  expect(missed.map(named), "selectors of kit.css no entry draws, in any run").toEqual([]);
});

test("each entry reads its tokens, a press rule's with the presses forced, in every run", async ({
  browser,
  baseURL,
}) => {
  const failures: string[] = [];
  const reads: string[] = [];
  let exempt = 0;
  await eachRun(browser, baseURL, EVERY, async (page, run) => {
    const plain = await ask(page, tokensQ(run.width, false));
    const held = await pressing(page, () => ask(page, tokensQ(run.width, true)));
    reads.push(`${label(run)} ${plain.reads} and ${held.reads} pressed`);
    exempt = plain.exempt.length;
    failures.push(...plain.failures.map((f) => `${label(run)}: ${f}`));
    failures.push(...held.failures.map((f) => `${label(run)} pressed: ${f}`));
  });
  console.log(`token reads per run: ${reads.join("; ")}; entries no rule of kit.css draws yet, so exempt: ${exempt}`);
  expect(failures, "a kit rule that does not read its token where the entry stands").toEqual([]);
});

test("each new primitive computes every longhand its source computes, pressed or not: dark and light, Classic", async ({
  browser,
  baseURL,
}) => {
  const failures: string[] = [];
  const pairs: string[] = [];
  await eachRun(browser, baseURL, CLASSIC, async (page, run) => {
    const plain = await ask(page, await twinsQ(run.width));
    const held = await pressing(page, async () => ask(page, await twinsQ(run.width)));
    pairs.push(`${label(run)} ${plain.pairs}`);
    failures.push(...plain.failures.map((f) => `${label(run)}: ${f}`));
    failures.push(...held.failures.map((f) => `${label(run)} pressed: ${f}`));
  });
  console.log(`twins: element pairs compared per run, plain and pressed: ${pairs.join(", ")}`);
  expect(failures, "a primitive that does not compute what its source computes").toEqual([]);
});

/* ---- the checks' own proof: each fails when what it checks is broken ---- */

/** Rules added to kit.css's sheet in the page, never on disk. */
const plantRules = (page: Page, rules: string[]) =>
  page.evaluate(
    ({ sheet, rules }) => {
      const kit = Array.from(document.styleSheets).find((s) => !!s.href && new URL(s.href).pathname.endsWith(sheet));
      if (!kit) throw new Error(`no stylesheet ends ${sheet}`);
      for (const rule of rules) kit.insertRule(rule, kit.cssRules.length);
    },
    { sheet: KIT_SHEET, rules },
  );
/** Entries added to the gallery's first family, as kit-gallery.mjs renders an entry. */
const plantEntries = (page: Page, html: string) =>
  page.evaluate((html) => document.querySelector(".gx-entries")?.insertAdjacentHTML("beforeend", html), html);
const entry = (id: string, inner: string, more = "") =>
  `<figure class="gx-entry" data-entry="${id}"${more}><div class="gx-stage">${inner}</div></figure>`;
const theirs = (a: KitAnswer, id: string) => a.failures.filter((f) => f.startsWith(`${id}:`));
const undrawn = (a: KitAnswer, prefix: string) =>
  tally([a.selectors])
    .missed.filter((s) => s.selector.startsWith(prefix))
    .map(named);

test("checks 1 and 2 name a class no entry draws, and each selector no entry draws, a press's too", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    // 1. A class every entry has stopped drawing is named.
    await show(page);
    expect((await ask(page, { check: "classes", classes: REGISTRY })).missing).toEqual([]);
    await page.evaluate(() =>
      document.querySelectorAll("[data-entry]:not([data-source]) .mark").forEach((el) => el.classList.remove("mark")),
    );
    expect((await ask(page, { check: "classes", classes: REGISTRY })).missing).toEqual(["mark"]);

    // 2. A rule is drawn while its entry stands and named once the entry is taken away; a list is judged a selector
    // at a time; a press's is judged only with the presses forced, where one no entry draws is named.
    await show(page);
    await plantRules(page, [
      ".gx-probe { background-color: var(--surface-pane-fill); }",
      ".gx-probe, .gx-probe-other { color: var(--ink); }",
      ".gx-probe:hover { color: var(--ink-muted); }",
      ".gx-probe-gone:focus-visible { color: var(--ink-dim); }",
    ]);
    await plantEntries(page, entry("probe", '<div class="gx-probe">A probe</div>'));
    const plain = await ask(page, rulesQ(false));
    expect(undrawn(plain, ".gx-probe")).toEqual([".gx-probe-other (of .gx-probe, .gx-probe-other): no entry draws it"]);
    const held = await pressing(page, () => ask(page, rulesQ(true)));
    expect(undrawn(held, ".gx-probe")).toEqual([
      ".gx-probe-other (of .gx-probe, .gx-probe-other): no entry draws it",
      ".gx-probe-gone:focus-visible: no entry draws it",
    ]);
    await page.evaluate(() => document.querySelector('[data-entry="probe"]')?.remove());
    expect(undrawn(await ask(page, rulesQ(false)), ".gx-probe")).toEqual([
      ".gx-probe: no entry draws it",
      ".gx-probe (of .gx-probe, .gx-probe-other): no entry draws it",
      ".gx-probe-other (of .gx-probe, .gx-probe-other): no entry draws it",
    ]);
  } finally {
    await context.close();
  }
});

test("check 3 names a token overridden in whole or in part, one not defined, a press's, a pseudo-element's and one only reduced motion reads", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    // A kit rule that reads a role passes where its entry stands; a page's rule over it is named.
    await show(page);
    await plantRules(page, [".gx-probe { background-color: var(--surface-pane-fill); }"]);
    await plantEntries(page, entry("probe", '<div class="gx-probe">A probe</div>'));
    const reading = await ask(page, tokensQ("desk", false));
    expect(theirs(reading, "probe")).toEqual([]);
    expect(reading.readsBy.probe).toBe(1);
    await page.addStyleTag({ content: ".gx-probe { background-color: rgb(9, 9, 9) !important; }" });
    expect(theirs(await ask(page, tokensQ("desk", false)), "probe")).toEqual([
      "probe: div.gx-probe background-color: planting --surface-pane-fill changed nothing (background-color at rgb(9, 9, 9))",
    ]);

    // A page's rule over part of a declaration: the longhands it keeps are named, and those the tokens move are not.
    await show(page);
    await plantRules(page, [
      ".gx-probe-part { padding: var(--space-2) var(--space-3); border: 1px solid var(--line); }",
    ]);
    await plantEntries(page, entry("probe-part", '<div class="gx-probe-part">A probe</div>'));
    expect(theirs(await ask(page, tokensQ("desk", false)), "probe-part")).toEqual([]);
    await page.addStyleTag({
      content: ".gx-probe-part { padding-left: 0 !important; border-bottom-color: rgb(9, 9, 9) !important; }",
    });
    expect(theirs(await ask(page, tokensQ("desk", false)), "probe-part")).toEqual([
      "probe-part: div.gx-probe-part padding: planting --space-2, --space-3 left padding-left at 0px: another rule keeps it",
      "probe-part: div.gx-probe-part border: planting --line left border-bottom-color at rgb(9, 9, 9): another rule keeps it",
    ]);

    // An opacity at 1, which the first number (7) cannot move: the second (0.37) does, and nothing is named.
    await show(page);
    await page.addStyleTag({ content: ":root { --gx-probe-opacity: 1; }" });
    await plantRules(page, [".gx-probe-o { opacity: var(--gx-probe-opacity); }"]);
    await plantEntries(page, entry("probe-o", '<div class="gx-probe-o">A probe</div>'));
    const clamped = await ask(page, tokensQ("desk", false));
    expect(theirs(clamped, "probe-o")).toEqual([]);
    expect(clamped.readsBy["probe-o"]).toBe(1);

    // A var() naming a token that is not there, on an element and on a list item's marker; an entry whose kit rules
    // read no token.
    await show(page);
    await plantRules(page, [
      ".gx-probe-bare { color: var(--gx-no-such-token); }",
      ".gx-probe-m::marker { color: var(--gx-no-such-marker); }",
      ".gx-probe-plain { display: block; }",
    ]);
    await plantEntries(
      page,
      entry("probe-bare", '<div class="gx-probe-bare">A probe</div>') +
        entry("probe-m", '<ul><li class="gx-probe-m">A probe</li></ul>') +
        entry("probe-plain", '<div class="gx-probe-plain">A probe</div>'),
    );
    const holds = await ask(page, tokensQ("desk", false));
    expect(theirs(holds, "probe-bare")[0]).toBe(
      "probe-bare: div.gx-probe-bare color reads --gx-no-such-token, which is not defined there",
    );
    expect(theirs(holds, "probe-m")[0]).toBe(
      "probe-m: ul > li.gx-probe-m::marker color reads --gx-no-such-marker, which is not defined there",
    );
    expect(theirs(holds, "probe-plain")).toEqual(["probe-plain: its kit rules read no token"]);

    // A press rule's tokens: not planted unpressed; with the presses forced, a token not there and a page's rule over
    // a press are named.
    await show(page);
    await plantRules(page, [
      ".gx-probe-p { color: var(--ink); }",
      ".gx-probe-p:hover { background-color: var(--gx-no-such-hover); }",
      ".gx-probe-p:focus-visible { outline-color: var(--ink-muted); }",
    ]);
    await page.addStyleTag({ content: ".gx-probe-p:focus-visible { outline-color: rgb(9, 9, 9) !important; }" });
    await plantEntries(page, entry("probe-p", '<button type="button" class="gx-probe-p">A probe</button>'));
    expect(theirs(await ask(page, tokensQ("desk", false)), "probe-p")).toEqual([]);
    const pressed = await pressing(page, () => ask(page, tokensQ("desk", true)));
    expect(theirs(pressed, "probe-p")).toEqual([
      "probe-p: button.gx-probe-p background-color reads --gx-no-such-hover, which is not defined there",
      "probe-p: button.gx-probe-p outline-color: planting --ink-muted changed nothing (outline-color at rgb(9, 9, 9))",
    ]);
  } finally {
    await context.close();
  }

  // A rule only reduced motion holds, reading a token that is not there: named in the reduced run, which is why the
  // runs include one, and not in the others.
  for (const reduced of [false, true]) {
    const { context: c, page: p } = await open(browser, baseURL, "desk", reduced);
    try {
      await show(p);
      await plantRules(p, [
        ".gx-probe-f { color: var(--ink); }",
        "@media (prefers-reduced-motion: reduce) { .gx-probe-f { background-color: var(--gx-no-such-still); } }",
      ]);
      await plantEntries(p, entry("probe-f", '<div class="gx-probe-f">A probe</div>'));
      const found = theirs(await ask(p, tokensQ("desk", false)), "probe-f");
      expect(found.some((f) => f.includes("reads --gx-no-such-still, which is not defined there"))).toBe(reduced);
    } finally {
      await c.close();
    }
  }
});

test("check 4 names a longhand its twin's source computes differently, on any element, and a box that stands apart", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    // A twin that computes what its source does passes; 14px against 15px of padding is named.
    await show(page);
    await plantRules(page, [".gx-probe-twin { padding: 14px; }"]);
    await plantEntries(
      page,
      entry("probe-twin", '<div class="gx-probe-twin">A probe</div>', ' data-twin="probe-source"') +
        entry("probe-source", '<div class="gx-probe-source">A probe</div>', ' data-source="e2e/kit/kit.spec.ts"'),
    );
    const source = await page.addStyleTag({ content: ".gx-probe-source { padding: 14px; }" });
    const equal = await ask(page, await twinsQ("desk"));
    expect(theirs(equal, "probe-twin")).toEqual([]);
    expect(equal.pairs).toBeGreaterThanOrEqual(1);
    await source.evaluate((el) => {
      el.textContent = ".gx-probe-source { padding: 14px 14px 14px 15px; }";
    });
    expect(theirs(await ask(page, await twinsQ("desk")), "probe-twin")).toEqual([
      "probe-twin: div.gx-probe-twin padding-left: 14px against 15px in probe-source",
    ]);

    // What the source draws beyond the kit's rules: a shadow the twin lacks, and a child's size and colour no kit rule
    // sets, the colour said once (not again for each longhand that takes it, a border's, the caret's).
    await show(page);
    await plantRules(page, [".gx-probe-more { padding: 14px; }"]);
    await plantEntries(
      page,
      entry("probe-more", '<div class="gx-probe-more">A <b>probe</b></div>', ' data-twin="probe-more-source"') +
        entry(
          "probe-more-source",
          '<div class="gx-probe-more-source">A <b>probe</b></div>',
          ' data-source="e2e/kit/kit.spec.ts"',
        ),
    );
    await page.addStyleTag({
      content:
        ".gx-probe-more-source { padding: 14px; box-shadow: rgb(200, 0, 0) 0px 0px 0px 3px; } " +
        ".gx-probe-more-source b { font-size: 30px; color: rgb(200, 0, 0); }",
    });
    expect(theirs(await ask(page, await twinsQ("desk")), "probe-more")).toEqual([
      "probe-more: div.gx-probe-more box-shadow: none against rgb(200, 0, 0) 0px 0px 0px 3px in probe-more-source",
      "probe-more: div.gx-probe-more > b color: oklch(0.96 0.004 80) against rgb(200, 0, 0) in probe-more-source",
      "probe-more: div.gx-probe-more > b font-size: 13.5px against 30px in probe-more-source",
    ]);

    // A longhand the twin excepts is not compared, and its box still is.
    await plantRules(page, [".gx-probe-box { display: block; width: 40px; height: 10px; }"]);
    await plantEntries(
      page,
      entry(
        "probe-box",
        '<div class="gx-probe-box"></div>',
        ' data-twin="probe-box-source" data-except="width" data-boxes="true"',
      ) + entry("probe-box-source", '<div class="gx-probe-box-source"></div>', ' data-source="e2e/kit/kit.spec.ts"'),
    );
    await page.addStyleTag({ content: ".gx-probe-box-source { display: block; width: 41px; height: 10px; }" });
    const boxes = theirs(await ask(page, await twinsQ("desk")), "probe-box");
    expect(boxes, "the box alone, the width being excepted").toHaveLength(1);
    expect(boxes[0]).toMatch(
      /^probe-box: div\.gx-probe-box's box [\d.]+ [\d.]+ 40\.00 10\.00 against [\d.]+ [\d.]+ 41\.00 10\.00 in probe-box-source/,
    );

    // Pressed, a hover the source draws and the twin does not is named.
    await show(page);
    await plantRules(page, [".gx-probe-h { padding: 14px; }"]);
    await plantEntries(
      page,
      entry("probe-h", '<button type="button" class="gx-probe-h">A probe</button>', ' data-twin="probe-h-source"') +
        entry(
          "probe-h-source",
          '<button type="button" class="gx-probe-h-source">A probe</button>',
          ' data-source="e2e/kit/kit.spec.ts"',
        ),
    );
    await page.addStyleTag({
      content: ".gx-probe-h-source { padding: 14px; } .gx-probe-h-source:hover { color: rgb(200, 0, 0); }",
    });
    expect(theirs(await ask(page, await twinsQ("desk")), "probe-h")).toEqual([]);
    const pressed = await pressing(page, async () => ask(page, await twinsQ("desk")));
    expect(theirs(pressed, "probe-h").some((f) => f.includes("color: ") && f.includes("rgb(200, 0, 0)"))).toBe(true);
  } finally {
    await context.close();
  }
});

test("the checks name a rule of kit.css in a group they cannot judge, or nested in another", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    await show(page);
    await plantRules(page, [
      "@container (min-width: 0px) { .gx-probe-c { color: var(--ink); } }",
      ".gx-probe-n { color: var(--ink); & .gx-probe-n-in { color: var(--ink-muted); } }",
    ]);
    await plantEntries(
      page,
      entry("probe-n", '<div class="gx-probe-n"><span class="gx-probe-n-in gx-probe-c">A probe</span></div>'),
    );
    for (const a of [await ask(page, rulesQ(false)), await ask(page, tokensQ("desk", false))]) {
      expect(a.failures.filter((f) => f.includes("kit.css"))).toEqual([
        "@container (min-width: 0px): kit.css holds a CSSContainerRule the checks cannot judge here, so none reads it",
        ".gx-probe-n: kit.css nests rules in it, which the checks do not read",
      ]);
    }
  } finally {
    await context.close();
  }
});
