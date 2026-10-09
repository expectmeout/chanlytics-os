import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { routeOf } from "./address";

/**
 * Reports, on a real workspace: one App Router page of lenses (`/w/<slug>/reports`, the Overview, and
 * `/w/<slug>/reports/<lens>`), with the frame's chrome around it (decision 0015, and the lenses spec).
 *
 * The Overview: the receptionist's share of the answered as a meter beside Worth knowing, and a strip of five figures compared
 * with the period before in counts; then each lens's cards, each with a table twin, and nothing in dollars. Read-only: the
 * date range only issues a GET. It is the page's act at the right of the strip of lenses (the frame's row), outside the
 * page's own element: a capsule that says what the page is on and opens the four periods, three windows reached in one
 * press, and a month to pick any days on. Days a member picked are the address's (`reports/<lens>:<from>~<to>`), so a
 * link opens on them and Back walks them; they need 00360 on the database the app reads.
 */
const INVENTED = [
  "Revenue",
  "Agent performance",
  "Segment health",
  "Lead sources",
  "Where bookings come from",
  "Your judgment layer",
  "Phone Rep",
  "Share",
];

/**
 * What the Reviews lens draws from its own read once it has landed: the figures of the listing and Business Profile the nightly's
 * workspace is seeded with (tooling/scripts/ops/e2e-workspace.mjs). What they say is google.spec.ts's.
 */
const reviewsLens = (page: Page) => page.getByTestId("google-tiles");

test.describe("Reports on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the Overview: the headline, five tiles, one period control above everything, no money; each lens its own cards with table twins", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const text = await report.innerText();
    for (const s of INVENTED) expect(text, `invented copy: "${s}"`).not.toContain(s);
    expect(text, "revenue has no column").not.toMatch(/\$\d/);

    await expect(report.getByTestId("reports-hero")).toContainText("answered by your receptionist");

    const tiles = report.getByTestId("reports-tiles").locator(".figure");
    await expect(tiles).toHaveCount(5);
    const labels = (await tiles.locator(".figure-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["customer messages", "calls", "new people", "booked", "needed you"]);
    // A count (or a dash with no calendar), and the period before in counts when it had some: never a percentage.
    for (const v of await tiles.locator(".figure-value").allInnerTexts()) {
      expect(v.trim()).toMatch(
        /^(\d+|—)\s*(up from \d+|down from \d+|same as the \d+ days before|none the \d+ days before)?$/,
      );
    }

    await expect(page.locator(".pg-act-slot").getByTestId("reports-period"), "at the strip's right").toBeVisible();
    await expect(page.getByTestId("reports-period-open"), "it says the period it is on").toHaveText("30 days");
    await page.getByTestId("reports-period-open").click();
    const range = page.getByRole("dialog", { name: "Date range" });
    await expect(range).toBeVisible();
    await expect(range.getByRole("radio"), "the four periods").toHaveCount(4);
    await expect(page.getByTestId("period-30d")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("reports-period-range")).toHaveText(/\S+ \d+ – \S+ \d+/);
    await expect(page.getByTestId("reports-period-before")).toHaveText(/^Compared with \S+ \d+ – \S+ \d+$/);
    for (const id of ["yesterday", "last-week", "last-month"])
      await expect(page.getByTestId(`period-${id}`), "days reached in one press").toHaveAttribute(
        "aria-pressed",
        "false",
      );
    await expect(range.getByRole("grid", { name: "Days" }), "and a month to pick any days on").toBeVisible();
    await page.keyboard.press("Escape");
    await expect(range).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask about this period" }), "the period asks nothing").toHaveCount(0);

    // A workspace nobody reached in the period has one honest card instead of the charts, and no Worth knowing.
    if (await report.getByTestId("reports-empty").count()) {
      await expect(report.getByTestId("reports-facts")).toHaveCount(0);
      return;
    }
    await expect(report.getByTestId("reports-facts")).toContainText("Worth knowing");
    // The receptionist's lens: who answered, with a table twin.
    await page.getByTestId("lens-receptionist").click();
    const main = report.getByTestId("chart-answered");
    await expect(main).toBeVisible();
    if (await main.locator(".empty").count()) {
      await expect(main.getByText("No customer messages in this period")).toBeVisible();
    } else {
      for (const who of ["Receptionist", "You", "Unanswered"])
        await expect(main.locator(".ck-legend-item", { hasText: who })).toHaveCount(1);
      await expect(main.locator("svg").first()).toBeVisible();
    }
    // Either way it has a table twin.
    await main.hover();
    await main.getByTestId("card-table").click();
    await expect(main.locator("table")).toBeVisible();
    for (const id of ["chart-reply", "chart-reasons", "chart-calls", "chart-booking"]) {
      await expect(report.getByTestId(id), id).toBeVisible();
    }
    await page.getByTestId("lens-people").click();
    for (const id of ["chart-channels", "chart-rhythm", "chart-people"]) {
      await expect(report.getByTestId(id), id).toBeVisible();
    }
    await page.getByTestId("lens-campaigns").click();
    await expect(report.getByTestId("chart-campaigns")).toBeVisible();
    // Reviews is shown to every workspace, and draws from a read of its own: here, a listing's.
    await page.getByTestId("lens-reviews").click();
    await expect(reviewsLens(page)).toBeVisible();
  });

  test("Reports is a page of its own on its path: it boots there, the frame around it, and the router walks it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);

    // A load of the path boots the frame with Reports lit and the page drawn inside it.
    await page.goto("/api/version");
    await page.goto(`/w/${slug}/reports`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Reports");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    expect(routeOf(page.url())).toBe("reports");

    // Away to a route the frame's own table draws, and Back: the router lands on Reports again, and the page is there.
    await page.locator(".nav-item", { hasText: "Today" }).click();
    await expect.poll(() => routeOf(page.url())).toBe("today");
    await expect(page.getByTestId("reports-real")).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await page.goForward();
    await expect.poll(() => routeOf(page.url())).toBe("today");

    // And to Reports by the sidebar: a route with a page of its own asks the router, and the frame stays.
    await page.locator(".nav-item", { hasText: "Reports" }).click();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Reports");

    // A lens is an address on this one page: the strip's tabs are links, and a press moves the address without a request for a page.
    const documents: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "document") documents.push(r.url());
    });
    await expect(page.getByTestId("reports-lenses")).toBeVisible();
    await page.getByTestId("lens-receptionist").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/receptionist");
    await expect(page.getByTestId("chart-answered")).toBeVisible();
    await expect(page.getByTestId("reports-hero")).toHaveCount(0);
    await page.getByTestId("lens-people").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/people");
    await expect(page.getByTestId("chart-channels")).toBeVisible();
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("reports/receptionist");
    await expect(page.getByTestId("chart-answered")).toBeVisible();
    await page.getByTestId("lens-overview").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(page.getByTestId("reports-hero")).toBeVisible();
    expect(documents, "a move between lenses is never a page request").toEqual([]);

    // A lens address loads on its own, the frame around it; the Overview is `reports` and `reports/overview` is no address.
    await page.goto(`/w/${slug}/reports/campaigns`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("chart-campaigns")).toBeVisible();
    await expect(page.getByTestId("lens-campaigns")).toHaveAttribute("aria-current", "page");
    await page.goto(`/w/${slug}/reports/reviews`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await expect(page.getByTestId("lens-reviews")).toHaveAttribute("aria-current", "page");
    // The address read its own surface as it loaded: the lens is drawn, not waiting on the other lenses' reads.
    await expect(reviewsLens(page)).toBeVisible();
    // A pick of another period on it reads (the lens's own, for the period asked) and requests no page.
    documents.length = 0;
    const reviewsRead = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports/reviews") &&
        r.url().includes("period=7d") &&
        r.method() === "GET",
    );
    await page.getByTestId("reports-period-open").click();
    await page.getByTestId("period-7d").click();
    await reviewsRead;
    await page.getByTestId("reports-period-open").click();
    await expect(page.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(documents, "a pick of another period is never a page request").toEqual([]);
    await page.goto(`/w/${slug}/reports/overview`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toHaveCount(0);
    await page.goto(`/w/${slug}/reports/anything`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toHaveCount(0);

    // The Pipeline's address is a lens even where deals are off: its empty state, never a not-found.
    await page.goto(`/w/${slug}/reports/pipeline`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("rpt-deals").or(page.getByTestId("lens-empty"))).toBeVisible();
  });

  test("changing the period asks the API for that window and keeps the frame while it loads", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const req = page.waitForRequest(
      // The Reports read alone: a pick also reads `reports/headline` (Today's line) and `reports/campaigns`, and the first of those is no answer.
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports") && r.url().includes("period=7d") && r.method() === "GET",
    );
    await page.getByTestId("reports-period-open").click();
    await page.getByTestId("period-7d").click();
    const seen = await req;
    expect(seen.url()).toContain("workspace=");
    await expect(page.getByTestId("period-7d"), "a press of a period closes the popover").toBeHidden();
    await page.getByTestId("reports-period-open").click();
    await expect(page.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(report.getByTestId("reports-hero")).toBeVisible();
  });

  test("days picked on the month are the address's: read by their first and last day, kept across a lens, Back and a reload, and a period takes them out again", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    const open = page.getByTestId("reports-period-open");
    const days = /^reports\/(\d{4}-\d{2})-10~\1-12$/;

    // The month before this one always holds its 10th and its 12th, and neither is a day to come.
    await open.click();
    const range = page.getByRole("dialog", { name: "Date range" });
    await range.getByRole("button", { name: "Previous month" }).click();
    const day = (n: number) =>
      range.locator(".date-pick-cell:not([data-outside]) > .date-pick-day").filter({ hasText: new RegExp(`^${n}$`) });
    await day(10).click();
    await expect(range.locator(".date-pick-hint"), "a first press chooses nothing").toContainText("Press the last day");
    expect(routeOf(page.url()), "and moves nothing").toBe("reports");
    const read = page.waitForRequest((r) => {
      const u = new URL(r.url());
      return (
        u.pathname.endsWith("/api/v1/reports") &&
        /-10$/.test(u.searchParams.get("from") ?? "") &&
        /-12$/.test(u.searchParams.get("to") ?? "")
      );
    });
    await day(12).click();
    await read;
    await expect.poll(() => routeOf(page.url())).toMatch(days);
    await expect(open, "the capsule says the days").toHaveText(/^\S+ 10 – 12$/);
    await expect(range, "a pick closes the popover").toBeHidden();
    await expect(page.locator(".rpt-failed"), "they were read").toHaveCount(0);
    await open.click();
    await expect(range.getByRole("radio", { checked: true }), "and none of the four periods is these days").toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    await expect(range).toBeHidden();

    // Another lens is the same days there, and Back walks the ranges a member looked at: the lens before, then the period.
    const peopleOverDays = /^reports\/people:\d{4}-\d{2}-10~\d{4}-\d{2}-12$/;
    await page.getByTestId("lens-people").click();
    await expect.poll(() => routeOf(page.url())).toMatch(peopleOverDays);
    await expect(open).toHaveText(/^\S+ 10 – 12$/);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toMatch(days);
    await expect(open).toHaveText(/^\S+ 10 – 12$/);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(open, "an address with no days is the period kept").toHaveText("30 days");
    // Forward to the days again, and a link to them (the address, loaded afresh) opens on them.
    await page.goForward();
    await page.goForward();
    await expect.poll(() => routeOf(page.url())).toMatch(peopleOverDays);
    await expect(open).toHaveText(/^\S+ 10 – 12$/);
    await page.reload();
    await expect(page.getByTestId("reports-real")).toBeVisible({ timeout: 30_000 });
    await expect(open, "a link to days opens on them").toHaveText(/^\S+ 10 – 12$/);
    await expect(page.locator(".rpt-failed"), "and says nothing failed").toHaveCount(0);

    // A window reached in one press is days like any picked, and a period by name takes the days out of the address.
    await open.click();
    await page.getByTestId("period-yesterday").click();
    await expect.poll(() => routeOf(page.url())).toMatch(/^reports\/people:(\d{4}-\d{2}-\d{2})~\1$/);
    await expect(open).toHaveText("Yesterday");
    await expect(range, "a press of a shortcut closes the popover too").toBeHidden();
    await open.click();
    await expect(page.getByTestId("period-yesterday")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("period-30d").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/people");
    await expect(open).toHaveText("30 days");
    await expect(range, "and a press of a period").toBeHidden();
    await open.click();
    await expect(page.getByTestId("period-30d")).toHaveAttribute("aria-checked", "true");
  });

  test("asked, then booked: the share from the calendar, the calendar's own sentence, or a read that failed", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("chart-booking");
    if (await card.count()) {
      await expect(card).toContainText(
        /have an appointment on the calendar|Nobody asked|Add a calendar link|Couldn't read your calendar/,
      );
    } else {
      // An empty period shows one card instead of the sections; the route still carries the line.
      const res = await apiGet(page, "/api/v1/reports?period=30d");
      expect((await res.json()).data).toHaveProperty("booking");
    }
  });
});
