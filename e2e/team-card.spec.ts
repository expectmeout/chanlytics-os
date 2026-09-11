import { expect, test } from "@playwright/test";
import { HAVE_SESSION, WHY_SKIPPED, signInAndGo } from "./session";

/**
 * The Team card writes to the SERVER.
 *
 * It read the real roster and wrote to the mockup's seeded one: an owner
 * pressed Invite, read "Invite sent to x as Operator", and nothing was sent,
 * stored or audited. Unit tests cannot catch that — they pin the source, and
 * the source looked reasonable. What catches it is watching for the request.
 *
 * Every test here INTERCEPTS the call. Nothing reaches Supabase, no invitation
 * email is sent, and no membership changes: the assertion is that the browser
 * tried, with the right method, URL and body. That is exactly the fact that was
 * false before, and it is safe to assert against production.
 */
test.describe("the Team card", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("Invite calls the API, scoped to a workspace, and reports the server's answer", async ({ page }) => {
    await signInAndGo(page, "#/admin/team");

    const seen: { url: string; method: string; body: unknown }[] = [];
    await page.route("**/api/v1/team/invite*", async (route) => {
      const req = route.request();
      seen.push({ url: req.url(), method: req.method(), body: req.postDataJSON() });
      // Answer as the server would on a rule violation, so the card's error
      // path is exercised too. Nothing is created.
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "conflict", message: "Intercepted by the test suite." } }),
      });
    });

    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page.getByPlaceholder("teammate@email.com").fill("e2e-intercepted@example.invalid");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect.poll(() => seen.length, { timeout: 10_000 }).toBe(1);
    expect(seen[0].method).toBe("POST");
    // Writes must carry the workspace: the server's ambiguity guard refuses an
    // unscoped write from anyone holding two memberships.
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].body).toMatchObject({ email: "e2e-intercepted@example.invalid", role: "operator" });

    // The server's own sentence, not a generic failure and not a false success.
    await expect(page.getByText("Intercepted by the test suite.")).toBeVisible();
  });

  test("a role change calls PATCH and never claims success on its own", async ({ page }) => {
    await signInAndGo(page, "#/admin/team");

    const seen: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/team/*", async (route) => {
      const req = route.request();
      if (req.method() === "GET") return route.fallback();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "conflict", message: "Intercepted role change." } }),
      });
    });

    // Wait for the roster to arrive before counting: the rows are painted by
    // the settings override, not by the first render, and counting too early
    // silently skipped this test rather than failing it.
    await page.locator(".set-team-row").first().waitFor({ timeout: 20_000 });
    // Only rows for OTHER members carry a menu; the signed-in row has none.
    const menus = page.locator(".set-team-row button.btn-icon");
    const count = await menus.count();
    test.skip(count === 0, "this workspace has no other member to change");
    await menus.first().click();
    // Inside the menu, not the row behind it — a role badge reading "Viewer"
    // would otherwise be a perfectly plausible thing to click by accident.
    await page.locator(".more-menu").getByRole("menuitem", { name: /Viewer/ }).click();

    await expect.poll(() => seen.length, { timeout: 10_000 }).toBe(1);
    expect(seen[0].method).toBe("PATCH");
    expect(seen[0].url).toContain("workspace=");
    await expect(page.getByText("Intercepted role change.")).toBeVisible();
  });

  test("the roster shows the signed-in account and no invented colleagues", async ({ page }) => {
    await signInAndGo(page, "#/admin/team");
    const card = page.locator(".set-card", { hasText: "Team" }).first();
    await expect(card).toBeVisible();
    for (const invented of ["Sarah Chen", "Marcus Webb", "Lena Park", "Jay Rivera", "serenityspa.co"]) {
      await expect(card).not.toContainText(invented);
    }
    await expect(card).toContainText(String(process.env.E2E_USER_EMAIL).split("@")[0]);
  });
});

test.describe("the chrome tells the truth", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("New Chat opens the real palette, never the fabricated assistant", async ({ page }) => {
    await signInAndGo(page, "#/today");
    const newChat = page.getByRole("button", { name: "New Chat" });
    await expect(newChat).toBeVisible();
    // Once gated like the topbar's Ask button; now both open the palette that
    // reads the workspace (ask-real.jsx). The seed overlay, which answered
    // "$1,840 booked against a $4,200 pace", stays in the demo.
    await expect(newChat).toBeEnabled();
    await newChat.click();
    await expect(page.getByTestId("ask-real")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("$1,840");
  });

  test("the sidebar names the workspace the data belongs to", async ({ page }) => {
    await signInAndGo(page, "#/today");
    // The globals are written by the seam's workspace override, which lands
    // after first paint — wait for it rather than reading an empty list.
    await page.waitForFunction(
      () => !!(window as unknown as { __WORKSPACES?: unknown[] }).__WORKSPACES,
      undefined,
      { timeout: 20_000 },
    );
    const active = await page.evaluate(() => {
      const w = window as unknown as { __WORKSPACES?: { id: string; name: string }[]; __ACTIVE_WORKSPACE?: string };
      const list = w.__WORKSPACES ?? [];
      return (list.find((t) => t.id === w.__ACTIVE_WORKSPACE) ?? list[0])?.name ?? null;
    });
    test.skip(!active, "no workspace resolved");
    await expect(page.locator(".sb-team-name")).toHaveText(active!);
  });
});
