import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Google, on a real workspace: the listing route answers honestly about what
 * this deployment can do and never carries a key; without a Places key on
 * the edge there is no row on Setup, no section on Reports and no card on
 * Integrations; with one and no listing yet, each offers the one next step.
 * Read-only: nothing here links, reads or removes a listing.
 */
test.describe("Google on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the route says whether listings can be looked up, and never a key", async ({ page }) => {
    const res = await page.request.get("/api/v1/google");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(typeof data.google.ready.places).toBe("boolean");
    expect(typeof data.google.ready.profile).toBe("boolean");
    expect(Array.isArray(data.google.reviews)).toBe(true);
    expect(Array.isArray(data.google.days)).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/AIza|api_key|secret|token/i);
  });

  test("Setup, Reports and Integrations follow the platform's readiness, then the listing", async ({ page }) => {
    const { data } = await (await page.request.get("/api/v1/google")).json();
    const ready: boolean = data.google.ready.places;
    const linked = !!data.google.listing;

    await page.goto("/#/admin/setup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("setup-readiness")).toBeVisible();
    const row = page.getByTestId("setup-row-google");
    if (!ready) {
      await expect(row).toHaveCount(0);
    } else {
      await expect(row).toBeVisible();
      await expect(row).toContainText("Your Google listing");
      await expect(row.locator(".cl-attn-status .lead")).toHaveText(linked ? /^(Ready|Waiting on Google)$/ : "Not started");
      if (!linked) await expect(row.getByTestId("setup-verb")).toHaveText("Find it");
    }

    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    if (!ready) {
      await expect(page.getByTestId("google-none")).toHaveCount(0);
      await expect(page.getByTestId("google-tiles")).toHaveCount(0);
    } else if (!linked) {
      await expect(page.getByTestId("google-none")).toContainText("Find it on Setup");
    } else {
      const tiles = page.getByTestId("google-tiles").locator(".rp2-tile");
      await expect(tiles).toHaveCount(4);
      for (const v of await tiles.locator(".rp2-tile-value").allInnerTexts()) expect(v.trim()).toMatch(/^(\d+(\.\d)?|—|just now|\d+[smhd] ago|[A-Z][a-z]{2} \d{1,2})$/);
    }

    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("channels")).toBeVisible();
    const card = page.getByTestId("google-card");
    if (!ready) await expect(card).toHaveCount(0);
    else await expect(card).toContainText(linked ? /Watched|Could not be read/ : "Your listing on Google");
    // The second door is named, never drawn as a button.
    await expect(page.getByTestId("not-available")).toContainText("Google Business Profile");
  });
});
