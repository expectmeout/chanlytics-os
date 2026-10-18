import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * Settings → Autonomy, on a real workspace.
 *
 * The mockup's pane drew a charter with invented evidence ("conf ≥ 0.8",
 * "12 auto-sent · 4% edited"), a veto row pointing at an invented draft, quiet
 * hours, outreach defaults and per-segment guardrails — none backed by a
 * column. The real pane renders the policies table: Replies is a card of its
 * own with its mode and the dials that mode has, bookings and price questions
 * are one question each (Hours & booking's, and Limits'), money is said once on
 * Limits, every row of the matrix is one something consults (reviews
 * included), and the hard limits are the runtime's actual numbers (the
 * Settings wiring review, 18 Oct 2026).
 *
 * Intercepts its own PUT, so the workspace's policy is never changed.
 */
const INVENTED = [
  "conf ≥ 0.8",
  "Kayla",
  "birthday 20%",
  "Quiet hours",
  "New-client outreach",
  "Per-segment guardrails",
  "auto-sent",
  "Discounts above 15%",
];

test.describe("Settings → Autonomy on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the matrix is the policies table: Replies a card of its own, money said once, the rest honest about enforcement", async ({
    page,
  }) => {
    await page.goto("/#/admin/autonomy");
    await page.waitForLoadState("networkidle");
    const table = page.locator(".pol-table");
    await expect(table).toBeVisible();

    const text = await page.locator(".set-pane").innerText();
    for (const s of INVENTED) expect(text, `invented copy on the pane: "${s}"`).not.toContain(s);

    // One row per class the workspace is offered (contracts policyClassOffered) and asked nowhere else: four where
    // deals are off, as the nightly's are, the reach-outs' cold email among them; Proposal follow-ups makes five.
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "Cold email to businesses a search found" })).toHaveCount(1);
    for (const label of ["Replies to customers", "Refunds", "Service & pricing questions", "Book · reschedule"])
      await expect(rows.filter({ hasText: label }), `${label} is asked elsewhere`).toHaveCount(0);
    // Replies is its own card: its mode a menu, one answer in force, open to an owner.
    const replies = page.getByTestId("aut-replies");
    await expect(replies.getByTestId("pol-phone-mode-reply")).toBeEnabled();
    // Money is said once, on Limits, and offers nothing to press.
    const money = page.getByTestId("rec-row-aut-hard-money");
    await expect(money).toContainText("Always go to you — locked in the database");
    // Price questions are Limits' one question, its answer a menu.
    await expect(page.getByTestId("price_choice-menu")).toBeVisible();
    // Every row is one the receptionist consults now: nothing says "not enforced".
    await expect(rows.filter({ hasText: "not enforced yet" })).toHaveCount(0);
    // The rows that run playbooks say what each mode does to a run -- behind the row's info mark, as every note is
    // since #620 -- and their dots are live.
    for (const label of ["Re-engage quiet customers", "Standing offers"]) {
      const row = rows.filter({ hasText: label });
      await expect(row.locator(".rec-tip")).toHaveAttribute("data-tip", /ask leaves it waiting on Today/);
      await expect(row.locator(".pol-dot").first()).toBeEnabled();
    }

    // Reviews offer Auto, Ask and Never; Veto is a dash. The row exists on every workspace, so one mode is on.
    const reviews = rows.filter({ hasText: "Google reviews" });
    await expect(reviews.locator(".pol-dash")).toHaveCount(1);
    await expect(reviews.locator(".pol-dot")).toHaveCount(3);
    await expect(reviews.locator(".pol-dot.on")).toHaveCount(1);
    await expect(reviews.locator(".pol-dot").first()).toBeEnabled();

    // The hard limits are the owner's dials now (S6): the reply cap and the pause after a person steps in, each a
    // control with a number the runtime actually uses -- they were two sentences -- and the day's budget beside them.
    await expect(page.getByText("Day's model budget")).toBeVisible();
    await expect(page.getByTestId("aut-reply-cap")).toBeVisible();
    await expect(page.getByTestId("aut-pause")).toBeVisible();
    // Each dial is a row of options with one chosen (the record kit's radios); the chosen one is the number the runtime uses.
    await expect(page.getByTestId("aut-reply-cap").getByRole("radio", { checked: true })).toHaveText(/^\d+$/);
    await expect(page.getByTestId("aut-pause").getByRole("radio", { checked: true })).toHaveText(/^\d+h$/);
  });

  test("changing the reply mode issues a workspace-scoped PUT with the class and mode — intercepted", async ({
    page,
  }) => {
    await page.goto("/#/admin/autonomy");
    await page.waitForLoadState("networkidle");
    const reply = page.getByTestId("pol-phone-mode-reply");
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

    // The mode is a menu of the four, each by what it does; Asks you is ask.
    await reply.click();
    await page.getByRole("menuitemradio", { name: /Asks you/ }).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].body).toEqual({ class: "reply", mode: "ask" });
  });

  test("Hours & booking asks once what happens when someone wants to book, its three answers each saying what it does", async ({
    page,
  }) => {
    await page.goto("/#/admin/hours");
    await page.waitForLoadState("networkidle");
    const menu = page.getByTestId("booking_choice-menu");
    await expect(menu).toBeVisible();
    await menu.click();
    const answers = page.getByRole("menuitemradio");
    await expect(answers).toHaveCount(3);
    await expect(page.getByRole("menuitemradio", { checked: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    // The booking tool's fold no longer holds a requests switch: the row above is where that is answered.
    await expect(page.getByTestId("bto-requests")).toHaveCount(0);
  });
});
