import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Billing on a real workspace: the route answers honestly about what this
 * deployment can charge and never carries a Stripe id it could act on; the
 * pane says the arrangement; a workspace on a direct arrangement is
 * refused Checkout. Read-only: nothing here opens Stripe or changes a
 * subscription.
 */
test.describe("Billing on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the route says whether this deployment can charge, the row's mode and status, and no id Stripe could act on", async ({ page }) => {
    const res = await page.request.get("/api/v1/billing");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(typeof data.billing.ready).toBe("boolean");
    expect(typeof data.billing.trial_days).toBe("number");
    expect(data.billing.account).not.toBeNull();
    expect(["stripe", "direct"]).toContain(data.billing.account.mode);
    expect(JSON.stringify(data)).not.toMatch(/cus_|sub_|whsec_|sk_(test|live)_/);
    if (data.billing.account.mode === "direct") expect(data.billing.account.status).toBe("active");
  });

  test("Settings › Billing says the arrangement, and offers Stripe only where it can", async ({ page }) => {
    const { data } = await (await page.request.get("/api/v1/billing")).json();
    await page.goto("/#/admin/billing");
    await page.waitForLoadState("networkidle");
    const pane = page.getByTestId("billing-real");
    await expect(pane).toBeVisible();
    await expect(page.getByTestId("soon-billing")).toHaveCount(0);
    const text = await pane.innerText();
    expect(text).not.toContain("Not built yet");
    for (const s of ["Professional", "Buy credits", "Credits left", "Used this cycle"]) expect(text, `invented: "${s}"`).not.toContain(s);
    if (data.billing.account.mode === "direct") {
      await expect(page.getByTestId("billing-headline")).toContainText("Direct arrangement");
      await expect(page.getByTestId("billing-checkout")).toHaveCount(0);
      await expect(page.getByTestId("billing-invoices")).toHaveCount(0);
    } else if (data.billing.account.status === "none") {
      await expect(page.getByTestId("billing-headline")).toContainText("No subscription yet");
      await expect(page.getByTestId("billing-checkout")).toHaveCount(data.billing.ready ? 1 : 0);
    } else {
      await expect(page.getByTestId("billing-invoices")).toBeVisible();
    }
  });

  test("Checkout is refused for a direct arrangement, and says so", async ({ page, baseURL }) => {
    const { data } = await (await page.request.get("/api/v1/billing")).json();
    test.skip(data.billing.account.mode !== "direct", "the live workspace pays by card; the refusal is for direct arrangements");
    const res = await page.request.post("/api/v1/billing/checkout", { headers: { origin: baseURL!, "content-type": "application/json" }, data: {} });
    expect([403, 409, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
    if (res.status() === 409) expect(body.error.message).toContain("direct arrangement");
  });

  test("Setup shows no billing row for a direct arrangement", async ({ page }) => {
    const { data } = await (await page.request.get("/api/v1/billing")).json();
    test.skip(data.billing.account.mode !== "direct", "a card-paying workspace has the row");
    await page.goto("/#/admin/setup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("setup-readiness")).toBeVisible();
    await expect(page.getByTestId("setup-row-billing")).toHaveCount(0);
  });
});
