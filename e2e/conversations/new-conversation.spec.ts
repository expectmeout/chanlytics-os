import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";

/**
 * A conversation begins from the Inbox, in a real browser
 * (docs/superpowers/specs/2026-10-07-a-conversation-begins-from-the-inbox-design.md, 4.1, 4.2 and 4.7).
 *
 * What only a browser can say: the act stands at the right of the row of views on each of the Inbox's three tabs, a
 * filled button on a desk and a capsule that says "+ New" on a phone, where its whole name is a screen reader's; a press
 * opens the sheet, and so does N; a person picked is read for how they can be reached, each wire said with what it
 * carries or why it cannot; and an address that names the sheet opens it and gives the Inbox its own address back.
 *
 * It writes nothing on the workspace: nobody is added, nothing is written in a field, and Send is never pressed. The
 * send itself is proved under the browser (core's verb over fakes, its door on a database, the route's policy).
 */
async function slugOfHome(page: Page): Promise<string> {
  await page.goto("/");
  await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
  const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
  return slug;
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
}

test.describe("A conversation begins from the Inbox", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the act stands on each of the Inbox's three tabs, and opens the sheet on the pick", async ({ page }) => {
    const slug = await slugOfHome(page);
    for (const tab of ["inbox", "conversations", "live"]) {
      await open(page, `/w/${slug}/${tab}`);
      const act = page.getByTestId("inbox-new");
      await expect(act, tab).toBeVisible();
      await expect(act, tab).toHaveText("New conversation");
      // At the right end of the row of views, on its line: the strip's own height, and inside the page's gutter.
      const [box, strip] = await Promise.all([act.boundingBox(), page.locator(".pg-slot nav").boundingBox()]);
      if (!box || !strip) throw new Error(`${tab}: the act or the row of views has no box`);
      expect(Math.abs(box.y + box.height / 2 - (strip.y + strip.height / 2)), `${tab}: on the row`).toBeLessThan(4);
      expect(box.x, `${tab}: after the views`).toBeGreaterThan(strip.x + strip.width);
    }
    await page.getByTestId("inbox-new").click();
    const sheet = page.getByTestId("ix-new");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Who is it for?");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("N opens it from the page, and a person picked is read for how they can be reached", async ({ page }) => {
    const slug = await slugOfHome(page);
    await open(page, `/w/${slug}/inbox`);
    // N answers a role that may write (host.tsx onNewKey), and the role is a viewer's until the workspace read says who
    // is looking: the sidebar stands before that, and an N pressed under it opened nothing (31 Oct 2026). The act's gate
    // lifts when the read is in.
    const act = page.getByTestId("inbox-new");
    await expect(act).toBeVisible();
    await expect(act).not.toHaveAttribute("data-gated");
    await page.locator("body").press("n");
    const sheet = page.getByTestId("ix-new");
    await expect(sheet).toBeVisible();
    const picks = page.getByTestId("ix-new-who-pick");
    // A workspace with nobody in it has nobody to pick: the pick says so, and there is no more to read.
    if (!(await picks.count())) return;
    await picks.first().click();
    await expect(page.getByTestId("ix-new-plan")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("ix-new-for")).not.toBeEmpty();
    // Each wire is said: the one a message goes by with what it carries, or all three with why none can.
    await expect(page.getByTestId("ix-new-way").or(page.getByTestId("ix-new-no-way")).first()).toBeVisible();
    // The way back to the pick, and out, with nothing written: closing asks nothing.
    await page.getByTestId("ix-new-change").click();
    await expect(page.getByTestId("ix-new-who")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("an address names the sheet: it opens, and the Inbox has its own address again", async ({ page }) => {
    const slug = await slugOfHome(page);
    await open(page, `/w/${slug}/inbox/new`);
    await expect(page.getByTestId("ix-new")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => routeOf(page.url())).toBe("inbox");
    // A reload of the address it left behind opens no sheet: the door was taken once.
    await page.reload();
    await expect(page.locator(".inbox")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ix-new")).toBeHidden();
  });
});

test.describe("A conversation begins from the Inbox, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the act says + New beside the row of views, its whole name a screen reader's, and the sheet opens with no field in focus", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    await page.goto(`/w/${slug}/inbox`);
    const act = page.getByRole("button", { name: "New conversation" });
    await expect(act).toBeVisible({ timeout: 30_000 });
    const box = await act.boundingBox();
    if (!box) throw new Error("the act has no box");
    // A capsule with its mark and its first word, 36px as People's scopes draw theirs: a bare plus in a circle said
    // nothing of what it makes (Ruben, 8 October 2026). The rest of the name is kept for a screen reader alone.
    expect(Math.round(box.height), "a 36px capsule").toBe(36);
    expect(box.width, "it holds a word, so it is wider than the circle it was").toBeGreaterThan(60);
    await expect(act.locator(".pg-act-keep")).toHaveText("New");
    const rest = await act.locator(".pg-act-rest").boundingBox();
    expect(rest ? Math.round(rest.width) : 0, "the rest of its name is drawn").toBeLessThanOrEqual(1);
    const mark = await act.locator("svg").boundingBox();
    if (!mark) throw new Error("the act's mark is not drawn");
    expect(mark.x, "the mark stands outside the capsule").toBeGreaterThanOrEqual(box.x);
    expect(mark.x + mark.width, "the mark stands outside the capsule").toBeLessThanOrEqual(box.x + box.width);
    // The row of views still fits beside it: nothing scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await act.tap();
    await expect(page.getByTestId("ix-new")).toBeVisible();
    await expect(page.getByTestId("ix-new")).toContainText("Who is it for?");
    // On a touch screen no field takes focus as the sheet rises: the keyboard waits for a tap on the field.
    expect(
      await page.evaluate(() => {
        const at = document.activeElement;
        return !!at && at.matches("input, textarea, select, [contenteditable='true']");
      }),
      "a field took focus as the sheet rose, which raises a phone's keyboard over it",
    ).toBe(false);
  });
});
