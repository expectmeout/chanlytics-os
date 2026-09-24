import { test, expect } from "@playwright/test";
import { googleProviderOn } from "./providers";

/**
 * The session gate, exercised from outside.
 *
 * Every assertion here corresponds to a decision recorded in
 * apps/dashboard/middleware.ts, and to a bug that decision exists to prevent.
 * These need no credentials — the whole point is what an UNAUTHENTICATED
 * caller receives — so this file runs anywhere, including against production.
 */

/** Public by exact path. Everything else requires a validated user. */
const PUBLIC = ["/login", "/api/version", "/privacy", "/terms"];

const PROTECTED_PAGES = ["/", "/admin", "/inbox"];
const PROTECTED_APIS = [
  "/api/v1/conversations",
  "/api/v1/settings",
  "/api/v1/workspaces",
  "/api/v1/team",
  "/api/v1/calls",
];

test.describe("unauthenticated", () => {
  for (const path of PROTECTED_PAGES) {
    test(`a page requires a session: ${path}`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res, `no response for ${path}`).not.toBeNull();
      expect(new URL(page.url()).pathname).toBe("/login");
    });
  }

  for (const path of PROTECTED_APIS) {
    test(`an API answers 401 as JSON, not login HTML: ${path}`, async ({ request }) => {
      // A fetch() redirected into the login PAGE makes every client parse
      // failure look like a data bug, which is a genuinely awful thing to
      // debug. The middleware branches on /api/ for exactly this.
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(401);
      expect(res.headers()["content-type"]).toContain("application/json");
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error?.code).toBe("unauthorized");
    });
  }

  for (const path of PUBLIC) {
    test(`stays reachable without a session: ${path}`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} should not redirect`).toBe(200);
    });
  }

  test("REGRESSION: /auth is not a public PREFIX", async ({ request }) => {
    // `path.startsWith("/auth")` would make every future route under /auth
    // public the moment it was created, and nothing in review would flag it.
    // The allowlist is exact paths -- the callback is on it by name, and this
    // neighbour is not.
    const res = await request.get("/auth/not-a-door", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toBe("/login");
  });

  test("the sign-in callback is public, and with nothing to exchange it sends the visitor to sign in", async ({
    request,
  }) => {
    // A provider sends the browser here with a code and no session. Opened
    // bare, there is nothing to exchange: a sign-in to start, never cached.
    const res = await request.get("/auth/callback", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login$/);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("signing out works even with no session left to sign out of", async ({ request }) => {
    // /auth/signout is public precisely so a stale or missing cookie does not
    // trap someone on a page they cannot leave. 405 on GET means it was
    // reached — it is POST-only and does its own same-origin check — rather
    // than bounced to /login.
    const res = await request.get("/auth/signout", { maxRedirects: 0 });
    expect(res.status(), "reached the route rather than being redirected").toBe(405);
  });

  test("an auth redirect is never cacheable", async ({ request }) => {
    // These responses depend entirely on a cookie. Any shared cache keying on
    // the URL alone would hand one visitor's outcome to the next — sending a
    // signed-in operator to /login, or worse.
    const res = await request.get("/", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("the query string does not travel to the login URL", async ({ request }) => {
    // clone() carries it over, so a conversation id in a param would be copied
    // onto /login and into the access logs of every hop in between. The app
    // routes on the hash, which the browser keeps across a redirect without
    // the server ever seeing it, so nothing is lost by dropping this.
    const res = await request.get("/inbox?conversation=leaky-id-12345&token=abc", { maxRedirects: 0 });
    expect(res.headers()["location"]).toBe("/login");
    expect(res.headers()["location"]).not.toContain("leaky-id-12345");
  });

  test("the login page renders its own form, not a shell of the app", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type=email]")).toBeVisible();
    // Google's door is shown exactly when the hosted project has the provider
    // on, which its public settings say; a button that can only fail is not shown.
    const google = await googleProviderOn();
    if (google === true) await expect(page.getByTestId("google-sign-in")).toBeVisible();
    if (google === false) await expect(page.getByTestId("google-sign-in")).toHaveCount(0);
    // Nothing behind the gate may be painted to someone who is not through it:
    // no sidebar, and no workspace's name at the head of one.
    await expect(page.getByTestId("sidebar")).toHaveCount(0);
    await expect(page.getByTestId("sb-workspace")).toHaveCount(0);
  });
});
