import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { reviewsFromProfile } from "../packages/contracts/src/google/google";

/**
 * Google, on a real workspace: the listing route answers honestly about what
 * this deployment can do and never carries a key; without a Places key on
 * the edge there is no row on Setup, the Reviews lens on Reports says there is
 * nothing to find and no card on Integrations; with one and no listing yet,
 * each offers the one next step. With a listing, Reviews draws five figures
 * where the Business Profile's reviews are on record and four where only the
 * five Google shows are. Read-only: nothing here links, reads or removes a
 * listing.
 */

/**
 * What each figure of the Reviews lens says as its number, by the metric it counts, in the order the lens draws them (contracts
 * report-tiles.ts and review-report.ts): a dash where the stored rows cannot say, never a zero.
 */
const PROFILE_FIGURES: ReadonlyArray<[string, RegExp]> = [
  ["rating", /^(\d\.\d|—)$/],
  ["reviews", /^(\d+|—)$/],
  ["reviews_written", /^(\d+|—)$/],
  ["reviews_answered", /^(\d+ of \d+|—)$/],
  ["review_reply_time", /^(\d+(s|m( \d+s)?|h( \d+m)?)|—)$/],
];
const PLACES_FIGURES: ReadonlyArray<[string, RegExp]> = [
  ["rating", /^(\d\.\d|—)$/],
  ["reviews", /^(\d+|—)$/],
  ["ratings_gained", /^(\d+|down \d+|—)$/],
  ["newest_review", /^(just now|\d+[smhd] ago|[A-Z][a-z]{2} \d{1,2}|—)$/],
];
/** The period before beside a number, in counts (compareWords, and the rating's own): never a percentage. */
const FIGURE_CHANGE = /^(up from \d+(\.\d)?|down from \d+(\.\d)?|same as the .+ before|none the .+ before)$/;
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

  test("the first run, Reports and Integrations follow the platform's readiness, then the listing", async ({
    page,
  }) => {
    const { data } = await (await apiGet(page, "/api/v1/google")).json();
    const ready: boolean = data.google.ready.places;
    const profile: boolean = data.google.ready.profile;
    const linked = !!data.google.listing;
    // Google's row put off by this member ("We're not on Google"), in their saved view.
    const views = (await (await apiGet(page, "/api/v1/views")).json()).data?.views ?? {};
    const putOff = Array.isArray(views.setup?.later) && views.setup.later.includes("google");

    // The listing is the first step's, which every workspace has reached.
    await page.goto("/#/start/business");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("first-run")).toBeVisible();
    const row = page.getByTestId("setup-row-google");
    const find = page.getByTestId("fr-find");
    if (!ready && !profile) {
      await expect(row).toHaveCount(0);
      await expect(find).toHaveCount(0);
    } else if (ready && !linked && !putOff) {
      // The owner, nothing linked: the step opens on Find, Google's answer for the name on record. Nothing is linked here.
      await expect(find).toBeVisible();
      await expect(page.getByTestId("fr-heading")).toContainText(/^Is this |^Which one is your business\?/);
      await expect(
        find
          .getByTestId("fr-find-hit")
          .first()
          .or(find.getByTestId("fr-find-none"))
          .or(find.getByTestId("fr-find-failed")),
      ).toBeVisible({ timeout: 20000 });
      await expect(row).toHaveCount(0);
    } else {
      await expect(row).toBeVisible();
      await expect(row).toContainText("Your Google listing");
      await expect(row.locator(".cl-attn-status .lead")).toHaveText(
        linked ? /^(Ready|Waiting on Google)$/ : "Not started",
      );
      if (!linked) await expect(row.getByTestId("setup-verb")).toHaveText(ready ? "Find it" : "Connect");
    }

    // Google is Reports' Reviews lens (surfaces/reports/lenses/reviews.tsx), at its own address since #1424 and drawn from its own
    // read (`reports/reviews`). Whose reviews it counts is the Business Profile's once a location is chosen and a sync has stored
    // them, and the five Google shows until then (contracts reviewsFromProfile, the one test): five figures and the cards that count
    // them, or four and the days gained.
    await page.goto("/#/reports/reviews");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    if (!ready && !profile && !linked) {
      // Nothing can be looked up or connected here: the registry's empty, and no card that leads to Find.
      await expect(page.getByTestId("lens-empty")).toBeVisible();
      await expect(page.getByTestId("google-none")).toHaveCount(0);
      await expect(page.getByTestId("google-tiles")).toHaveCount(0);
    } else if (!linked) {
      await expect(page.getByTestId("google-none")).toContainText("Find it");
      await expect(page.getByTestId("google-tiles")).toHaveCount(0);
    } else {
      const connection = data.google.connection;
      const fromProfile = reviewsFromProfile(connection);
      const figures = page.getByTestId("google-tiles").locator("[data-figure]");
      const expected = fromProfile ? PROFILE_FIGURES : PLACES_FIGURES;
      await expect(figures).toHaveCount(expected.length);
      // The number alone: the figure's value also holds the period before beside it, in its own span.
      const drawn = await figures.evaluateAll((els) =>
        els.map((el) => ({
          id: el.getAttribute("data-figure"),
          value: (el.querySelector(".figure-value")?.firstChild?.textContent ?? "").trim(),
          change: el.querySelector(".figure-change")?.textContent?.trim() ?? null,
        })),
      );
      expect(drawn.map((f) => f.id)).toEqual(expected.map(([id]) => id));
      expected.forEach(([id, value], i) => {
        expect(drawn.at(i)?.value, `${id}'s number`).toMatch(value);
        const change = drawn.at(i)?.change;
        if (change) expect(change, `${id}'s change`).toMatch(FIGURE_CHANGE);
      });
      await expect(page.getByTestId("chart-google-latest")).toBeVisible();
      const profileCards = ["chart-reviews-stars", "chart-reviews-weekly", "reviews-waiting"];
      if (fromProfile) {
        // Every review on record: the mix, the weeks and who waits, and no day-by-day count of Google's own.
        for (const id of profileCards) await expect(page.getByTestId(id), id).toBeVisible();
        await expect(page.getByTestId("chart-google-gained")).toHaveCount(0);
        await expect(page.getByTestId("reviews-connect")).toHaveCount(0);
      } else {
        // The five Google shows count nothing: the days gained, and the door to the profile where none is connected or its
        // location is still to choose.
        await expect(page.getByTestId("chart-google-gained")).toBeVisible();
        for (const id of profileCards) await expect(page.getByTestId(id), id).toHaveCount(0);
        await expect(page.getByTestId("reviews-connect")).toHaveCount(connection?.location_name ? 0 : 1);
      }
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
