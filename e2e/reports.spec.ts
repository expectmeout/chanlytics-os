import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Reports, on a real workspace.
 *
 * The seeded page led with revenue, bookings, eight agents and a share link
 * over invented numbers. The real one is the receptionist's own numbers over
 * a chosen period, every chart with a table twin and nothing in dollars.
 * Read-only; the range control only issues a GET.
 */
const INVENTED = ["Revenue", "Agent performance", "Segment health", "Lead sources", "Where bookings come from", "Your judgment layer", "Phone Rep", "Share"];

test.describe("Reports on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("six measured tiles, a period control above everything, charts with table twins, no money", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const text = await report.innerText();
    for (const s of INVENTED) expect(text, `invented copy: "${s}"`).not.toContain(s);
    expect(text, "revenue has no column").not.toMatch(/\$\d/);

    const tiles = report.locator(".rp2-strip-reception .rp2-tile");
    await expect(tiles).toHaveCount(6);
    const labels = (await tiles.locator(".rp2-tile-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["customer messages", "answered by the receptionist", "median reply time", "needed you", "calls", "new people"]);
    // A tile value is a count, a percentage or a duration — never a dash-free invention.
    for (const v of await tiles.locator(".rp2-tile-value").allInnerTexts()) expect(v.trim()).toMatch(/^(\d+|\d+%|—|\d+s|\d+m( \d{2}s)?|\d+h \d{2}m)$/);

    // Campaigns: five indicators beside the receptionist's, and the sources
    // card or the honest line — never a number the schema has no column for.
    const campaign = report.locator(".rp2-strip-campaigns .rp2-tile");
    await expect(campaign).toHaveCount(5);
    const campaignLabels = (await campaign.locator(".rp2-tile-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(campaignLabels).toEqual(["messages sent", "delivered", "replied", "said yes", "asked to stop"]);
    for (const v of await campaign.locator(".rp2-tile-value").allInnerTexts()) expect(v.trim()).toMatch(/^(\d+|\d+%|—)$/);
    await expect(report.getByTestId("chart-campaigns")).toBeVisible();

    // The period control is one row above the charts and scopes everything.
    const ranges = report.locator(".rp2-range .cl-tab");
    await expect(ranges).toHaveCount(3);
    await expect(ranges.filter({ hasText: "30 days" })).toHaveClass(/active/);

    // The main chart is an SVG with a legend of three series — or, when no
    // customer wrote in the period, an honest sentence instead of an empty plot.
    const main = report.getByTestId("chart-answered");
    await expect(main.locator(".rp2-legend .rp2-key")).toHaveCount(3);
    if (await main.locator(".rp2-empty").count()) {
      await expect(main.getByText("No customer messages in this period")).toBeVisible();
    } else {
      await expect(main.locator("svg")).toBeVisible();
    }
    // Either way it has a table twin.
    await main.getByRole("button", { name: "Table" }).click();
    const table = main.locator("table");
    await expect(table).toBeVisible();
    await expect(table.locator("thead th")).toHaveCount(8);
  });

  test("changing the period asks the API for that window and keeps the frame while it loads", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const req = page.waitForRequest((r) => r.url().includes("/api/v1/reports") && r.url().includes("days=7") && r.method() === "GET");
    await report.locator(".rp2-range .cl-tab", { hasText: "7 days" }).click();
    const seen = await req;
    expect(seen.url()).toContain("workspace=");
    await expect(report.locator(".rp2-range .cl-tab", { hasText: "7 days" })).toHaveClass(/active/);
    await expect(report.getByText(/last 7 days|7 days/i).first()).toBeVisible();
  });
});
