import { expect, type Locator, type Page } from "@playwright/test";
import { routeOf } from "./address";

/**
 * What the product tells an owner they could not have seen, checked the way a
 * person would check it: on screen, in the words on screen, by pressing the
 * button that says what it does.
 *
 * Each of these was a real page before it was a check. The queue's three
 * conversations were printed again under "While you were away" (#653) -- every
 * unit test passed, because the rows a real workspace has carry their subject in
 * their KEY, not in the field the rule read. The door to the QR opened the top of
 * Broadcasts, and on a phone the QR was 834px down an 844px screen (#663) --
 * "it navigates" was true and useless. So these read the rendered page, and
 * "reached" means in the viewport, not in the DOM.
 *
 * Shared by the nightly specs and by the harness that verifies them before they
 * ever run against production, so the two cannot drift: the checks here are the
 * checks that ran.
 */

/** Where every "nobody has said yes to offers" leads (contracts GET_YES_ROUTE): People's sheet. */
export const GET_YES_HASH = "#/clients/get-yes";
/** The route it is, as the app's address names it (a path since decision 0015). */
export const GET_YES_ROUTE = GET_YES_HASH.replace(/^#\//, "");

/**
 * The WHOLE QR is on screen, under a head that says why the person is there.
 *
 * Not toBeVisible, and not a bare toBeInViewport either -- both pass on the old
 * door, whose section sat ten pixels from the bottom of a phone: visible, and
 * "in the viewport" by a sliver. Checked against that page before this ran
 * anywhere, the bare assertion passed it. A QR you can see ten pixels of cannot
 * be scanned, so the image itself must be entirely in view.
 *
 * Get their yes is a sheet over People's list since the Campaigns wiring review
 * (19 Oct 2026: a yes is about people), so the frame's head names the page under
 * it, People, and the sheet's own section says why the person is there. This read
 * "Get their yes" off the top bar until 7 Oct 2026, "Sent" off the head until 16
 * Oct, and "Get their yes" off the head until People's list said its own name there.
 */
export async function expectQrInView(page: Page): Promise<void> {
  await expect.poll(() => routeOf(page.url())).toBe(GET_YES_ROUTE);
  const section = page.getByTestId("bc-optin");
  await expect(section).toBeVisible();
  await expect(section).toContainText("Get their yes");
  await expect(section.locator(".bc-optin-qr")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".pg-head")).toContainText("People");
}

/** One row of Today's Ask found, as it reads (Today in three zones, 2 Nov 2026; surfaces/today/zones/found.tsx). */
export interface FoundRow {
  /** What it stands for: a rule's `rule:<id>` (unreachable, never-booked ...), a card's id, a call's or a lead's row. */
  key: string;
  /** rule, noticed, call, tried or idea. */
  source: string;
  tag: string;
  text: string;
  /** Its why, which waits behind the sentence until it is pressed: the arithmetic, for a rule. */
  why: string;
  /** Its one act's words; none where a row has nowhere to go. */
  act: string;
}

/**
 * Today's Ask found, as it reads; empty when the zone is absent (nothing to rank). Each row's why is read by pressing its
 * sentence, as a person does, and put away again: pressing it does nothing else (Not today waits beside it, unpressed).
 */
export async function readFound(page: Page): Promise<FoundRow[]> {
  const zone = page.getByTestId("today-ask-found");
  if ((await zone.count()) === 0) return [];
  const out: FoundRow[] = [];
  for (const row of await zone.locator('.tz-idea[data-testid^="today-found-"]').all()) {
    const sentence = row.getByTestId("today-found-sentence");
    const act = row.getByTestId("today-found-act");
    let why = "";
    if (await sentence.count()) {
      await sentence.click();
      await expect(row.getByTestId("today-found-rest")).toBeVisible();
      why = ((await row.locator(".tz-idea-why small").first().textContent()) ?? "").trim();
      await sentence.click();
    }
    out.push({
      key: (await row.getAttribute("data-key")) ?? "",
      source: ((await row.getAttribute("data-testid")) ?? "").replace(/^today-found-/, ""),
      tag: (await row.locator(".tz-idea-kind").innerText()).trim(),
      text: (await sentence.count()) ? (await sentence.innerText()).trim() : "",
      why,
      act: (await act.count()) ? (await act.innerText()).trim() : "",
    });
  }
  return out;
}

/**
 * Every row Ask found draws is a claim with a way out: what it is, its sentence, its why behind it, its one act; and three
 * rows at most, the rest said. A rule's sentence, and what Ask noticed, carries its number, with why under it.
 */
export async function expectFoundWellFormed(page: Page): Promise<FoundRow[]> {
  const rows = await readFound(page);
  expect(rows.length, "Ask found draws three at most").toBeLessThanOrEqual(3);
  for (const r of rows) {
    expect(r.tag.length, `${r.key}: what it is`).toBeGreaterThan(0);
    expect(r.text.length, `${r.key}: a sentence`).toBeGreaterThan(0);
    // Every row its one act: a door, or a card's own Approve (the 3 Nov audit: a steady finding stood with none).
    expect(r.act.length, `${r.key}: its one act`).toBeGreaterThan(0);
    if (r.source !== "rule" && r.source !== "noticed") continue;
    expect(r.text, `${r.key}: the sentence has its number in it`).toMatch(/\d/);
    expect(r.why.length, `${r.key}: why, under it`).toBeGreaterThan(0);
  }
  return rows;
}

/**
 * Nobody waiting in Need you is said again in Ask found: a person is a row of one or the other. The bell held both kinds
 * of a row once, and the page printed the same three people twice (#653), under While you were away, which went.
 */
export async function expectNoQueueRepeat(page: Page): Promise<void> {
  const queued = (await page.getByTestId("today-queue").locator(".cl-attn-who").allInnerTexts())
    .map((n) => n.trim())
    .filter(Boolean);
  const found = (await readFound(page)).map((r) => r.text);
  for (const who of queued) {
    expect(
      found.filter((t) => t.startsWith(`${who}:`)),
      `${who} is in Need you and again in Ask found`,
    ).toEqual([]);
  }
}

/**
 * Since you looked opens in place: the line's few words, and once pressed its rows under it, closed again by a second
 * press. Nothing where the member never looked. (What each row says is contracts todaySince's, which
 * tooling/scripts/tests/today-zones/since-you-looked.test.mjs executes: a row per bit is so by construction, so counting
 * one against the other here proved nothing.)
 */
export async function expectSinceOpens(page: Page): Promise<void> {
  const line = page.getByTestId("today-since");
  if ((await line.count()) === 0) return;
  const bits = (await line.locator("em").allInnerTexts()).map((b) => b.trim()).filter(Boolean);
  expect(bits.length, "the line says what happened").toBeGreaterThan(0);
  await line.click();
  const list = page.getByTestId("today-since-list");
  await expect(list).toBeVisible();
  await expect(list.locator(".tz-sn").first()).toBeVisible();
  await line.click();
  await expect(list).toHaveCount(0);
}

/* ------------------------------------------------------- Leads (release B) */

/**
 * The Leads scope, as an owner sees it: the People | Leads switch with Leads
 * chosen, the one standing line, and the strongest fit at the top of the table.
 * "Reached" means in the viewport here too -- a standing line below the fold
 * says nothing about whether the owner can see what the search found.
 */
export async function expectLeadsScope(page: Page, want: { standing: string; first: string }): Promise<void> {
  // People's scopes are the frame's strip, links (since #1412): the one picked is the page.
  const tabs = page.getByRole("navigation", { name: "Which people" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");
  // In Glass the standing line is the frame's head's sentence (the page's own line, leads-standing, is drawn on a
  // phone alone): "3 leads · 2 ready · 1 search", each part read on its own. On a desk the head is kept for a reader
  // and the frame's focus alone (components.css, the head's slot, 1 Oct 2026), so it is read, not looked for on screen.
  const standing = page.locator(".pg-head .pg-sentence");
  for (const part of want.standing.split("·")) await expect(standing).toContainText(part.trim());
  await expect(page.locator(".cl-table tbody tr").first()).toContainText(want.first);
}

/** The strip says how the round ended, in words, where the owner can read them. */
export async function expectStripEnding(page: Page, words: string): Promise<void> {
  const strip = page.getByTestId("lead-strip");
  await expect(strip).toBeInViewport({ ratio: 1 });
  await expect(strip).toContainText(words);
  expect(await strip.innerText(), "a strip never says a dollar amount").not.toMatch(/\$\d/);
}

/**
 * The peek's two groups, and the rule that makes them worth having: nothing
 * Claude READ wears the same mark as something the product SAW. The defect this
 * guards is a page that ticks "independent" as confidently as "open on Maps".
 */
export async function expectPeekSeenVersusRead(page: Page): Promise<void> {
  const peek = page.getByTestId("lead-peek");
  await expect(peek).toBeVisible();
  // Fit is the sheet's first line, folded until pressed unless a check failed: every check on its own line, what was
  // seen and what Claude read told apart by their marks (sheet/panes.tsx).
  const fit = peek.getByTestId("lead-sheet-sec-fit-press");
  if ((await fit.getAttribute("aria-expanded")) !== "true") await fit.click();
  const checks = peek.getByTestId("peek-checks-open");
  await expect(checks).toBeVisible();
  expect(await checks.locator(".lw-ck").count(), "the checks are drawn").toBeGreaterThan(0);
  expect(
    await checks.locator(".lw-ck.read .pk-ck-check").count(),
    "a check Claude read wears the mark of one the product saw",
  ).toBe(0);
}

/**
 * A lead row as Undo must give it back: every cell word for word, except the Found cell's relative age ("7m"), which
 * ticks with the clock and turned a minute during a run (25 Sep). That cell is read by its tip instead, the absolute
 * time the place was found, so a changed found_at still fails.
 */
export async function leadRowWords(row: Locator): Promise<string> {
  return row.evaluate((tr) =>
    [...tr.children]
      .map((td) =>
        td.getAttribute("data-testid") === "lead-found"
          ? `found ${(td.querySelector("[data-testid=lead-tip-found]")?.textContent ?? "").trim()}`
          : (td as HTMLElement).innerText.trim(),
      )
      .join("\t"),
  );
}

/** A row put back by Undo is the row that was there, word for word (leadRowWords). */
export async function expectRowUnchangedAfterUndo(page: Page, name: string, before: string): Promise<void> {
  const row = page.locator(".cl-table tbody tr", { hasText: name });
  await expect(row).toHaveCount(1);
  await expect.poll(() => leadRowWords(row), { message: `${name} came back changed` }).toBe(before);
}

/* --------------------------------------------- Focus, and the width of a page */

/**
 * Where focus is, as a sentence: the element's test id, the name a screen reader would hear, or its tag -- and
 * "the document itself" for `<body>`, which is where every one of these checks' defects ends up. Used in their
 * messages, so a failure says what took focus instead of only that something did.
 */
export async function focusedNow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "the document itself";
    const id = el.getAttribute("data-testid");
    const name = el.getAttribute("aria-label");
    return [el.tagName.toLowerCase(), el.id ? `#${el.id}` : "", id ? `[${id}]` : "", name ? ` "${name}"` : ""].join("");
  });
}

/**
 * Focus is on something INSIDE `selector`, and never on `<body>`.
 *
 * A gesture that holds focus -- a fold, a sheet -- loses it whenever the thing focus was on leaves the page under it:
 * an ask answered, a row removed, an Add that became a sentence, a toast taken away. Each of those left a keyboard at
 * the top of the document, where Tab walks the page behind the thing the person is looking at.
 */
export async function expectFocusInside(page: Page, selector: string, why: string): Promise<void> {
  const inside = await page.evaluate(
    (sel) =>
      !!(document.activeElement && document.activeElement !== document.body && document.activeElement.closest(sel)),
    selector,
  );
  expect(inside, `${why} (focus is on ${await focusedNow(page)})`).toBe(true);
}

/** Focus is exactly where it was: a redraw must never move focus a person put somewhere themselves. */
export async function expectFocusUnmoved(page: Page, was: string, why: string): Promise<void> {
  expect(await focusedNow(page), why).toBe(was);
}

/**
 * Nothing a person reads on scrolls sideways.
 *
 * Measured on what SCROLLS, never on an element's rectangle: dozens of things are laid out past their own box on
 * purpose (a label clipped to 1px for a screen reader, a row that hides its own overflow), and none of them moves
 * anything. One pixel of rounding is allowed.
 *
 * The document is always measured. `scrollers` names the panes the page is read in, because the document is not
 * always the one that moves: the Who you are card's 8px was an arrow inside a clipped label, and what it scrolled
 * was the Settings pane (`.set-pane`, overflow-x: auto) while the document stayed exactly 390px wide. A check that
 * read the document alone passed that page -- measured against it, with the arrow put back.
 */
export async function expectNoSidewaysScroll(page: Page, where: string, scrollers: string[] = []): Promise<void> {
  const found = await page.evaluate((sels) => {
    const of = (el: Element) => el.scrollWidth - el.clientWidth;
    const out: string[] = [];
    if (of(document.documentElement) > 1) out.push(`the page by ${of(document.documentElement)}px`);
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) if (of(el) > 1) out.push(`${sel} by ${of(el)}px`);
    }
    return out;
  }, scrollers);
  expect(found, `${where} scrolls sideways: ${found.join(", ")}`).toEqual([]);
}

/**
 * How far a phone's sheet floats clear of the screen's sides and foot (tokens.css --sheet-float, #1789, 21 Oct 2026:
 * as iOS 26's own sheets do), read off the page, so a check of where a sheet stands follows the token, not a number.
 */
export async function sheetFloat(page: Page): Promise<number> {
  return page.evaluate(
    () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-float")) || 0,
  );
}

/**
 * Every motion that ends has ended: a page pushed over a list slides in with its presses off until it lands (kit
 * motion), so what a thumb would press, or where a row stands, is read once the page has come to rest.
 */
export async function motionSettled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  );
}

/**
 * A thumb down the screen from (x, y) by `by` pixels (up it where `by` is negative), through the browser's own input
 * (CDP), still down at the end: what the page does under it is read before `letGo`.
 */
export async function pullHeld(page: Page, x: number, y: number, by: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i += 1)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (by * i) / 6 }] });
  return { letGo: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) };
}

/** How far down the screen a pull past its end has moved the first box `sel` names (kit motion/page-give.ts): 0 at rest. */
export async function givenOf(page: Page, sel: string): Promise<number> {
  return page.evaluate(
    (s) => parseFloat(getComputedStyle(document.querySelector(s)!).translate.split(" ")[1] ?? "") || 0,
    sel,
  );
}
