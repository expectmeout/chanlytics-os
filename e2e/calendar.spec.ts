import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { activeWorkspace, scoped, apiGet } from "./workspace";
import { routeOf } from "./address";
import { expectLit, placeRow } from "./shell/places";

/**
 * Calendar on a real workspace.
 *
 * The route renders the real board, not the Coming Soon card or the
 * mockup's two-way-synced spa with its therapists and dollars. A workspace
 * with no feed still gets its hours and closures, and is told plainly that
 * no calendar is connected; one with a feed gets the taken blocks and the
 * windows the receptionist would offer. Read-only: moving weeks only
 * issues a GET.
 *
 * The Calendar is a page of its own on its path (decision 0015, step 6): an App Router page at `/w/<slug>/calendar`, and at
 * `/w/<slug>/calendar/<YYYY-MM-DD>` a day opened in Day view, the frame drawing its chrome around it. Its views are the
 * frame's strip over it (`calendar/week`, `calendar/month`, ...), links the page follows; the hours, the rules and the
 * calendar's read are a sheet Settings opens (the Calendar's lane F, D6).
 */
/** Hours and rules, opened as an owner does: Settings at the bar's end, then its item. The kit's sheet, on the page's body. */
async function openRules(page: import("@playwright/test").Page) {
  await page.getByTestId("cal-options").click();
  await page.getByRole("menuitem", { name: "Hours and rules" }).click();
  const sheet = page.getByTestId("cal-rules");
  await expect(sheet).toBeVisible();
  return sheet;
}
/** A write is refused unless it comes from the app: the same-origin guard every mutating route applies. */
const fromTheApp = { headers: { origin: new URL(process.env.E2E_BASE_URL ?? "https://app.chanlytics.com").origin } };
const INVENTED = [
  "Two-way sync",
  "Apple iCal",
  "Utilization",
  "Lena",
  "Jay",
  "Swedish",
  "Hot stone",
  "At risk",
  "double-booking",
];

test.describe("Calendar on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the real board from the workspace's hours, closures and feed, and never invents an appointment", async ({
    page,
  }) => {
    await page.goto("/#/calendar");
    await page.waitForLoadState("networkidle");
    const board = page.getByTestId("calendar-real");
    await expect(board).toBeVisible();

    const text = await board.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    expect(text).not.toMatch(/\$\d/);

    const res = await apiGet(page, "/api/v1/calendar");
    expect(res.status()).toBe(200);
    const cal = (await res.json()).data.calendar as {
      feed: { present: boolean; state: string; by_hand?: boolean; notices?: { tool: string | null } };
      days: Array<{ items: unknown[]; windows: unknown[] }>;
    };
    expect(JSON.stringify(cal)).not.toContain("ical_url");

    // Seven day columns, and Show, whose caption is the legend, in the bar on the frame's row of views.
    await expect(board.getByTestId("cal-dayhead")).toHaveCount(7);
    await expect(board.getByTestId("cal-col")).toHaveCount(7);
    await expect(page.getByTestId("cal-bar").getByTestId("cal-show")).toBeVisible();

    // The blocks and windows are exactly the route's. With no calendar that reads, the route's items are the bookings
    // that arrived by email (the appointments record) and nothing else, and no open time is named.
    const items = cal.days.reduce((a, d) => a + d.items.length, 0);
    const windows = cal.days.reduce((a, d) => a + d.windows.length, 0);
    if (cal.feed.state === "ok") {
      expect(await board.getByTestId("cal-window").count()).toBe(windows);
    } else {
      await expect(board.getByTestId("cal-window")).toHaveCount(0);
      if (!items) await expect(board.getByTestId("cal-block")).toHaveCount(0);
    }
    expect((await board.getByTestId("cal-block").count()) + (await board.locator(".cal-allday").count())).toBe(items);
    // The board's one notice (CAL-12) says only what is the owner's to see or do. A business that books by hand said so in
    // Settings, and is told nothing; a calendar link that could not be read says so; no link says so, or, with a booking
    // tool named, where its emails stand when they need the owner (emails that work say nothing over the board).
    const notice = board.getByTestId("cal-notice-feed");
    if (cal.feed.by_hand) await expect(notice).toHaveCount(0);
    else if (cal.feed.present && cal.feed.state !== "ok") await expect(notice).toContainText("could not be read");
    else if (!cal.feed.present && !cal.feed.notices?.tool) await expect(notice).toContainText("No calendar connected");
    else if (!cal.feed.present && (await notice.count()))
      await expect(notice).toContainText(
        /needs? a look|Waiting for the first booking email|needs an address|confirm the forward/,
      );
    // The feed's state is in Hours and rules, the one state Connections and Setup say too (contracts calendarSourceOf): a
    // calendar link's read in CALENDAR_FEED_WORDS, or, with no link, where the booking tool's emails stand or that the
    // owner books by hand.
    const rules = await openRules(page);
    await expect(rules).toContainText(/Hours|Closed|Booking/);
    await expect(rules.getByTestId("cal-feed-state")).toContainText(
      /^(Readable|Last good read|Could not be read|Not connected|By email|Waiting for the first email|Needs you|\d+ to look at|Booked by hand)$/,
    );
    await page.keyboard.press("Escape");
    await expect(rules).toBeHidden();
  });

  test("switching views is instant — no read — and Today, the arrows and a date move the anchor; only a far move reads again", async ({
    page,
  }) => {
    await page.goto("/#/calendar");
    await page.waitForLoadState("networkidle");
    const board = page.getByTestId("calendar-real");
    await expect(board).toBeVisible();
    // The bar is the page's act on the frame's row of views, beside the views (board-parts.tsx calendarAct).
    const bar = page.getByTestId("cal-bar");

    // The window around today is loaded once; every view is a slice of it.
    const reads: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/v1/calendar?") && r.method() === "GET") reads.push(r.url());
    });
    // The views are the frame's strip over the board: links to each view's address, which the page follows.
    await page.getByTestId("cal-view-month").click();
    await expect(board.getByTestId("cal-month")).toBeVisible();
    await expect(board.getByTestId("cal-month-cell")).toHaveCount(42);
    await expect(bar.getByTestId("cal-range")).toContainText(/\d{4}/);
    await page.getByTestId("cal-view-agenda").click();
    await expect(board.getByTestId("cal-agenda")).toBeVisible();
    await expect(board.getByTestId("cal-agenda-day")).toHaveCount(14);
    await page.getByTestId("cal-view-day").click();
    await expect(board.getByTestId("cal-col")).toHaveCount(1);
    await page.getByTestId("cal-view-week").click();
    await expect(board.getByTestId("cal-col")).toHaveCount(7);
    const before = await bar.getByTestId("cal-range").innerText();
    await bar.getByTestId("cal-next").click();
    await expect(bar.getByTestId("cal-range")).not.toHaveText(before);
    await expect(bar.getByTestId("cal-today")).toBeEnabled();
    await bar.getByTestId("cal-today").click();
    await expect(bar.getByTestId("cal-range")).toHaveText(before);
    await expect(bar.getByTestId("cal-today")).toBeDisabled();
    expect(reads, "no read for a view switch, a week, or Today inside the window").toEqual([]);

    // Three months out is outside the window: one read, for a window around that day. The range opens the kit's date
    // picker (a month of days over the page); Page Down walks it a month at a time and Enter chooses the day it stands on.
    const req = page.waitForRequest(
      (r) => r.url().includes("/api/v1/calendar?") && r.url().includes("days=63") && r.method() === "GET",
    );
    await bar.getByTestId("cal-jump").click();
    await expect(page.getByRole("dialog", { name: "Go to a date" })).toBeVisible();
    for (let month = 0; month < 3; month++) await page.keyboard.press("PageDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Go to a date" })).toBeHidden();
    const seen = await req;
    expect(seen.url()).toContain("from=");
    await expect(board.getByTestId("cal-col")).toHaveCount(7);
    await expect(bar.getByTestId("cal-jump")).toBeVisible();
  });

  test("adding a person from an appointment is get-or-create: an existing number returns them, a bad one is refused, nothing is duplicated", async ({
    page,
  }) => {
    const ws = await activeWorkspace(page);
    const before = (await (await apiGet(page, "/api/v1/contacts")).json()).data.people as Array<{
      id: string;
      phone_e164: string | null;
    }>;
    const bad = await page.request.post(scoped("/api/v1/contacts", ws), {
      data: { phone: "not a number", source: "calendar" },
      ...fromTheApp,
    });
    expect(bad.status()).toBe(400);
    expect(((await bad.json()).error?.message ?? "") as string).toContain("phone");
    const known = before.find((p) => p.phone_e164);
    if (known) {
      const again = await page.request.post(scoped("/api/v1/contacts", ws), {
        data: { phone: known.phone_e164, source: "calendar" },
        ...fromTheApp,
      });
      const body = await again.json();
      // The status and the reason, never the number: this message reaches the
      // run log, which is not the seven-day artifact the workflow confines a
      // real workspace's data to.
      expect(
        again.status(),
        `re-adding a stored number answered ${again.status()}: ${JSON.stringify(body.error ?? {})}`,
      ).toBe(200);
      expect(body.data).toEqual({ contact_id: known.id, existed: true });
      const after = (await (await apiGet(page, "/api/v1/contacts")).json()).data.people as unknown[];
      expect(after.length, "an existing number adds nobody").toBe(before.length);
    }
  });

  test("every view scrolls to its last day, on a desktop screen and on a phone -- the views grew under a Calendar that clips, and nothing below the fold could be reached", async ({
    page,
  }) => {
    for (const size of [
      { width: 1280, height: 720 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/#/calendar");
      await page.waitForLoadState("networkidle");
      const board = page.getByTestId("calendar-real");
      await expect(board).toBeVisible();
      for (const view of ["week", "month", "agenda"]) {
        await page.getByTestId(`cal-view-${view}`).click();
        await expect(page.getByTestId(`cal-view-${view}`)).toHaveAttribute("aria-current", "page");
        // Scroll whatever scrolls to its end, then ask whether the last day is on screen. toBeVisible cannot say it: a box
        // cut off by an overflow is still "visible". (The legend is Show's caption now, in its menu, never under the board.)
        // Asked until the view has slid in: measured mid-slide on a phone, the month's last row was still on its way.
        const reached = () =>
          board.evaluate((cal) => {
            // Whatever scrolls: the grid, the body, and on a phone the window (mobile.css, "The window scrolls").
            const scrolls = (el: Element | null) => !!el && el.scrollHeight > el.clientHeight + 1;
            const grid = cal.querySelector(".cal-scroll");
            const body = cal.querySelector(".cal-body");
            const pane = cal.querySelector(".cal-pane");
            for (const el of [grid, body, pane, cal]) if (el) el.scrollTop = el.scrollHeight;
            window.scrollTo(0, document.scrollingElement!.scrollHeight);
            const scroller = [grid, body, pane].find(scrolls) ?? grid ?? body ?? cal;
            const bottom = (el: Element) => el.getBoundingClientRect().bottom;
            const days = scroller.querySelectorAll(
              '[data-testid="cal-col"], [data-testid="cal-month-cell"], [data-testid="cal-agenda-day"]',
            );
            const last = days[days.length - 1];
            const clip = Math.min(window.innerHeight, bottom(cal));
            return { lastDay: !!last && bottom(last) <= Math.min(clip, bottom(scroller)) + 1 };
          });
        await expect.poll(reached, { message: `${view} at ${size.width}x${size.height}` }).toEqual({ lastDay: true });
      }
    }
  });

  test("the Calendar is a page of its own on its path: it boots there, a day address opens that day, and the router walks it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);

    // A load of the path boots the frame with Calendar lit and the page drawn inside it.
    await page.goto("/api/version");
    await page.goto(`/w/${slug}/calendar`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expectLit(page, "Calendar");
    await expect(page.getByTestId("calendar-real")).toBeVisible();
    expect(routeOf(page.url())).toBe("calendar");

    // An address under it: a whole date opens that day in Day view, one column, and the frame around it is the same.
    const day = new Date();
    day.setDate(day.getDate() + 1);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    await page.goto("/api/version");
    await page.goto(`/w/${slug}/calendar/${key}`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    const board = page.getByTestId("calendar-real");
    await expect(board).toBeVisible();
    await expect(page.getByTestId("cal-view-day")).toHaveAttribute("aria-current", "page");
    await expect(board.getByTestId("cal-col")).toHaveCount(1);
    expect(routeOf(page.url())).toBe(`calendar/${key}`);
    await expectLit(page, "Calendar");

    // Away to a route the frame's own table draws, and Back: the router lands on the day again, and the page is there.
    await placeRow(page, "Today").click();
    await expect.poll(() => routeOf(page.url())).toBe("today");
    await expect(page.getByTestId("calendar-real")).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe(`calendar/${key}`);
    await expect(page.getByTestId("calendar-real")).toBeVisible();
    await page.goForward();
    await expect.poll(() => routeOf(page.url())).toBe("today");

    // And to the Calendar by the sidebar: a route with a page of its own asks the router, and the frame stays.
    await placeRow(page, "Calendar").click();
    await expect.poll(() => routeOf(page.url())).toBe("calendar");
    await expect(page.getByTestId("calendar-real")).toBeVisible();
    await expect(page.getByTestId("cal-view-week")).toHaveAttribute("aria-current", "page");

    // The hash address the emails and the phone app say lands on the path.
    await page.goto("/api/version");
    await page.goto(`/w/${slug}#/calendar/${key}`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/calendar/${key}`, { timeout: 30_000 });
    await expect(page.getByTestId("calendar-real")).toBeVisible();
  });

  test("the calendar sweep on the edge refuses a call without the sweep key", async ({ request }) => {
    const res = await request.post("https://chanlytics-messaging.vercel.app/api/cron/calendar", { data: {} });
    expect([401, 503]).toContain(res.status());
  });
});
