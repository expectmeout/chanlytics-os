import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { KIT_SKIP_REASON } from "./kit-checks";
import { kitSkeleton, trappedUnder, type SkeletonAsk } from "./kit-behaves-checks";

/**
 * The kit's components with behaviour of their own, run in a browser (docs/plans/2026-09-28-the-interface-kit-and-its-
 * looks.md, step 2.5): the harness's running page for its `kit` record (tooling/scripts/e2e-harness/kit-behaves.tsx,
 * at /behaves), where each is drawn by its own component on the pinned Base UI and the dashboard's React.
 *
 *   corepack pnpm e2e:local -- e2e/kit/kit-behaves.spec.ts --scenario=kit
 *
 * 1. What each component draws, in each state a person brings it to, is its entry in the static gallery
 *    (kit-gallery.mjs), element for element (kit-behaves-checks.ts, kitSkeleton). So the gallery that the class,
 *    rule and token checks read (e2e/kit/kit.spec.ts) draws what the components draw. The node suite cannot hold this:
 *    its stub React runs no Base UI hook, and under its react-server condition React has none to run (see
 *    tooling/scripts/tests/styles/kit-components.test.mjs).
 * 2. What each does, with a keyboard and a pointer: Escape closes the sheet, a menu and the popover and gives focus back
 *    to what opened them; Tab stays inside the sheet, and the page behind it does not scroll; a menu's arrows walk it
 *    and typing finds an item; a switch answers Space and the segmented control the arrows; the combobox narrows its
 *    list and chooses with the keys; the tooltip shows on hover and on focus and hides on Escape; a toast arrives in a
 *    region a screen reader hears and goes on its ×; and a field's problem reaches its box's aria-describedby and
 *    aria-invalid, and leaves it when mended. At a desk and on a phone, in both themes and both looks.
 * 3. In Glass, where a pane or a bar blurs what is behind it and so holds what is fixed inside it, nothing the kit pops
 *    is held: each is portaled to the body, under no ancestor that makes a containing block, and stands by its control.
 * And each check fails when what it checks is broken, shown on faults planted in the page, never on disk. It waits by
 * condition, never for a fixed time; a React or Base UI warning in the console fails the run it came in.
 *
 * Production has no gallery: the nightly skips this with a reason its skip ceiling does not count (skip-ceiling.ts).
 */
test.skip(process.env.E2E_SCENARIO !== "kit", KIT_SKIP_REASON);

/** The recorder's two widths (tooling/scripts/checks/style-equality.mjs), imported as a test runs, as kit.spec.ts does. */
const recorder = () => import("../../tooling/scripts/checks/style-equality.mjs");
/** The static gallery's families, whose entries of the kit's Base UI components the running page draws. */
const gallery = () => import("../../tooling/scripts/e2e-harness/kit-gallery.mjs");
/** What the hold reads of an element, shared with the node suite's hold (kit-shared.mjs). */
const shared = () => import("../../tooling/scripts/e2e-harness/kit-shared.mjs");
/** A skeleton's question, with the attributes it reads. */
const asking = async (ask: object): Promise<SkeletonAsk> => {
  const { MARKUP_READ, MARKUP_PRESENT } = await shared();
  return { ...ask, read: MARKUP_READ, present: MARKUP_PRESENT } as SkeletonAsk;
};

type Width = "desk" | "phone";
type Theme = "dark" | "light";
type Look = "classic" | "glass";
type Run = { width: Width; theme: Theme; look: Look };
const label = (r: Run) => `${r.width} ${r.theme} ${r.look}`;
const EVERY: Run[] = (["desk", "phone"] as const).flatMap((width) =>
  (["dark", "light"] as const).flatMap((theme) =>
    (["classic", "glass"] as const).map((look) => ({ width, theme, look })),
  ),
);

/** How long a condition may take to come true before the check says it did not. */
const WAIT_MS = 5000;

/** A context of a width, and what the page said in its console that it should not have. */
async function open(browser: Browser, baseURL: string | undefined, width: Width) {
  const { VIEWPORTS } = await recorder();
  const context: BrowserContext = await browser.newContext({ ...VIEWPORTS[width], baseURL });
  const page = await context.newPage();
  const said: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") said.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => said.push(`pageerror: ${e.message}`));
  return { context, page, said };
}

/** The running page in a theme and a look, its components drawn. */
async function show(page: Page, theme: Theme = "dark", look: Look = "classic") {
  await page.goto(`/behaves?theme=${theme}&look=${look}`);
  await page.waitForSelector('[data-entry="field-kit-wrong"] .rec-field');
  await page.evaluate(() => document.fonts.ready);
}

/** Whether a condition in the page comes true within the wait: the one way this spec waits. */
async function met<A>(page: Page, predicate: (arg: A) => boolean, arg: A, timeout = WAIT_MS): Promise<boolean> {
  try {
    await page.waitForFunction(predicate, arg, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** The portals Base UI holds on the body now, by id. */
const portalIds = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll("body > [data-base-ui-portal]")).map((p) => p.id));

/** What the element focused now is, in words: its test id, its name, or its tag and its words. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "the page's body";
    return (
      el.getAttribute("data-testid") ??
      el.getAttribute("aria-label") ??
      `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`
    );
  });

/* ---- 1. what each draws, held to its gallery entry ---- */

/** Each state the spec brings a component to, by the gallery entry it draws, and how it is brought there. */
const STATES: { entry: string; bring: (page: Page) => Promise<void>; ready: string }[] = [
  { entry: "sheet-kit", bring: (p) => p.getByTestId("sheet-open").click(), ready: "section.sheet" },
  { entry: "menu-kit", bring: (p) => p.getByTestId("menu-open").click(), ready: ".more-menu" },
  { entry: "menu-kit-set", bring: (p) => p.getByTestId("menu-set-open").click(), ready: ".more-menu" },
  { entry: "popover-kit", bring: (p) => p.getByTestId("popover-open").click(), ready: ".panel-pop" },
  { entry: "tooltip-kit", bring: (p) => p.getByTestId("tooltip-trigger").hover(), ready: ".ui-tip.show" },
  {
    entry: "select-kit",
    bring: (p) => p.locator('[data-entry="select-kit"] .rec-select').click(),
    ready: ".rec-combo-pop [data-highlighted]",
  },
  {
    entry: "combobox-kit",
    bring: async (p) => {
      await p.getByRole("combobox", { name: "Languages" }).click();
      await p.keyboard.type("Sp");
    },
    ready: ".rec-combo-pop [data-highlighted]",
  },
  { entry: "switch-kit", bring: async () => undefined, ready: ".rec-switch" },
  { entry: "segmented-kit", bring: async () => undefined, ready: ".rec-seg" },
  { entry: "segmented-kit-hints", bring: async () => undefined, ready: ".rec-seg[data-hints]" },
  { entry: "field-kit", bring: async () => undefined, ready: ".rec-input-group" },
  { entry: "field-kit-wrong", bring: async () => undefined, ready: ".field-error" },
];

/** The entry's static HTML, from the gallery's families. */
async function galleryHtml(entry: string): Promise<string> {
  const { FAMILIES } = await gallery();
  const found = FAMILIES.flatMap((f: { entries: { id: string; html: string }[] }) => f.entries).find(
    (e: { id: string }) => e.id === entry,
  );
  if (!found) throw new Error(`the gallery has no entry ${entry}`);
  return found.html;
}

/** One state held to its entry: what the gallery draws and what the component drew, each spelled, or the difference. */
async function holdState(page: Page, state: (typeof STATES)[number]): Promise<string[]> {
  const before = await portalIds(page);
  await state.bring(page);
  if (!(await met(page, (sel) => !!document.querySelector(sel), state.ready)))
    return [`${state.entry}: never drew ${state.ready}`];
  const portals = (await portalIds(page)).filter((id) => !before.includes(id));
  const drawn = await page.evaluate(kitSkeleton, await asking({ entry: state.entry, portals }));
  const written = await page.evaluate(kitSkeleton, await asking({ html: await galleryHtml(state.entry) }));
  return drawn === written ? [] : [`${state.entry}: the gallery draws ${written}\n  the component ${drawn}`];
}

/** The toasts' region, held to its entry: the region is the page's from its first draw, so it is read from its portal. */
async function holdToast(page: Page): Promise<string[]> {
  await page.getByTestId("sheet-open").click();
  await page.getByTestId("sheet-save").click();
  if (!(await met(page, () => !!document.querySelector(".pp-toast .pp-toast-msg"), null)))
    return ["toast-kit: no toast"];
  const portal = await page.evaluate(() => document.querySelector(".pp-toast-stack")?.parentElement?.id ?? "");
  const drawn = await page.evaluate(kitSkeleton, await asking({ portals: [portal] }));
  const written = await page.evaluate(kitSkeleton, await asking({ html: await galleryHtml("toast-kit") }));
  return drawn === written ? [] : [`toast-kit: the gallery draws ${written}\n  the component ${drawn}`];
}

test("each of the kit's Base UI components draws its gallery entry, in each state a person brings it to", async ({
  browser,
  baseURL,
}) => {
  const { context, page, said } = await open(browser, baseURL, "desk");
  const failures: string[] = [];
  try {
    for (const state of STATES) {
      await show(page);
      failures.push(...(await holdState(page, state)));
    }
    await show(page);
    failures.push(...(await holdToast(page)));
  } finally {
    await context.close();
  }
  console.log(`held: ${STATES.length + 1} states of the kit's components, each against its gallery entry`);
  expect(failures, "a component and its gallery entry that part").toEqual([]);
  expect(said, "what the page said in its console").toEqual([]);
});

/* ---- 2. what each does ---- */

type Check = (page: Page, run: Run) => Promise<string[]>;

/** Opened from its control by the keyboard, closed by Escape, and focus given back to the control. */
const escapeGivesFocusBack =
  (name: string, opener: string, popup: string): Check =>
  async (page) => {
    await page.getByTestId(opener).focus();
    await page.keyboard.press("Enter");
    if (!(await met(page, (sel) => !!document.querySelector(sel), popup)))
      return [`${name}: Enter on its control did not open it`];
    await page.keyboard.press("Escape");
    if (!(await met(page, (sel) => !document.querySelector(sel), popup))) return [`${name}: Escape left it open`];
    const back = await focused(page);
    return back === opener ? [] : [`${name}: focus went to ${back}, not back to its control (${opener})`];
  };

const sheetEscape = escapeGivesFocusBack("the sheet", "sheet-open", "section.sheet");
const menuEscape = escapeGivesFocusBack("the menu", "menu-open", ".more-menu");
const popoverEscape = escapeGivesFocusBack("the popover", "popover-open", ".panel-pop");

/** Tab and Shift+Tab walk the sheet's own controls and never leave it. */
const tabStaysInSheet: Check = async (page) => {
  await page.getByTestId("sheet-open").click();
  if (!(await met(page, () => !!document.activeElement?.closest("section.sheet"), null)))
    return ["the sheet: focus did not go into it as it opened"];
  const stops = await page.evaluate(
    () =>
      Array.from(
        document.querySelectorAll("section.sheet button, section.sheet input, section.sheet [tabindex]"),
      ).filter((el) => (el as HTMLElement).tabIndex >= 0).length,
  );
  const out: string[] = [];
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < stops + 2; i++) {
      await page.keyboard.press(key);
      // Base UI keeps focus in with a guard at either end, which hands it back in as it arrives: judge where it settles.
      await met(page, () => !document.activeElement?.hasAttribute("data-base-ui-focus-guard"), null);
      const inside = await page.evaluate(() => !!document.activeElement?.closest("section.sheet"));
      if (!inside) {
        out.push(`the sheet: ${key} took focus to ${await focused(page)}, outside the sheet`);
        break;
      }
    }
  }
  return out;
};

/**
 * The page behind the sheet holds still: a wheel over its wash moves nothing, where the same wheel over the sheet's rows
 * scrolls them, which is the condition waited for (the wheel over the wash was dispatched first).
 */
const pageHoldsStill: Check = async (page, run) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("sheet-open").click();
  if (!(await met(page, () => !!document.querySelector("section.sheet .rec-row"), null)))
    return ["the sheet: it did not open"];
  const wash = run.width === "desk" ? { x: 200, y: 450 } : { x: 195, y: 40 };
  await page.mouse.move(wash.x, wash.y);
  await page.mouse.wheel(0, 900);
  const rows = await page.locator("section.sheet .rec-sheet-body").boundingBox();
  if (!rows) return ["the sheet: no rows to scroll"];
  await page.mouse.move(rows.x + rows.width / 2, rows.y + Math.min(rows.height / 2, 120));
  await page.mouse.wheel(0, 300);
  const scrolled = await met(
    page,
    () => {
      const sheet = document.querySelector("section.sheet");
      return !!sheet && [sheet, ...Array.from(sheet.querySelectorAll("*"))].some((el) => el.scrollTop > 0);
    },
    null,
  );
  if (!scrolled)
    return ["the sheet: its own rows did not scroll under a wheel, so the wheel over the wash proves nothing"];
  const behind = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
  return behind === 0 ? [] : [`the page behind the sheet scrolled ${behind}px under a wheel over its wash`];
};

/** The menu's arrows walk its items, and typing finds one. */
const menuKeys: Check = async (page) => {
  await page.getByTestId("menu-open").focus();
  await page.keyboard.press("ArrowDown");
  if (!(await met(page, () => document.activeElement?.classList.contains("more-item") === true, null)))
    return ["the menu: ArrowDown on its control put focus on no item"];
  const out: string[] = [];
  const first = await focused(page);
  if (!first.includes("Copy number")) out.push(`the menu: it opened on ${first}, not its first item`);
  await page.keyboard.press("ArrowDown");
  const next = await focused(page);
  if (!next.includes("Send booking link")) out.push(`the menu: ArrowDown went to ${next}, not the next item`);
  await page.keyboard.press("ArrowUp");
  const back = await focused(page);
  if (!back.includes("Copy number")) out.push(`the menu: ArrowUp went to ${back}, not the item before`);
  await page.keyboard.type("de");
  const found = await met(page, () => (document.activeElement?.textContent ?? "").includes("Delete person"), null);
  if (!found) out.push(`the menu: typing "de" found ${await focused(page)}, not "Delete person…"`);
  await page.keyboard.press("Escape");
  return out;
};

/** A switch answers Space, twice; the read-only one keeps its state. */
const switchSpace: Check = async (page) => {
  const out: string[] = [];
  const now = page.getByRole("switch", { name: "Send it now" });
  await now.focus();
  await page.keyboard.press("Space");
  if (
    !(await met(
      page,
      () => document.querySelector('[aria-label="Send it now"]')?.getAttribute("aria-checked") === "true",
      null,
    ))
  )
    out.push("the switch: Space did not turn it on");
  await page.keyboard.press("Space");
  if (
    !(await met(
      page,
      () => document.querySelector('[aria-label="Send it now"]')?.getAttribute("aria-checked") === "false",
      null,
    ))
  )
    out.push("the switch: Space again did not turn it off");
  const locked = page.getByRole("switch", { name: "Take calls" });
  await locked.focus();
  await page.keyboard.press("Space");
  const kept = await page.evaluate(() =>
    document.querySelector('[aria-label="Take calls"]')?.getAttribute("aria-checked"),
  );
  if (kept !== "true") out.push("the switch: Space moved a read-only switch");
  return out;
};

/** The segmented control: the arrows choose the next and the one before, wrapping, focus going with them. */
const segmentedArrows: Check = async (page) => {
  const out: string[] = [];
  const checked = () =>
    page.evaluate(() => {
      const group = document.querySelector('[data-entry="segmented-kit"] [role="radiogroup"]');
      const on = group?.querySelector('[aria-checked="true"]');
      return { on: on?.textContent ?? "", focus: document.activeElement === on };
    });
  await page.locator('[data-entry="segmented-kit"] [aria-checked="true"]').focus();
  for (const [key, want] of [
    ["ArrowRight", "Every month"],
    ["ArrowRight", "Once"],
    ["ArrowLeft", "Every month"],
  ] as const) {
    await page.keyboard.press(key);
    const ok = await met(
      page,
      (w) => {
        const on = document.querySelector('[data-entry="segmented-kit"] [aria-checked="true"]');
        return on?.textContent === w && document.activeElement === on;
      },
      want,
    );
    if (!ok)
      out.push(`the segmented control: ${key} chose ${JSON.stringify(await checked())}, not "${want}" with focus`);
  }
  return out;
};

/**
 * The combobox narrows its list as you type, draws none where nothing matches, walks it with the arrows and chooses
 * with Enter; and a search after a choice replaces the words chosen, since focus selects them.
 */
const comboboxKeys: Check = async (page) => {
  const out: string[] = [];
  await page.getByRole("combobox", { name: "Languages" }).click();
  await page.keyboard.type("sp");
  const narrowed = await met(page, () => document.querySelectorAll(".rec-combo-pop [role=option]").length === 2, null);
  if (!narrowed) {
    const n = await page.evaluate(() => document.querySelectorAll(".rec-combo-pop [role=option]").length);
    return [`the combobox: "sp" left ${n} options, not the 2 that match`];
  }
  // Words nothing matches draw no list: never an empty pane under the box. Taken back, the matches come back.
  await page.keyboard.type("q");
  const none = await met(
    page,
    () => {
      const pop = document.querySelector(".rec-combo-pop");
      return !!pop && !pop.querySelector("[role=option]") && pop.getBoundingClientRect().height === 0;
    },
    null,
  );
  if (!none) out.push("the combobox: words nothing matches drew an empty list under the box");
  await page.keyboard.press("Backspace");
  await met(page, () => document.querySelectorAll(".rec-combo-pop [role=option]").length === 2, null);
  const walked = () =>
    page.evaluate(() => document.querySelector(".rec-combo-pop [data-highlighted]")?.textContent ?? "");
  if (!(await walked()).startsWith("Spanish"))
    out.push(`the combobox: typing walked to ${await walked()}, not the first match`);
  await page.keyboard.press("ArrowDown");
  if (
    !(await met(
      page,
      () =>
        (document.querySelector(".rec-combo-pop [data-highlighted]")?.textContent ?? "").startsWith("Spanish, Mexico"),
      null,
    ))
  )
    out.push(`the combobox: ArrowDown walked to ${await walked()}, not the next match`);
  await page.keyboard.press("Enter");
  const chosen = await met(
    page,
    () =>
      !document.querySelector(".rec-combo-pop [role=option]") &&
      (document.querySelector('[data-entry="combobox-kit"] figcaption')?.textContent ?? "").includes("chosen: es-MX"),
    null,
  );
  if (!chosen) out.push("the combobox: Enter did not choose the match walked to and close the list");
  const said = await page.getByRole("combobox", { name: "Languages" }).inputValue();
  if (said !== "Spanish, Mexico") out.push(`the combobox: its box says "${said}" after the choice`);
  await page.getByRole("combobox", { name: "Languages" }).click();
  await page.keyboard.type("en");
  const replaced = await met(
    page,
    () =>
      (document.querySelector<HTMLInputElement>('input[aria-label="Languages"]')?.value ?? "") === "en" &&
      document.querySelectorAll(".rec-combo-pop [role=option]").length === 1,
    null,
  );
  if (!replaced) {
    const box = await page.getByRole("combobox", { name: "Languages" }).inputValue();
    out.push(`the combobox: a search after a choice made "${box}", not "en" over its one match`);
  }
  return out;
};

/** The tooltip shows on hover and hides as the pointer leaves; shows on keyboard focus and hides on Escape. */
const tooltipShows: Check = async (page) => {
  const out: string[] = [];
  const shown = () =>
    !!document.querySelector(".ui-tip.show") &&
    getComputedStyle(document.querySelector(".tip-place")!).display !== "none";
  await page.getByTestId("tooltip-trigger").hover();
  if (!(await met(page, shown, null))) out.push("the tooltip: hovering its control showed no tip");
  await page.mouse.move(2, 2);
  if (!(await met(page, () => !document.querySelector(".ui-tip.show"), null)))
    out.push("the tooltip: it stayed as the pointer left");
  await page.getByTestId("popover-open").focus();
  await page.keyboard.press("Tab");
  if ((await focused(page)) !== "tooltip-trigger")
    return [...out, `the tooltip: Tab went to ${await focused(page)}, not its control`];
  if (!(await met(page, shown, null))) out.push("the tooltip: focus from the keyboard showed no tip");
  await page.keyboard.press("Escape");
  if (!(await met(page, () => !document.querySelector(".ui-tip.show"), null)))
    out.push("the tooltip: Escape did not hide it");
  return out;
};

/** A toast arrives in a region a screen reader hears, is reached by F6, and goes on its ×. */
const toastArrives: Check = async (page) => {
  const out: string[] = [];
  await page.getByTestId("sheet-open").click();
  await page.getByTestId("sheet-save").click();
  if (!(await met(page, () => !!document.querySelector(".pp-toast .pp-toast-msg"), null)))
    return ["the toast: Save raised none"];
  const heard = await page.evaluate(() => {
    const toast = document.querySelector(".pp-toast");
    const region = toast?.closest("[aria-live]");
    return { live: region?.getAttribute("aria-live") ?? null, words: toast?.textContent ?? "" };
  });
  if (heard.live !== "polite" && heard.live !== "assertive")
    out.push(`the toast: it arrived in no live region (${heard.live})`);
  if (!heard.words.includes("Saved for every line.")) out.push(`the toast: it says "${heard.words}"`);
  await page.keyboard.press("F6");
  if (!(await met(page, () => !!document.activeElement?.closest(".pp-toast-stack"), null)))
    out.push(`the toast: F6 took focus to ${await focused(page)}, not the toasts`);
  await page.locator(".pp-toast-x").click();
  if (!(await met(page, () => !document.querySelector(".pp-toast"), null)))
    out.push("the toast: its × left it standing");
  return out;
};

/** A field's problem is its box's description and marks it invalid; mended, the box is valid and its hint describes it. */
const fieldProblem: Check = async (page) => {
  const out: string[] = [];
  const wiring = () =>
    page.evaluate(() => {
      const box = document.querySelector<HTMLInputElement>('[data-entry="field-kit-wrong"] input.rec-input');
      const ids = (box?.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const said = ids.map((id) => document.getElementById(id)?.textContent ?? `(no #${id})`).join(" | ");
      return { invalid: box?.getAttribute("aria-invalid") ?? null, said };
    });
  const wrong = await wiring();
  if (wrong.invalid !== "true") out.push(`the field: a problem left its box aria-invalid=${wrong.invalid}`);
  if (!wrong.said.includes("A website starts with https://."))
    out.push(`the field: its box is described by "${wrong.said}", not its problem`);
  await page.locator('[data-entry="field-kit-wrong"] input.rec-input').fill("https://example.com/northside");
  const mended = await met(
    page,
    () => {
      const box = document.querySelector('[data-entry="field-kit-wrong"] input.rec-input');
      return (
        !!box &&
        box.getAttribute("aria-invalid") !== "true" &&
        !document.querySelector('[data-entry="field-kit-wrong"] .field-error')
      );
    },
    null,
  );
  if (!mended) out.push("the field: mended, it stayed invalid");
  const right = await wiring();
  if (!right.said.includes("Where they read about you."))
    out.push(`the field: mended, its box is described by "${right.said}", not its hint`);
  return out;
};

const CHECKS: [string, Check][] = [
  ["Escape closes the sheet, and focus goes back", sheetEscape],
  ["Escape closes the menu, and focus goes back", menuEscape],
  ["Escape closes the popover, and focus goes back", popoverEscape],
  ["Tab stays inside the sheet", tabStaysInSheet],
  ["the page behind the sheet holds still", pageHoldsStill],
  ["the menu's arrows and typing", menuKeys],
  ["a switch answers Space", switchSpace],
  ["the segmented control answers the arrows", segmentedArrows],
  ["the combobox narrows and chooses by the keys", comboboxKeys],
  ["the tooltip shows on hover and on focus, and hides on Escape", tooltipShows],
  ["a toast is heard and goes on its ×", toastArrives],
  ["a field's problem is wired to its box", fieldProblem],
];

test("each behaves with a keyboard and a pointer, at a desk and on a phone, in both themes and both looks", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(8 * 60_000);
  const failures: string[] = [];
  for (const width of ["desk", "phone"] as const) {
    const { context, page, said } = await open(browser, baseURL, width);
    try {
      for (const run of EVERY.filter((r) => r.width === width)) {
        for (const [name, check] of CHECKS) {
          await show(page, run.theme, run.look);
          failures.push(...(await check(page, run)).map((f) => `${label(run)}: ${name}: ${f}`));
        }
      }
    } finally {
      await context.close();
    }
    failures.push(...said.map((s) => `${width}: the console: ${s}`));
  }
  console.log(`behaviour: ${CHECKS.length} checks in each of ${EVERY.length} runs (${EVERY.map(label).join(", ")})`);
  expect(failures, "what a component did not do").toEqual([]);
});

/* ---- 3. in Glass, nothing the kit pops is held under a blur ---- */

/** Each popup, opened from its control, and the element that roots it on the body. */
const POPS: { name: string; bring: (page: Page) => Promise<void>; root: string; control: string | null }[] = [
  { name: "the sheet", bring: (p) => p.getByTestId("sheet-open").click(), root: "section.sheet", control: null },
  {
    name: "a menu in the sheet's foot, under its glass bar",
    bring: async (p) => {
      await p.getByTestId("sheet-open").click();
      await p.getByTestId("sheet-menu").click();
    },
    root: ".pop-place",
    control: '[data-testid="sheet-menu"]',
  },
  {
    name: "the menu",
    bring: (p) => p.getByTestId("menu-open").click(),
    root: ".pop-place",
    control: '[data-testid="menu-open"]',
  },
  {
    name: "the popover",
    bring: (p) => p.getByTestId("popover-open").click(),
    root: ".pop-place",
    control: '[data-testid="popover-open"]',
  },
  {
    name: "the select's list",
    bring: (p) => p.locator('[data-entry="select-kit"] .rec-select').click(),
    root: ".pop-place:not([hidden])",
    control: '[data-entry="select-kit"] .rec-select',
  },
  {
    name: "the tooltip",
    bring: (p) => p.getByTestId("tooltip-trigger").hover(),
    root: ".tip-place",
    control: '[data-testid="tooltip-trigger"]',
  },
  {
    name: "the toasts",
    bring: async (p) => {
      await p.getByTestId("sheet-open").click();
      await p.getByTestId("sheet-save").click();
    },
    root: ".pp-toast-stack",
    control: null,
  },
];

/** A popup held by nothing: on the body, under no containing block, and by its control (within its height and a half). */
async function heldByNothing(page: Page, pop: (typeof POPS)[number]): Promise<string[]> {
  await pop.bring(page);
  if (
    !(await met(
      page,
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.getBoundingClientRect().height > 0;
      },
      pop.root,
    ))
  )
    return [`${pop.name}: never drawn`];
  const trap = await page.evaluate(trappedUnder, pop.root);
  const out: string[] = [];
  if (!trap.underBody) out.push(`${pop.name}: not portaled to the body (its outermost portal stands elsewhere)`);
  out.push(...trap.holders.map((h) => `${pop.name}: held by ${h}`));
  if (pop.control) {
    const apart = await page.evaluate(
      ({ root, control }) => {
        const a = document.querySelector(root)!.getBoundingClientRect();
        const b = document.querySelector(control)!.getBoundingClientRect();
        const gap = Math.min(Math.abs(a.top - b.bottom), Math.abs(b.top - a.bottom));
        return { gap, reach: b.height * 1.5 + 12 };
      },
      { root: pop.root, control: pop.control },
    );
    if (apart.gap > apart.reach) out.push(`${pop.name}: stands ${Math.round(apart.gap)}px from its control`);
  }
  return out;
}

test("in Glass, nothing the kit pops is held under a blurred pane or bar: each is on the body, by its control", async ({
  browser,
  baseURL,
}) => {
  const failures: string[] = [];
  for (const width of ["desk", "phone"] as const) {
    const { context, page } = await open(browser, baseURL, width);
    try {
      for (const theme of ["dark", "light"] as const) {
        for (const pop of POPS) {
          await show(page, theme, "glass");
          failures.push(...(await heldByNothing(page, pop)).map((f) => `${width} ${theme} glass: ${f}`));
        }
      }
    } finally {
      await context.close();
    }
  }
  expect(failures, "a popup held in place of the window").toEqual([]);
});

/* ---- the checks' own proof: each fails when what it checks is broken ---- */

test("the hold names a class a component stopped drawing, and an attribute it drew otherwise", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    await show(page);
    const menu = STATES.find((s) => s.entry === "menu-kit")!;
    expect(await holdState(page, menu)).toEqual([]);
    await show(page);
    // Planted in the component's own drawing: the danger item loses its class as it is drawn.
    await page.evaluate(() => {
      new MutationObserver(() => document.querySelector(".more-item.danger")?.classList.remove("danger")).observe(
        document.body,
        {
          subtree: true,
          childList: true,
        },
      );
    });
    const parted = await holdState(page, menu);
    expect(parted).toHaveLength(1);
    expect(parted[0]).toMatch(/^menu-kit: the gallery draws .*button\.danger\.more-item/);
    await show(page);
    // Planted on a switch already drawn: its role said otherwise.
    await page.evaluate(() => document.querySelector('[aria-label="Send it now"]')?.setAttribute("role", "checkbox"));
    const switched = await holdState(
      page,
      STATES.find((s) => s.entry === "switch-kit")!,
    );
    expect(switched[0]).toMatch(/role=checkbox/);
  } finally {
    await context.close();
  }
});

test("the behaviour checks name each fault planted: Escape, Tab, the scroll, the combobox's list and words, the tip, the field", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await open(browser, baseURL, "desk");
  const run: Run = { width: "desk", theme: "dark", look: "classic" };
  try {
    // Escape swallowed before Base UI hears it.
    await show(page);
    await page.evaluate(() =>
      window.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") e.stopImmediatePropagation();
        },
        true,
      ),
    );
    expect(await sheetEscape(page, run)).toEqual(["the sheet: Escape left it open"]);

    // Tab let out: the sheet's focus guards taken away, so Tab walks past its last control.
    await show(page);
    await page.getByTestId("sheet-open").click();
    await met(page, () => !!document.activeElement?.closest("section.sheet"), null);
    await page.keyboard.press("Escape");
    await met(page, () => !document.querySelector("section.sheet"), null);
    await page.evaluate(() => {
      new MutationObserver(() =>
        document.querySelectorAll("[data-base-ui-focus-guard]").forEach((g) => g.remove()),
      ).observe(document.body, { subtree: true, childList: true });
    });
    const tabbed = await tabStaysInSheet(page, run);
    expect(tabbed.some((f) => /Tab took focus to .*outside the sheet/.test(f))).toBe(true);

    // The page scrolled: Base UI's lock undone by a stylesheet.
    await show(page);
    await page.addStyleTag({ content: "html, body { overflow: auto !important; }" });
    const scrolled = await pageHoldsStill(page, run);
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]).toMatch(/^the page behind the sheet scrolled \d+px/);

    // An empty list drawn, where the record kit's state for it says it is not.
    await show(page);
    await page.addStyleTag({ content: ".rec-combo-pop[hidden] { display: block !important; }" });
    const emptied = await comboboxKeys(page, run);
    expect(emptied).toEqual(["the combobox: words nothing matches drew an empty list under the box"]);

    // The chosen words left unselected by the press that opens the list, so a search lands where the press did.
    await show(page);
    await page.evaluate(() => window.addEventListener("mouseup", (e) => e.stopPropagation(), true));
    const appended = await comboboxKeys(page, run);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatch(/^the combobox: a search after a choice made "Spanish, [^"]*en[^"]*", not "en"/);

    // A tip never shown.
    await show(page);
    await page.addStyleTag({ content: ".tip-place { display: none !important; }" });
    const tipless = await tooltipShows(page, run);
    expect(tipless).toContain("the tooltip: hovering its control showed no tip");

    // A field whose box is not marked.
    await show(page);
    await page.evaluate(() => {
      const unmark = () => {
        const box = document.querySelector('[data-entry="field-kit-wrong"] input.rec-input');
        if (box?.hasAttribute("aria-invalid")) box.removeAttribute("aria-invalid");
      };
      unmark();
      new MutationObserver(unmark).observe(document.body, { subtree: true, attributes: true, childList: true });
    });
    expect((await fieldProblem(page, run))[0]).toBe("the field: a problem left its box aria-invalid=null");
  } finally {
    await context.close();
  }
});

test("the Glass check names a popup held under a blur, and one standing away from its control", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await open(browser, baseURL, "desk");
  try {
    await show(page, "dark", "glass");
    await page.addStyleTag({ content: "body { backdrop-filter: blur(2px); }" });
    const menu = POPS.find((p) => p.name === "the menu")!;
    const held = await heldByNothing(page, menu);
    expect(held.some((f) => /^the menu: held by body: backdrop-filter blur\(2px\)/.test(f))).toBe(true);
    await show(page, "dark", "glass");
    await page.addStyleTag({ content: ".pop-place { margin-top: 400px; }" });
    const away = await heldByNothing(page, menu);
    expect(away.some((f) => /^the menu: stands \d+px from its control/.test(f))).toBe(true);
  } finally {
    await context.close();
  }
});
