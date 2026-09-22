import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * The scoping rule, proved from outside.
 *
 * Every /api/v1 read on the workspace scope must be told which workspace it
 * means. An account in one workspace has no ambiguity; an account in two is
 * refused with `choose_workspace` (with-route.ts memberContext) rather than
 * answered from the oldest membership -- the fallback only GET /workspaces
 * may take, because deciding which workspace a tab opens is its job. The
 * unit suite runs the rule against a database in memory; this is the same
 * rule over real HTTP, with the real session and the real middleware.
 */
test.describe("Which workspace a request means", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a read that names its workspace is answered; one that names none is refused when the account holds two, and answered when it holds one", async ({
    page,
  }) => {
    const ws = await page.request.get("/api/v1/workspaces");
    expect(ws.status()).toBe(200);
    const { data } = await ws.json();
    const ids: string[] = (data.workspaces ?? []).map((w: { id: string }) => w.id);
    expect(ids.length).toBeGreaterThan(0);

    const named = await page.request.get(`/api/v1/team?workspace=${ids[0]}`);
    expect(named.status()).toBe(200);

    const bare = await page.request.get("/api/v1/team");
    if (ids.length > 1) {
      expect(bare.status(), "two workspaces and no name: the server refuses to guess").toBe(400);
      const body = await bare.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("choose_workspace");
      expect(body.error.message).toContain("say which one first");
    } else {
      test.info().annotations.push({
        type: "note",
        description:
          "this account holds one workspace, so the refusal cannot be provoked here; the unit suite proves it on two",
      });
      expect(bare.status(), "one workspace: nothing to choose").toBe(200);
    }

    // A workspace this account is not in resolves to nothing, never to the other one.
    const stranger = await page.request.get("/api/v1/team?workspace=00000000-0000-4000-8000-000000000000");
    expect(stranger.status()).toBe(404);
  });
});
