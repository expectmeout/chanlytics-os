import { test, expect } from "@playwright/test";

/**
 * Sign-up on production: the page, the readiness answer, and the two
 * refusals that must hold before anything is created (a cross-site post,
 * a bad body). The probe that actually creates a workspace and its user
 * runs only when E2E_SIGNUP_PROBE=1 (it sends a real code email), and
 * removes both with the service role afterwards.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("sign-up", () => {
  test("the page offers a name, an email, and the way to sign in", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByTestId("signup")).toBeVisible();
    await expect(page.getByLabel("Business name")).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create workspace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    // The clock line reads the device, never asks.
    await expect(page.getByText(/^Your clock: /)).toBeVisible();
  });

  test("readiness says whether a code is required, and never anything else", async ({ request }) => {
    const res = await request.get("/api/v1/signup");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data.open).toBe(true);
    expect(typeof data.code_required).toBe("boolean");
    expect(Object.keys(data).sort()).toEqual(["code_required", "open"]);
  });

  test("a post from another site is refused, and a bad body is refused, before anything exists", async ({ request, baseURL }) => {
    const foreign = await request.post("/api/v1/signup", { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { name: "Evil", email: "evil@example.com" } });
    expect(foreign.status()).toBe(403);
    const bad = await request.post("/api/v1/signup", { headers: { origin: baseURL!, "content-type": "application/json" }, data: { name: "x", email: "not-an-email" } });
    expect(bad.status()).toBe(400);
    const { error } = await bad.json();
    expect(error.code).toBe("validation");
  });

  test("a sign-up creates the workspace and its owner, sends the code, and lands at the code step (opt-in probe)", async ({ page, request, baseURL }) => {
    test.skip(process.env.E2E_SIGNUP_PROBE !== "1" || !URL_ || !KEY, "set E2E_SIGNUP_PROBE=1 with the service role to run the probe");
    const rest = (path: string, init: RequestInit = {}) =>
      fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "content-type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
    const stamp = Date.now();
    const name = `E2E signup probe ${stamp}`;
    const email = (process.env.E2E_SIGNUP_EMAIL || "e2e-signup-{stamp}@example.com").replace("{stamp}", String(stamp));
    let tenantId: string | null = null;
    let userId: string | null = null;
    try {
      const res = await request.post("/api/v1/signup", {
        headers: { origin: baseURL!, "content-type": "application/json" },
        data: { name, email, timezone: "America/New_York", ...(process.env.E2E_SIGNUP_CODE ? { code: process.env.E2E_SIGNUP_CODE } : {}) },
      });
      expect(res.status()).toBe(200);
      const { data } = await res.json();
      expect(data.sent).toBe(true);
      expect(data.next).toContain("/login?email=");
      // The workspace exists with an owner, provisioned like any other.
      const tenants = (await (await rest(`tenants?select=id,slug,timezone&name=eq.${encodeURIComponent(name)}`)).json()) as Array<{ id: string; slug: string; timezone: string }>;
      expect(tenants).toHaveLength(1);
      tenantId = tenants[0].id;
      expect(tenants[0].timezone).toBe("America/New_York");
      const members = (await (await rest(`memberships?select=user_id,role&tenant_id=eq.${tenantId}`)).json()) as Array<{ user_id: string; role: string }>;
      expect(members).toEqual([expect.objectContaining({ role: "owner" })]);
      userId = members[0].user_id;
      const policies = (await (await rest(`policies?select=class&tenant_id=eq.${tenantId}`)).json()) as Array<{ class: string }>;
      expect(policies.length).toBeGreaterThanOrEqual(7);
      // The next screen is sign-in at the code step, for this address.
      await page.goto(data.next);
      await expect(page.getByLabel(/Enter the 6-digit code sent to/)).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
    } finally {
      if (tenantId) {
        await rest(`events?tenant_id=eq.${tenantId}`, { method: "DELETE" });
        await rest(`tenants?id=eq.${tenantId}`, { method: "DELETE" });
      }
      if (userId) {
        await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } });
      }
    }
  });
});
