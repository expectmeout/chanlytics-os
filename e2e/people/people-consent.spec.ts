import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

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

    // Since #907 the answer in force is a row on the record kit, its control in the Visit messages fold behind it.
    await page.getByTestId("rec-row-act-person-visit").click();
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
    // The second answer, offers, is its own control with its own words: since #907 its row's label ("Offers and news")
    // is the record kit's, outside the control, and the control says what the answer is for.
    await expect(page.getByTestId("consent-marketing")).toContainText("Separate and optional");
  });

  test("the People rail offers the list a broadcast may reach", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".cl-rail-row", { hasText: "Can receive offers" })).toBeVisible();
  });

  test("a name the owner gives is a workspace-scoped PUT, and a note the receptionist reads a workspace-scoped POST to the notes log — intercepted", async ({
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

    // Since #919 notes are a dated, signed log of their own (person-notes.jsx): a note is one POST to the person's
    // notes door, with its words as `body`, and the details door is not touched.
    const noted: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/contacts/*/notes*", async (route) => {
      const req = route.request();
      noted.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      });
    });
    const notes = page.getByTestId("person-notes-input");
    await expect(notes).toBeVisible();
    await notes.fill("Sees Sofia. Prefers mornings.");
    await page.getByTestId("person-notes-save").click();
    await expect.poll(() => noted.length).toBe(1);
    expect(noted[0].method).toBe("POST");
    expect(noted[0].url).toContain("workspace=");
    expect(noted[0].body).toMatchObject({ body: "Sees Sofia. Prefers mornings." });
    expect(seen.length, "a note never goes through the details door").toBe(1);
  });

  /**
   * The address, for real: this workspace is the nightly's own and its people
   * are seeded (tooling/scripts/ops/e2e-workspace.mjs resets `email` each run), so
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
   * The proposal's link, for real, the same way (0008; e2e-workspace.mjs resets `proposal_url` and the deals each run):
   * the link is the deal's, given in the one sheet. What is wrong with a typed address is said under its field and
   * sends nothing; a good one goes to the deal's door with its scheme supplied, the card shows where it lives, and an
   * emptied one is cleared. Nothing is sent to anyone: the sheet's send stays off. A workspace whose customers book has
   * no deal at all, and the nightly's answers booking until it is seeded.
   */
  test("a proposal's link is given in the deal sheet, refused there when it is not one, stored on the deal with its scheme, and emptied again — through the real door", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const robin = page.locator(".cl-table tbody tr", { hasText: "Robin Example" });
    test.skip((await robin.count()) === 0, "the seeded person is not in this workspace");
    await robin.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();
    await expect(page.getByTestId("person-email")).toBeVisible();
    test.skip(
      (await page.getByTestId("person-deal").count()) === 0,
      "no Deal section: deals are off on this workspace (it answers that its customers book), so a proposal has nowhere to live",
    );

    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/v1\/contacts\/[^/]+\/deal/.test(r.url())) posts.push(r.postData() ?? "");
    });
    const sheet = page.getByTestId("rec-sheet-deal-sheet");
    const save = page.getByTestId("rec-sheet-save-deal-sheet");
    const noSend = async () => {
      const send = sheet.getByTestId("deal-sheet-send-switch");
      if ((await send.count()) && (await send.getAttribute("aria-checked")) === "true") await send.click();
    };
    // A proposal out to work on: opened, without a link, where Robin has none (a run that died half way may leave one).
    const start = page.getByTestId("person-deal-start");
    if (await start.count()) {
      await start.click();
      await expect(sheet).toBeVisible();
      await noSend();
      await save.click();
      await expect(sheet).toHaveCount(0);
    }
    const card = page.getByTestId("person-deal-card").first();
    await expect(card).toBeVisible();
    // The link is changed in the sheet's edit: the card leads with "Edit proposal" where there is none, else it is
    // one of the quiet moves.
    const edit = async () => {
      const next = card.getByTestId("person-deal-next");
      if ((await next.count()) && (await next.innerText()).trim() === "Edit proposal") await next.click();
      else await card.getByTestId("person-deal-move").filter({ hasText: "Edit proposal" }).click();
      await expect(sheet).toBeVisible();
      await expect(sheet.locator(".rec-sheet-title")).toHaveText("Edit proposal");
    };

    await edit();
    const input = sheet.getByTestId("deal-sheet-link-input");
    const before = posts.length;
    await input.fill("docs");
    await save.click();
    await expect(sheet.getByTestId("deal-sheet-link").getByRole("alert")).toContainText("full web address");
    expect(posts, "a refusal under the field sends nothing").toHaveLength(before);

    await input.fill(" docs.example.com/p/robin-e2e ");
    await save.click();
    await expect(sheet).toHaveCount(0);
    await expect(card.getByTestId("person-deal-link")).toHaveText("docs.example.com");
    await expect(card.getByTestId("person-deal-link")).toHaveAttribute("href", "https://docs.example.com/p/robin-e2e");
    expect(JSON.parse(posts.at(-1) ?? "{}")).toMatchObject({
      stage: "proposed",
      proposal_url: "https://docs.example.com/p/robin-e2e",
    });

    // Still there on a cold load: it was stored, not drawn.
    await page.reload();
    await expect(page.getByTestId("person-deal-link").first()).toHaveText("docs.example.com");

    // Emptied, it is cleared: the door is told which field was emptied, and the card says there is none.
    await edit();
    await sheet.getByTestId("deal-sheet-link-input").fill("");
    await save.click();
    await expect(sheet).toHaveCount(0);
    await expect(card.getByTestId("person-deal-link")).toHaveCount(0);
    await expect(card.getByTestId("person-deal-fact").first()).toHaveText("No link");
    expect(JSON.parse(posts.at(-1) ?? "{}").clear).toContain("proposal_url");
  });
});
