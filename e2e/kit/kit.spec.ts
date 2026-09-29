import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import {
  KIT_SKIP_REASON,
  NO_WORDS,
  NO_WORDS_CSS,
  PRESSES,
  focusRings,
  groundsUnder,
  kitChecks,
  placeEntry,
  toastsOverFeet,
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
 * 5. A toast raised over an open sheet stands clear of the sheet's foot, where its Save is, at both widths, in both
 *    looks.
 * 6. Under Glass, at both widths and in both themes: every control an entry draws shows the house's ring when a key
 *    focuses it, its own box-shadow or outline or its box's (a field's, by :focus-within).
 * 7. Under Glass, at both widths and in both themes: every word an entry draws reads 4.5:1, or 3:1 when it is large,
 *    on the ground drawn under it, read from the page's own pixels with the words hidden, each entry shot at the top of
 *    the window, where the look's strongest light stands. A control that cannot be used is not held (WCAG 1.4.3).
 * And each fails when what it checks is broken, shown on faults planted in the page, never on disk. The functions that
 * run in the page are e2e/kit/kit-checks.ts, which says what they cannot see. Motion is stopped as the recorder stops
 * it (STILL), and read with it off. The presses are forced by the browser's own devtools protocol
 * (CSS.forcePseudoState), so this runs in Chromium, the config's one browser.
 *
 * Production has no gallery: the nightly skips this with a reason its skip ceiling does not count (skip-ceiling.ts).
 */
test.skip(process.env.E2E_SCENARIO !== "kit", KIT_SKIP_REASON);

const KIT_SHEET = "surfaces/kit/kit.css";
const MINUTE_MS = 60_000;
const STILL_ID = "kit-still";
/** Every name classes.json holds: the kit's classes, and the modifiers kit.css names beside them (.active, .icon…). */
const LISTS: { classes: string[]; modifiers?: string[] } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../apps/dashboard/src/surfaces/kit/classes.json"), "utf8"),
);
const REGISTRY = [...LISTS.classes, ...(LISTS.modifiers ?? [])];

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
/** Where the look's own promises are held (a key's focus, the words' contrast): both widths and themes, under Glass. */
const GLASS = EVERY.filter((r) => r.look === "glass" && !r.reduced);

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

/**
 * Check 7 on the page as it stands: every kit entry brought to the top of the window in turn, its words read, the
 * ground under them shot with the words hidden, and each word's ratio on it (kit-checks.ts, placeEntry and
 * groundsUnder). What fails is each word under its ratio, 4.5 or 3 for a large one, but in a control that cannot be
 * used. The ratio of every word is kept by where it stands and what it says, for the checks' own proof.
 */
async function contrastOf(page: Page) {
  await page.addStyleTag({ content: NO_WORDS_CSS });
  const entries = await page.$$eval("[data-entry]:not([data-source])", (els) =>
    els.map((e) => (e as HTMLElement).dataset.entry as string),
  );
  const found = { words: 0, lowest: Infinity, failures: [] as string[], ratios: {} as Record<string, number> };
  for (const entry of entries) {
    const placed = await page.evaluate(placeEntry, { entry, hide: NO_WORDS });
    if (!placed.clip) continue;
    const png = (await page.screenshot({ clip: placed.clip })).toString("base64");
    const shot = { png, width: placed.clip.width, words: placed.words, hide: NO_WORDS };
    for (const w of await page.evaluate(groundsUnder, shot)) {
      if (w.ratio === null || w.exempt) continue;
      found.words += 1;
      found.lowest = Math.min(found.lowest, w.ratio);
      found.ratios[`${w.at} "${w.text}"`] = w.ratio;
      if (w.ratio < w.need)
        found.failures.push(`${w.at} "${w.text}" reads ${w.ratio}:1 on rgb(${w.ground}), under ${w.need}`);
    }
  }
  return found;
}
const rulesQ = (pressed: boolean): KitAsk => ({ check: "rules", sheet: KIT_SHEET, presses: PRESSES, pressed });
/**
 * Check 3's question for a run. A run with reduced motion plants only what reduced motion alone holds (a rule inside
 * `prefers-reduced-motion`): the other runs plant the rest, and the house's reduced-motion rules still a kit rule's
 * motion there, as they should.
 */
const tokensQ = (width: Width, pressed: boolean, reduced = false): KitAsk => ({
  check: "tokens",
  sheet: KIT_SHEET,
  presses: PRESSES,
  pressed,
  width,
  still: STILL_ID,
  ...(reduced ? { media: "prefers-reduced-motion" } : {}),
});

/**
 * Where a stylesheet other than kit.css keeps what a kit rule draws, each known and each waiting for the Phase 4 step
 * named (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, Phase 4, in 0015's order): check 3 names every
 * longhand a planted token does not move, and a failure one of these explains, in the runs it names, is expected. An
 * entry no run meets any more fails the test and comes out of the list, so the check stays strict for everything else.
 */
const KNOWN_OVERRIDES: { by: string; until: string; runs: RegExp; failure: RegExp }[] = [
  {
    by:
      "settings.css:1388, `:is(.bt-services-sheet, .bt-prompt-sheet, .rec-fold-sheet) .btn-sm { height: var(--control-h-md) }`: " +
      "the Business tab's sheets hold a small button at the medium height",
    until: "Phase 4's Settings step (0015 step 11), where the Business tab's sheets take the kit's sizes",
    runs: /./,
    failure:
      /^rec-fold-sheet(?:-leaving)?: .* > button\.btn\.btn-sm\.btn-(?:primary|ghost) height: planting --control-h-sm changed nothing/,
  },
  {
    by: "legacy.css, `@media (pointer: coarse) { html.legacy-on .chip { min-height: 0 } }`: the shell's touch floor, undone for a chip",
    until:
      "Phase 4's step for the frame (0015 step 13), where legacy.css leaves with the shell and the kit keeps its own floor",
    runs: /^phone /,
    failure: /^chip-wrap: .* span\.chip\.chip-wrap min-height: planting --chip-h changed nothing/,
  },
  {
    by:
      "record.css, `@media (max-width: 760px)`: the record kit's phone form (a fold's label and fields, the inline " +
      "editor, the sheet's edge), which kit.css's one breakpoint cannot hold without moving 761 to 900px (step 2.1)",
    until: "Phase 4's People step (0015 step 5), where the record kit takes 900px, as REC_PHONE_QUERY",
    runs: /^phone /,
    failure:
      /^rec-[a-z-]+: .* (?:[a-z-]+: planting --rec-key changed nothing|border-left: planting --line-strong changed nothing)/,
  },
];
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
        `twin, ${a.entries - a.kitEntries} sources), drawing the ${LISTS.classes.length} classes and ` +
        `${REGISTRY.length - LISTS.classes.length} modifiers of classes.json`,
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

test("each entry reads its tokens, a press rule's with the presses forced, in every run, but the known overrides", async ({
  browser,
  baseURL,
}) => {
  const found: { run: string; text: string }[] = [];
  const reads: string[] = [];
  let exempt = 0;
  await eachRun(browser, baseURL, EVERY, async (page, run) => {
    const plain = await ask(page, tokensQ(run.width, false, run.reduced));
    const held = await pressing(page, () => ask(page, tokensQ(run.width, true, run.reduced)));
    reads.push(`${label(run)} ${plain.reads} and ${held.reads} pressed`);
    if (!run.reduced) exempt = plain.exempt.length;
    found.push(...plain.failures.map((text) => ({ run: label(run), text })));
    found.push(...held.failures.map((text) => ({ run: `${label(run)} pressed`, text })));
  });
  const known = (o: (typeof KNOWN_OVERRIDES)[number], f: { run: string; text: string }) =>
    o.runs.test(f.run) && o.failure.test(f.text);
  const explained = found.filter((f) => KNOWN_OVERRIDES.some((o) => known(o, f)));
  console.log(
    `token reads per run: ${reads.join("; ")}; entries no rule of kit.css draws yet, so exempt: ${exempt}; ` +
      `${explained.length} plants the ${KNOWN_OVERRIDES.length} known overrides keep from moving`,
  );
  expect(
    found.filter((f) => !explained.includes(f)).map((f) => `${f.run}: ${f.text}`),
    "a kit rule that does not read its token where the entry stands",
  ).toEqual([]);
  expect(
    KNOWN_OVERRIDES.filter((o) => !found.some((f) => known(o, f))).map((o) => `${o.by}: keeps nothing any more`),
    "a known override no run meets: take it out of KNOWN_OVERRIDES",
  ).toEqual([]);
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

test("a toast raised over an open sheet stands clear of its foot, where its Save is, at both widths, in both looks", async ({
  browser,
  baseURL,
}) => {
  for (const width of ["desk", "phone"] as const) {
    const { context, page } = await open(browser, baseURL, width);
    try {
      for (const look of ["classic", "glass"] as const) {
        await show(page, "dark", look);
        const found = await page.evaluate(toastsOverFeet);
        expect(found.pairs, `${width} ${look}: toasts compared with an open sheet's foot`).toBeGreaterThan(0);
        expect(found.over, `${width} ${look}: a toast over a sheet's foot`).toEqual([]);
      }
    } finally {
      await context.close();
    }
  }
});

test("every control an entry draws shows the house's ring when a key focuses it: Glass, both widths and themes", async ({
  browser,
  baseURL,
}) => {
  const failures: string[] = [];
  const counts: string[] = [];
  await eachRun(browser, baseURL, GLASS, async (page, run) => {
    const found = await page.evaluate(focusRings);
    counts.push(`${label(run)} ${found.focusables}`);
    failures.push(...found.failures.map((f) => `${label(run)}: ${f}`));
  });
  console.log(`rings: the controls a key focused, per run: ${counts.join(", ")}`);
  expect(failures, "a control whose focus draws no ring").toEqual([]);
});

test("every word an entry draws reads 4.5:1, a large one 3:1, on the ground under it: Glass, both widths and themes", async ({
  browser,
  baseURL,
}) => {
  // Each entry is shot on its own, four runs over: longer than the harness's two minutes for a test.
  test.setTimeout(10 * MINUTE_MS);
  const failures: string[] = [];
  const counts: string[] = [];
  await eachRun(browser, baseURL, GLASS, async (page, run) => {
    const found = await contrastOf(page);
    counts.push(`${label(run)} ${found.words} words, the lowest at ${found.lowest}:1`);
    failures.push(...found.failures.map((f) => `${label(run)}: ${f}`));
  });
  console.log(`contrast: ${counts.join("; ")}`);
  expect(failures, "a word under its ratio on the ground under it").toEqual([]);
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
      const found = theirs(await ask(p, tokensQ("desk", false, reduced)), "probe-f");
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

test("check 5 names a toast over a sheet's foot: on a phone as the bell's list lifted it, on a desk moved over the sheet", async ({
  browser,
  baseURL,
}) => {
  const faults = {
    // The bell's list, which a phone's page drew until it kept a desk's twin to a desk (mobile.css, :root:has(.tbn-pop)).
    phone: (page: Page) =>
      page.evaluate(() =>
        document.querySelector(".gx-entries")?.insertAdjacentHTML("beforeend", '<section class="tbn-pop"></section>'),
      ),
    // The stack at the page's right edge, over the sheet, where the kit stands it beside.
    desk: (page: Page) =>
      page.addStyleTag({
        content: ".pp-toast-stack { left: auto !important; right: 0 !important; transform: none !important; }",
      }),
  };
  for (const width of ["desk", "phone"] as const) {
    const { context, page } = await open(browser, baseURL, width);
    try {
      for (const look of ["classic", "glass"] as const) {
        await show(page, "dark", look);
        expect((await page.evaluate(toastsOverFeet)).over).toEqual([]);
        await faults[width](page);
        expect(
          (await page.evaluate(toastsOverFeet)).over.map((o) => o.split(":")[0]),
          `${width} ${look}`,
        ).toEqual(["sheet"]);
      }
    } finally {
      await context.close();
    }
  }
});

test("checks 6 and 7 name a control whose focus draws no ring, and a word under its ratio, but a large one at 3:1", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(5 * MINUTE_MS);
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    await show(page, "light", "glass");
    await plantRules(page, [
      ".gx-probe-noring:focus-visible { box-shadow: none !important; outline: none !important; }",
      ".gx-probe-faint { color: rgb(170, 170, 176); }",
      ".gx-probe-large { color: rgb(114, 114, 118); font-size: 26px; }",
    ]);
    await plantEntries(
      page,
      entry("probe-ring", '<button type="button">A probe</button>') +
        entry("probe-noring", '<button type="button" class="gx-probe-noring">A probe</button>') +
        entry("probe-faint", '<p class="gx-probe-faint">A faint probe</p>') +
        entry("probe-large", '<p class="gx-probe-large">A large probe</p>'),
    );
    // 6. The house's ring draws on a plain button; a rule that takes it away is named.
    expect((await page.evaluate(focusRings)).failures.filter((f) => f.startsWith("probe-"))).toEqual([
      "probe-noring: button.gx-probe-noring draws no ring when a key focuses it",
    ]);
    // 7. Pale words are named; a large word under 4.5:1 is held to 3:1 and passes.
    const found = await contrastOf(page);
    expect(found.failures.filter((f) => f.startsWith("probe-")).map((f) => f.split(" reads ")[0])).toEqual([
      'probe-faint: p.gx-probe-faint "A faint probe"',
    ]);
    const large = found.ratios['probe-large: p.gx-probe-large "A large probe"'];
    expect(large, "the large probe's words are measured, at 3:1 or more and under 4.5:1").toBeGreaterThanOrEqual(3);
    expect(large).toBeLessThan(4.5);
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
