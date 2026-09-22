import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { expectFocusInside, expectFocusUnmoved, expectNoSidewaysScroll, focusedNow } from "./signals";

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
 * field, with the one the test started from. Nothing here presses Save.
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
/** Every fold on the page that is open. A closed one is drawn and `hidden`, so "open" is what a person can see. */
const openFolds = (page: Page): Locator => page.locator(".rec-fold:not([hidden])");

/** Open a row's fold by pressing the act the row states it with, never by its place on the page. */
async function openFold(page: Page, id: string): Promise<Locator> {
  await actOf(page, id).click();
  const fold = foldOf(page, id);
  await expect(fold).toBeVisible();
  return fold;
}

/**
 * Throw away whatever the test typed: Cancel, and the ask it raises when something was typed. Answering "Yes,
 * discard" is the only way this spec ever ends an editor -- Save is never pressed.
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

  test("a click on the page outside an open fold survives a redraw", async ({ page }) => {
    const before = await readConfig(page);
    await openRecord(page);

    await openFold(page, "tone");
    // Somewhere on the page that is not the fold, and not a control that would open anything.
    await page.locator(".bt-title").click();
    const away = await focusedNow(page);
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="rec-fold-tone"]')),
      "the click did not take focus out of the fold",
    ).toBe(false);

    // Anything that draws the page again: the settings surface being read once more, which the page listens for.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("surface:settings")));
    await expect(foldOf(page, "tone")).toBeVisible();
    await expectFocusUnmoved(page, away, "a redraw pulled focus back into the fold the person had left");

    await discard(page, "tone");
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
    // closed dropped the language, so the fold saved without it (Task 3.5's onLeave).
    await page.locator(".bt-title").click();
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
  });

  test("nothing on the record scrolls sideways on a phone, its folds open or shut", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRecord(page);
    await expectNoSidewaysScroll(page, "the record at rest", [PANE]);

    // The Who you are card overflowed a phone by 8px once, on the arrow inside a door's clipped words. Every card is
    // measured, and then the folds whose fields are widest.
    for (const id of ["guardrails", "escalate_when", "fallbacks", "booking_rules", "hours"]) {
      await openFold(page, id);
      await expectNoSidewaysScroll(page, `the ${id} fold open`, [PANE]);
      await discard(page, id);
    }
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
});
