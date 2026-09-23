import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * "Offers by WhatsApp" on the profile rail.
 *
 * Intercepts its own PUT (like the receptionist-mode spec) and answers it,
 * so it proves the control renders from real data, is live for the owner,
 * asks how the answer was given, and issues the workspace-scoped request —
 * without recording anything against a real customer.
 */
test.describe("Consent for one person", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("shows the answer in force, asks how a yes was given, and issues a workspace-scoped PUT — intercepted", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");
    await rows.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();

    const control = page.getByTestId("consent-control");
    await expect(control).toBeVisible();
    const segs = control.locator(".cl-prof-autonomy").first().locator(".cl-prof-aut-seg");
    await expect(segs).toHaveCount(3);
    await expect(segs.nth(0)).toHaveText("Yes");
    await expect(segs.nth(1)).toHaveText("Not asked");
    await expect(segs.nth(2)).toHaveText("No");
    // Exactly one segment reflects the answer on record.
    await expect(control.locator(".cl-prof-autonomy").first().locator(".cl-prof-aut-seg.active")).toHaveCount(1);
    // The e2e account is an owner, so the control is live.
    await expect(segs.nth(0)).toBeEnabled();

    const seen: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/contacts/*/consent*", async (route) => {
      const req = route.request();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { contact_id: "intercepted", consent: "opted_in", dnc: false, source: "in_person" },
        }),
      });
    });

    // A yes is not recorded until the page knows how it was given.
    await segs.nth(0).click();
    const how = page.getByTestId("consent-control-how");
    await expect(how).toBeVisible();
    expect(seen.length).toBe(0);
    await how.getByRole("button", { name: "In person" }).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].body).toEqual({ consent: "opted_in", source: "in_person" });
    // The second answer, offers, is its own control with its own words.
    await expect(page.getByTestId("consent-marketing")).toContainText("Offers and news");
  });

  test("the People rail offers the list a broadcast may reach", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".cl-rail-row", { hasText: "Can receive offers" })).toBeVisible();
  });

  test("a name the owner gives and notes the receptionist reads issue a workspace-scoped PUT — intercepted", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");
    await rows.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();

    const seen: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/contacts/*/details*", async (route) => {
      const req = route.request();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { contact_id: "intercepted", name: "Test Name" } }),
      });
    });

    await page.locator(".cl-prof-id").hover();
    await page.getByTestId("person-rename").click();
    const input = page.getByTestId("person-name-input");
    await expect(input).toBeVisible();
    await input.fill("Test Name");
    await input.press("Enter");
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].body).toEqual({ name: "Test Name" });

    const notes = page.getByTestId("person-notes-input");
    await expect(notes).toBeVisible();
    await notes.fill("Sees Sofia. Prefers mornings.");
    await page.getByTestId("person-notes-save").click();
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1].body).toEqual({ notes: "Sees Sofia. Prefers mornings." });
    await expect(page.getByText("Notes for the receptionist")).toBeVisible();
  });

  /**
   * The address, for real: this workspace is the nightly's own and its people
   * are seeded (tooling/scripts/e2e-workspace.mjs resets `email` each run), so
   * the door is walked end to end instead of intercepted. What is wrong with a
   * typed address is said under the field and sends nothing; a good one goes
   * through PUT details to set_person_email (00125), comes back in the door's
   * own spelling, and an empty one clears it.
   */
  test("a person's email address is added, refused when it is not one, stored in one spelling, and cleared — through the real door", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const robin = page.locator(".cl-table tbody tr", { hasText: "Robin Example" });
    test.skip((await robin.count()) === 0, "the seeded person is not in this workspace");
    await robin.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();

    const row = page.getByTestId("person-email");
    await expect(row).toBeVisible();
    // A run that died half way leaves an address behind until the next seed: start from none.
    if ((await page.getByTestId("person-email-edit").getAttribute("aria-label")) === "Change the email address") {
      await page.getByTestId("person-email-edit").click();
      await page.getByTestId("person-email-input").fill("");
      await page.getByTestId("person-email-save").click();
      await expect(page.getByTestId("person-email-edit")).toHaveAttribute("aria-label", "Add an email address");
    }

    const puts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PUT" && /\/api\/v1\/contacts\/[^/]+\/details/.test(r.url())) puts.push(r.postData() ?? "");
    });

    await page.getByTestId("person-email-edit").click();
    const input = page.getByTestId("person-email-input");
    await input.fill("robin.example.com");
    await page.getByTestId("person-email-save").click();
    await expect(page.getByTestId("person-email-problem")).toContainText("missing the @");
    expect(puts, "a refusal under the field sends nothing").toHaveLength(0);

    await input.fill("  Robin.E2E@Example.COM ");
    await input.press("Enter");
    await expect(row).toContainText("robin.e2e@example.com");
    expect(JSON.parse(puts[0])).toEqual({ email: "Robin.E2E@Example.COM" });

    // Still there on a cold load: it was stored, not drawn.
    await page.reload();
    await expect(page.getByTestId("person-email")).toContainText("robin.e2e@example.com");

    await page.getByTestId("person-email-edit").click();
    await page.getByTestId("person-email-input").fill("");
    await page.getByTestId("person-email-save").click();
    await expect(page.getByTestId("person-email-edit")).toHaveAttribute("aria-label", "Add an email address");
    await expect(page.getByTestId("person-email")).not.toContainText("@");
  });

  /**
   * The proposal link, for real, the same way (00154; e2e-workspace.mjs resets `proposal_url` each run): what is
   * wrong with a typed address is said under the field and sends nothing; a good one goes through PUT details to
   * set_person_proposal with its scheme supplied, the row shows where it lives, and an empty one clears it.
   */
  test("a person's proposal link is added, refused when it is not one, stored with its scheme, and cleared — through the real door", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const robin = page.locator(".cl-table tbody tr", { hasText: "Robin Example" });
    test.skip((await robin.count()) === 0, "the seeded person is not in this workspace");
    await robin.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();

    const row = page.getByTestId("person-proposal");
    await expect(row).toBeVisible();
    // A run that died half way leaves a link behind until the next seed: start from none.
    if ((await page.getByTestId("person-proposal-edit").getAttribute("aria-label")) === "Change the proposal link") {
      await page.getByTestId("person-proposal-edit").click();
      await page.getByTestId("person-proposal-input").fill("");
      await page.getByTestId("person-proposal-save").click();
      await expect(page.getByTestId("person-proposal-edit")).toHaveAttribute("aria-label", "Add a proposal link");
    }

    const puts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PUT" && /\/api\/v1\/contacts\/[^/]+\/details/.test(r.url())) puts.push(r.postData() ?? "");
    });

    await page.getByTestId("person-proposal-edit").click();
    const input = page.getByTestId("person-proposal-input");
    await input.fill("docs");
    await page.getByTestId("person-proposal-save").click();
    await expect(page.getByTestId("person-proposal-problem")).toContainText("full web address");
    expect(puts, "a refusal under the field sends nothing").toHaveLength(0);

    await input.fill(" docs.example.com/p/robin-e2e ");
    await input.press("Enter");
    await expect(page.getByTestId("person-proposal-link")).toHaveText("docs.example.com");
    await expect(page.getByTestId("person-proposal-link")).toHaveAttribute(
      "href",
      "https://docs.example.com/p/robin-e2e",
    );
    expect(JSON.parse(puts[0])).toEqual({ proposal: "docs.example.com/p/robin-e2e" });

    // Still there on a cold load: it was stored, not drawn.
    await page.reload();
    await expect(page.getByTestId("person-proposal-link")).toHaveText("docs.example.com");

    await page.getByTestId("person-proposal-edit").click();
    await page.getByTestId("person-proposal-input").fill("");
    await page.getByTestId("person-proposal-save").click();
    await expect(page.getByTestId("person-proposal-edit")).toHaveAttribute("aria-label", "Add a proposal link");
    await expect(page.getByTestId("person-proposal-link")).toHaveCount(0);
  });
});
