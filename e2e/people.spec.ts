import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * People, on a real workspace.
 *
 * The mockup's Clients page carried sixty invented people with health scores,
 * lifetime value, packages and therapists. None of those columns exist. A
 * signed-in session must see the workspace's actual people, described only
 * in facts the schema holds, with the Tier 2 tabs (Leads, Deal board, Lists)
 * absent rather than leading to a Coming Soon card.
 *
 * Read-only against real data, like the rest of the signed-in specs.
 */

/** Words that only ever described invented numbers. */
const INVENTED_VOCABULARY = ["LTV", "Health index", "Total book", "Active touches", "therapist", "Sessions left", "Cadence", "Temperature"];
/** People who exist only in the design seeds. */
const INVENTED_PEOPLE = ["Aisha Khan", "David Chen", "@thewellness.co", "Maya Rodriguez", "Gabby Moreno", "Jordan Patel"];

async function assertMeasuredOnly(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  for (const word of INVENTED_VOCABULARY) {
    expect(text, `${where} shows a number the schema does not hold: "${word}"`).not.toContain(word);
  }
  for (const who of INVENTED_PEOPLE) {
    expect(text, `${where} shows an invented person: "${who}"`).not.toContain(who);
  }
  expect(text, `${where} shows a dollar amount, and revenue has no column`).not.toMatch(/\$\d/);
}

test.describe("People on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the list is the workspace's people, in facts only, with the Tier 2 tabs absent", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".cl-page-title")).toHaveText("Clients");
    await assertMeasuredOnly(page, "#/clients");

    // The seeded strip offered Leads, Deal board and Lists; a real workspace
    // has one view, so the strip is gone rather than three dead tabs.
    await expect(page.locator(".stabs")).toHaveCount(0);

    // The table's columns are the measured ones.
    // innerText follows the CSS text-transform, so compare case-insensitively.
    const headers = await page.locator(".cl-table thead th").allInnerTexts();
    expect(headers.map((h) => h.replace(/[▲▼]/g, "").trim().toLowerCase())).toEqual(["client", "state", "last contact", "receptionist", "first contact"]);

    // Every state pill is one of the six.
    const pills = await page.locator(".cl-row-bucket-pill").allInnerTexts();
    for (const p of pills) expect(["needs you", "waiting on you", "opted out", "new", "quiet", "active"]).toContain(p.trim().toLowerCase());

    // The header counts are integers, and "People" equals the rows shown when nothing is filtered.
    const shown = await page.locator(".cl-table tbody tr:not(:has(.cl-table-empty))").count();
    const total = (await page.locator(".cl-head-stats .stat-cell").first().locator(".stat-cell-value").innerText()).trim();
    expect(Number(total)).toBe(shown);
  });

  test("a profile opens from the list and is a timeline, not a form", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.cl-table-empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");

    await rows.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();
    await expect(page).toHaveURL(/#\/clients\/[0-9a-f-]{36}$/);
    await assertMeasuredOnly(page, "the profile");

    await expect(page.getByText("Last exchange")).toBeVisible();
    await expect(page.getByText("Right now")).toBeVisible();
    await expect(page.locator(".cl-prof-section-title", { hasText: "Timeline" })).toBeVisible();

    const facts = await page.locator(".cl-prof-money .stat-cell-label").allInnerTexts();
    const labels = facts.map((f) => f.trim().toLowerCase());
    // A seventh cell, Next visit, appears once the workspace has a calendar connected.
    expect(labels.slice(0, 6)).toEqual(["first contact", "last contact", "conversations", "calls", "consent", "receptionist"]);
    expect(labels.slice(6)).toEqual(labels.length > 6 ? ["next visit"] : []);

    // Back returns to the list, not to a "client not found" page.
    await page.locator(".cl-prof-back").click();
    await expect(page.locator(".cl-page-title")).toHaveText("Clients");
  });

  test("a profile deep link to a stranger's id says so instead of inventing a person", async ({ page }) => {
    await page.goto("/#/clients/00000000-0000-4000-8000-000000000000");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("This person is not in your workspace")).toBeVisible();
    await assertMeasuredOnly(page, "a missing profile");
  });

  test("Booked and Asked-never-booked exist only with a calendar, as facts; Leads and the Deal board land on People", async ({ page }) => {
    const list = await page.request.get("/api/v1/contacts");
    const body = (await list.json()).data as { people: Array<{ visits?: unknown }>; calendar?: { state: string } };
    expect(body.calendar).toBeTruthy();
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const smart = await page.locator(".cl-rail-row.smart").allInnerTexts();
    const has = (label: string) => smart.some((t) => t.includes(label));
    if (body.calendar?.state === "ok") {
      expect(has("Booked"), "a connected calendar shows the outcome lists").toBe(true);
      expect(has("Asked, never booked")).toBe(true);
      await expect(page.locator(".cl-head-stats .stat-cell", { hasText: "Booked" })).toHaveCount(1);
      // Every Booked chip belongs to a person the route says has an appointment ahead.
      const chips = await page.getByTestId("row-booked").count();
      const ahead = body.people.filter((p) => (p.visits as { next?: unknown } | null)?.next).length;
      expect(chips).toBe(ahead);
    } else {
      expect(has("Booked")).toBe(false);
      expect(has("Asked, never booked")).toBe(false);
    }
    for (const gone of ["leads", "pipeline"]) {
      await page.goto(`/#/${gone}`);
      await expect.poll(() => new URL(page.url()).hash, { message: `${gone} retires into People` }).toBe("#/clients");
      await expect(page.locator(".cl-page-title")).toHaveText("Clients");
    }
  });
});
