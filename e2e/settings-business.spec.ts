import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { expectFocusInside, expectNoSidewaysScroll } from "./signals";

/**
 * Settings › Business on a real workspace: the record, and the things only a browser can show about it.
 *
 * The page is made of three gestures -- a value edited in its row, a set of fields folded open under the row that
 * states them, and a list in a sheet beside the page -- and every one of them moves FOCUS. The unit suite draws the
 * page on a stub React that never attaches a ref, so not one of those moves is testable there: it cannot see that a
 * removed shift left a keyboard at the top of the document, that "Keep editing" answered an ask and abandoned the
 * person on `<body>`, or that a sheet's Save sat under a toast. Each of those was a real defect or a real risk in
 * review (the plan's Task 3.7 notes, 21-22 Sep), and each is a line here.
 *
 * The rule this spec keeps: it NEVER leaves the shared e2e workspace changed. Every editor it opens it cancels, and
 * `expectRecordUnchanged` re-reads the config at the end of each test that typed anything and compares it, field for
 * field, with the one the test started from. The one Save it presses (a row's sheet on a touch phone, which is only
 * proved by saving) is taken by a stand-in for the settings door put on the page by that test, never by the workspace.
 *
 * "On screen" is toBeInViewport({ ratio: 1 }) throughout: a bare toBeVisible, and a bare toBeInViewport, both pass a
 * control clipped to a sliver, which is how the QR that nobody could scan passed its check (21 Sep, #809).
 */

/** The record as Settings reads it. */
const ROUTE = "#/admin/workspace";
/** The pane the record is read in, which is what scrolls when something on it is laid out past the edge. */
const PANE = ".set-pane";

/** The page is a Settings pane; the head is drawn only once the settings read has a brain to draw. */
async function openRecord(page: Page): Promise<void> {
  await page.goto(`/${ROUTE}`);
  await expect(page.getByTestId("bt-head")).toBeVisible({ timeout: 40_000 });
}

/** What GET settings holds, for the comparison that proves nothing was saved. */
async function readConfig(page: Page): Promise<unknown> {
  const res = await apiGet(page, "/api/v1/settings");
  expect(res.status()).toBe(200);
  const { data } = (await res.json()) as { data: { config: unknown; version: number } };
  return { config: data.config, version: data.version };
}

/** The workspace is as it was found: the spec opens editors, it never saves one. */
async function expectRecordUnchanged(page: Page, before: unknown): Promise<void> {
  expect(await readConfig(page), "the journey changed the shared workspace").toEqual(before);
}

const foldOf = (page: Page, id: string): Locator => page.getByTestId(`rec-fold-${id}`);
const actOf = (page: Page, id: string): Locator => page.getByTestId(`rec-row-act-${id}`);
/**
 * Every fold on the page that is open. A closed one is drawn and `hidden`, so "open" is what a person can see; on a
 * phone an open fold is a sheet from the bottom (record-fold.jsx), drawn in the app's root with the fold's test id.
 */
const openFolds = (page: Page): Locator => page.locator(".rec-fold:not([hidden]), .rec-fold-sheet");

/** Open a row's fold by pressing the act the row states it with, never by its place on the page. */
async function openFold(page: Page, id: string): Promise<Locator> {
  await actOf(page, id).click();
  const fold = foldOf(page, id);
  await expect(fold).toBeVisible();
  return fold;
}

/**
 * Throw away whatever the test typed: Cancel, and the ask it raises when something was typed. Answering "Yes,
 * discard" is how this spec ends an editor; the one Save it presses goes to a stand-in (the header says which).
 */
async function discard(page: Page, id: string, kind: "fold" | "sheet" = "fold"): Promise<void> {
  await page.getByTestId(`rec-${kind}-cancel-${id}`).click();
  const yes = page.getByTestId(`rec-${kind}-${id}-cancel-yes`);
  if (await yes.count()) await yes.click();
  if (kind === "fold") await expect(foldOf(page, id)).toBeHidden();
  else await expect(page.getByTestId(`rec-sheet-${id}`)).toHaveCount(0);
}

/** The services sheet, opened from the row that states the list. */
async function openServices(page: Page): Promise<Locator> {
  await actOf(page, "services").click();
  const sheet = page.getByTestId("rec-sheet-services");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Every service the sheet is drawing, whatever the record came with: an added row is one more, never the only one. */
const serviceRows = (page: Page): Locator => page.locator('[data-testid^="rec-service-"][data-rec-row]');

/** Add `n` services to the open sheet, each by the Add the sheet offers, and answer with how many rows there are. */
async function addServices(page: Page, n: number): Promise<number> {
  const was = await serviceRows(page).count();
  for (let i = 0; i < n; i++) await page.getByTestId("rec-services-add").click();
  await expect(serviceRows(page)).toHaveCount(was + n);
  return was;
}

/** Two boxes' rectangles overlap. Both are on screen, so a null rectangle is a failure, not a pass. */
async function boxOf(where: Locator, what: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const b = await where.boundingBox();
  expect(b, `${what} has no box on screen`).not.toBeNull();
  return { x: b!.x, y: b!.y, w: b!.width, h: b!.height };
}
const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The record, quiet (the plan's Task 4.0), checked the only way it can be: by computed style, in a browser.
 *
 * The owner read the page on 22 September and named three things before he read a word of it -- gradients, a second
 * typeface, and lines he could do nothing about. All three were taken out in CSS, and CSS is exactly what the unit
 * suite cannot execute: a mutant that put the fold's gradient back passed 265 tests. So the journey that already opens
 * every fold at a phone's width asks the page what it is actually painting.
 */
async function expectQuiet(page: Page, where: string): Promise<void> {
  const loud = await page.evaluate(() => {
    const gradients: string[] = [];
    const monospace: string[] = [];
    const hints: string[] = [];
    // The cards, and a fold open on a phone, which is a sheet drawn in the app's root rather than in its card.
    for (const card of document.querySelectorAll(".rec-card, .rec-fold-sheet")) {
      for (const el of [card, ...card.querySelectorAll("*")]) {
        const cs = getComputedStyle(el);
        const name = el.className || el.tagName;
        if (cs.backgroundImage.includes("gradient")) gradients.push(`${name}: ${cs.backgroundImage.slice(0, 48)}`);
        if (/mono/i.test(cs.fontFamily) && (el.textContent ?? "").trim()) monospace.push(`${name}: ${cs.fontFamily}`);
      }
      // A row that HAS its fact says it and stops: its hint is a sentence the editor says again over the box.
      for (const row of card.querySelectorAll('.rec-row[data-empty="false"]')) {
        for (const hint of row.querySelectorAll(".rec-row-hint")) {
          if (getComputedStyle(hint).display !== "none") hints.push(`${row.getAttribute("data-testid")}`);
        }
      }
    }
    return { gradients, monospace, hints };
  });
  expect(loud.gradients, `${where}: a gradient is painted inside the record`).toEqual([]);
  expect(loud.monospace, `${where}: the record reads in a second typeface`).toEqual([]);
  expect(loud.hints, `${where}: a filled row carries a hint at a phone's width`).toEqual([]);
}

/**
 * What it can do, at a phone's width (the plan's Tasks 4.1 and 4.1b).
 *
 * A row that is whole keeps its sentence for a screen reader and OFF SCREEN, which is one CSS rule and nothing a unit
 * test can execute: deleting `.bt-can-says`'s visually-hidden rule leaves the whole suite green and puts six
 * two-clause paragraphs on the card, which is the clutter the owner named. So the page is asked what it is laying
 * out -- and, beside it, that a row nothing does reads like one rather than drawing a lit glyph beside "No number
 * yet".
 */
/**
 * The five strength badges in the rules fold sit in ONE place.
 *
 * On a phone `.bt-rule-head` wrapped: a badge went under its label where the label was long and stayed inline where
 * it was short, so the same signal appeared in two positions down one fold, and an owner scanning for it had to read
 * every row. One position, measured against each badge's own label rather than the viewport, since the labels start
 * at the same edge and a badge that moved with its label would still be wrong.
 */
async function expectRuleBadgesInLine(page: Page, where: string): Promise<void> {
  const badges = await page.evaluate(() =>
    [...document.querySelectorAll(".bt-rule")].map((row) => {
      const label = row.querySelector(".bt-rule-label")!.getBoundingClientRect();
      const chip = row.querySelector(".bt-rule-chip")?.getBoundingClientRect();
      return {
        id: row.getAttribute("data-testid"),
        dx: chip ? Math.round(chip.left - label.left) : null,
        ownLine: chip ? chip.top >= label.bottom - 1 : null,
      };
    }),
  );
  expect(badges.length, `${where}: four rules and the photos switch`).toBe(5);
  for (const b of badges) expect(b.dx, `${where}: ${b.id} wears a badge`).not.toBeNull();
  expect(
    [...new Set(badges.map((b) => b.dx))],
    `${where}: every badge starts at the same offset from its label`,
  ).toHaveLength(1);
  for (const b of badges) expect(b.ownLine, `${where}: ${b.id}'s badge is on its own line under the label`).toBe(true);
}

async function expectAbilitiesQuiet(page: Page, where: string): Promise<void> {
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="rec-card-can"]');
    if (!el) return null;
    const boxes = [...el.querySelectorAll(".bt-can-says")].map((n) => {
      const r = n.getBoundingClientRect();
      const s = getComputedStyle(n);
      return { w: Math.round(r.width), h: Math.round(r.height), clipped: s.clipPath !== "none" };
    });
    const rows = [...el.querySelectorAll(".bt-can-row")].map((r) => ({
      id: r.getAttribute("data-testid"),
      ready: r.getAttribute("data-ready"),
      why: !!r.querySelector(".bt-can-why"),
      ink: getComputedStyle(r.querySelector(".rec-row-key") as Element).color,
      lit: r.querySelectorAll('.rec-can-chip[data-on="true"]').length,
    }));
    // --ink-dim as this card's own ground resolves it, for the row nothing does.
    const probe = document.createElement("span");
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--ink-dim").trim();
    el.appendChild(probe);
    const dim = getComputedStyle(probe).color;
    probe.remove();
    return { boxes, rows, dim, limits: el.querySelectorAll(".bt-cannot-row").length };
  });
  expect(card, `${where}: What it can do is on the record`).not.toBeNull();
  expect(card!.rows.length, `${where}: six abilities`).toBe(6);
  // Every ability that draws no sentence on screen, and every limit, keeps one for a reader.
  expect(card!.limits, `${where}: the three limits`).toBe(3);
  expect(card!.boxes.length, `${where}: every ability and every limit keeps its sentence`).toBe(
    card!.rows.filter((r) => !r.why).length + card!.limits,
  );
  expect(card!.boxes.length, `${where}: and there are some to keep`).toBeGreaterThan(3);
  for (const b of card!.boxes) {
    expect(b, `${where}: a sentence kept for a reader is not laid out`).toMatchObject({ w: 1, h: 1, clipped: true });
  }
  expect(
    card!.rows.some((r) => r.why),
    `${where}: the row this record can fix does say so`,
  ).toBe(true);
  for (const r of card!.rows) {
    expect(r.lit > 0, `${where}: ${r.id} is lit on a channel exactly when it does something there`).toBe(
      r.ready === "true",
    );
    if (r.ready === "true") expect(r.why, `${where}: ${r.id} is whole, so it draws no sentence`).toBe(false);
    else expect(r.ink, `${where}: ${r.id} does nothing, and reads like it`).toBe(card!.dim);
  }
}

/**
 * A sheet, quiet, by what the browser paints inside it (the plan's Phase 5, under Task 4.0's rule): no bordered pill,
 * no gradient, one typeface, no colour but the house's neutrals and its accent (and `also`, the tokens a sheet's own
 * controls paint: a switch's on and its knob), and no count on the glass -- in the prompt sheet a block's cost is its
 * share, and "1,190 characters" is the entry's description, visually hidden.
 */
async function expectSheetQuiet(
  page: Page,
  selector: string,
  where: string,
  also: string[] = [],
  counts = false,
): Promise<void> {
  const loud = await page.evaluate(
    ({ selector, also }) => {
      const sheet = document.querySelector(selector);
      if (!sheet) return null;
      const root = getComputedStyle(document.documentElement);
      // Each token as the browser resolves it, so a colour is compared with what the stylesheet may paint.
      const probe = document.createElement("span");
      sheet.appendChild(probe);
      const tokens = new Set(["rgba(0, 0, 0, 0)"]);
      for (const t of [
        "--ink",
        "--ink-muted",
        "--ink-dim",
        "--ink-faint",
        "--bg",
        "--bg-raised",
        "--bg-sunken",
        "--bg-hover",
        "--bg-active",
        "--line",
        "--line-strong",
        "--accent",
        ...also,
      ]) {
        probe.style.color = root.getPropertyValue(t).trim();
        tokens.add(getComputedStyle(probe).color);
      }
      probe.remove();
      const gradients: string[] = [];
      const pills: string[] = [];
      const colours: string[] = [];
      const faces = new Set<string>();
      for (const el of [sheet, ...sheet.querySelectorAll("*")]) {
        const cs = getComputedStyle(el);
        const name = `${el.tagName.toLowerCase()}.${String(el.className || "").split(" ")[0]}`;
        if (cs.display === "none") continue;
        if (cs.backgroundImage.includes("gradient")) gradients.push(name);
        const r = el.getBoundingClientRect();
        if (r.height > 0 && parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderTopLeftRadius) >= r.height / 2)
          pills.push(name);
        if ([...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) faces.add(cs.fontFamily);
        for (const c of [cs.color, cs.backgroundColor]) if (!tokens.has(c)) colours.push(`${name}: ${c}`);
      }
      // What is on the glass: text outside a visually hidden span, in something laid out.
      const seen: string[] = [];
      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || el.closest(".rec-sr") || el.getClientRects().length === 0) continue;
        seen.push(n.textContent ?? "");
      }
      return {
        gradients,
        pills,
        colours,
        faces: [...faces],
        counts: seen.join(" ").match(/\d[\d,]*\s*characters?/g) ?? [],
      };
    },
    { selector, also },
  );
  expect(loud, `${where}: the sheet is open`).not.toBeNull();
  expect(loud!.gradients, `${where}: a gradient in the sheet`).toEqual([]);
  expect(loud!.pills, `${where}: a bordered pill in the sheet`).toEqual([]);
  expect(loud!.faces, `${where}: one typeface`).toHaveLength(1);
  expect(loud!.colours, `${where}: a colour outside the tokens`).toEqual([]);
  if (counts) expect(loud!.counts, `${where}: a character count on the glass`).toEqual([]);
}

/** The prompt sheet: quiet, and no character count on its glass. */
const expectPromptSheetQuiet = (page: Page, where: string): Promise<void> =>
  expectSheetQuiet(page, '[data-testid="rec-sheet-prompt"]', where, [], true);

/** A fold open on a phone is a sheet; its switches paint the two tokens a switch is drawn in, on and its knob. */
const SWITCH_TOKENS = ["--ok", "--knob"];

/**
 * Every control in a sheet takes a finger: 44px tall AND 44px wide, by its box or by the reach it draws around itself
 * (an ::after laid over it, which is how the kit's switch keeps its shape and takes its 44px from the space around it).
 * Wide as well as tall: a shift's remove drawn in a phone's sheet was 44px tall and 26px wide.
 */
async function expectFingerSized(page: Page, selector: string, where: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const sheet = document.querySelector(sel);
    if (!sheet) return null;
    const out: string[] = [];
    const controls = sheet.querySelectorAll(
      'button, a[href], input, textarea, select, [role="switch"], [role="radio"], [role="combobox"], [tabindex="0"]',
    );
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      const after = getComputedStyle(el, "::after");
      const laid = after.content && after.content !== "none" && after.position === "absolute";
      const tall = Math.max(r.height, laid ? r.height - parseFloat(after.top) - parseFloat(after.bottom) : 0);
      const wide = Math.max(r.width, laid ? r.width - parseFloat(after.left) - parseFloat(after.right) : 0);
      // Half a pixel for the layout's own rounding: a 44px floor measures 43.99 inside a flex row.
      if (tall < 43.5 || wide < 43.5) {
        const name = el.getAttribute("aria-label") || (el.textContent ?? "").trim().slice(0, 24);
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${name}": ${wide.toFixed(1)}x${tall.toFixed(1)}px`,
        );
      }
    }
    return out;
  }, selector);
  expect(small, `${where}: the sheet is open`).not.toBeNull();
  expect(small, `${where}: a control shorter than a finger`).toEqual([]);
}

/**
 * The settings door, stood in for on the page, so a Save a test presses never reaches the workspace this spec shares
 * (its rule, above): it takes what the page sends, answers as the bridge does when the server takes it (onSaved, then
 * the read again, which is what the page draws its rows from), and keeps what it was sent. Tagged, so a test can say
 * the door is still this one at the moment it saves. Answers the config the page read, for the comparison.
 */
async function standInSave(page: Page): Promise<any> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    w.__e2eTook = [];
    w.__saveSettings = (config: unknown, version: number, onSaved: (s: unknown) => void) => {
      const saved = { config: JSON.parse(JSON.stringify(config)), version: version + 1 };
      w.__e2eTook.push({ config: saved.config, version });
      onSaved(saved);
      w.__SETTINGS = { ...w.__SETTINGS, config: saved.config, version: saved.version };
      window.dispatchEvent(new CustomEvent("surface:settings"));
      return Promise.resolve({ ok: true });
    };
    w.__saveSettings.__e2e = true;
  });
  return page.evaluate(() =>
    JSON.parse(JSON.stringify((window as unknown as { __SETTINGS: { config: unknown } }).__SETTINGS.config)),
  );
}
/**
 * The door the page will call is still the stand-in: a bridge that installed its verbs again since would send a real
 * PUT to the shared workspace before a test's own check of what was sent could fail.
 */
async function expectStandIn(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => (window as unknown as { __saveSettings?: { __e2e?: boolean } }).__saveSettings?.__e2e),
    "the settings door is no longer the stand-in",
  ).toBe(true);
}

/** Every motion running on the elements `selector` finds, as the browser runs it: what moves, for how long, how. */
type Motion = { prop: string; ms: number; easing: string };
async function motionsOn(page: Page, selector: string): Promise<Motion[][]> {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((el) =>
        el.getAnimations().map((a) => {
          const named = a as unknown as { transitionProperty?: string; animationName?: string };
          const effect = a.effect as KeyframeEffect;
          return {
            prop: named.transitionProperty ?? named.animationName ?? "",
            ms: Number(effect.getComputedTiming().duration),
            // A transition's easing is its effect's; an animation's is its keyframes' (rise-in's, from the rule).
            easing: String(named.animationName ? effect.getKeyframes()[0]?.easing : effect.getTiming().easing),
          };
        }),
      ),
    selector,
  );
}
/** The house's easings, as tokens.css spells them and the browser hands them back. */
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.7, 0, 0.84, 0)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";
/** Wait out whatever is moving, so the next step starts from rest. */
const settled = (page: Page): Promise<unknown> =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));

/**
 * The four motions of spec §9, and each of them gone under reduced motion, measured on the page as it runs them. The
 * stub the unit suite draws on runs no stylesheet and draws no frame, so this is the only place any of it is proved:
 * the value becoming its field, a fold arriving as a sheet beside the page and leaving by its edge, the one line of
 * what it will be told that the draft changed, and the save settling. `reduced` is whether the page was asked for
 * reduced motion, where every one is none. And through all of it the page holds still: a row keeps its height as it
 * becomes its editor, and the card behind a sheet does not move as the sheet comes or goes (23 Sep: the in-page fold
 * pushed everything under it down by up to 546px).
 */
async function expectMotions(page: Page, reduced: boolean): Promise<void> {
  const where = reduced ? "under reduced motion" : "with motion";
  const none = (m: Motion[][], what: string) => expect(m.flat(), `${what} moves ${where}`).toEqual([]);
  /** Where the row after the fold stands in its card: what must hold still whatever the pane scrolls to. */
  const still = () =>
    page
      .getByTestId("rec-row-notes")
      .evaluate((el) =>
        Math.round(el.getBoundingClientRect().top - el.closest(".rec-card")!.getBoundingClientRect().top),
      );

  // 1. The value becomes its field: the editor's body fades in on 120ms, the label holds still, the caret is at the
  // end of what is there, and the row keeps its height (the editor is the row's one line, its Save and Cancel where
  // the act was).
  await settled(page);
  const rowHeight = await page.getByTestId("rec-row-website").evaluate((el) => el.getBoundingClientRect().height);
  const inline = await page.evaluate(async () => {
    (document.querySelector('[data-testid="rec-row-act-website"]') as HTMLElement).click();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const box = document.activeElement as HTMLInputElement | null;
    return { at: box?.selectionStart ?? null, end: box?.value.length ?? null, inside: !!box?.closest(".rec-inline") };
  });
  expect(inline, `${where}: focus in the website's box, the caret at the end of what is there`).toEqual({
    at: inline.end,
    end: inline.end,
    inside: true,
  });
  const body = await motionsOn(page, '[data-testid="rec-inline-website"] .rec-inline-body');
  if (reduced) none(body, "the value becoming its field");
  else
    expect(body, "the value becomes its field in a 120ms cross-fade").toEqual([
      [{ prop: "opacity", ms: 120, easing: EASE_OUT }],
    ]);
  none(await motionsOn(page, '[data-testid="rec-inline-website"] .rec-inline-key'), "the label");
  const editorHeight = await page.getByTestId("rec-inline-website").evaluate((el) => el.getBoundingClientRect().height);
  expect(
    Math.abs(editorHeight - rowHeight),
    `${where}: the row changed height as it became its editor`,
  ).toBeLessThanOrEqual(2);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rec-inline-website")).toBeHidden();

  // 2. A fold opens as a sheet beside the page (record-fold.jsx frame="sheet", which every fold of this tab is), and
  // comes in from its edge as every side sheet does (components.css side-in, 260ms on --ease-out), its wash fading in
  // with it; the row it opened from stays in its card behind it, and nothing on the page moves.
  await settled(page);
  const at = await still();
  await actOf(page, "escalate_when").click();
  const fold = '[role="dialog"][data-testid="rec-fold-escalate_when"]';
  await expect(page.locator(fold)).toBeVisible();
  const sheetIn = await motionsOn(page, fold);
  const washIn = await motionsOn(page, ".rec-sheet-backdrop[data-fold]");
  if (reduced) {
    none(sheetIn, "the sheet arriving");
    none(washIn, "the sheet's wash");
  } else {
    expect(sheetIn, "the sheet comes in from its edge").toEqual([[{ prop: "side-in", ms: 260, easing: EASE_OUT }]]);
    expect(washIn, "and its wash fades in").toEqual([[{ prop: "wash-in", ms: 200, easing: EASE_OUT }]]);
  }
  await settled(page);
  expect(await still(), `${where}: the card behind the open sheet moved`).toBe(at);
  await expect(
    page.locator(".rec-fold-behind").getByTestId("rec-row-escalate_when"),
    "the row behind the sheet",
  ).toHaveCount(1);

  // 3. The line the draft just changed washes, and no other. Two reasons typed, one after the other: the block the
  // first leaves is what the second is a change OF.
  await settled(page);
  const box = page.locator(`${fold} textarea`).first();
  const one = `${(await box.inputValue()).trim()}\nThey ask about a gift card`.trim();
  await box.fill(one);
  await settled(page);
  await box.fill(`${one}\nThey ask about parking`);
  const lines = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} .rec-says-line`)].map((l) => ({
        text: l.textContent ?? "",
        changed: l.getAttribute("data-changed") === "true",
      })),
    fold,
  );
  const washing = await motionsOn(page, `${fold} .rec-says-line`);
  expect(
    lines.filter((l) => l.changed).map((l) => l.text),
    `${where}: the one line the second reason added is the changed one`,
  ).toEqual([expect.stringContaining("They ask about parking")]);
  lines.forEach((l, i) => {
    if (l.changed && !reduced)
      expect(washing[i], "the changed line washes over 400ms, once").toEqual([
        { prop: "background-color", ms: 400, easing: EASE_OUT },
      ]);
    else expect(washing[i], `${where}: "${l.text.slice(0, 40)}" washes`).toEqual([]);
  });

  // 4. It leaves by its edge as it closes (side-out, faster, on --ease-in), by a still copy React no longer holds
  // (record-fold.jsx recSheetLeaves): the fold is closed and focus is back on the row's act at once, nothing in what
  // leaves can be found or pressed, it is gone as its slide ends, and the card behind holds still throughout.
  await settled(page);
  await page.getByTestId("rec-fold-cancel-escalate_when").click();
  await page.getByTestId("rec-fold-escalate_when-cancel-yes").click();
  const closing = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const copy = document.querySelector('.rec-fold-sheet[data-leaving="true"]');
    const wash = document.querySelector('.rec-sheet-backdrop[data-leaving="true"]');
    const moving = (el: Element | null) =>
      el
        ? el.getAnimations().map((a) => ({
            prop: (a as unknown as { animationName: string }).animationName,
            ms: Number((a.effect as KeyframeEffect).getComputedTiming().duration),
            easing: String((a.effect as KeyframeEffect).getKeyframes()[0]?.easing),
          }))
        : null;
    return {
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      focus: document.activeElement?.getAttribute("data-testid"),
      copy: moving(copy),
      wash: moving(wash),
      named: copy ? copy.querySelectorAll("[id], [data-testid]").length + (copy.getAttribute("role") ? 1 : 0) : 0,
    };
  });
  expect(closing.dialogs, "the fold is closed the moment it is").toBe(0);
  expect(closing.focus, "and focus is back on its row's act at once").toBe("rec-row-act-escalate_when");
  if (reduced) expect([closing.copy, closing.wash], "nothing leaves under reduced motion").toEqual([null, null]);
  else {
    expect(closing.copy, "it leaves by its edge on --ease-in").toEqual([
      { prop: "side-out", ms: 180, easing: EASE_IN },
    ]);
    expect(closing.wash, "its wash fading with it").toEqual([{ prop: "wash-out", ms: 160, easing: EASE_IN }]);
    expect(closing.named, "and nothing in what leaves can be found, named or pressed").toBe(0);
  }
  await expect(page.locator('[data-leaving="true"]'), "what leaves is gone as its slide ends").toHaveCount(0);
  await expect(page.locator(fold)).toHaveCount(0);
  expect(await still(), `${where}: the card moved once the sheet had gone`).toBe(at);

  // 5. The save settle: the row its save draws again lets its value arrive on rise-in.
  await settled(page);
  await actOf(page, "tone").click();
  const voice = page.locator('[data-testid="rec-fold-tone"] textarea').first();
  await voice.fill((await voice.inputValue()) === "Calm and kind." ? "Warm, and never in a hurry." : "Calm and kind.");
  await expectStandIn(page);
  await page.getByTestId("rec-fold-save-tone").click();
  await expect(page.getByTestId("rec-row-tone")).toHaveAttribute("data-settled", "true");
  const arriving = await motionsOn(page, '[data-testid="rec-row-tone"] .rec-row-val');
  if (reduced) none(arriving, "the saved value arriving");
  else
    expect(arriving, "the saved value arrives on rise-in").toEqual([[{ prop: "rise-in", ms: 200, easing: EASE_OUT }]]);
  await settled(page);
}

test.describe("Settings › Business on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the standing line's door opens the row it names, and focus lands inside it and comes back to the act", async ({
    page,
  }) => {
    const before = await readConfig(page);
    await openRecord(page);

    // Three clauses and, where something is missing, the one gap most worth closing -- which is the door to it.
    const standing = page.getByTestId("rec-standing");
    await expect(standing).toBeInViewport({ ratio: 1 });
    await expect(standing).toContainText(/\S/);

    const door = page.getByTestId("rec-standing-door");
    if ((await door.count()) === 0) {
      // A record with no gap states no gap, and offers no door to one. Nothing else here to prove.
      await expect(standing).toHaveAttribute("data-state", "ok");
      return;
    }
    await door.click();
    // The door opens ONE editor, as a row's own act does, and focus is in it rather than on the document.
    await expect(openFolds(page)).toHaveCount(1);
    const id = (await openFolds(page).first().getAttribute("data-testid"))!.replace("rec-fold-", "");
    await expectFocusInside(page, `[data-testid="rec-fold-${id}"]`, "the door opened a fold and left focus outside it");

    await discard(page, id);
    // As it closes, focus goes back to the act of the row it opened from (record-fold.jsx recFocusBack).
    await expect(actOf(page, id)).toBeFocused();
    await expectRecordUnchanged(page, before);
  });

  test("Cancel with changes asks, and Keep editing puts focus back in the fold rather than on the document", async ({
    page,
  }) => {
    const before = await readConfig(page);
    await openRecord(page);

    await openFold(page, "tone");
    const box = foldOf(page, "tone").locator("textarea").first();
    await box.click();
    await box.fill("Warm, and never in a hurry.");

    await page.getByTestId("rec-fold-cancel-tone").click();
    const ask = page.getByTestId("rec-fold-tone-cancel-confirm");
    await expect(ask).toBeVisible();
    await expect(ask).toContainText("Discard your changes?");
    // The fold is still open behind the question: nothing was thrown away by asking.
    await expect(foldOf(page, "tone")).toBeVisible();

    await page.getByTestId("rec-fold-tone-cancel-no").click();
    await expect(ask).toHaveCount(0);
    // "Keep editing" takes the ask -- and the button focus was on -- off the page. Focus comes back into the fold.
    await expectFocusInside(page, '[data-testid="rec-fold-tone"]', 'focus was dropped by "Keep editing"');

    await discard(page, "tone");
    await expect(actOf(page, "tone")).toBeFocused();
    await expectRecordUnchanged(page, before);
  });

  test("a shift's remove, an Add and an item of the week's copy menu each leave focus in the fold", async ({
    page,
  }) => {
    const before = await readConfig(page);
    await openRecord(page);

    const hours = await openFold(page, "hours");
    // A day that is open has a shift; a second one is the break this fold offers to add.
    const monday = hours.getByTestId("rec-hours-day-mon");
    if ((await monday.getAttribute("data-open")) !== "true") await monday.getByTestId("rec-hours-switch-mon").click();
    await expect(monday).toHaveAttribute("data-open", "true");
    await hours.getByTestId("rec-hours-add-mon").click();

    // Where the person was: the first shift's opening time, which the remove does not take away.
    const firstOpen = hours.locator("#bt-hours-mon-0-open");
    await firstOpen.click();
    await hours.getByTestId("rec-hours-remove-mon-1").click();
    // Focus was on the remove, which went with its row. It comes back to the last FIELD the person was in.
    await expect(firstOpen, "a removed shift left focus on the document").toBeFocused();

    // The copy menu: its item goes with the menu that closed, and focus must not go with it.
    await hours.getByTestId("rec-hours-copy").getByRole("button").first().click();
    const item = page.getByRole("menuitem").first();
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.getByRole("menuitem")).toHaveCount(0);
    await expectFocusInside(page, '[data-testid="rec-fold-hours"]', "an item of the copy menu dropped focus");

    await discard(page, "hours");
    await expectRecordUnchanged(page, before);
  });

  test("a closed day's Add puts focus in the new row's first box, and its remove puts focus back in the row above", async ({
    page,
  }) => {
    const before = await readConfig(page);
    await openRecord(page);

    const closures = await openFold(page, "closures");
    const add = closures.getByTestId("rec-closures-add");
    if ((await add.count()) === 0) {
      // A list already at its cap says so where Add was, and there is nothing to add here.
      await expect(closures.getByTestId("rec-closures-cap")).toBeVisible();
      await discard(page, "closures");
      return;
    }
    await add.click();
    // Not on Add: the next thing a person does is type into the row they just made.
    await expectFocusInside(page, '[data-testid="rec-closure-0"]', "Add left focus on itself");
    const firstDate = closures.locator("#bt-closure-0-date");
    await expect(firstDate).toBeFocused();

    await add.click();
    await firstDate.click();
    await closures.getByTestId("rec-closure-remove-1").click();
    await expect(firstDate, "a removed closed day left focus on the document").toBeFocused();

    await discard(page, "closures");
    await expectRecordUnchanged(page, before);
  });

  test("a press beside an open editor lands on its wash and is its Cancel: nothing typed, the sheet closes and focus is back on the act", async ({
    page,
  }) => {
    // Every fold of this tab is a modal sheet beside the page (record-fold.jsx frame="sheet"), so what lies over the
    // page beside it is its wash, and a press there is the fold's Cancel -- with nothing typed, the sheet simply goes
    // (the click that once landed on the page and had to survive a redraw lands here now).
    const before = await readConfig(page);
    await openRecord(page);

    const sheet = await openFold(page, "tone");
    // A point on screen beside the sheet, whatever the pane scrolled to bring the row in reach: 40px left of the
    // sheet's own edge, half-way down it.
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    const beside = { x: Math.max(8, box!.x - 40), y: box!.y + box!.height / 2 };
    expect(
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? null, beside),
      "what lies over the page beside the sheet is not its wash",
    ).toBe("rec-sheet-backdrop");
    await page.mouse.click(beside.x, beside.y);
    await expect(foldOf(page, "tone")).toBeHidden();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(actOf(page, "tone")).toBeFocused();

    // A redraw meanwhile opens nothing: the settings surface being read once more, which the page listens for.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("surface:settings")));
    await expect(openFolds(page)).toHaveCount(0);
    await expectRecordUnchanged(page, before);
  });

  test("a language typed into the box and left there by focus is added", async ({ page }) => {
    const before = await readConfig(page);
    await openRecord(page);

    const fold = await openFold(page, "languages");
    const box = fold.getByTestId("rec-languages-add").locator("input");
    if (!(await box.isVisible())) {
      // A full list offers no box: the sentence that says why stands where it was.
      await expect(fold.getByTestId("rec-languages-cap")).toBeVisible();
      await discard(page, "languages");
      return;
    }
    const tokens = page.locator('[data-testid="rec-languages-tokens"] .bt-token');
    const already = (await tokens.allInnerTexts()).map((t) => t.trim().toLowerCase());
    // One this record does not answer in yet, whatever it already answers in: the check is the gesture, not the word.
    const fresh = ["Portuguese", "Swedish", "Finnish", "Czech", "Greek"].find(
      (l) => !already.includes(l.toLowerCase()),
    );
    expect(fresh, "this record already answers in every language the check could type").toBeTruthy();
    const was = await tokens.count();
    await box.click();
    await box.fill(fresh!);
    // Leaving the box is the gesture: the old form's box added what was typed as it lost focus, and a box that only
    // closed dropped the language, so the fold saved without it (Task 3.5's onLeave). Tab leaves it for the next
    // control in the sheet; a click on the page beside a modal sheet would land on its wash, which is its Cancel.
    await page.keyboard.press("Tab");
    await expect(tokens).toHaveCount(was + 1);
    await expect(fold.getByTestId("rec-languages-tokens")).toContainText(fresh!);

    await discard(page, "languages");
    await expectRecordUnchanged(page, before);
  });

  test("the Add that fills a list to its cap becomes the sentence, and focus stays in the fold", async ({ page }) => {
    const before = await readConfig(page);
    await openRecord(page);

    const fold = await openFold(page, "languages");
    const box = fold.getByTestId("rec-languages-add").locator("input");
    // Added from IN the box, one at a time, until the list is full. The box is hidden rather than removed, and a
    // hidden box keeps focus until the browser's next rendering update and then hands it to the document, which is the
    // one place focus must never be left (the kit's useRecFocusHold; this journey is where that was measured).
    for (let i = 0; i < 8 && (await box.isVisible()); i++) {
      await box.click();
      await box.fill(`Language ${i + 1}`);
      await page.keyboard.press("Enter");
    }
    await expect(fold.getByTestId("rec-languages-cap"), "the list never filled to its cap").toBeVisible();
    await expect(box, "the box to add one stayed beside the cap's sentence").toBeHidden();
    await expectFocusInside(page, '[data-testid="rec-fold-languages"]', "the Add that filled the list dropped focus");

    await discard(page, "languages");
    await expectRecordUnchanged(page, before);
  });

  test("the services sheet keeps focus from its opening to its close, the toast's Undo included", async ({ page }) => {
    const before = await readConfig(page);
    await openRecord(page);

    const sheet = await openServices(page);
    // As it opens, focus is on the sheet itself, so a screen reader names the dialog.
    await expect(sheet).toBeFocused();

    const rows = page.locator('[data-testid^="rec-service-"][data-rec-row]');
    const was = await rows.count();
    await page.getByTestId("rec-services-add").click();
    await expect(rows).toHaveCount(was + 1);
    // A row the list has just been given takes focus in its first box, not on the Add that made it.
    await expect(sheet.locator(`#svc-${was}-name`)).toBeFocused();
    await sheet.locator(`#svc-${was}-name`).fill("Balayage");

    // A remove leaves an Undo where the row was, inside the sheet, where Tab can still reach it.
    await page.getByTestId(`rec-service-remove-${was}`).click();
    const undo = page.locator('[data-testid^="rec-service-undo-"]').first();
    await expect(undo).toBeInViewport({ ratio: 1 });
    await expect(undo, "the Undo left where the row was did not take focus").toBeFocused();

    await undo.click();
    await expect(rows).toHaveCount(was + 1);
    await expect(sheet.locator(`#svc-${was}-name`), "the row put back did not take focus").toBeFocused();

    // The toast is the house's undo and echoes the same removal, outside the dialog's Tab ring. Pressing it takes the
    // toast -- and the button focus is on -- off the page, and focus must come back into the sheet, never to `<body>`.
    await page.getByTestId(`rec-service-remove-${was}`).click();
    const toastUndo = page.locator(".pp-toast .pp-toast-cta", { hasText: "Undo" }).last();
    await expect(toastUndo).toBeInViewport({ ratio: 1 });
    await toastUndo.focus();
    await toastUndo.click();
    await expectFocusInside(page, ".rec-sheet", "the toast's Undo left focus outside the sheet");

    // Escape with something typed asks rather than throwing it away, and Keep editing brings focus back in.
    await page.keyboard.press("Escape");
    const ask = page.getByTestId("rec-sheet-services-cancel-confirm");
    await expect(ask).toBeVisible();
    await page.getByTestId("rec-sheet-services-cancel-no").click();
    await expect(ask).toHaveCount(0);
    await expectFocusInside(page, ".rec-sheet", 'the sheet dropped focus on "Keep editing"');

    await discard(page, "services", "sheet");
    // As the sheet closes, focus goes back to the act that opened it.
    await expect(actOf(page, "services")).toBeFocused();
    await expectRecordUnchanged(page, before);
  });

  test("the services sheet fits a phone: three boxes to a row, the remove at its right, and a foot that holds still", async ({
    page,
  }) => {
    const before = await readConfig(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openRecord(page);
    await openServices(page);

    const rows = page.locator('[data-testid^="rec-service-"][data-rec-row]');
    const was = await rows.count();
    await page.getByTestId("rec-services-add").click();
    await expect(rows).toHaveCount(was + 1);

    // A service's three boxes stack into ONE row: its name across the top with the remove at the right, and how long
    // it takes beside its price under them.
    const row = page.getByTestId(`rec-service-${was}`);
    const whole = await boxOf(row, "the service's row");
    const name = await boxOf(row.locator(".bt-service-name"), "the name box");
    // The name's own box is INSIDE .bt-service-name, beside the consult-first mark; the row's other two are its own.
    const minutes = await boxOf(row.locator(":scope > .rec-box").nth(0), "the minutes box");
    const price = await boxOf(row.locator(":scope > .rec-box").nth(1), "the price box");
    const remove = await boxOf(page.getByTestId(`rec-service-remove-${was}`), "the remove");
    expect(Math.abs(name.y - remove.y), "the remove is not on the name's line").toBeLessThan(name.h);
    expect(Math.round(remove.x + remove.w), "the remove is not at the row's right edge").toBe(
      Math.round(whole.x + whole.w),
    );
    expect(minutes.y, "how long it takes is not under the name").toBeGreaterThan(name.y + name.h - 1);
    expect(Math.abs(minutes.y - price.y), "the price is not beside how long it takes").toBeLessThan(4);
    expect(price.x, "the price is not to the right of how long it takes").toBeGreaterThan(minutes.x);

    // Neither the page nor the sheet scrolls sideways.
    await expectNoSidewaysScroll(page, "the services sheet on a phone", [PANE]);
    const body = page.locator(".rec-sheet-body");
    expect(
      await body.evaluate((el) => el.scrollWidth - el.clientWidth),
      "the sheet's rows scroll sideways",
    ).toBeLessThanOrEqual(1);

    // Enough rows that the list actually scrolls, then: the foot holds still under them. (The columns' head is not
    // drawn at this width -- the row's shape names them -- so there is nothing of it to hold.)
    for (let i = 0; i < 12 && (await body.evaluate((el) => el.scrollHeight <= el.clientHeight)); i++) {
      await page.getByTestId("rec-services-add").click();
    }
    expect(
      await body.evaluate((el) => el.scrollHeight > el.clientHeight),
      "the sheet's rows never came to scroll",
    ).toBe(true);
    const footBefore = await boxOf(page.locator(".rec-sheet-foot"), "the sheet's foot");
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const footAfter = await boxOf(page.locator(".rec-sheet-foot"), "the sheet's foot");
    expect(footAfter.y, "the foot moved when the rows scrolled").toBe(footBefore.y);
    await expect(page.getByTestId("rec-sheet-save-services")).toBeInViewport({ ratio: 1 });

    await discard(page, "services", "sheet");
    await expectRecordUnchanged(page, before);
  });

  test("the sheet's columns head holds still over the rows it names", async ({ page }) => {
    const before = await readConfig(page);
    await openRecord(page);
    await openServices(page);
    const body = page.locator(".rec-sheet-body");
    for (let i = 0; i < 24 && (await body.evaluate((el) => el.scrollHeight <= el.clientHeight)); i++) {
      await page.getByTestId("rec-services-add").click();
    }
    expect(
      await body.evaluate((el) => el.scrollHeight > el.clientHeight),
      "the sheet's rows never came to scroll",
    ).toBe(true);
    const head = page.locator(".bt-service-head");
    const headBefore = await boxOf(head, "the columns' head");
    const footBefore = await boxOf(page.locator(".rec-sheet-foot"), "the sheet's foot");
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect((await boxOf(head, "the columns' head")).y, "the columns' head scrolled away from its rows").toBe(
      headBefore.y,
    );
    expect(
      (await boxOf(page.locator(".rec-sheet-foot"), "the sheet's foot")).y,
      "the foot moved when the rows scrolled",
    ).toBe(footBefore.y);
    await discard(page, "services", "sheet");
    await expectRecordUnchanged(page, before);
  });

  test("what the receptionist is told opens as a sheet from its door, walks to a block, opens a row, and closes back to the door", async ({
    page,
  }) => {
    const before = await readConfig(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRecord(page);
    const door = page.getByTestId("rec-prompt-open");
    const sheet = page.getByTestId("rec-sheet-prompt");
    const blocks = sheet.locator('[data-testid^="rec-prompt-block-"]');

    // The told section's door opens the sheet, and focus is on the sheet, so a screen reader names the dialog.
    await door.click();
    await expect(sheet).toBeFocused();
    await expect(page.getByTestId("rec-prompt-contents")).toBeVisible();

    // An entry takes the reader to its block: the last one, which starts below the fold of a long prompt.
    const entries = sheet.locator(".bt-prompt-entry");
    expect(await entries.count(), "one entry per block").toBe(await blocks.count());
    const last = entries.last();
    const id = (await last.getAttribute("data-testid"))!.slice("rec-prompt-entry-".length);
    await last.click();
    const block = page.getByTestId(`rec-prompt-block-${id}`);
    await expect(block).toBeInViewport();
    await expect(block, "the block it walked to takes focus, so a keyboard reads on from it").toBeFocused();
    // A block's door is latent until the block is approached (spec §11): walked to and focused, its door is drawn.
    const settled = () =>
      page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
    const opacity = (l: Locator) => l.evaluate((el) => getComputedStyle(el).opacity);
    if (await block.locator(".bt-prompt-door").count()) {
      await settled();
      expect(await opacity(block.locator(".bt-prompt-door")), "the focused block's door is drawn").toBe("1");
    }

    // Escape closes the sheet, and focus goes back to the door that opened it.
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(door).toBeFocused();

    // A block's door lands in the row's editor: the sheet goes, and focus is inside the fold or the inline editor it
    // opened. Escape then closes that editor, since nothing was typed. The seeded workspace's prompt is the product's
    // own opening lines, which no row of the page writes, so every block it has is the platform's and offers no door:
    // that is asserted instead, and the door is walked on the salon's record.
    await door.click();
    await expect(sheet).toBeFocused();
    const rowDoors = sheet.locator('[data-testid^="rec-prompt-door-"]:not([data-testid="rec-prompt-door-services"])');
    if ((await rowDoors.count()) === 0) {
      expect(
        await sheet.locator('[data-testid^="rec-prompt-block-platform"]').count(),
        "a block a row wrote offers its door",
      ).toBe(await blocks.count());
      await sheet.getByRole("button", { name: "Close" }).first().click();
      await expect(sheet).toHaveCount(0);
      await expect(door).toBeFocused();
    } else {
      // At rest, with the pointer away from every block, no door is drawn; the pointer on a block draws its door.
      await page.mouse.move(0, 0);
      await settled();
      expect(
        await sheet.locator(".bt-prompt-door").evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity)),
        "a door drawn at rest on a desktop",
      ).toEqual(Array(await sheet.locator(".bt-prompt-door").count()).fill("0"));
      await rowDoors.first().locator("xpath=ancestor::section[1]").hover();
      await settled();
      expect(await opacity(rowDoors.first()), "the door of the block under the pointer is drawn").toBe("1");
      await rowDoors.first().click();
      await expect(sheet).toHaveCount(0);
      await expectFocusInside(
        page,
        ".rec-fold:not([hidden]), .rec-inline:not([hidden])",
        "a block's door left focus outside the row it opened",
      );
      await page.keyboard.press("Escape");
      await expect(page.locator(".rec-fold:not([hidden]), .rec-inline:not([hidden])")).toHaveCount(0);
    }

    // On a phone: no contents beside the blocks, each block's head carries its share, the head holds still over the
    // blocks, the foot is Close, nothing scrolls sideways, and nothing in it is loud.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const channel of ["WhatsApp", "Phone"]) {
      await door.click();
      await expect(sheet).toBeVisible();
      if (channel === "Phone") await sheet.getByRole("radio", { name: "Phone" }).click();
      // The switch's own colour transition is measured once it has landed, not half-way between two tokens.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
      await expect(page.getByTestId("rec-prompt-contents")).toBeHidden();
      const n = await blocks.count();
      expect(n, `${channel}: there are blocks to read`).toBeGreaterThan(0);
      // Each head carries the rail's bar, drawn, and its share in words kept for a screen reader, off the glass.
      for (let i = 0; i < n; i++) {
        await expect(blocks.nth(i).locator(".bt-prompt-block-bar")).toBeVisible();
        const words = await blocks
          .nth(i)
          .locator(".bt-prompt-block-share")
          .evaluate((el) => ({
            w: Math.round(el.getBoundingClientRect().width),
            clipped: getComputedStyle(el).clipPath !== "none",
          }));
        expect(words, `${channel}: a block's share in words is on the glass`).toEqual({ w: 1, clipped: true });
      }
      // Nothing hovers here, so every door is drawn.
      expect(
        await sheet
          .locator(".bt-prompt-door")
          .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== "1").length),
        `${channel}: a door hidden on a phone`,
      ).toBe(0);
      await expectNoSidewaysScroll(page, `the prompt sheet on a phone, ${channel}`, [PANE, ".rec-sheet-body"]);
      await expectPromptSheetQuiet(page, `the prompt sheet on a phone, ${channel}`);
      const body = page.locator(".rec-sheet-body");
      const head = await boxOf(sheet.locator(".rec-sheet-head"), "the sheet's head");
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect((await boxOf(sheet.locator(".rec-sheet-head"), "the sheet's head")).y, "the head moved").toBe(head.y);
      const close = sheet.locator(".rec-sheet-foot").getByRole("button", { name: "Close" });
      await expect(close).toBeInViewport({ ratio: 1 });
      await close.click();
      await expect(sheet).toHaveCount(0);
      await expect(door).toBeFocused();
    }
    await expectRecordUnchanged(page, before);
  });

  test("nothing on the record scrolls sideways on a phone, and nothing on it is a gradient, a second typeface or a line about a fact it already states", async ({
    page,
  }) => {
    const before = await readConfig(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openRecord(page);
    await expectNoSidewaysScroll(page, "the record at rest", [PANE]);
    await expectQuiet(page, "the record at rest");
    await expectAbilitiesQuiet(page, "the record at rest");

    // The Who you are card overflowed a phone by 8px once, on the arrow inside a door's clipped words. Every card is
    // measured, and then the folds whose fields are widest. Each one open is also where the fold's own ground and the
    // block of what a save will say are painted, which is what carried a gradient and a monospace.
    for (const id of ["guardrails", "escalate_when", "fallbacks", "booking_rules", "hours", "languages"]) {
      // On a phone a fold opens as a sheet from the bottom, in the app's root (record-fold.jsx): what scrolls is the
      // pane behind it and the sheet's own body, and what is painted is inside the sheet.
      const fold = await openFold(page, id);
      await expect(fold).toHaveAttribute("role", "dialog");
      const sheet = `[role="dialog"][data-testid="rec-fold-${id}"]`;
      await expectNoSidewaysScroll(page, `the ${id} fold open`, [PANE, `${sheet} .rec-sheet-body`]);
      await expectQuiet(page, `the ${id} fold open`);
      await expectSheetQuiet(page, sheet, `the ${id} fold open`, SWITCH_TOKENS);
      if (id === "guardrails") await expectRuleBadgesInLine(page, "the rules fold open on a phone");
      await discard(page, id);
    }
    await expectRecordUnchanged(page, before);
  });

  test("a toast never covers the sheet's Save, at any width the sheet is drawn at", async ({ page }) => {
    const before = await readConfig(page);
    for (const width of [1280, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await openRecord(page);
      await openServices(page);
      const was = await addServices(page, 1);
      await page.getByTestId(`rec-service-remove-${was}`).click();

      const toast = page.locator(".pp-toast").last();
      await expect(toast).toBeInViewport({ ratio: 1 });
      const save = page.getByTestId("rec-sheet-save-services");
      await expect(save).toBeInViewport({ ratio: 1 });
      const t = await boxOf(toast, `the toast at ${width}px`);
      const s = await boxOf(save, `the sheet's Save at ${width}px`);
      expect(overlaps(t, s), `at ${width}px the toast covers the sheet's Save`).toBe(false);
      // And the lift exists to keep the whole foot clear, not the button alone: a toast over the foot hides the line
      // that says what saving will tell the receptionist, and the question above Save.
      const foot = await boxOf(page.locator(".rec-sheet-foot"), `the sheet's foot at ${width}px`);
      expect(overlaps(t, foot), `at ${width}px the toast covers the sheet's foot`).toBe(false);

      await discard(page, "services", "sheet");
    }
    await expectRecordUnchanged(page, before);
  });
  test("the four motions run on the house's durations and easings, on the changed line alone, and none of them under reduced motion", async ({
    page,
  }) => {
    // Spec §9, and Task 6.1. The one Save it presses (the save settle) goes to the stand-in door, never the workspace.
    const before = await readConfig(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRecord(page);
    await standInSave(page);
    await expectMotions(page, false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openRecord(page);
    await standInSave(page);
    await expectMotions(page, true);
    await expectRecordUnchanged(page, before);
  });

  test("at rest the record draws every row's act, quietly, and darkens the one under the pointer; nothing else is drawn that an owner does not act on without looking for it", async ({
    page,
  }) => {
    // Spec §11, as amended by Task 6.3 and by the 23 Sep quieting, measured by computed style: a control is drawn when
    // it is laid out and nothing over it is transparent. A row's act is drawn at rest in the dim ink and takes the ink
    // as the row is approached (record.css); it was opacity 0 until hovered, which read as a page with nothing to
    // press. business-tab-page.test.mjs holds which controls the page draws at rest on a whole record and on an empty
    // one; this is what the browser paints of them.
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRecord(page);
    await page.mouse.move(0, 0);
    await settled(page);
    const drawn = () =>
      page.evaluate(() => {
        const pane = document.querySelector(".set-pane")!;
        const out: { id: string; why: string | null }[] = [];
        const controls = pane.querySelectorAll(
          'button, a[href], input, select, textarea, [role="switch"], [tabindex="0"]',
        );
        for (const el of controls) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          let seen = 1;
          for (let n: Element | null = el; n && n !== pane; n = n.parentElement)
            seen *= parseFloat(getComputedStyle(n).opacity);
          if (seen <= 0) continue;
          const id = el.getAttribute("data-testid") || el.getAttribute("href") || el.className;
          const why =
            id === "rec-prompt-open"
              ? "Read it"
              : id === "rec-standing-door"
                ? "the standing line's link"
                : id === "set-export-all"
                  ? "Download"
                  : id === "rec-who-carriers" || el.closest(".set-team-mail") || el.classList.contains("set-mark")
                    ? "part of a sentence it sits in"
                    : el.classList.contains("rec-row-act")
                      ? "a row's act"
                      : id.startsWith("rec-can-door-")
                        ? "missing"
                        : null;
          out.push({ id, why });
        }
        return out;
      });
    const atRest = await drawn();
    expect(
      atRest.filter((c) => !c.why).map((c) => c.id),
      "a control drawn at rest that an owner does not act on without looking for it",
    ).toEqual([]);
    expect(atRest.map((c) => c.why)).toContain("Read it");
    // Download is Your data's, under the tab, and drawn wherever the app can name its door (window.__href); the
    // harness has no export door to name, so it is held to being drawn only where it is on the page.
    if (await page.getByTestId("set-export-all").count()) expect(atRest.map((c) => c.why)).toContain("Download");
    // Every row with an act draws it at rest: none is latent.
    const latent = await page.locator(".rec-row .rec-row-act").evaluateAll((els) =>
      els
        .filter((el) => {
          let seen = 1;
          for (let n: Element | null = el; n; n = n.parentElement) seen *= parseFloat(getComputedStyle(n).opacity);
          return seen < 1 || !el.getClientRects().length;
        })
        .map((el) => el.getAttribute("data-testid")),
    );
    expect(latent, "an act not drawn at rest").toEqual([]);
    expect(atRest.filter((c) => c.why === "a row's act").length).toBeGreaterThan(10);

    // Quietly: the dim ink at rest, the ink as the row is approached, and the whole row is the press (the pointer says
    // so). The two inks are read from the tokens as the browser resolves them, so the comparison holds in either theme.
    const ink = (token: string) =>
      page.evaluate((t) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${t})`;
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      }, token);
    const row = page.locator('.rec-row[data-empty="false"]:not([data-state="warn"]):has(.rec-row-act)').first();
    const act = row.locator(".rec-row-act");
    const colour = () => act.evaluate((el) => getComputedStyle(el).color);
    expect(await colour(), "at rest, the dim ink").toBe(await ink("--ink-dim"));
    expect(await row.evaluate((el) => getComputedStyle(el).cursor), "the row is the press").toBe("pointer");
    await row.hover();
    await settled(page);
    expect(await colour(), "approached, the ink").toBe(await ink("--ink"));

    // On a phone nothing hovers, so every act is drawn.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.mouse.move(0, 0);
    await settled(page);
    expect(
      await page
        .locator(".rec-row-act")
        .evaluateAll((els) =>
          els.filter((el) => getComputedStyle(el).opacity !== "1").map((el) => el.getAttribute("data-testid")),
        ),
      "an act hidden on a phone",
    ).toEqual([]);
  });

  test.describe("on a touch phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("a row opens as a sheet from the bottom: reaching past it asks, Keep editing keeps, Save saves, and the page behind holds still", async ({
      page,
    }) => {
      const before = await readConfig(page);
      await openRecord(page);
      // The save goes to a stand-in for the settings door, never to the workspace this spec shares (its rule, above):
      // it takes what the page sends, answers as the bridge does when the server takes it (onSaved, then the read
      // again, which is what the page draws its rows from), and keeps what it was sent for the check below.
      const read = await standInSave(page);

      const pane = page.locator(PANE);
      const scrolled = () => pane.evaluate((el) => el.scrollTop);
      await actOf(page, "tone").scrollIntoViewIfNeeded();
      const top = await scrolled();
      await actOf(page, "tone").tap();

      // A modal dialog rising from the bottom, named by the row's label, with focus in its field.
      const sheet = page.locator('[role="dialog"][data-testid="rec-fold-tone"]');
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute("aria-modal", "true");
      await expect(sheet).toHaveAccessibleName(/voice/i);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
      const box = sheet.locator("textarea").first();
      await expect(box, "focus is not in the sheet's field").toBeFocused();
      const rise = await boxOf(sheet, "the sheet");
      expect(Math.round(rise.y + rise.h), "the sheet does not stand on the bottom of the screen").toBe(844);
      expect(Math.round(rise.w), "the sheet is not the screen's width").toBe(390);

      // Quiet, and made for a finger: nothing scrolls sideways, nothing loud is painted, every control is 44px.
      const inSheet = '[role="dialog"][data-testid="rec-fold-tone"]';
      await expectNoSidewaysScroll(page, "the voice's sheet", [PANE, `${inSheet} .rec-sheet-body`]);
      await expectSheetQuiet(page, inSheet, "the voice's sheet", SWITCH_TOKENS);
      await expectFingerSized(page, inSheet, "the voice's sheet");

      const words =
        (await box.inputValue()) === "Warm, and never in a hurry." ? "Calm and kind." : "Warm, and never in a hurry.";
      await box.fill(words);
      // What it will be told is drawn under the box as it is typed, and the sheet grows to hold it: measured again.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
      const grown = await boxOf(sheet, "the sheet");

      // The page behind does not scroll under the sheet: not by a wheel on the wash over it, nor on the sheet itself.
      const above = await page.evaluate(
        (y) =>
          [...document.querySelectorAll('[data-testid^="rec-row-act-"]')]
            .map((el) => ({ id: el.getAttribute("data-testid"), r: el.getBoundingClientRect() }))
            .filter((a) => a.id !== "rec-row-act-tone" && a.r.height > 0 && a.r.top > 120 && a.r.bottom < y - 8)
            .map((a) => ({ id: a.id!, x: a.r.left + a.r.width / 2, y: a.r.top + a.r.height / 2 }))
            .at(-1) ?? null,
        grown.y,
      );
      expect(above, "no row of the page is in sight above the sheet").not.toBeNull();
      expect(
        await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? null, above!),
        "what lies over the other row is not the wash",
      ).toBe("rec-sheet-backdrop");
      await page.mouse.move(above!.x, above!.y);
      await page.mouse.wheel(0, 400);
      await page.mouse.move(195, grown.y + 30);
      await page.mouse.wheel(0, 400);
      expect(await scrolled(), "the page behind the sheet scrolled").toBe(top);

      // Reaching past the sheet for another row lands on the wash, which is the fold's Cancel: with something typed,
      // it asks, and the other row does not open.
      await page.touchscreen.tap(above!.x, above!.y);
      const ask = page.getByTestId("rec-fold-tone-cancel-confirm");
      await expect(ask).toBeVisible();
      await expect(ask).toContainText("Discard your changes?");
      await expect(page.locator('[role="dialog"]'), "another editor opened under the ask").toHaveCount(1);
      await expect(sheet.locator(".rec-sheet-foot").getByTestId("rec-fold-tone-cancel-confirm")).toHaveCount(1);
      await page.getByTestId("rec-fold-tone-cancel-no").tap();
      await expect(ask).toHaveCount(0);
      await expectFocusInside(page, inSheet, 'focus was dropped by "Keep editing"');
      await expect(box, "Keep editing kept what was typed").toHaveValue(words);
      expect(await scrolled(), "the page behind the sheet scrolled").toBe(top);

      // Save: the sheet goes, focus is back on the row's act, the row says the saved words, and what was sent is the
      // read config with this fold's one key changed.
      // The door the page will call is still the stand-in: a bridge that installed its verbs again since would send a
      // real PUT to the shared workspace before `took` could fail.
      await expectStandIn(page);
      await page.getByTestId("rec-fold-save-tone").tap();
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
      await expect(actOf(page, "tone"), "focus did not come back to the row's act").toBeFocused();
      await expect(page.getByTestId("rec-row-tone")).toContainText(words);
      const took = await page.evaluate(() => (window as unknown as { __e2eTook: { config: any }[] }).__e2eTook);
      expect(took, "one save, sent once").toHaveLength(1);
      const expected = JSON.parse(JSON.stringify(read));
      expected.brain.profile = { ...(expected.brain.profile ?? {}), tone: words };
      expect(took[0].config, "the save sent more than the voice").toEqual(expected);
      expect(await scrolled(), "the page behind the sheet scrolled").toBe(top);

      // A fold with the widest fields, as a sheet: quiet and made for a finger too.
      await actOf(page, "hours").tap();
      const hours = '[role="dialog"][data-testid="rec-fold-hours"]';
      await expect(page.locator(hours)).toBeVisible();
      // A break on Monday, so a shift's remove is drawn to be measured: the control the Settings pane's own sizing
      // made a finger wide, which a sheet drawn outside the pane lost (26px) until settings.css named the sheet.
      const monday = page.getByTestId("rec-hours-day-mon");
      if ((await monday.getAttribute("data-open")) !== "true") await page.getByTestId("rec-hours-switch-mon").tap();
      await expect(monday).toHaveAttribute("data-open", "true");
      await page.getByTestId("rec-hours-add-mon").tap();
      await expect(page.getByTestId("rec-hours-remove-mon-1")).toBeVisible();
      // The switch just pressed is measured once its colour has landed, not half-way between two tokens.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
      // And the pane's type: the sheet's buttons at the column's size, its times in figures that line up.
      const typed = await page.evaluate((sel) => {
        const sheet = document.querySelector(sel)!;
        const probe = document.createElement("span");
        probe.style.fontSize = getComputedStyle(document.documentElement).getPropertyValue("--text-sm").trim();
        sheet.appendChild(probe);
        const small = getComputedStyle(probe).fontSize;
        probe.remove();
        return {
          buttons: [...sheet.querySelectorAll(".btn-sm")].filter((b) => getComputedStyle(b).fontSize !== small).length,
          figures: getComputedStyle(sheet.querySelector("#bt-hours-mon-0-open")!).fontVariantNumeric,
        };
      }, hours);
      expect(typed, "the hours' sheet reads in the Settings pane's type").toEqual({
        buttons: 0,
        figures: "tabular-nums",
      });
      await expectNoSidewaysScroll(page, "the hours' sheet", [PANE, `${hours} .rec-sheet-body`]);
      await expectSheetQuiet(page, hours, "the hours' sheet", SWITCH_TOKENS);
      await expectFingerSized(page, hours, "the hours' sheet");
      await discard(page, "hours");
      await expect(actOf(page, "hours")).toBeFocused();

      // The sheet rises as it opens and goes down the way it came as it closes (spec §9, item 1, and Task 6.1's step
      // 3b), over a card that holds still: the row it opened from is drawn behind it the whole time, so nothing under
      // the wash moves as it leaves. Under reduced motion it appears and goes at once, and nothing is left behind.
      for (const reduced of [false, true]) {
        await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
        await settled(page);
        const where = reduced ? "under reduced motion" : "with motion";
        const next = page.getByTestId("rec-row-act-notes");
        // Where the next row stands in its card: the card under the wash is what must hold still, whatever the pane
        // scrolls to bring the row in reach.
        const still = () =>
          next.evaluate((el) =>
            Math.round(el.getBoundingClientRect().top - el.closest(".rec-card")!.getBoundingClientRect().top),
          );
        await actOf(page, "tone").scrollIntoViewIfNeeded();
        const at = await still();
        await actOf(page, "tone").tap();
        const tone = '[role="dialog"][data-testid="rec-fold-tone"]';
        await expect(page.locator(tone)).toBeVisible();
        const rising = await motionsOn(page, tone);
        if (reduced) expect(rising.flat(), `${where}: the sheet rises`).toEqual([]);
        else
          expect(rising, "the sheet rises on --ease-out").toEqual([[{ prop: "transform", ms: 200, easing: EASE_OUT }]]);
        await settled(page);
        expect(await still(), `${where}: the card behind the open sheet moved`).toBe(at);
        const leaving = await page.evaluate(async () => {
          (document.querySelector('[data-testid="rec-fold-close-tone"]') as HTMLElement).click();
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          const copy = document.querySelector('.rec-fold-sheet[data-leaving="true"]');
          const wash = document.querySelector('.rec-sheet-backdrop[data-leaving="true"]');
          const moving = (el: Element | null) =>
            el
              ? el.getAnimations().map((a) => ({
                  prop: (a as unknown as { transitionProperty: string }).transitionProperty,
                  ms: Number((a.effect as KeyframeEffect).getComputedTiming().duration),
                  easing: String((a.effect as KeyframeEffect).getTiming().easing),
                }))
              : null;
          return {
            dialogs: document.querySelectorAll('[role="dialog"]').length,
            focus: document.activeElement?.getAttribute("data-testid") ?? null,
            copy: moving(copy),
            wash: moving(wash),
            named: copy ? copy.querySelectorAll("[id], [data-testid]").length + (copy.getAttribute("role") ? 1 : 0) : 0,
          };
        });
        expect(leaving.dialogs, `${where}: the fold is closed the moment it is`).toBe(0);
        expect(leaving.focus, `${where}: focus is back on the row's act at once`).toBe("rec-row-act-tone");
        if (reduced) expect([leaving.copy, leaving.wash], "nothing leaves under reduced motion").toEqual([null, null]);
        else {
          expect(leaving.copy, "the sheet goes down on --ease-in-out").toEqual([
            { prop: "transform", ms: 200, easing: EASE_IN_OUT },
          ]);
          expect(leaving.wash, "its wash fading with it").toEqual([{ prop: "opacity", ms: 200, easing: EASE_IN_OUT }]);
          expect(leaving.named, "and nothing in what leaves can be found, named or pressed").toBe(0);
        }
        expect(await still(), `${where}: the card behind the leaving sheet moved`).toBe(at);
        await expect(page.locator('[data-leaving="true"]'), "what leaves is gone as its slide ends").toHaveCount(0);
        expect(await still(), `${where}: the card moved once the sheet had gone`).toBe(at);
      }

      // The workspace the spec shares was never written: the stand-in took the save.
      await expectRecordUnchanged(page, before);
    });
  });
});
