import { test, expect } from "@playwright/test";
import { googleProviderOn } from "./providers";

/**
 * Sign-up on production: the page, the readiness answer, and the two
 * refusals that must hold before anything is created (a cross-site post,
 * a bad body). The probe that actually creates the user runs only when
 * E2E_SIGNUP_PROBE=1 (it sends a real code email), proves that no
 * workspace was made for an address nobody has proved, and removes the
 * user with the service role afterwards.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("sign-up", () => {
  test("the page offers a name, an email, and the way to sign in", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByTestId("signup")).toBeVisible();
    await expect(page.getByLabel("Business name")).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    // The credential, on every posture but the waitlist — which takes details
    // and creates no account to hold one.
    const posture = (await (await page.request.get("/api/v1/signup")).json()).data.posture as string;
    if (posture !== "waitlist") await expect(page.getByLabel("Choose a password")).toBeVisible();
    await expect(page.getByRole("button", { name: posture === "waitlist" ? "Join the list" : "Create workspace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    // The clock line reads the device, never asks.
    await expect(page.getByText(/^Your clock: /)).toBeVisible();
    // Google is a door too -- when the project's provider is on, and never on
    // the waitlist, which takes details and no accounts.
    const { data } = await (await page.request.get("/api/v1/signup")).json();
    const google = await googleProviderOn();
    if (data.posture !== "waitlist" && google === true) await expect(page.getByTestId("google-sign-in")).toBeVisible();
    if (data.posture === "waitlist" || google === false) await expect(page.getByTestId("google-sign-in")).toHaveCount(0);
  });

  test("readiness says the posture, whether a code is required, and never anything else", async ({ request }) => {
    const res = await request.get("/api/v1/signup");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    // The posture is the deployment's (SIGNUP_CODE): open, invite-only, or a
    // waitlist; the two booleans the page renders from are derived from it.
    expect(["open", "invite", "waitlist"]).toContain(data.posture);
    expect(data.open).toBe(data.posture !== "waitlist");
    expect(data.code_required).toBe(data.posture === "invite");
    expect(Object.keys(data).sort()).toEqual(["code_required", "open", "posture"]);
  });

  test("a post from another site is refused, and a bad body is refused, before anything exists", async ({ request, baseURL }) => {
    const foreign = await request.post("/api/v1/signup", { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { name: "Evil", email: "evil@example.com" } });
    expect(foreign.status()).toBe(403);
    const bad = await request.post("/api/v1/signup", { headers: { origin: baseURL!, "content-type": "application/json" }, data: { name: "x", email: "not-an-email" } });
    expect(bad.status()).toBe(400);
    const { error } = await bad.json();
    expect(error.code).toBe("validation");
  });

  test("a sign-up makes the user with what the form said, sends the code, and makes no workspace (opt-in probe)", async ({ request, baseURL }) => {
    test.skip(process.env.E2E_SIGNUP_PROBE !== "1" || !URL_ || !KEY, "set E2E_SIGNUP_PROBE=1 with the service role to run the probe");
    // The probe proves a code went out, and no example.com address can receive
    // one: production's mailer refuses the send, so without a real inbox the
    // probe could only fail, and open an issue every night saying so (#467).
    test.skip(!process.env.E2E_SIGNUP_EMAIL, "set E2E_SIGNUP_EMAIL to a real inbox, with {stamp} for a fresh address each run, to run the probe");
    const admin = { apikey: KEY!, Authorization: `Bearer ${KEY}` };
    const rest = (path: string, init: RequestInit = {}) =>
      fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...admin, "content-type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
    const stamp = Date.now();
    const name = `E2E signup probe ${stamp}`;
    const email = process.env.E2E_SIGNUP_EMAIL!.replace("{stamp}", String(stamp));
    let userId: string | null = null;
    try {
      const res = await request.post("/api/v1/signup", {
        headers: { origin: baseURL!, "content-type": "application/json" },
        data: { name, email, password: `e2e-probe-${stamp}-Aa1!`, timezone: "America/New_York", ...(process.env.E2E_SIGNUP_CODE ? { code: process.env.E2E_SIGNUP_CODE } : {}) },
      });
      expect(res.status()).toBe(200);
      const { data } = await res.json();
      expect(data.sent).toBe(true);
      // Nowhere to send them: the code step is on the sign-up page itself now,
      // in the page's own state after its own post. This probe posts without
      // the page, so it ends at the user it made: the sign-in screen it used
      // to open went with #441, and page.goto(null) throws.
      expect(data.next).toBeNull();
      // THE WORKSPACE WAITS FOR ITS OWNER: nothing in tenants for an address
      // nobody has proved. The user exists, carrying what the form said, for
      // the create screen to open with after the code.
      const tenants = (await (await rest(`tenants?select=id&name=eq.${encodeURIComponent(name)}`)).json()) as Array<{ id: string }>;
      expect(tenants).toHaveLength(0);
      const listed = (await (await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=1000`, { headers: admin })).json()) as { users: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> };
      const user = listed.users.find((u) => u.email === email);
      expect(user).toBeTruthy();
      userId = user!.id;
      expect(user!.user_metadata?.pending_workspace).toEqual({ name, timezone: "America/New_York" });
    } finally {
      if (userId) {
        await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: admin });
      }
    }
  });
});
