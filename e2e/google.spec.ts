import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { reviewsFromProfile } from "../packages/contracts/src/google/google";
import { toReviewsReportVM, type ReviewsReportDto } from "../packages/contracts/src/reports/review-report";

/**
 * Google, on the nightly's own workspace: the listing route answers honestly about what this deployment can do and never
 * carries a key; without a Places key on the edge there is no row on Setup, and with one the row follows the listing. The
 * workspace holds a listing, the Business Profile connected to it and four of its reviews (tooling/scripts/ops/e2e-workspace.mjs,
 * convergeGoogle), so the Reviews lens draws from a profile that has synced: five figures whose values the seed makes exact, the
 * sentence at the head, the mix of stars, who waits (one with a reply the receptionist wrote and held back) and the latest.
 * Read-only: nothing here links, reads or removes a listing, or answers a review.
 */

/**
 * What the seed holds of Google. Restated here rather than imported, as leads.spec.ts restates the leads: that file is ESM run by
 * plain node, and Playwright compiles a spec to CJS. The first test reads the workspace back through the API and refuses a seed
 * that has drifted from these, so the two copies cannot quietly disagree.
 */
const SEEDED = {
  placeId: "ChIJfixture0201",
  /** Reviews on record, and of them: answered, the receptionist's, waiting. */
  onRecord: 4,
  answered: 2,
  byReceptionist: 1,
  waiting: 2,
};

/**
 * The five figures the 30 days of those four reviews make, in the order the lens draws them (contracts review-report.ts), by the
 * metric each counts: a rating that fell from the one review before the period (5.0), three written against one in the 30 before,
 * two of three answered, and no middle time from fewer than three replies. A dash where the stored rows cannot say, never a zero.
 */
const SEEDED_FIGURES: ReadonlyArray<{ id: string; value: string; change: string | null }> = [
  { id: "rating", value: "4.0", change: "down from 5.0" },
  { id: "reviews", value: "4", change: null },
  { id: "reviews_written", value: "3", change: "up from 1" },
  { id: "reviews_answered", value: "2 of 3", change: null },
  { id: "review_reply_time", value: "—", change: null },
];

/** The Reviews read for the period the lens opens on, as the page reads it. */
async function reviewsRead(page: Page): Promise<ReviewsReportDto> {
  const res = await apiGet(page, "/api/v1/reports/reviews?period=30d");
  expect(res.status()).toBe(200);
  return (await res.json()).data;
}

test.describe("Google on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the workspace holds the seed's Google: the listing, a profile that has synced, four reviews and what the ledger counts of them", async ({
    page,
  }) => {
    const { data } = await (await apiGet(page, "/api/v1/google")).json();
    expect(data.google.listing?.place_id, "the seed's listing (e2e-workspace.mjs --apply)").toBe(SEEDED.placeId);
    expect(reviewsFromProfile(data.google.connection), "a profile with a location, synced").toBe(true);
    const { ledger } = await reviewsRead(page);
    expect(ledger, "the reviews on record").not.toBeNull();
    expect(ledger?.on_record).toEqual({ profile: SEEDED.onRecord, places: 0, complete: true });
    // Three in the 30 days and one in the 30 before: all four are in the ledger.
    expect(ledger?.written).toHaveLength(SEEDED.onRecord);
    expect(ledger?.written.filter((w) => w.replied)).toHaveLength(SEEDED.answered);
    expect(ledger?.written.filter((w) => w.by === "receptionist")).toHaveLength(SEEDED.byReceptionist);
    expect(ledger?.waiting_total).toBe(SEEDED.waiting);
    expect(
      ledger?.waiting.map((w) => w.held),
      "the oldest first; the second has the reply the receptionist held back",
    ).toEqual([null, "price"]);
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

  test("the first run and Integrations follow the platform's readiness, then the listing and the profile", async ({
    page,
  }) => {
    const { data } = await (await apiGet(page, "/api/v1/google")).json();
    const ready: boolean = data.google.ready.places;
    const profile: boolean = data.google.ready.profile;

    // The listing is the first step's, which every workspace has reached; the row is Setup's, drawn where a deployment can look
    // a listing up or connect a profile at all.
    await page.goto("/#/start/business");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("first-run")).toBeVisible();
    const row = page.getByTestId("setup-row-google");
    if (!ready && !profile) {
      await expect(row).toHaveCount(0);
    } else {
      await expect(row).toBeVisible();
      await expect(row).toContainText("Your Google listing");
      await expect(row.locator(".cl-attn-status .lead")).toHaveText(/^(Ready|Waiting on Google)$/);
    }

    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("connections-connected")).toBeVisible();
    // Both doors are connected rows: the profile as the seed left it, the listing watched (or, when a read failed, said so).
    const profileRow = page.getByTestId("connection-google_profile");
    const listingRow = page.getByTestId("connection-google_listing");
    await expect(profileRow).toContainText("Google Business Profile");
    await expect(profileRow).toContainText(/Connected|Could not sync/);
    await expect(listingRow).toContainText(/Watched|Could not be read/);
    await expect(JSON.stringify(await (await apiGet(page, "/api/v1/google")).json())).not.toMatch(
      /refresh_token|access_token|credentials_ref/,
    );
  });

  test("Reviews draws the five figures the seed's reviews make, the sentence they say at the head, the mix, who waits and the latest", async ({
    page,
  }) => {
    // The page folds the read with contracts' toReviewsReportVM, and so does this: the figures are asserted exact (the values
    // the seed makes), the sentence and the held reply are the fold's own words.
    const vm = toReviewsReportVM(await reviewsRead(page), { nowMs: Date.now() });
    expect(vm.source).toBe("profile");
    expect(vm.tiles.map((t) => ({ id: t.metric, value: t.value, change: t.compare }))).toEqual(SEEDED_FIGURES);
    expect(vm.lines.head, "the head says the figures' numbers").toMatch(/\b3 new\b.*\b2 answered\b/);

    await page.goto("/#/reports/reviews");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await expect(page.getByTestId("lens-reviews")).toHaveAttribute("aria-current", "page");

    const figures = page.getByTestId("google-tiles").locator("[data-figure]");
    await expect(figures).toHaveCount(SEEDED_FIGURES.length);
    // The number alone: the figure's value also holds the period before beside it, in its own span.
    const drawn = await figures.evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute("data-figure"),
        value: (el.querySelector(".figure-value")?.firstChild?.textContent ?? "").trim(),
        change: el.querySelector(".figure-change")?.textContent?.trim() ?? null,
      })),
    );
    expect(drawn).toEqual(SEEDED_FIGURES);

    // The head is the lens's sentence, in the frame's head beside its name.
    await expect(page.locator(".pg-head .pg-sentence")).toHaveText(vm.lines.head ?? "");

    // Every review on record: the mix, the weeks and who waits, and no day-by-day count of Google's own.
    for (const id of ["chart-reviews-stars", "chart-reviews-weekly", "reviews-waiting", "chart-google-latest"])
      await expect(page.getByTestId(id), id).toBeVisible();
    await expect(page.getByTestId("chart-google-gained")).toHaveCount(0);
    await expect(page.getByTestId("reviews-connect")).toHaveCount(0);
    await expect(page.getByTestId("chart-reviews-stars")).toContainText(vm.lines.mix ?? "");

    // Who waits: both, the oldest first, and the one the receptionist wrote a reply for says so.
    const waiting = page.getByTestId("reviews-waiting");
    await expect(waiting).toContainText(`Waiting for a reply (${SEEDED.waiting})`);
    await expect(waiting.getByTestId("google-review")).toHaveCount(SEEDED.waiting);
    const held = vm.waiting.rows.flatMap((r) => (r.held ? [r.held] : []));
    expect(held, "one of the two was held").toHaveLength(1);
    await expect(waiting.getByTestId("google-review-held")).toHaveText(held);
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
