import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { apiGet } from "../workspace";
import { routeOf } from "../address";

/**
 * A person's page on its path (decision 0015, step 5): `/w/<slug>/people/<id>` is an App Router page, the frame draws its
 * chrome around it, and the address a hash said (`/w/<slug>#/clients/<id>`, in an email or a bookmark) still lands on it.
 * Read-only against real data, like the rest of the signed-in specs.
 */
test.describe("A person's page on its path", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  /** The workspace's slug, as the home sends this tab to it. */
  async function slugOf(page: Page): Promise<string> {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
    return slug;
  }

  test("it is a page of its own: it boots on its path, People lit, its Back is People, and the hash address lands on it", async ({
    page,
  }) => {
    const slug = await slugOf(page);
    const people = (await (await apiGet(page, "/api/v1/contacts")).json()).data.people as { id: string }[];
    test.skip(people.length === 0, "this workspace has nobody to open");
    const id = people[0].id;

    // A load of the path boots the frame with People lit and the person drawn inside it.
    await page.goto("/api/version");
    await page.goto(`/w/${slug}/people/${id}`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("People");
    await expect(page.getByTestId("person-now")).toBeVisible();
    expect(routeOf(page.url())).toBe(`clients/${id}`);

    // Its own Back goes to People, and the browser's Back and Forward walk the two.
    await page.getByRole("button", { name: "Back to People" }).first().click();
    await expect.poll(() => routeOf(page.url())).toBe("clients");
    await expect(page.getByTestId("person-now")).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe(`clients/${id}`);
    await expect(page.getByTestId("person-now")).toBeVisible();
    await page.goForward();
    await expect.poll(() => routeOf(page.url())).toBe("clients");

    // The address a hash said, in an email or a bookmark, lands on the path, and the page is there.
    await page.goto(`/w/${slug}#/clients/${id}`);
    await expect(page.getByTestId("person-now")).toBeVisible({ timeout: 30_000 });
    expect(routeOf(page.url())).toBe(`clients/${id}`);
    expect(new URL(page.url()).pathname).toBe(`/w/${slug}/people/${id}`);
  });

  test("an address that names nobody says so, in the page, inside the frame", async ({ page }) => {
    const slug = await slugOf(page);
    await page.goto(`/w/${slug}/people/00000000-0000-4000-8000-000000000000`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("This person is not in your workspace")).toBeVisible();
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("People");
  });
});
