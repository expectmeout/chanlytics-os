import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";

/**
 * The address of a page, in a real browser (decision 0015, "The address first").
 *
 * A route is the path after the workspace's slug, `/w/acme/inbox`, and the frame that draws every page stays mounted
 * as the route moves. `/w/acme#/inbox` -- what an email's link, the phone app and every bookmark say -- keeps working
 * for ever: the frame moves it to its path before it draws. The mapping itself, every route of it, is run in
 * tooling/scripts/tests/shell/address/address.test.mjs; this is the browser's half: a hash address lands on its path, a
 * reload of a path boots the frame, and a move inside the app is a path pushed, with Back and Forward walking it and
 * no page load between. Read-only: nothing here writes.
 */
test.describe("the address of a page", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  /** The slug of the workspace the home opens for this session: a signed-in tab at / is sent to /w/<slug>. */
  async function slugOfHome(page: Page): Promise<string> {
    await signIn(page);
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
    return slug;
  }

  /** The frame is up, on the route: its sidebar drawn and its current item the one the route lights. */
  async function expectFrameOn(page: Page, place: string): Promise<void> {
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText(place);
  }

  /** A new document, from anywhere but the address being asked for: a same-document move would never load the frame. */
  async function loadFresh(page: Page, address: string): Promise<void> {
    await page.goto("/api/version");
    await page.goto(address);
  }

  test("a hash address lands on its path, before the frame draws: /w/<slug>#/reports is /w/<slug>/reports", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}#/reports`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/reports`, { timeout: 30_000 });
    expect(new URL(page.url()).hash, "the hash is gone: the path says the route").toBe("");
    await expectFrameOn(page, "Reports");
  });

  test("the query stays, after the route, when the address moves", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}?ref=e2e#/reports`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/reports`, { timeout: 30_000 });
    expect(new URL(page.url()).search).toBe("?ref=e2e");
    await expectFrameOn(page, "Reports");
  });

  test("the home carries a route to the workspace's path: /#/reports opens /w/<slug>/reports", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, "/#/reports");
    await page.waitForURL((u) => u.pathname === `/w/${slug}/reports`, { timeout: 30_000 });
    expect(new URL(page.url()).hash).toBe("");
    await expectFrameOn(page, "Reports");
  });

  test("a reload of a path boots the frame on that route, where a route is a path the server serves", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/reports`);
    await expectFrameOn(page, "Reports");
    expect(new URL(page.url()).pathname).toBe(`/w/${slug}/reports`);
    await page.reload();
    await expectFrameOn(page, "Reports");
    expect(new URL(page.url()).pathname, "the reload kept the path").toBe(`/w/${slug}/reports`);
    // The shell's old name for a route the product has a word for still lands, moved to the word for ever (contracts
    // ROUTE_WORDS: the path says people where the shell's route says clients), and the route it is at is the same.
    await loadFresh(page, `/w/${slug}/clients`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/people`, { timeout: 30_000 });
    await expectFrameOn(page, "People");
    expect(routeOf(page.url())).toBe("clients");
    await loadFresh(page, `/w/${slug}#/clients`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/people`, { timeout: 30_000 });
    await expectFrameOn(page, "People");
  });

  test("a move inside the app is a path, and the frame stays mounted: Back and Forward walk the paths with no page load", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/today`);
    await expectFrameOn(page, "Today");
    // What a page load would lose: a mark on this document.
    await page.evaluate(() => {
      (window as unknown as { __addressSpec?: boolean }).__addressSpec = true;
    });
    const alive = () => page.evaluate(() => (window as unknown as { __addressSpec?: boolean }).__addressSpec === true);

    await page.locator(".nav-item", { hasText: "Reports" }).click();
    await page.waitForURL((u) => u.pathname === `/w/${slug}/reports`);
    await expectFrameOn(page, "Reports");
    expect(await alive(), "the move loaded no page").toBe(true);

    await page.locator(".nav-item", { hasText: "People" }).click();
    await page.waitForURL((u) => routeOf(u) === "clients");
    await expectFrameOn(page, "People");

    await page.goBack();
    await page.waitForURL((u) => u.pathname === `/w/${slug}/reports`);
    await expectFrameOn(page, "Reports");
    expect(await alive(), "Back loaded no page").toBe(true);

    await page.goBack();
    await page.waitForURL((u) => routeOf(u) === "today");
    await expectFrameOn(page, "Today");

    await page.goForward();
    await page.waitForURL((u) => u.pathname === `/w/${slug}/reports`);
    await expectFrameOn(page, "Reports");
    expect(await alive(), "Forward loaded no page").toBe(true);
  });

  test("a sign-in returns to the route the gate carried: /login#/reports lands on /w/<slug>/reports", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    // The gate sends a signed-out visitor to /login with the route in the fragment (auth-gate.spec.ts); the sign-in page
    // keeps it, and the home carries it to the workspace's path. A session that is already in takes the same road.
    await page.goto("/login#/reports");
    await page.waitForURL((u) => u.pathname === `/w/${slug}/reports`, { timeout: 30_000 });
    expect(new URL(page.url()).hash).toBe("");
    await expectFrameOn(page, "Reports");
  });

  test("a fragment that is no route is left alone: a refused sign-in's is not drawn as a page, and the workspace opens on Today", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}#error=server_error&error_code=unexpected_failure`);
    await expectFrameOn(page, "Today");
    expect(new URL(page.url()).pathname, "not moved: it names no route").toBe(`/w/${slug}`);
    await expect(page.getByText(/No surface at/), "a sign-in failure is not a routing error").toHaveCount(0);
  });
});
