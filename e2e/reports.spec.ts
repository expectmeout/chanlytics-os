import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Reports, on a real workspace (the redesign of September 2026).
 *
 * The receptionist's share of the answered as a meter beside Worth knowing, five tiles compared with the period before
 * in counts, then the cards, each with a table twin, and nothing in dollars. Read-only: the range control only issues a
 * GET, and Ask is not pressed.
 */
const INVENTED = ["Revenue", "Agent performance", "Segment health", "Lead sources", "Where bookings come from", "Your judgment layer", "Phone Rep", "Share"];

test.describe("Reports on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the headline, five tiles, one period control above everything, cards with table twins, no money", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const text = await report.innerText();
    for (const s of INVENTED) expect(text, `invented copy: "${s}"`).not.toContain(s);
    expect(text, "revenue has no column").not.toMatch(/\$\d/);

    await expect(report.getByTestId("reports-hero")).toContainText("answered by your receptionist");

    const tiles = report.getByTestId("reports-tiles").locator(".rpt-tile");
    await expect(tiles).toHaveCount(5);
    const labels = (await tiles.locator(".rpt-tile-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["customer messages", "calls", "new people", "booked", "needed you"]);
    // A count (or a dash with no calendar), and the period before in counts when it had some: never a percentage.
    for (const v of await tiles.locator(".rpt-tile-value").allInnerTexts()) {
      expect(v.trim()).toMatch(/^(\d+|—)\s*(up from \d+|down from \d+|same as the \d+ days before|none the \d+ days before)?$/);
    }

    const ranges = report.locator(".rpt-range button");
    await expect(ranges).toHaveCount(3);
    await expect(ranges.filter({ hasText: "30 days" })).toHaveAttribute("aria-pressed", "true");
    await expect(report.getByRole("button", { name: "Ask about this period" })).toBeVisible();
    await expect(report.getByTestId("chart-campaigns")).toBeVisible();

    // A workspace nobody reached in the period has one honest card instead of the charts, and no Worth knowing.
    if (await report.getByTestId("reports-empty").count()) {
      await expect(report.getByTestId("reports-facts")).toHaveCount(0);
      return;
    }
    await expect(report.getByTestId("reports-facts")).toContainText("Worth knowing");
    const main = report.getByTestId("chart-answered");
    if (await main.locator(".empty").count()) {
      await expect(main.getByText("No customer messages in this period")).toBeVisible();
    } else {
      for (const who of ["Receptionist", "You", "Unanswered"]) await expect(main.locator(".ck-legend-item", { hasText: who })).toHaveCount(1);
      await expect(main.locator("svg").first()).toBeVisible();
    }
    // Either way it has a table twin.
    await main.hover();
    await main.getByTestId("card-table").click();
    await expect(main.locator("table thead th")).toHaveCount(8);
    for (const id of ["chart-reply", "chart-reasons", "chart-calls", "chart-booking", "chart-channels", "chart-rhythm", "chart-people"]) {
      await expect(report.getByTestId(id), id).toBeVisible();
    }
  });

  test("changing the period asks the API for that window and keeps the frame while it loads", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const req = page.waitForRequest((r) => r.url().includes("/api/v1/reports") && r.url().includes("days=7") && r.method() === "GET");
    await report.locator(".rpt-range button", { hasText: "7 days" }).click();
    const seen = await req;
    expect(seen.url()).toContain("workspace=");
    await expect(report.locator(".rpt-range button", { hasText: "7 days" })).toHaveAttribute("aria-pressed", "true");
    await expect(report.getByTestId("reports-hero")).toBeVisible();
  });

  test("asked, then booked: the share from the calendar, the calendar's own sentence, or a read that failed", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("chart-booking");
    if (await card.count()) {
      await expect(card).toContainText(/have an appointment on the calendar|Nobody asked|Connect your calendar|Couldn't read your calendar/);
    } else {
      // An empty period shows one card instead of the sections; the route still carries the line.
      const res = await apiGet(page, "/api/v1/reports?days=30");
      expect((await res.json()).data).toHaveProperty("booking");
    }
  });
});
