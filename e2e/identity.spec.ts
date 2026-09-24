import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * A person's own name: set on the Profile tab's You card, shown on the
 * sidebar chip and the Team roster, cleared again. The account under test keeps whatever name it
 * had before.
 */
test.describe("identity on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("the name you give is the name the chrome shows; clearing it brings 'Your account' back", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/admin/profile");
    await page.waitForLoadState("networkidle");
    // Since #947 the name is a row on the record kit: the field is in the DOM, hidden, until its Change is pressed.
    await page.getByTestId("set-you-change").click();
    const field = page.getByTestId("set-you-name");
    await expect(field).toBeVisible();
    const before = await field.inputValue();
    const put = async (name: string) => {
      const r = await page.evaluate(async (n) => {
        const res = await fetch("/api/v1/me", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ display_name: n }),
        });
        return { status: res.status, body: await res.json() };
      }, name);
      // A 429 here is not the product misbehaving. profile_set allows ten name
      // changes an hour (rate-limit.ts) and this spec spends four of them per
      // run, so three runs inside one window exhaust it. Said plainly, because
      // the assertion that follows would otherwise read "Expected 400,
      // Received 429" and send whoever is on the failure hunting a validation
      // bug that does not exist.
      // Not a failure of the product but of the run's timing, so the spec steps aside with the reason rather
      // than painting the night red: four nightlies inside one hour did exactly that on 17 September 2026.
      test.skip(
        r.status === 429,
        "rate limited: profile_set allows 10 name changes an hour and this spec spends 4 per run, so the suite cannot judge the product when it is run repeatedly inside that window",
      );
      return r;
    };
    try {
      const set = await put("Ruben Test");
      expect(set.status).toBe(200);
      expect(set.body.data.display_name).toBe("Ruben Test");
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".user-chip .name")).toHaveText("Ruben Test");
      await expect(page.locator(".user-chip .avatar")).toHaveText("RT");
      // The roster is the Team tab's; it is painted by the settings override,
      // so wait for a row before reading the one that says You.
      await page.goto("/#/admin/team");
      await page.locator(".set-team-row").first().waitFor({ timeout: 20_000 });
      await expect(page.locator(".set-team-row").filter({ hasText: "You" }).locator(".set-team-name")).toContainText(
        "Ruben Test",
      );
      const cleared = await put("");
      expect(cleared.status).toBe(200);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".user-chip .name")).toHaveText("Your account");
      const tooLong = await put("x".repeat(81));
      expect(tooLong.status).toBe(400);
    } finally {
      await put(before);
    }
  });
});
