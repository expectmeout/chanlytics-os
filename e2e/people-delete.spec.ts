import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * "Delete this person" is the one destructive verb on the profile.
 *
 * Like the Team card spec, this intercepts its own DELETE and answers it, so
 * it proves the control exists, is gated on the typed name, and issues the
 * request scoped to the workspace — without erasing anyone. The route itself
 * is covered by the erasure integration tests.
 */
test.describe("Delete this person", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("is gated on the typed name and issues a workspace-scoped DELETE — intercepted, nothing is deleted", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");
    await rows.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();
    const name = (await page.locator(".cl-prof-name").innerText()).trim();

    const seen: { method: string; url: string }[] = [];
    await page.route("**/api/v1/contacts/*", async (route) => {
      const req = route.request();
      if (req.method() !== "DELETE") return route.fallback();
      seen.push({ method: req.method(), url: req.url() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { contact_id: "intercepted-by-the-test-suite", already_erased: false },
        }),
      });
    });

    // The signed-in e2e account is an owner, so the control is offered: in the page's ⋯, not beside what changes daily.
    await page.getByTestId("person-more").click();
    await page.getByRole("menuitem", { name: "Delete person…" }).click();
    const confirm = page.getByTestId("delete-confirm");
    await expect(confirm).toBeVisible();
    const del = confirm.getByRole("button", { name: "Delete this person", exact: true });
    await expect(del).toBeDisabled();
    await confirm.getByRole("textbox").fill("not the name");
    await expect(del).toBeDisabled();
    await confirm.getByRole("textbox").fill(name);
    await expect(del).toBeEnabled();
    await del.click();

    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("DELETE");
    expect(seen[0].url).toContain("workspace=");
    // Back on the list afterwards.
    await expect(page.getByTestId("people-standing")).toBeVisible();
  });
});
