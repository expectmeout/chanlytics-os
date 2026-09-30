import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { routeOf } from "./address";

/**
 * Live, on a real workspace.
 *
 * The seeded console showed Selena Cho on an invented call with Live Listen,
 * Take Over and End Call — none of which the phone provider offers for a
 * hosted agent. The real page lists the calls in progress under the heartbeat
 * rule, runs a clock from each call's real start, and opens on the last call's
 * summary when nobody is on the line. Read-only: nothing here changes a call.
 *
 * Live is a view of the Inbox's door (#655), so its list is the Inbox's shape:
 * card rows at the Inbox's width, not a table, and no second list of the calls
 * Conversations › Calls already holds.
 */
const INVENTED = [
  "Selena Cho",
  "Aisha Khan",
  "Maya Rodriguez",
  "Serenity Spa",
  "Phone Rep",
  "Live Listen",
  "Take Over",
  "End Call",
  "Take-overs",
];

test.describe("Live on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the page is real, honest about the line, and offers no control the provider lacks", async ({ page }) => {
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    const live = page.getByTestId("live-real");
    await expect(live).toBeVisible();

    const text = await live.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);

    // The list leads with "Right now" and a count.
    await expect(live.locator(".lm-list-label").first()).toContainText(/right now/i);
    const count = live.locator(".lm-list-count").first();
    await expect(count).toHaveText(/^\d+ calls?$/);

    // Either a call is up — a Live pill and a clock that moves — or the page
    // says what the line is doing instead of inventing a caller.
    const liveRows = live.getByTestId("live-row");
    if ((await liveRows.count()) > 0) {
      await expect(liveRows.first().locator(".pill-accent")).toContainText("Live");
      const clock = liveRows.first().locator(".lm-row-clock");
      const before = await clock.innerText();
      await page.waitForTimeout(2200);
      expect(await clock.innerText(), "the elapsed clock runs").not.toBe(before);
    } else {
      // A workspace without a phone line says so twice, in the line stat and in
      // the note under the list, and either one is the honest answer.
      await expect(live.getByText(/No call in progress|no phone line yet/).first()).toBeVisible();
    }

    // No table and no "Recent" list: every call is in Conversations › Calls,
    // and the list's door opens it.
    await expect(live.locator("table")).toHaveCount(0);
    await expect(live.getByTestId("recent-row")).toHaveCount(0);
    await expect(live.getByTestId("live-to-calls")).toBeVisible();

    // With nobody on the line the panel opens on the last call, when there is
    // one, and shows its summary state — never a blank.
    const summary = live.getByTestId("live-summary");
    if ((await liveRows.count()) === 0 && (await summary.count()) > 0) {
      await expect(summary.locator(".lm-summary-title")).not.toBeEmpty();
    }
  });

  test("Live's list is the Inbox's width: switching the Inbox's views does not move the list's edge", async ({
    page,
  }) => {
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    const inboxList = await page.locator(".ix-list").first().boundingBox();
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("live-real")).toBeVisible();
    const liveList = await page.locator(".lm-list").first().boundingBox();
    expect(inboxList && liveList, "both lists drew").toBeTruthy();
    // It was 400px against the Inbox's 340: pressing Live moved the edge 60px.
    expect(Math.round(liveList!.width)).toBe(Math.round(inboxList!.width));
    expect(Math.round(liveList!.x)).toBe(Math.round(inboxList!.x));
  });

  test("the Inbox's tab strip pulses Live only when a call is really up", async ({ page }) => {
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("live-real")).toBeVisible();
    const liveRows = await page.getByTestId("live-row").count();
    const tab = page.locator(".stabs-tab", { hasText: "Live" });
    await expect(tab).toBeVisible();
    await expect(tab.locator(".live-dot")).toHaveCount(liveRows > 0 ? 1 : 0);
  });
  /**
   * Live is a page of its own (decision 0015, step 8): an App Router page at /w/<slug>/live, and a call a door names is an
   * address under it (/w/<slug>/live/<call>), which the page follows and writes back as it opens calls (replaced, never
   * pushed). The frame draws its chrome around the page: the Inbox's Live tab lit, its crumbs the Inbox and Live.
   */
  test("Live is a page of its own on its path: it boots there, the frame around it, and the router walks it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);

    // A load of the path boots the frame with Inbox lit and Live's page drawn inside it.
    await page.goto("/api/version");
    await page.goto(`/w/${slug}/live`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Inbox");
    await expect(page.getByTestId("live-real")).toBeVisible();
    expect(routeOf(page.url())).toBe("live");

    // Away to a route the frame's own table draws, and Back: the router lands on Live again.
    await page.locator(".nav-item", { hasText: "Today" }).click();
    await expect.poll(() => routeOf(page.url())).toBe("today");
    await expect(page.getByTestId("live-real")).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("live");
    await expect(page.getByTestId("live-real")).toBeVisible();

    // The hash address emails and bells say still lands, and moves to the path.
    await page.goto(`/w/${slug}#/live`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/live`);
    await expect(page.getByTestId("live-real")).toBeVisible();

    // A call the workspace does not hold is said to be gone, never another call in its place.
    await page.goto(`/w/${slug}/live/no-such-call`);
    await expect(page.getByTestId("live-real")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("live-missing")).toBeVisible();
    expect(routeOf(page.url())).toBe("live/no-such-call");
  });
});
