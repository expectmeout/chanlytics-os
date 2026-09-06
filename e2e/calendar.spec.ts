import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Calendar on a real workspace.
 *
 * The route renders the real board, not the Coming Soon card or the
 * mockup's two-way-synced spa with its therapists and dollars. A workspace
 * with no feed still gets its hours and closures, and is told plainly that
 * no calendar is connected; one with a feed gets the taken blocks and the
 * windows the receptionist would offer. Read-only: moving weeks only
 * issues a GET.
 */
const INVENTED = ["Two-way sync", "Google Calendar", "Apple iCal", "Utilization", "Lena", "Jay", "Swedish", "Hot stone", "At risk", "double-booking"];

test.describe("Calendar on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the real board from the workspace's hours, closures and feed, and never invents an appointment", async ({ page }) => {
    await page.goto("/#/calendar");
    await page.waitForLoadState("networkidle");
    const board = page.getByTestId("calendar-real");
    await expect(board).toBeVisible();

    const text = await board.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    expect(text).not.toMatch(/\$\d/);

    const res = await page.request.get("/api/v1/calendar");
    expect(res.status()).toBe(200);
    const cal = (await res.json()).data.calendar as { feed: { present: boolean; state: string }; days: Array<{ items: unknown[]; windows: unknown[] }> };
    expect(JSON.stringify(cal)).not.toContain("ical_url");

    // Seven day columns, the legend, the feed chip in the schema's words.
    await expect(board.getByTestId("cal-dayhead")).toHaveCount(7);
    await expect(board.getByTestId("cal-col")).toHaveCount(7);
    await expect(board.getByTestId("cal-legend")).toBeVisible();
    await expect(board.getByTestId("cal-feed")).toContainText(/From your calendar|No calendar connected|could not be read/);

    // The blocks and windows are exactly the route's.
    const items = cal.days.reduce((a, d) => a + d.items.length, 0);
    const windows = cal.days.reduce((a, d) => a + d.windows.length, 0);
    if (cal.feed.state === "ok") {
      expect(await board.getByTestId("cal-window").count()).toBe(windows);
      expect(await board.getByTestId("cal-block").count() + (await board.locator(".cal-allday").count())).toBe(items);
    } else {
      await expect(board.getByTestId("cal-feed-card")).toBeVisible();
      await expect(board.getByTestId("cal-block")).toHaveCount(0);
      await expect(board.getByTestId("cal-window")).toHaveCount(0);
    }
    if (!cal.feed.present) await expect(board.getByTestId("cal-feed-card")).toContainText("No calendar connected");
  });

  test("moving the week asks the API for that span and keeps the board; Day view shows one column", async ({ page }) => {
    await page.goto("/#/calendar");
    await page.waitForLoadState("networkidle");
    const board = page.getByTestId("calendar-real");
    await expect(board).toBeVisible();
    const before = await board.getByTestId("cal-range").innerText();
    const req = page.waitForRequest((r) => r.url().includes("/api/v1/calendar") && r.url().includes("from=") && r.method() === "GET");
    await board.getByTestId("cal-next").click();
    const seen = await req;
    expect(seen.url()).toContain("workspace=");
    await expect(board.getByTestId("cal-range")).not.toHaveText(before);
    // exact: once the week moves, a "Today" button appears and "Day" would match it too.
    await board.getByRole("button", { name: "Day", exact: true }).click();
    await expect(board.getByTestId("cal-col")).toHaveCount(1);
  });

  test("a month of counts and an agenda, each read for its own span; the rules bar carries Settings' words", async ({ page }) => {
    await page.goto("/#/calendar");
    await page.waitForLoadState("networkidle");
    const board = page.getByTestId("calendar-real");
    await expect(board).toBeVisible();
    await expect(board.getByTestId("cal-rules")).toContainText(/Hours|Closed|Rules/);

    const month = page.waitForRequest((r) => r.url().includes("/api/v1/calendar") && r.url().includes("days=42") && r.method() === "GET");
    await board.getByTestId("cal-view-month").click();
    await month;
    await expect(board.getByTestId("cal-month")).toBeVisible();
    expect(await board.getByTestId("cal-month-cell").count()).toBe(42);
    await expect(board.getByTestId("cal-range")).toContainText(/\d{4}/);

    const agenda = page.waitForRequest((r) => r.url().includes("/api/v1/calendar") && r.url().includes("days=14") && r.method() === "GET");
    await board.getByTestId("cal-view-agenda").click();
    await agenda;
    await expect(board.getByTestId("cal-agenda")).toBeVisible();
    expect(await board.getByTestId("cal-agenda-day").count()).toBe(14);
    await expect(board.getByTestId("cal-jump")).toBeVisible();
  });
});
