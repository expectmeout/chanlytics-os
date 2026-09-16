import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Settings → Autonomy, on a real workspace.
 *
 * The mockup's pane drew a charter with invented evidence ("conf ≥ 0.8",
 * "12 auto-sent · 4% edited"), a veto row pointing at an invented draft, quiet
 * hours, outreach defaults and per-segment guardrails — none backed by a
 * column. The real pane renders the policies table: the reply row is a live
 * switch, money is locked, every other row is one the receptionist consults
 * (reviews included), and the hard limits are the runtime's actual numbers.
 *
 * Intercepts its own PUT, so the workspace's policy is never changed.
 */
const INVENTED = ["conf ≥ 0.8", "Kayla", "birthday 20%", "Quiet hours", "New-client outreach", "Per-segment guardrails", "auto-sent", "Discounts above 15%"];

test.describe("Settings → Autonomy on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the matrix is the policies table: reply live, money locked, the rest honest about enforcement", async ({ page }) => {
    await page.goto("/#/admin/autonomy");
    await page.waitForLoadState("networkidle");
    const table = page.locator(".pol-table");
    await expect(table).toBeVisible();

    const text = await page.locator(".set-pane").innerText();
    for (const s of INVENTED) expect(text, `invented copy on the pane: "${s}"`).not.toContain(s);

    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(7);
    // The reply row is the live switch: exactly one mode on, and it is enabled for an owner.
    const reply = rows.filter({ hasText: "Replies to customers" });
    await expect(reply.locator(".pol-dot.on")).toHaveCount(1);
    await expect(reply.locator(".pol-dot").first()).toBeEnabled();
    // Money is locked to Never and says why.
    const money = rows.filter({ hasText: "Refunds" });
    await expect(money).toHaveClass(/pol-locked/);
    await expect(money.getByText("Locked by charter")).toBeVisible();
    // Every row is one the receptionist consults now: nothing says "not enforced".
    await expect(rows.filter({ hasText: "not enforced yet" })).toHaveCount(0);
    // Booking and FAQ offer Auto and Ask; Veto and Never are dashes that say why.
    for (const label of ["Service & pricing questions", "Book · reschedule"]) {
      const row = rows.filter({ hasText: label });
      await expect(row.locator(".pol-dash")).toHaveCount(2);
      await expect(row.locator(".pol-dot")).toHaveCount(2);
      await expect(row.locator(".pol-dot").first()).toBeEnabled();
      await expect(row).toContainText("on WhatsApp and on the phone");
    }
    // The rows that run playbooks say what each mode does to a run, and their dots are live.
    for (const label of ["Re-engage quiet customers", "Standing offers"]) {
      const row = rows.filter({ hasText: label });
      await expect(row).toContainText("ask leaves it waiting on Today");
      await expect(row.locator(".pol-dot").first()).toBeEnabled();
    }

    // Reviews offer Auto, Ask and Never; Veto is a dash. The row exists on every workspace, so one mode is on.
    const reviews = rows.filter({ hasText: "Google reviews" });
    await expect(reviews.locator(".pol-dash")).toHaveCount(1);
    await expect(reviews.locator(".pol-dot")).toHaveCount(3);
    await expect(reviews.locator(".pol-dot.on")).toHaveCount(1);
    await expect(reviews.locator(".pol-dot").first()).toBeEnabled();

    // The hard limits are the owner's dials now (S6): the reply cap and the pause after a person steps in, each a
    // control with a number the runtime actually uses -- they were two sentences.
    await expect(page.getByTestId("aut-reply-cap")).toBeVisible();
    await expect(page.getByTestId("aut-pause")).toBeVisible();
    expect(await page.getByTestId("aut-reply-cap").inputValue()).toMatch(/^\d+$/);
  });

  test("changing the reply mode issues a workspace-scoped PUT with the class and mode — intercepted", async ({ page }) => {
    await page.goto("/#/admin/autonomy");
    await page.waitForLoadState("networkidle");
    const reply = page.locator(".pol-table tbody tr").filter({ hasText: "Replies to customers" });
    await expect(reply).toBeVisible();

    const seen: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/policies*", async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") return route.fallback();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { policy: { class: "reply", mode: "ask", limits: {} } } }),
      });
    });

    // Column order is Auto · Veto · Ask · Never; the third dot is Ask.
    await reply.locator(".pol-dot").nth(2).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].body).toEqual({ class: "reply", mode: "ask" });
  });
});
