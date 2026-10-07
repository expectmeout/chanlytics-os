import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { apiGet } from "../workspace";

/**
 * The bell on a real workspace: it opens, it shows the workspace's own rows
 * or "All caught up", it offers device alerts, and nothing seeded is in it.
 */
const INVENTED = ["Aisha", "Deal won", "Milestone", "Gmail", "refund"];

test.describe("The bell on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("opens on the real feed with the device-alert switch, and nothing invented", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const pop = page.getByRole("dialog", { name: "Notifications" });
    await expect(pop).toBeVisible();
    const text = await pop.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    const items = pop.locator(".tbn-item:not(.tbn-item-group)");
    if ((await pop.locator(".tbn-item").count()) === 0) {
      await expect(pop.getByText("All caught up")).toBeVisible();
    } else {
      // Every note has a title and IS its press, named by where it leads: the
      // four derived kinds, or a row the workspace kept — an alert the edge
      // raised. A search that stopped to ask keeps its kind's own verb, Answer
      // it (contracts SERVER_LOOK), and the seed holds one (e2e-workspace.mjs,
      // WAITING_SEARCH). No note carries a row of buttons of its own (25 Sep).
      for (const row of await items.all()) {
        await expect(row.locator(".tbn-item-title")).not.toBeEmpty();
        await expect(row.getByRole("button", { name: /^(Open|Review|See|Team|Accept|Answer it|Finish)/ })).toHaveCount(
          1,
        );
      }
      await expect(pop.locator(".tbn-actions")).toHaveCount(0);
      // Notes of one kind are said once, and open under their line.
      const group = pop.getByTestId("bell-group").first();
      if ((await group.count()) > 0) {
        const head = group.locator(".tbn-item-group .tbn-open");
        await expect(head).toHaveAttribute("aria-expanded", "false");
        await head.click();
        await expect(head).toHaveAttribute("aria-expanded", "true");
        expect(await group.locator(".tbn-item.in-group").count()).toBeGreaterThan(1);
      }
    }
    // The kept rows come from the route, with this person's marks on each.
    const res = await apiGet(page, "/api/v1/notifications");
    expect(res.status()).toBe(200);
    const data = (await res.json()).data as {
      notifications: Array<{ id: string; kind: string; title: string; read: boolean; dismissed: boolean }>;
      seen_at: string | null;
    };
    expect(Array.isArray(data.notifications)).toBe(true);
    for (const n of data.notifications) expect(typeof n.title).toBe("string");
    await expect(page.getByTestId("notif-alerts")).toBeVisible();
    await page.screenshot({ path: "test-results/bell.png" });
  });
});
