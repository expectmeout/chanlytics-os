import { expect, type Page } from "@playwright/test";

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

/** Where every "nobody has said yes to offers" leads (contracts GET_YES_ROUTE). */
export const GET_YES_HASH = "#/broadcasts/get-yes";

/**
 * The WHOLE QR is on screen, under a crumb that says why the person is there.
 *
 * Not toBeVisible, and not a bare toBeInViewport either -- both pass on the old
 * door, whose section sat ten pixels from the bottom of a phone: visible, and
 * "in the viewport" by a sliver. Checked against that page before this ran
 * anywhere, the bare assertion passed it. A QR you can see ten pixels of cannot
 * be scanned, so the image itself must be entirely in view.
 */
export async function expectQrInView(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).hash).toBe(GET_YES_HASH);
  const section = page.getByTestId("bc-optin");
  await expect(section).toBeVisible();
  await expect(section).toContainText("Get their yes");
  await expect(section.locator(".bc-optin-qr")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".topbar")).toContainText("Get their yes");
}

export interface LeakRow {
  id: string;
  text: string;
  math: string;
  doors: string[];
}

/** Today's "Worth a look", as it reads; empty when the band is absent (a workspace with nothing wrong). */
export async function readLeaks(page: Page): Promise<LeakRow[]> {
  const band = page.getByTestId("today-leaks");
  if ((await band.count()) === 0) return [];
  const out: LeakRow[] = [];
  for (const row of await band.locator('[data-testid^="today-leak-"]').all()) {
    out.push({
      id: ((await row.getAttribute("data-testid")) ?? "").replace(/^today-leak-/, ""),
      text: (await row.locator(".tl-text").innerText()).trim(),
      math: (await row.locator(".tl-math").innerText()).trim(),
      doors: (await row.locator(".tl-acts button").allInnerTexts()).map((d) => d.trim()),
    });
  }
  return out;
}

/**
 * Every row the band shows is a claim with its arithmetic and a way out: a
 * sentence, the numbers under it, at least one door, and never more than two
 * rows -- past two it is a list, and the band exists because lists are skimmed.
 */
export async function expectLeaksWellFormed(page: Page): Promise<LeakRow[]> {
  const rows = await readLeaks(page);
  expect(rows.length, "the band is two rows at most").toBeLessThanOrEqual(2);
  for (const r of rows) {
    expect(r.text.length, `${r.id}: a sentence`).toBeGreaterThan(0);
    expect(r.text, `${r.id}: the sentence has its number in it`).toMatch(/\d/);
    expect(r.math.length, `${r.id}: the arithmetic under it`).toBeGreaterThan(0);
    expect(r.doors.length, `${r.id}: a door`).toBeGreaterThan(0);
  }
  return rows;
}

/**
 * No conversation waiting in the queue is said again under "While you were
 * away". The bell holds both kinds of row -- one the edge wrote down, carrying
 * its conversation, and one the browser derives, carrying it only in its key --
 * and a rule that read one of them passed every test while the page printed the
 * same three people twice.
 */
export async function expectNoQueueRepeat(page: Page): Promise<void> {
  const queued = (await page.getByTestId("today-queue").locator(".cl-attn-who").allInnerTexts()).map((n) => n.trim()).filter(Boolean);
  const away = (await page.getByTestId("today-away").locator(".ta-title").allInnerTexts()).map((t) => t.trim());
  for (const who of queued) {
    expect(away.filter((t) => t.includes(who)), `${who} is in the queue and again under While you were away`).toEqual([]);
  }
}

/**
 * The card's head is the bell's own number and its foot says how many of them
 * are not on screen, so they must add up: a group of twelve calls stands for
 * twelve, not for one. Counting groups read as "22 ... and 2 more".
 *
 * With no row drawn there is no foot (the head says the number once), and the
 * empty line may congratulate only when the head is 0: a card that read
 * "All caught up." beside a bell of 4 is the defect this guards.
 */
export async function expectAwayAddsUp(page: Page): Promise<void> {
  const away = page.getByTestId("today-away");
  await expect(away).toBeVisible();
  const head = Number((await away.locator(".tq-count").innerText()).trim());
  const rows = away.getByTestId("today-away-row");
  if ((await rows.count()) === 0) {
    const empty = away.getByTestId("today-away-empty");
    await expect(empty).toBeVisible();
    await expect(away.locator(".tq-foot")).toHaveCount(0);
    expect((await empty.innerText()).includes("All caught up"), `head ${head} with "${await empty.innerText()}"`).toBe(head === 0);
    return;
  }
  const shown = (await rows.evaluateAll((els) => els.map((r) => Number(r.getAttribute("data-count") ?? "1")))).reduce((a, n) => a + n, 0);
  const foot = away.locator(".tq-foot");
  const more = (await foot.count()) ? Number(/(\d+) more/.exec(await foot.innerText())?.[1] ?? "0") : 0;
  expect(head, `head ${head} = ${shown} on screen + ${more} more`).toBe(shown + more);
}

/** A warning is never listed below good news, whatever the two rows' clocks say. */
export async function expectWarningsFirst(page: Page): Promise<void> {
  const tones = await page.getByTestId("today-away-row").evaluateAll((rows) => rows.map((r) => (r.classList.contains("warn") ? "warn" : "other")));
  const firstOther = tones.indexOf("other");
  if (firstOther === -1) return;
  expect(tones.slice(firstOther), `a warning sits below good news: ${tones.join(",")}`).not.toContain("warn");
}

/* ------------------------------------------------------- Leads (release B) */

/**
 * The Leads scope, as an owner sees it: the People | Leads switch with Leads
 * chosen, the one standing line, and the strongest fit at the top of the table.
 * "Reached" means in the viewport here too -- a standing line below the fold
 * says nothing about whether the owner can see what the search found.
 */
export async function expectLeadsScope(page: Page, want: { standing: string; first: string }): Promise<void> {
  const tabs = page.getByRole("tablist", { name: "Which people" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Leads" })).toHaveAttribute("aria-selected", "true");
  const standing = page.getByTestId("leads-standing");
  await expect(standing).toBeInViewport({ ratio: 1 });
  // "3 leads · 2 ready · 1 search" is three adjacent spans (PeopleStanding), so the
  // line's own text has no space around the dots: each part is read on its own.
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
  // The two groups are the evidence bar's card (#770), told apart by a hairline and by their marks rather than by
  // headings; the card is in the page whether or not it is showing.
  await expect(peek.getByTestId("peek-checks-seen")).toBeAttached();
  await expect(peek.getByTestId("peek-checks-read")).toBeAttached();
  expect(
    await peek.getByTestId("peek-checks-read").locator(".pk-ck-check").count(),
    "a check Claude read wears the mark of one the product saw",
  ).toBe(0);
}

/** A row put back by Undo is the row that was there, word for word. */
export async function expectRowUnchangedAfterUndo(page: Page, name: string, before: string): Promise<void> {
  const row = page.locator(".cl-table tbody tr", { hasText: name });
  await expect(row).toHaveCount(1);
  await expect.poll(async () => (await row.innerText()).trim(), { message: `${name} came back changed` }).toBe(before.trim());
}
