import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";
import { apiGet } from "../workspace";

/**
 * People's list, in a real browser (decision 0015, step 5: the shell leaves surface by surface).
 *
 * The list, its views and the New list door are an App Router page at `/w/<slug>/people`, drawn inside the frame that stays
 * mounted (src/surfaces/people). A view of it is a path, `people/seg:needs_you`, and the old names, `clients` in a path or a
 * hash and Lists' own `lists/<id>`, still land there for ever. Read-only: nothing here writes; the New list box is opened
 * and left.
 */
test.describe("People's list is a page of its own", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  /** The slug of the workspace the home opens for this session. */
  async function slugOfHome(page: Page): Promise<string> {
    await signIn(page);
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
    return slug;
  }

  /** A new document, from anywhere but the address being asked for: a same-document move would never load the frame. */
  async function loadFresh(page: Page, address: string): Promise<void> {
    await page.goto("/api/version");
    await page.goto(address);
  }

  /** The frame is up and People is the item it lights. */
  async function expectPeopleFrame(page: Page): Promise<void> {
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("People");
  }

  test("/w/<slug>/people draws the list inside the frame, and a reload keeps the path", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/people`);
    await expectPeopleFrame(page);
    await expect(page.getByTestId("people-standing")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("people-table-scroll")).toBeVisible();
    expect(routeOf(page.url())).toBe("clients");
    await page.reload();
    await expectPeopleFrame(page);
    await expect(page.getByTestId("people-standing")).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname, "the reload kept the path").toBe(`/w/${slug}/people`);
  });

  test("a view is a path: /people/seg:needs_you opens Needs you picked, with its own crumb", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/people/seg:needs_you`);
    await expectPeopleFrame(page);
    const picked = page.locator('.cl-rail-row[aria-current="true"]');
    await expect(picked).toContainText("Needs you", { timeout: 30_000 });
    expect(new URL(page.url()).pathname, "the address the link named is the one drawn").toBe(
      `/w/${slug}/people/seg:needs_you`,
    );
  });

  test("a list picked on the rail says so in the path, and the page it is on is not loaded again", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/people`);
    await expectPeopleFrame(page);
    await expect(page.getByTestId("people-standing")).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      (window as unknown as { __peopleSpec?: boolean }).__peopleSpec = true;
    });
    const alive = () => page.evaluate(() => (window as unknown as { __peopleSpec?: boolean }).__peopleSpec === true);

    await page.locator(".cl-rail-row", { hasText: "Needs you" }).first().click();
    await page.waitForURL((u) => routeOf(u) === "clients/seg:needs_you");
    await expect(page.locator('.cl-rail-row[aria-current="true"]')).toContainText("Needs you");
    expect(await alive(), "the pick loaded no page").toBe(true);

    // Pressing the picked row again goes back to everyone, in the path too.
    await page.locator('.cl-rail-row[aria-current="true"]').click();
    await page.waitForURL((u) => routeOf(u) === "clients");
    expect(await alive(), "going back to everyone loaded no page").toBe(true);
  });

  test("the old names land on the word: /clients and #/clients are /people, with a view kept", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/clients`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/people`, { timeout: 30_000 });
    await expectPeopleFrame(page);

    await loadFresh(page, `/w/${slug}/clients/seg:needs_you`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/people/seg:needs_you`, { timeout: 30_000 });
    await expect(page.locator('.cl-rail-row[aria-current="true"]')).toContainText("Needs you", { timeout: 30_000 });

    await loadFresh(page, `/w/${slug}#/clients`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/people`, { timeout: 30_000 });
    expect(new URL(page.url()).hash, "the hash is gone: the path says the route").toBe("");
    await expectPeopleFrame(page);
  });

  test("a list's own address, /lists/<id>, lands on People with that list picked, replaced, not pushed", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    const res = await apiGet(page, "/api/v1/segments");
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as { data: { lists: { id: string; archived_at?: string | null }[] } };
    // A list this workspace keeps, else one of People's own, which the address names by its word.
    const own = data.lists.find((l) => !l.archived_at);
    const id = own ? own.id : "needs_you";
    const where = own ? `people/list:${id}` : `people/seg:${id}`;
    await loadFresh(page, `/w/${slug}/lists/${id}`);
    await page.waitForURL((u) => u.pathname === `/w/${slug}/${where}`, { timeout: 30_000 });
    await expectPeopleFrame(page);
    // Replaced, so Back leaves People rather than bouncing through the old route.
    await page.goBack();
    await page.waitForURL(
      (u) => !u.pathname.startsWith(`/w/${slug}/lists/`) && !u.pathname.startsWith(`/w/${slug}/people`),
    );
  });

  test("the New list door opens the box for an owner and leaves it alone: /people/new-list", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/people/new-list`);
    await expectPeopleFrame(page);
    await expect(page.getByTestId("new-list-name")).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("new-list-name")).toHaveCount(0);
  });
});
