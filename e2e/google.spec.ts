import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

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
    const res = await apiGet(page, "/api/v1/google");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(typeof data.google.ready.places).toBe("boolean");
    expect(typeof data.google.ready.profile).toBe("boolean");
    expect(Array.isArray(data.google.reviews)).toBe(true);
    expect(Array.isArray(data.google.days)).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/AIza|api_key|secret|token/i);
  });

  test("Setup, Reports and Integrations follow the platform's readiness, then the listing", async ({ page }) => {
    const { data } = await (await apiGet(page, "/api/v1/google")).json();
    const ready: boolean = data.google.ready.places;
    const profile: boolean = data.google.ready.profile;
    const linked = !!data.google.listing;

    await page.goto("/#/admin/setup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("setup-readiness")).toBeVisible();
    const row = page.getByTestId("setup-row-google");
    if (!ready && !profile) {
      await expect(row).toHaveCount(0);
    } else {
      await expect(row).toBeVisible();
      await expect(row).toContainText("Your Google listing");
      await expect(row.locator(".cl-attn-status .lead")).toHaveText(
        linked ? /^(Ready|Waiting on Google)$/ : "Not started",
      );
      if (!linked) await expect(row.getByTestId("setup-verb")).toHaveText(ready ? "Find it" : "Connect");
    }

    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    if (!ready && !profile) {
      await expect(page.getByTestId("google-none")).toHaveCount(0);
      await expect(page.getByTestId("google-tiles")).toHaveCount(0);
    } else if (!linked) {
      await expect(page.getByTestId("google-none")).toContainText("Find it on Setup");
    } else {
      const tiles = page.getByTestId("google-tiles").locator(".rp2-tile");
      await expect(tiles).toHaveCount(4);
      for (const v of await tiles.locator(".rp2-tile-value").allInnerTexts())
        expect(v.trim()).toMatch(/^(\d+(\.\d)?|—|just now|\d+[smhd] ago|[A-Z][a-z]{2} \d{1,2})$/);
    }

    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("connections-connected")).toBeVisible();
    // Both doors are rows either way: "Later" where closed, a verb for an owner where open, the listing's state where linked.
    const profileRow = page.getByTestId("connection-google_profile");
    const listingRow = page.getByTestId("connection-google_listing");
    await expect(profileRow).toContainText("Google Business Profile");
    if (!profile) await expect(profileRow).toContainText("Later");
    if (!ready) await expect(listingRow).toContainText("Later");
    if (ready) await expect(listingRow).toContainText(linked ? /Watched|Could not be read/ : "Your listing on Google");
    await expect(JSON.stringify(await (await apiGet(page, "/api/v1/google")).json())).not.toMatch(
      /refresh_token|access_token|credentials_ref/,
    );
  });

  test("the way to Google refuses politely where the door is closed, and never leaks the state key", async ({
    page,
  }) => {
    // An account with more than one workspace must say which; the app's own calls always do.
    const ws = await (await page.request.get("/api/v1/workspaces")).json();
    const id = ws.data.activeWorkspaceId ?? ws.data.workspaces[0]?.id;
    const { data } = await (await page.request.get(`/api/v1/google?workspace=${id}`)).json();
    const res = await page.request.get(`/api/v1/google/connect?workspace=${id}`, { maxRedirects: 0 });
    if (!data.google.ready.profile) {
      expect([403, 409]).toContain(res.status());
    } else {
      expect(res.status()).toBe(302);
      const to = res.headers()["location"] ?? "";
      expect(to).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
      expect(to).toContain("access_type=offline");
      expect(to).toContain("prompt=consent");
      expect(to).not.toMatch(/client_secret/);
    }
    // A forged state is refused before anything is trusted.
    const back = await page.request.get(`/api/v1/google/callback?code=x&state=forged.forged&workspace=${id}`, {
      maxRedirects: 0,
    });
    expect(back.status()).toBe(302);
    expect(back.headers()["location"] ?? "").toMatch(/google=error&why=(state_signature|not_available)/);
  });
});
