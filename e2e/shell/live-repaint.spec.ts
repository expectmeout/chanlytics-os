import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { activeWorkspace, scoped } from "../workspace";

/**
 * A change made elsewhere reaches an open page, without a reload (decision 0019; the page-open PRD of 3 Nov 2026, L6).
 * Every other test of the live feed runs on stand-ins: the database's notices on Postgres, the runner over a feed the test
 * holds. This one runs the whole road on production, in the nightly's own workspace: a write in one browser commits, the
 * database tells the workspace's topic at the commit, Supabase Realtime carries it to the other browser's tab, the runner
 * reads the surface again, and the page draws it. Two contexts, so two sessions and two sockets, as two people are.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };
/** As long as a change may take to reach an open page with the feed up (the PRD's NFR1 is 3 s at p95; the run's margin). */
const REACHES_MS = 8_000;

/** People, open in a tab of its own, marked so a reload would show. */
async function peopleOpen(page: Page): Promise<void> {
  await signIn(page);
  await page.goto("/#/clients");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => Object.assign(window, { __stillTheSamePage: true }));
}

const stillTheSamePage = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stillTheSamePage?: boolean }).__stillTheSamePage === true);

test.describe("a change made elsewhere reaches an open page, without a reload", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("a list made in another browser is on People's rail within seconds, and gone again when it is removed", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const watching = await (await browser.newContext({ baseURL: BASE })).newPage();
    const writing = await (await browser.newContext({ baseURL: BASE })).newPage();
    await peopleOpen(watching);
    await signIn(writing);
    const ws = await activeWorkspace(writing);
    const name = `Live ${Date.now().toString(36)}`;
    let id: string | null = null;
    try {
      const made = await writing.request.post(scoped("/api/v1/segments", ws), { data: { name }, ...fromTheApp });
      expect(made.ok(), `the list is made: ${made.status()}`).toBe(true);
      id = ((await made.json()).data as { list?: { id: string }; id?: string }).list?.id ?? null;
      await expect(watching.getByText(name, { exact: true }).first()).toBeVisible({ timeout: REACHES_MS });
      expect(await stillTheSamePage(watching), "drawn by the feed, not by a reload").toBe(true);
    } finally {
      if (!id) {
        const lists = (await (await writing.request.get(scoped("/api/v1/segments", ws))).json()).data as {
          lists: Array<{ id: string; name: string }>;
        };
        id = lists.lists.find((l) => l.name === name)?.id ?? null;
      }
      if (id) await writing.request.delete(scoped(`/api/v1/segments/${id}`, ws), fromTheApp);
    }
    await expect(watching.getByText(name, { exact: true })).toHaveCount(0, { timeout: REACHES_MS });
    expect(await stillTheSamePage(watching), "its removal too").toBe(true);
  });
});
