import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Settings → Notifications, on a real workspace.
 *
 * The seeded pane offered six toggles nothing read — morning brief, SMS
 * escalations, segment entry and exit, a weekly report, milestones. The real
 * pane shows who is alerted (the configured addresses), what is actually sent,
 * and how. Adding an address saves through the settings route; intercepted
 * here, so the workspace's recipients never change.
 */
const INVENTED = [
  "Morning brief",
  "Escalations via SMS",
  "Segment entry",
  "Weekly report email",
  "Agent milestones",
  "Approval requests",
];

test.describe("Settings → Notifications on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("shows the configured recipients and the alerts that are really sent, and nothing that is not", async ({
    page,
  }) => {
    await page.goto("/#/admin/notifications");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("notif-recipients")).toBeVisible();
    await expect(page.getByTestId("notif-kinds")).toBeVisible();
    const text = await page.locator(".set-pane").innerText();
    for (const s of INVENTED) expect(text, `a toggle nothing reads: "${s}"`).not.toContain(s);
    await expect(page.getByText("A customer needs a person")).toBeVisible();
    await expect(page.getByText("After every phone call")).toBeVisible();
    await expect(page.getByText("switch alerts on from the bell")).toBeVisible();
  });

  test("adding an address saves the whole config with its version, scoped to the workspace — intercepted", async ({
    page,
  }) => {
    await page.goto("/#/admin/notifications");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("notif-recipients");
    await expect(card).toBeVisible();

    const seen: {
      method: string;
      url: string;
      body: { config?: { notifications?: { escalation_emails?: string[] } }; version?: unknown };
    }[] = [];
    await page.route("**/api/v1/settings*", async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") return route.fallback();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { version: 999 } }),
      });
    });

    const input = card.getByRole("textbox", { name: "Add an address to alert" });
    await expect(input).toBeEnabled();
    await input.fill("e2e-alert@example.invalid");
    await card.getByRole("button", { name: "Add" }).click();

    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].url).toContain("workspace=");
    expect(typeof seen[0].body.version).toBe("number");
    expect(seen[0].body.config?.notifications?.escalation_emails).toContain("e2e-alert@example.invalid");
    await expect(page.getByText("will be alerted from the next escalation")).toBeVisible();
  });
});
