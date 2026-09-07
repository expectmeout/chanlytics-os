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
    const headers = (await page.locator(".cl-table thead th").allInnerTexts()).map((h) => h.replace(/[▲▼]/g, "").trim().toLowerCase()).filter(Boolean);
    const cal = ((await (await page.request.get("/api/v1/contacts")).json()).data as { calendar?: { state: string } }).calendar;
    // With a calendar connected the outcome takes the receptionist's column; the checkbox and the actions columns have no words. First contact lives in the identity cell.
    expect(headers).toEqual(["client", "state", "last contact", cal?.state === "ok" ? "visits" : "receptionist", "offers"]);
    // Every Offers cell is one of the three answers.
    for (const t of await page.getByTestId("row-offers").allInnerTexts()) expect(["Yes", "No", "Not asked"]).toContain(t.trim());
    // One state switcher: the strip above; the tab row is gone.
    await expect(page.locator(".cl-section-head .cl-tabs")).toHaveCount(0);

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
      // Every green day in the Visits column belongs to a person the route says has an appointment ahead.
      const ahead = body.people.filter((p) => (p.visits as { next?: unknown } | null)?.next).length;
      await expect(page.locator('[data-testid="row-next-visit"] .cl-row-next')).toHaveCount(ahead);
      // The rail is grouped, and Booked this week and Lapsed exist.
      await expect(page.getByTestId("rail-group-journey")).toBeVisible();
      expect(has("Booked this week") && has("Lapsed")).toBe(true);
      // A list's next step waits for a recorded yes.
      await page.locator(".cl-rail-row.smart", { hasText: "Asked, never booked" }).click();
      await expect(page.getByTestId("list-action")).toBeVisible();
      await expect(page.getByTestId("list-action")).toContainText(/said yes|Nobody/);
      await expect.poll(() => new URL(page.url()).hash).toBe("#/clients/seg:asked_never_booked");
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

  test("a state and a saved list are linkable: the address opens the view, and the view writes the address", async ({ page }) => {
    await page.goto("/#/clients/state:quiet");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("state-filter")).toContainText("Quiet");
    await page.getByTestId("state-filter").locator("button").click();
    await expect.poll(() => new URL(page.url()).hash).toBe("#/clients");
    const saved = ((await (await page.request.get("/api/v1/segments")).json()).data as { lists: Array<{ id: string; name: string }> }).lists;
    if (saved.length) {
      await page.goto(`/#/clients/list:${saved[0].id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("saved-filter")).toContainText(saved[0].name);
    }
  });

  test("a selection becomes a list or a yes on record — the requests are the real ones, intercepted", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const boxes = page.getByTestId("row-select");
    test.skip((await boxes.count()) < 2, "this workspace has fewer than two people");
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    const bar = page.getByTestId("bulk-bar");
    await expect(bar).toContainText("2 selected");

    const seen: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/segments*", async (route) => {
      const req = route.request();
      if (req.method() === "GET") { await route.continue(); return; }
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { lists: [] } }) });
    });
    await page.route("**/api/v1/contacts/*/consent*", async (route) => {
      const req = route.request();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { contact_id: "intercepted", consent: "opted_in", dnc: false, source: "in_person" } }) });
    });

    // A new list from the bar: one POST with the name.
    await bar.getByRole("button", { name: "Add to list" }).click();
    await page.getByText("New list…").click();
    await page.getByTestId("bulk-list-name").fill("E2E bulk list");
    await page.getByTestId("bulk-list-name").press("Enter");
    await expect.poll(() => seen.filter((r) => r.method === "POST").length).toBe(1);
    expect(seen.find((r) => r.method === "POST")?.body).toEqual({ name: "E2E bulk list" });
    // The bar is busy until the create settles (the intercepted list is never found again, and it says so).
    await expect(page.getByTestId("bulk-list-name")).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Record a yes" })).toBeEnabled();

    // A yes for both: one PUT each, saying how it was given.
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await bar.getByRole("button", { name: "Record a yes" }).click();
    await page.getByText("In person", { exact: true }).click();
    await expect.poll(() => seen.filter((r) => r.url.includes("/consent")).length).toBe(2);
    for (const r of seen.filter((x) => x.url.includes("/consent"))) {
      expect(r.method).toBe("PUT");
      expect(r.body).toEqual({ consent: "opted_in", source: "in_person" });
    }
  });

  test("the booking link is one step from a profile with a thread: the button lands on the thread", async ({ page }) => {
    const people = ((await (await page.request.get("/api/v1/contacts")).json()).data as { people: Array<{ id: string; has_chat: boolean | null; latest_conversation_id: string | null }> }).people;
    const withChat = people.find((p) => p.has_chat && p.latest_conversation_id);
    test.skip(!withChat, "nobody here has a WhatsApp thread");
    const detail = (await (await page.request.get(`/api/v1/contacts/${withChat!.id}`)).json()).data.person as { booking_link?: string | null; visits?: { all?: unknown[] } | null };
    test.skip(!detail.booking_link, "no booking link on file");
    await page.goto(`/#/clients/${withChat!.id}`);
    await expect(page.locator(".cl-prof-name")).toBeVisible();
    const btn = page.getByTestId("text-booking-link");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/Text the booking link|Send the booking-link template/);
    await btn.click();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/inbox\//);
  });

  test("the keyboard walks the rows: ↓ focuses, Enter opens the profile", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.cl-table-empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to walk");
    await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; if (el && el.blur) el.blur(); });
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".cl-table tbody tr.focused")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.locator(".cl-prof-name")).toBeVisible();
  });

  test("the attention strip keeps its height across every tab, and its rows say something true", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const strip = page.getByTestId("attention-strip");
    await expect(strip).toBeVisible();
    // No header, no toggle: the strip is the page's hero, as drawn.
    await expect(page.locator(".cl-buckets-toggle")).toHaveCount(0);
    // Inset like the sections around it: its left edge is the search box's, its right edge the table's.
    const stripBox = (await strip.boundingBox())!;
    const searchBox = (await page.locator(".cl-search-wrap").boundingBox())!;
    const tableBox = (await page.locator(".cl-table-wrap").boundingBox())!;
    expect(Math.abs(stripBox.x - searchBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(stripBox.x + stripBox.width - (tableBox.x + tableBox.width))).toBeLessThanOrEqual(1);
    const heights: number[] = [];
    for (const t of ["needs_you", "waiting_on_you", "new", "quiet", "active"]) {
      await page.getByTestId(`attention-tab-${t}`).click();
      await expect(page.getByTestId(`attention-tab-${t}`)).toHaveAttribute("aria-selected", "true");
      heights.push((await strip.boundingBox())!.height);
    }
    // Whatever each tab holds — three rows, one, none — the strip does not move the page.
    for (const h of heights) expect(Math.abs(h - heights[0])).toBeLessThanOrEqual(1);
    // Every row shown: a sentence that is never the old placeholder, and a state line with words.
    for (const row of await page.getByTestId("attention-row").all()) {
      const sentence = (await row.locator(".cl-attn-sentence").innerText()).trim();
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence).not.toMatch(/nothing written to quote/);
      expect((await row.locator(".cl-attn-status").innerText()).trim().length).toBeGreaterThan(0);
    }
    for (const b of await page.getByTestId("attention-cta").allInnerTexts()) expect(["Open in Inbox", "Open thread"]).toContain(b.trim());
  });
});
