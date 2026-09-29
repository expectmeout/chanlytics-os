import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { kitChecks, type KitAnswer, type KitAsk, type SeenRule, type Width } from "./kit-checks";

/**
 * The kit's gallery, checked in a browser (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, step 2.3): the
 * page the local harness draws for its `kit` record (tooling/scripts/e2e-harness/kit-gallery.mjs), every class of the
 * kit in the app's own stylesheets.
 *
 *   corepack pnpm e2e:local -- e2e/kit.spec.ts --scenario=kit
 *
 * 1. Every class in classes.json is drawn by an entry.
 * 2. Every rule of kit.css is drawn by an entry, but a press's: at a desk, on a phone and at a desk with reduced motion.
 * 3. Each entry reads its tokens: a token planted where the entry stands changes what it draws, in the dark theme and
 *    the light one, Classic and Glass, at a desk and on a phone.
 * 4. Each new primitive draws what its source draws, dark and light, under Classic: a source reads the theme's colours
 *    where the kit reads a look's roles, so under Glass the two part by design.
 * And each fails when what it checks is broken, shown on faults planted in the page, never on disk. The functions that
 * run in the page are e2e/kit-checks.ts. Motion is stopped as the recorder stops it (STILL), and read with it off.
 *
 * Production has no gallery: the nightly skips this with a reason its skip ceiling does not count (skip-ceiling.ts).
 */
test.skip(
  process.env.E2E_SCENARIO !== "kit",
  "the kit's gallery is the local harness's alone: set E2E_SCENARIO=kit, as `corepack pnpm e2e:local -- e2e/kit.spec.ts --scenario=kit` does",
);

const KIT_SHEET = "surfaces/kit/kit.css";
const STILL_ID = "kit-still";
const REGISTRY: string[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../apps/dashboard/src/surfaces/kit/classes.json"), "utf8"),
).classes;

/**
 * The recorder's still stylesheet, its two widths and its tolerance for an edge (tooling/scripts/checks/
 * style-equality.mjs), so the gallery is held and measured as every recorded page is. Imported as a test runs:
 * Playwright compiles a static import into CommonJS, which an .mjs is not.
 */
const recorder = () => import("../tooling/scripts/checks/style-equality.mjs");

type Theme = "dark" | "light";
type Look = "classic" | "glass";

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

const ask = (page: Page, question: KitAsk): Promise<KitAnswer> => page.evaluate(kitChecks, question);
const tokens = (width: Width): KitAsk => ({ check: "tokens", sheet: KIT_SHEET, width, still: STILL_ID });
const twins = async (width: Width): Promise<KitAsk> => ({
  check: "twins",
  sheet: KIT_SHEET,
  width,
  still: STILL_ID,
  tolerance: (await recorder()).EDGE_TOLERANCE,
});

/**
 * Check 2 across its contexts: a rule is drawn when an entry matched it in any of them. What is left is each rule no
 * context drew, but a press's (a rule whose every selector holds :hover, :active or a :focus), named by its selector
 * and its media.
 */
function tally(seen: SeenRule[][]) {
  const byKey = new Map<string, SeenRule>();
  for (const rule of seen.flat()) {
    const was = byKey.get(rule.key);
    byKey.set(rule.key, was ? { ...was, drawn: was.drawn || rule.drawn } : rule);
  }
  const all = [...byKey.values()];
  return {
    all,
    pressed: all.filter((r) => r.press),
    missed: all.filter((r) => !r.press && !r.drawn),
  };
}
const named = (r: SeenRule) => `${r.selector}${r.media ? ` in ${r.media}` : ""}: no entry draws it`;

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

test("every rule of kit.css is drawn by an entry, but a press's: at a desk, on a phone and with reduced motion", async ({
  browser,
  baseURL,
}) => {
  const seen: SeenRule[][] = [];
  for (const [width, reduced] of [
    ["desk", false],
    ["phone", false],
    ["desk", true],
  ] as const) {
    const { context, page } = await open(browser, baseURL, width, reduced);
    try {
      await show(page);
      seen.push((await ask(page, { check: "rules", sheet: KIT_SHEET })).rules);
    } finally {
      await context.close();
    }
  }
  const { all, pressed, missed } = tally(seen);
  console.log(
    `kit rules: ${all.length} in kit.css, ${all.length - pressed.length - missed.length} drawn; left out as a ` +
      `press's: ${pressed.map((r) => r.selector).join(", ") || "none"}`,
  );
  expect(missed.map(named), "rules of kit.css no entry draws, in any of the three").toEqual([]);
});

test("each entry reads its tokens: dark and light, Classic and Glass, desk and phone", async ({ browser, baseURL }) => {
  const failures: string[] = [];
  const reads: string[] = [];
  let exempt = 0;
  for (const width of ["desk", "phone"] as const) {
    const { context, page } = await open(browser, baseURL, width);
    try {
      for (const theme of ["dark", "light"] as const) {
        for (const look of ["classic", "glass"] as const) {
          await show(page, theme, look);
          const a = await ask(page, tokens(width));
          const run = `${width} ${theme} ${look}`;
          reads.push(`${run} ${a.reads}`);
          exempt = a.exempt.length;
          failures.push(...a.failures.map((f) => `${run}: ${f}`));
        }
      }
    } finally {
      await context.close();
    }
  }
  console.log(`token reads per run: ${reads.join(", ")}; entries no rule of kit.css draws yet, so exempt: ${exempt}`);
  expect(failures, "a kit rule that does not read its token where the entry stands").toEqual([]);
});

test("each new primitive draws what its source draws: dark and light, Classic", async ({ browser, baseURL }) => {
  const failures: string[] = [];
  const pairs: string[] = [];
  for (const width of ["desk", "phone"] as const) {
    const { context, page } = await open(browser, baseURL, width);
    try {
      for (const theme of ["dark", "light"] as const) {
        await show(page, theme);
        const a = await ask(page, await twins(width));
        pairs.push(`${width} ${theme} ${a.pairs}`);
        failures.push(...a.failures.map((f) => `${width} ${theme}: ${f}`));
      }
    } finally {
      await context.close();
    }
  }
  console.log(`twins: element pairs compared per run: ${pairs.join(", ")}`);
  expect(failures, "a primitive that does not draw what its source draws").toEqual([]);
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

test("each check fails when what it checks is broken, on faults planted in the page", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    // 1. A class every entry has stopped drawing is named.
    await show(page);
    expect((await ask(page, { check: "classes", classes: REGISTRY })).missing).toEqual([]);
    await page.evaluate(() =>
      document.querySelectorAll("[data-entry]:not([data-source]) .mark").forEach((el) => el.classList.remove("mark")),
    );
    expect((await ask(page, { check: "classes", classes: REGISTRY })).missing).toEqual(["mark"]);

    // 3. A kit rule that reads a role passes where its entry stands; a page's rule over it is named.
    await show(page);
    await plantRules(page, [".gx-probe { background-color: var(--surface-pane-fill); }"]);
    await plantEntries(page, entry("probe", '<div class="gx-probe">A probe</div>'));
    const reading = await ask(page, tokens("desk"));
    expect(theirs(reading, "probe")).toEqual([]);
    expect(reading.readsBy.probe).toBe(1);
    await page.addStyleTag({ content: ".gx-probe { background-color: rgb(9, 9, 9) !important; }" });
    const overridden = theirs(await ask(page, tokens("desk")), "probe");
    expect(overridden, "the page's rule over the kit's").toHaveLength(1);
    expect(overridden[0]).toContain(
      "probe: div.gx-probe background-color: planting --surface-pane-fill changed nothing",
    );

    // 3's two holds: a var() naming a token that is not there, and an entry whose kit rules read no token.
    await show(page);
    await plantRules(page, [
      ".gx-probe-bare { color: var(--gx-no-such-token); }",
      ".gx-probe-plain { display: block; }",
    ]);
    await plantEntries(
      page,
      entry("probe-bare", '<div class="gx-probe-bare">A probe</div>') +
        entry("probe-plain", '<div class="gx-probe-plain">A probe</div>'),
    );
    const holds = await ask(page, tokens("desk"));
    expect(theirs(holds, "probe-bare").join("\n")).toContain(
      "div.gx-probe-bare color reads --gx-no-such-token, which is not defined there",
    );
    expect(theirs(holds, "probe-plain")).toEqual(["probe-plain: its kit rules read no token"]);

    // 2. The probe rule is drawn while its entry stands, and named once the entry is taken away.
    await show(page);
    await plantRules(page, [".gx-probe { background-color: var(--surface-pane-fill); }"]);
    await plantEntries(page, entry("probe", '<div class="gx-probe">A probe</div>'));
    const probeRule = (rules: SeenRule[]) => tally([rules]).missed.filter((r) => r.selector === ".gx-probe");
    expect(probeRule((await ask(page, { check: "rules", sheet: KIT_SHEET })).rules)).toEqual([]);
    await page.evaluate(() => document.querySelector('[data-entry="probe"]')?.remove());
    expect(probeRule((await ask(page, { check: "rules", sheet: KIT_SHEET })).rules).map(named)).toEqual([
      ".gx-probe: no entry draws it",
    ]);

    // 4. A twin that computes what its source does passes; 14px against 15px of padding is named.
    await show(page);
    await plantRules(page, [".gx-probe-twin { padding: 14px; }"]);
    await plantEntries(
      page,
      entry("probe-twin", '<div class="gx-probe-twin">A probe</div>', ' data-twin="probe-source"') +
        entry("probe-source", '<div class="gx-probe-source">A probe</div>', ' data-source="e2e/kit.spec.ts"'),
    );
    const source = await page.addStyleTag({ content: ".gx-probe-source { padding: 14px; }" });
    const equal = await ask(page, await twins("desk"));
    expect(theirs(equal, "probe-twin")).toEqual([]);
    expect(equal.pairs).toBeGreaterThanOrEqual(1);
    await source.evaluate((el) => {
      el.textContent = ".gx-probe-source { padding: 15px; }";
    });
    expect(theirs(await ask(page, await twins("desk")), "probe-twin")).toContain(
      "probe-twin: div.gx-probe-twin padding-top: 14px against 15px in probe-source",
    );

    // 4's boxes and its exceptions: a width the twin excepts is not compared as a longhand, and its box still is.
    await plantRules(page, [".gx-probe-box { display: block; width: 40px; height: 10px; }"]);
    await plantEntries(
      page,
      entry(
        "probe-box",
        '<div class="gx-probe-box"></div>',
        ' data-twin="probe-box-source" data-except="width" data-boxes="true"',
      ) + entry("probe-box-source", '<div class="gx-probe-box-source"></div>', ' data-source="e2e/kit.spec.ts"'),
    );
    await page.addStyleTag({ content: ".gx-probe-box-source { display: block; width: 41px; height: 10px; }" });
    const boxes = theirs(await ask(page, await twins("desk")), "probe-box");
    expect(boxes, "the box alone, the width being excepted").toHaveLength(1);
    expect(boxes[0]).toMatch(
      /^probe-box: div\.gx-probe-box's box [\d.]+ [\d.]+ 40\.00 10\.00 against [\d.]+ [\d.]+ 41\.00 10\.00 in probe-box-source/,
    );
  } finally {
    await context.close();
  }
});
