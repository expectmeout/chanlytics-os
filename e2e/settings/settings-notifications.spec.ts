import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * Settings → Notifications, on a real workspace (decision 0040).
 *
 * The seeded pane offered six toggles nothing read — morning brief, SMS escalations, segment entry and exit, a weekly
 * report, milestones. The real page says where alerts reach you (the bell, the business's email, your phones, this
 * browser) and what you are told about, a topic a row with a tick for each channel the code reads: the business's
 * email (notifications.email_off) and your own phone (me/alerts). Every save here is intercepted, so the suite's
 * workspace keeps its addresses and its choices.
 */
const INVENTED = [
  "Morning brief",
  "Escalations via SMS",
  "Segment entry",
  "Weekly report email",
  "Agent milestones",
  "Approval requests",
];

type SettingsPut = {
  config?: { notifications?: { escalation_emails?: string[]; email_off?: string[] } };
  version?: unknown;
  /** Where it was sent: a workspace's own route. */
  url?: string;
};

/** Answer every PUT settings as the server would, and keep what was sent. */
async function holdSaves(page: Page): Promise<SettingsPut[]> {
  const seen: SettingsPut[] = [];
  await page.route("**/api/v1/settings*", async (route) => {
    const req = route.request();
    if (req.method() !== "PUT") return route.fallback();
    const body = req.postDataJSON() as SettingsPut;
    seen.push({ ...body, url: req.url() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { version: Number(body.version) + 1, config: body.config } }),
    });
  });
  return seen;
}

test.describe("Settings → Notifications on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("says where alerts reach you and what is sent, a topic a row, and nothing that is not", async ({ page }) => {
    await page.goto("/#/admin/notifications");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("ntf-channels")).toBeVisible();
    await expect(page.getByTestId("ntf-grid")).toBeVisible();
    const text = await page.locator(".set-pane").innerText();
    for (const s of INVENTED) expect(text, `a toggle nothing reads: "${s}"`).not.toContain(s);
    expect(text, "Chanlytics' own alerts are not the workspace's").not.toContain("to Chanlytics");
    await expect(page.getByText("A customer needs a person")).toBeVisible();
    await expect(page.getByText("After every phone call")).toBeVisible();
    await expect(page.getByText("Always on")).toBeVisible();
  });

  test("adding an address saves the whole config with its version, scoped to the workspace — intercepted", async ({
    page,
  }) => {
    await page.goto("/#/admin/notifications");
    await page.waitForLoadState("networkidle");
    const seen = await holdSaves(page);
    await page.getByTestId("ntf-email-change").click();
    const box = page.getByRole("textbox", { name: "Add an address to email" });
    await expect(box).toBeEnabled();
    await box.fill("e2e-alert@example.invalid");
    await page.getByTestId("ntf-email-edit").getByRole("button", { name: "Add" }).click();

    await expect.poll(() => seen.length).toBe(1);
    expect(typeof seen[0].version).toBe("number");
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].config?.notifications?.escalation_emails).toContain("e2e-alert@example.invalid");
    await expect(page.getByText("will be alerted from the next one")).toBeVisible();
  });

  test("an email tick saves what the business is emailed, and the tick says so at once — intercepted", async ({
    page,
  }) => {
    await page.goto("/#/admin/notifications");
    await page.waitForLoadState("networkidle");
    const seen = await holdSaves(page);
    const tick = page.getByTestId("ntf-email-call");
    await expect(tick).toHaveAttribute("aria-pressed", "true");
    await tick.click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].config?.notifications?.email_off).toEqual(["call"]);
    await expect(tick).toHaveAttribute("aria-pressed", "false");
  });
});
