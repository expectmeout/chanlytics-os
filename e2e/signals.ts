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

/**
 * One finding of Today's AI found, as it reads (Today, calm, 19 Nov 2026; surfaces/today/zones/found.tsx): the first is
 * the page's card where AI found holds it, whole, with its act; each other is a line, short, that is its own door.
 */
export interface FoundRow {
  /** rule, noticed, call, tried or idea. */
  source: string;
  /** What it is, in a few words: the card's title, or the line's name. */
  head: string;
  /** Its numbers, under it: the card's why, or the line's second line. */
  sub: string;
  /** The card's one act's words; a line is its own door, and says none. */
  act: string;
  /** Whether it is the page's card. */
  card: boolean;
  /** What a press on it opens: the card's act, or the line. */
  door: Locator;
}

/** Today's AI found, as it reads: its card where it holds the page's, then its lines; empty where it draws nothing. */
export async function readFound(page: Page): Promise<FoundRow[]> {
  const out: FoundRow[] = [];
  const said = async (where: Locator): Promise<string> =>
    (await where.count()) ? (await where.first().innerText()).trim() : "";
  const card = page.locator('[data-testid="today-card"][data-holder="found"]');
  if (await card.count()) {
    const act = card.getByTestId("today-found-act");
    out.push({
      source: ((await card.locator(".calm-lead-in").getAttribute("data-testid")) ?? "").replace(/^today-found-/, ""),
      head: await said(card.locator(".calm-title")),
      sub: await said(card.locator(".calm-why")),
      act: await said(act),
      card: true,
      door: act,
    });
  }
  const zone = page.getByTestId("today-ask-found");
  if (await zone.count())
    for (const line of await zone
      // The lines the list draws, not the rest folded under "3 more AI found" (the second look, L6).
      .locator(':scope > .calm-line[data-testid^="today-found-"]:not([data-testid="today-found-more"])')
      .all()) {
      out.push({
        source: ((await line.getAttribute("data-testid")) ?? "").replace(/^today-found-/, ""),
        head: await said(line.locator(".calm-name")),
        sub: await said(line.locator(".calm-said")),
        act: "",
        card: false,
        door: line.locator('a[href], [role="button"]').first(),
      });
    }
  return out;
}

/**
 * Every finding AI found draws is a claim with a way out: what it is, its numbers under it, and a press that goes; the
 * card and three lines at most, the rest said. A rule's, and what AI noticed, carries its number.
 */
export async function expectFoundWellFormed(page: Page): Promise<FoundRow[]> {
  const rows = await readFound(page);
  expect(rows.filter((r) => !r.card).length, "AI found names three lines at most").toBeLessThanOrEqual(3);
  for (const r of rows) {
    expect(r.head.length, `${r.source}: what it is`).toBeGreaterThan(0);
    // Every finding its way out: the card's act (the 3 Nov audit: a steady finding stood with none), or the line itself.
    if (r.card) expect(r.act.length, `${r.head}: its one act`).toBeGreaterThan(0);
    else await expect(r.door, `${r.head}: its door`).toHaveCount(1);
    if (r.source !== "rule" && r.source !== "noticed") continue;
    expect(`${r.head} ${r.sub}`, `${r.head}: its number`).toMatch(/\d/);
  }
  return rows;
}

/**
 * Nobody waiting on you is said again in AI found: a person is who waits, or a finding, never both. The bell held both
 * kinds of a row once, and the page printed the same three people twice (#653), under While you were away, which went.
 */
export async function expectNoQueueRepeat(page: Page): Promise<void> {
  const queued = [
    ...(await page.locator('[data-testid="today-card"][data-holder="queue"] .calm-who').allInnerTexts()),
    ...(await page.getByTestId("today-queue").locator(".calm-line:not([data-folded]) .calm-name").allInnerTexts()),
  ]
    .map((n) => n.trim())
    .filter(Boolean);
  const found = (await readFound(page)).map((r) => r.head);
  for (const who of queued)
    expect(
      found.filter((head) => head === who || head.startsWith(`${who}:`)),
      `${who} waits on you and again in AI found`,
    ).toEqual([]);
}

/* ------------------------------------------------------- Leads (release B) */

/**
 * The Leads scope, as an owner sees it: the People | Leads switch with Leads
 * chosen, the one standing line, and who is first in the queue at the top of the table.
 * "Reached" means in the viewport here too -- a standing line below the fold
 * says nothing about whether the owner can see what the search found.
 */
export async function expectLeadsScope(page: Page, want: { standing: string; first: string }): Promise<void> {
  // People's scopes are the frame's strip, links (since #1412): the one picked is the page.
  const tabs = page.getByRole("navigation", { name: "Which people" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");
  // In Glass the standing line is the frame's head's sentence (the page's own line, leads-standing, is drawn on a
  // phone alone): "3 leads · 2 not contacted · 1 search needs you", each part read on its own. On a desk the head is kept for a reader
  // and the frame's focus alone (components.css, the head's slot, 1 Oct 2026), so it is read, not looked for on screen.
  const standing = page.locator(".pg-head .pg-sentence");
  for (const part of want.standing.split("·")) await expect(standing).toContainText(part.trim());
  // A row, not its group's heading (Leads is a queue, #2137).
  await expect(page.locator(".cl-table tbody tr:not(.dtable-group)").first()).toContainText(want.first);
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
 * How far a phone's sheet rests clear of the screen's foot (tokens.css --sheet-foot, 4 Nov 2026: never higher than the
 * tab bar's, so a sheet covers the bar). The token is a min() of two others, so a fixed probe resolves it to pixels.
 */
export async function sheetFoot(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position: fixed; bottom: var(--sheet-foot, 0px)";
    document.body.append(probe);
    const foot = parseFloat(getComputedStyle(probe).bottom) || 0;
    probe.remove();
    return foot;
  });
}

/**
 * Every motion that ends has ended: a page pushed over a list slides in with its presses off until it lands (kit
 * motion), so what a thumb would press, or where a row stands, is read once the page has come to rest. A motion tied to
 * the scroll (the top's ground fading in as Today goes under it, components.css `frame-top-ground`) runs on the scroll's
 * own timeline and ends only when a thumb scrolls that far: it is no motion to wait for, and waiting for it never ended
 * (the nightly's two Today cases of first-rows, red since Today went under the top).
 */
export async function motionSettled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.timeline === document.timeline && a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  );
}

/**
 * Where a box's top stands once the page is at rest: every motion that ends has ended (motionSettled), then two frames
 * run with it at one place. A page arrives risen 4px and settling (components.css `.route-view`, route-in, 240 ms), and
 * a reading taken as it came in stood 4px from one taken a press later: a row carried back by a thumb (shell/phone.spec.ts,
 * 26 Nov 2026) and History's tabs under a press (27 Nov 2026) each failed a first try so on the nightly.
 */
export async function restingTop(at: Locator): Promise<number> {
  await motionSettled(at.page());
  return at.evaluate(
    (el) =>
      new Promise<number>((done) => {
        let last = Number.NaN;
        const look = () => {
          const top = el.getBoundingClientRect().top;
          if (Math.abs(top - last) < 0.5) done(top);
          else {
            last = top;
            requestAnimationFrame(look);
          }
        };
        requestAnimationFrame(look);
      }),
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
