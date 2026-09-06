import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * TEMPORARY, never committed: on the live workspace, hide the receptionist's
 * operational templates from the composers (the page's own Hide links),
 * then picture the card, the composers and the top-right chrome.
 */
const OUT = process.env.PROOF_OUT || ".";
const OPERATIONAL = ["approval_confirmation", "approval_request", "form_received", "form_submission"];

test.describe("proof: templates that belong", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.setTimeout(240_000);

  test("hides the operational templates and pictures the result", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("templates");
    await expect(card).toBeVisible();
    for (const name of OPERATIONAL) {
      const row = card.getByTestId("template-row").filter({ hasText: ` · ${name} · ` }).first();
      if ((await row.count()) === 0) { console.log("no row for", name); continue; }
      if (/is-hidden/.test((await row.getAttribute("class")) || "")) { console.log("already hidden", name); continue; }
      await row.getByTestId("template-hide").click();
      await expect(page.locator(".pp-toast").first()).toContainText(/out of the composers|could not|Request failed/, { timeout: 30_000 });
      console.log("HID", name, "→", (await page.locator(".pp-toast").first().innerText()).replace(/\s+/g, " "));
      await page.waitForTimeout(1200);
    }
    await page.waitForTimeout(800);
    await card.screenshot({ path: `${OUT}/shot2-settings-card.png` });
    const hidden = card.getByTestId("templates-hidden");
    console.log("HIDDEN HEAD:", (await hidden.count()) ? (await hidden.innerText()).replace(/\s+/g, " ") : "(none)");

    const res = await page.request.get("/api/v1/templates");
    const offered = (await res.json()).data.templates as { name: string; hidden_at: string | null }[];
    console.log("OFFERED:", offered.map((t) => t.name).join(", "));

    await page.screenshot({ path: `${OUT}/shot2-topbar.png`, clip: { x: 0, y: 0, width: 1280, height: 60 } });

    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    const composer = page.getByTestId("bc-composer");
    await expect(composer).toBeVisible();
    await page.waitForTimeout(600);
    await composer.screenshot({ path: `${OUT}/shot2-broadcast-composer.png` });
    console.log("BC CHIPS:", (await composer.getByTestId("bc-template").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
    console.log("BC ACTIVE:", (await composer.locator('[data-testid="bc-template"].active').innerText()).replace(/\s+/g, " "));
    console.log("BC LABELS:", (await composer.locator(".bc-var-label").allInnerTexts()).join(" | "));
    console.log("BC PREVIEW:", (await composer.getByTestId("bc-preview").innerText()).replace(/\s+/g, " "));

    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("pb-new").click();
    const pb = page.getByTestId("pb-composer");
    await expect(pb).toBeVisible();
    await page.waitForTimeout(600);
    await pb.screenshot({ path: `${OUT}/shot2-playbook-composer.png` });
    console.log("PB ACTIVE:", (await pb.locator('[data-testid="pb-template"].active').innerText()).replace(/\s+/g, " "));
    console.log("PB STARTER:", (await pb.getByTestId("pb-starter").innerText()).replace(/\s+/g, " "));
    await pb.getByTestId("pb-cancel").click();
  });
});
