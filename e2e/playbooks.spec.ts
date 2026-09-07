import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Campaigns › Playbooks on a real workspace.
 *
 * The route renders the real page, not the Coming Soon card or the mockup's
 * six invented campaigns: the cards are the workspace's playbooks with what
 * their runs earned, the composer offers the four triggers with the count
 * of people on each list who said yes, and the templates are the approved
 * ones the workspace holds (or the honest line). Nothing is made here — the
 * workspace keeps no test playbook.
 */
const INVENTED = ["Birthday offer", "Recovery Agent", "Review Bot", "Referral thank-you", "Attributed", "Spring couples"];

test.describe("Playbooks on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the real page from the workspace's playbooks, offers the six triggers, and never invents a number", async ({ page }) => {
    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("playbooks-real");
    await expect(real).toBeVisible();

    const [pb, tpl] = await Promise.all([
      page.request.get("/api/v1/playbooks"),
      page.request.get("/api/v1/templates"),
    ]);
    expect(pb.status()).toBe(200);
    expect(tpl.status()).toBe(200);
    const playbooks = (await pb.json()).data.playbooks as { id: string; state: string }[];
    const approved = ((await tpl.json()).data.templates as { channel: string; meta_status: string }[]).filter((t) => t.channel === "whatsapp" && t.meta_status === "approved");

    // The cards are exactly the route's rows; none, and the page says so.
    await expect(real.getByTestId("pb-card")).toHaveCount(playbooks.length);
    if (playbooks.length === 0) await expect(real.getByTestId("pb-empty")).toBeVisible();

    const text = await real.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);

    // The composer: the four triggers, each with a count; the approved
    // templates or the honest line; the clock in the business's zone.
    // Cancelled — nothing is saved.
    await page.getByTestId("pb-new").click();
    const composer = real.getByTestId("pb-composer");
    await expect(composer).toBeVisible();
    await expect(composer.getByTestId("pb-trigger")).toHaveCount(6);
    await expect(composer.getByTestId("pb-trigger").first()).toContainText("Win-back");
    await expect(composer.getByTestId("pb-trigger-hint")).toContainText("Settings › Autonomy");
    if (approved.length === 0) {
      await expect(composer.getByTestId("pb-no-template")).toBeVisible();
    } else {
      await expect(composer.getByTestId("pb-template")).toHaveCount(approved.length);
      await expect(composer.getByTestId("pb-preview")).toBeVisible();
    }
    await expect(composer.getByTestId("pb-hour")).toBeVisible();
    await composer.getByTestId("pb-cancel").click();
    await expect(real.getByTestId("pb-composer")).toHaveCount(0);
  });

  test("the Campaigns tab is Playbooks, and Today shows a run only when one is waiting", async ({ page }) => {
    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("playbooks-real")).toBeVisible();
    await expect(page.getByRole("button", { name: "Playbooks" }).first()).toBeVisible();

    const bc = await page.request.get("/api/v1/broadcasts");
    expect(bc.status()).toBe(200);
    const waiting = ((await bc.json()).data.broadcasts as { state: string }[]).filter((b) => b.state === "pending_approval").length;
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("brief-run-row")).toHaveCount(Math.min(2, waiting));
  });
});
