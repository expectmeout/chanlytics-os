import { expect, test, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { expectLeadsScope, expectPeekSeenVersusRead, expectRowUnchangedAfterUndo, expectStripEnding } from "./signals";

/**
 * Leads, on the nightly's own workspace.
 *
 * What this proves is the seeded state ON THE PAGE: the scope, the rail, the
 * strip's ending, the peek's two groups, and that every act the owner can take
 * from a row goes through the real route and can be undone back to the row that
 * was there. What it cannot prove for free is a search: a real one spends on
 * the source and the judge. Decision 30 lists this workspace in
 * `lead_platform.tenants_on` (the seed writes it), so a real search CAN run
 * here while the switch is off for everyone else -- behind E2E_PAID_LEADS=1,
 * which the nightly does not set, modelled on Ask's E2E_PAID_MODEL.
 *
 * The two paid tests skip with a stated reason and count toward the skip
 * ceiling (e2e/skip-ceiling.ts, E2E_MAX_SKIPS default 8): Ask's five and these
 * two make seven. A third paid lead test raises the ceiling in the workflow
 * first, deliberately.
 *
 * Read-mostly: every write here is undone in the same test, and
 * e2e-workspace.mjs puts the six leads back before the next run.
 */
const PAID = process.env.E2E_PAID_LEADS === "1";
const WHY_UNPAID = "a real search spends on the source and the judge: set E2E_PAID_LEADS=1 to run it";

/**
 * The seed's search and its six leads (tooling/scripts/e2e-workspace.mjs, which
 * owns them). Restated here rather than imported, as thread.spec.ts restates
 * Robin: that file is ESM run by plain node, and Playwright compiles a spec to
 * CJS, so an import of it fails at load. The first test reads the workspace back
 * through the API and refuses a seed that has drifted from these names, so the
 * two copies cannot quietly disagree.
 */
const LEAD_SEARCH_NAME = "Personal trainers · Austin";
const ZILKER = "Zilker Strength Lab";
const TRAVIS = "Travis Heights Coaching Co.";
const MUELLER = "Mueller Movement Studio";
const KETTLEBELL = "East Side Kettlebell";
const FITCORP = "FitCorp Austin Central";
const HYDE_PARK = "Hyde Park Personal Training";
const SEEDED = [ZILKER, TRAVIS, MUELLER, KETTLEBELL, FITCORP, HYDE_PARK];
/**
 * The seed's own arithmetic, as `leadsStanding` counts it: the rail's numbers
 * are the COUNTED Qualified leads (lead_list_counts), so the six seeded places
 * stand as three leads -- two Ready and one Contacted -- under one kept search.
 */
const STANDING = "3 leads · 2 ready · 1 search";
/** contracts LEAD_NOT_A_FIT_WORDS.chain: the why the peek offers first (§9.5). */
const WHY_CHAIN = "A chain or franchise";

interface Sent { url: string; body: unknown }

/** Every write the page makes while a test runs, in order, as the page made it. */
async function watch(page: Parameters<typeof signIn>[0], pattern: string): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route(pattern, async (route) => {
    sent.push({ url: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.continue();
  });
  return sent;
}

/**
 * Open the seeded search from the rail. The strip and the three classes belong
 * to a search -- LeadsScope draws neither while `searchId` is null -- so a test
 * that reads an ending, or a class other than Qualified, comes through here.
 */
async function openSeededSearch(page: Page): Promise<void> {
  await page.goto("/#/clients/leads");
  await page.waitForLoadState("networkidle");
  await page.locator(".cl-rail-row", { hasText: LEAD_SEARCH_NAME }).locator(".ld-search-pick").click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/clients\/leads:s-[0-9a-f-]{36}$/);
}

test.describe("Leads on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the Leads scope shows the seeded search and its leads, strongest fit first, and the strip says how it ended", async ({ page }) => {
    // The seed owns these six; this spec restates their names. If the two ever
    // disagree, every other assertion below is measuring the wrong workspace.
    // `leads_page` answers ONE class a call and defaults to the counted
    // Qualified ones, so the six are read in the three classes they are in.
    const named = async (cls: string): Promise<string[]> => {
      const r = await (await apiGet(page, `/api/v1/leads?list=all&sort=fit&dir=asc&class=${cls}`)).json();
      return (r.data.rows as Array<{ business_name: string }>).map((row) => row.business_name);
    };
    const qualified = await named("qualified");
    const held = [...qualified, ...(await named("review")), ...(await named("excluded"))];
    expect([...held].sort()).toEqual([...SEEDED].sort());
    // Strongest fit first is the database's order, not the page's: the seed
    // dates the six a minute apart so the band's tie-break is not a coin toss.
    expect(qualified, "strongest fit first").toEqual([ZILKER, TRAVIS, HYDE_PARK]);

    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await expectLeadsScope(page, { standing: STANDING, first: ZILKER });
    await expect(page.locator(".cl-table tbody tr").nth(1)).toContainText(TRAVIS);

    // The rail names the search, and its count is the members' count. The strip
    // and the three classes are the open search's, so read them from it.
    await expect(page.locator(".cl-rail-row", { hasText: LEAD_SEARCH_NAME })).toBeVisible();
    await openSeededSearch(page);
    await expectStripEnding(page, "Found 3 personal trainers");
    await expect(page.getByTestId("lead-strip")).toContainText("1 left out");

    // Excluded is a view, and the view is the address.
    await page.getByTestId("lead-class-excluded").click();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/clients\/leads:s-[0-9a-f-]{36}:c-excluded$/);
    const left = page.locator(".cl-table tbody tr").first();
    await expect(left).toContainText(FITCORP);
    await expect(left).toContainText("Chain");
    await expect(left).toContainText("Not checked");
  });

  test("no page of Leads says a dollar amount, and nothing on it names where the places came from", async ({ page }) => {
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    const text = await page.locator(".app-root").innerText();
    expect(text, "a screen said what a search cost").not.toMatch(/\$\d/);
    expect(text, "a screen named the vendor").not.toMatch(/apify|compass|bounce ?verify/i);
  });

  test("the peek names every check's source in two groups, and a catch-all address reads Unconfirmed", async ({ page }) => {
    await openSeededSearch(page);
    await page.getByTestId("lead-class-review").click();
    await page.locator(".cl-table tbody tr", { hasText: MUELLER }).getByTestId("lead-name").click();
    await expectPeekSeenVersusRead(page);
    await expect(page.getByTestId("lead-peek")).toContainText("Unconfirmed");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-peek")).toHaveCount(0);
  });

  test("Not a fit, then Undo, leaves the lead as it was and no row behind", async ({ page }) => {
    const sent = await watch(page, "**/api/v1/leads/*/stage");
    const undone = await watch(page, "**/api/v1/lead-operations/*/undo");
    await page.goto("/#/clients/leads:l-nurture");
    await page.waitForLoadState("networkidle");
    const row = page.locator(".cl-table tbody tr", { hasText: HYDE_PARK });
    const before = await row.innerText();
    // Not a fit is the peek's, not the row's: a row offers Call, Copy and the
    // class's own three (LeadRowActions), and the five whys are asked in the
    // peek that opened (§9.5). The words are contracts' LEAD_NOT_A_FIT_WORDS.
    await row.getByTestId("lead-name").click();
    const peek = page.getByTestId("lead-peek");
    await expect(peek).toBeVisible();
    await peek.getByTestId("peek-not-a-fit").click();
    await peek.getByText(WHY_CHAIN, { exact: true }).click();
    await expect.poll(() => sent.map((s) => s.body)).toEqual([{ kind: "not_a_fit", why: "chain" }]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => undone.length).toBe(1);
    expect(undone[0].body).toMatchObject({ version: expect.any(Number) });
    await page.goto("/#/clients/leads:l-nurture");
    await expectRowUnchangedAfterUndo(page, HYDE_PARK, before);
    const after = await (await apiGet(page, "/api/v1/leads?list=nurture&sort=fit&dir=asc")).json();
    expect((after.data.rows as Array<{ business_name: string }>).map((r) => r.business_name)).toContain(HYDE_PARK);
  });

  test("Put back, then Undo, leaves the left-out place as it was", async ({ page }) => {
    const put = await watch(page, "**/api/v1/leads/*/put-back");
    const undone = await watch(page, "**/api/v1/lead-operations/*/undo");
    await openSeededSearch(page);
    await page.getByTestId("lead-class-excluded").click();
    const row = page.locator(".cl-table tbody tr", { hasText: FITCORP });
    const before = await row.innerText();
    await row.hover();
    await row.getByTestId("lead-put-back").click();
    await expect.poll(() => put.length).toBe(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => undone.length).toBe(1);
    await expectRowUnchangedAfterUndo(page, FITCORP, before);
  });

  test("Keep on a Needs review row counts it this month, and Undo gives it back", async ({ page }) => {
    const kept = await watch(page, "**/api/v1/leads/*/keep");
    const undone = await watch(page, "**/api/v1/lead-operations/*/undo");
    await openSeededSearch(page);
    await page.getByTestId("lead-class-review").click();
    const row = page.locator(".cl-table tbody tr", { hasText: KETTLEBELL });
    const before = await row.innerText();
    await row.hover();
    await row.getByTestId("lead-keep").click();
    await expect.poll(() => kept.length).toBe(1);
    // The toast, by its own class: the shell keeps a role="status" slot of its
    // own (topbar.jsx), so asking for the role alone finds two.
    await expect(page.locator(".pp-toast").first()).toContainText("It counts as a lead this month.");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => undone.length).toBe(1);
    await expectRowUnchangedAfterUndo(page, KETTLEBELL, before);
  });

  test("an old #/leads bookmark lands on the Leads scope", async ({ page }) => {
    await page.goto("/#/leads");
    await expect.poll(() => new URL(page.url()).hash, { message: "leads is a scope of People now" }).toBe("#/clients/leads");
    await expect(page.getByTestId("leads-standing")).toBeVisible();
  });

  test("the keyboard walks the leads: J focuses, Enter peeks, C dials, F opens the finder, Esc backs out in order", async ({ page }) => {
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("j");
    await expect(page.locator(".cl-table tbody tr.focused")).toHaveCount(1);
    await page.keyboard.press("Enter");
    const peek = page.getByTestId("lead-peek");
    await expect(peek).toBeVisible();
    // C dials from the owner's own phone by setting window.location.href to a
    // tel: URL (`plDial`, Task 2). That leaves the browser, so there is no element
    // and no navigation for Playwright to read: what the nightly proves is that
    // the key reaches a lead with a number to dial, and that the peek shows it.
    // Stored canonical and dialled as stored, but drawn as the app writes numbers everywhere else (#770:
    // toLeadPeekVM's reach.phone.value is formatPhoneDisplay's). Call is the act pinned at the peek's foot.
    await expect(peek.getByTestId("peek-phone-value")).toHaveText(/^\+1 \(512\) 555-010\d$/);
    await expect(peek.getByTestId("peek-act-call")).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-peek")).toHaveCount(0);
    await page.keyboard.press("f");
    await expect(page.getByTestId("lead-finder")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-finder")).toHaveCount(0);
  });

  test("at a phone's width the switch, search and Find are one bar and the first lead is on the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    const bar = page.getByTestId("leads-phone-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByTestId("leads-phone-search")).toBeVisible();
    await expect(bar.getByTestId("leads-phone-find")).toBeVisible();
    // Nothing above the rows but the bar and the strip: no stat cards, no
    // controls row, no rail (feedback_mobile_work_first).
    await expect(page.locator(".cl-rail")).toBeHidden();
    await expect(page.locator(".cl-controls")).toHaveCount(0);
    await expect(page.locator(".cl-table tbody tr").first()).toBeInViewport({ ratio: 1 });
    // A card, not a row of columns, with a 44px Call.
    const call = page.locator(".cl-table tbody tr").first().getByRole("button", { name: /^Call / });
    expect((await call.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });

  test("Find leads turns words into a plan card, and nothing is started when it is closed", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    const before = await (await apiGet(page, "/api/v1/lead-searches")).json();
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    // The button reads "Find leads F" -- it carries its own key -- so it is
    // named by its test id rather than by a name that would never match.
    await page.getByTestId("leads-find").click();
    await page.getByTestId("finder-input").fill("6 personal trainers in Round Rock, TX, a phone is enough");
    await page.getByTestId("finder-plan").click();
    await expect(page.getByTestId("lead-plan")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("plan-sentence")).toContainText("Round Rock");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-finder")).toHaveCount(0);
    const after = await (await apiGet(page, "/api/v1/lead-searches")).json();
    expect((after.data.searches as unknown[]).length, "a plan the owner closed started nothing").toBe((before.data.searches as unknown[]).length);
  });

  test("a small search runs end to end on the listed workspace, and is removed after", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(10 * 60_000);
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("leads-find").click();
    await page.getByTestId("finder-input").fill("6 independent bike shops in Round Rock, TX, a phone is enough");
    await page.getByTestId("finder-plan").click();
    await expect(page.getByTestId("lead-plan")).toBeVisible({ timeout: 40_000 });
    await page.getByTestId("plan-approve").click();
    const strip = page.getByTestId("lead-strip");
    await expect(strip).toContainText(/Finding|Stopped|Found/, { timeout: 60_000 });
    await expect(strip).toContainText(/^(Found|Stopped)/, { timeout: 9 * 60_000 });
    // What it spent is read from the ledger, never from a screen.
    const searches = await (await apiGet(page, "/api/v1/lead-searches")).json();
    // What a round spent is the ROUND's (LeadSearchRoundDto), never the search's.
    const mine = (searches.data.searches as Array<{ id: string; name: string; round: { cost_usd: number } | null }>).find((s) => /bike shops/i.test(s.name));
    expect(mine, "the search the page started is in the ledger").toBeTruthy();
    expect(Number(mine!.round?.cost_usd ?? 0)).toBeLessThan(0.5);
    // And the workspace goes back to its six: the seed's verify() refuses a drifted one.
    // The kept search's menu says what it asked for, so that is its button's name.
    await page.locator(".cl-rail-row", { hasText: mine!.name }).locator(".ld-search-more").click();
    await page.getByRole("menuitem", { name: "Remove this search" }).click();
    await page.getByTestId("leads-remove-yes").click();
    await expect(page.locator(".cl-rail-row", { hasText: mine!.name })).toHaveCount(0);
  });
});
