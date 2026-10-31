import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * The kit's table on a real workspace (decision 0083): what a member does to it with a pointer, the keys and a thumb, on
 * People, Leads and the Pipeline's list. The widths' model (Person, the fill column, takes the room the others leave
 * until a member sizes it), a column moved by its keys, a range picked with Shift, a width that outlives a reload, the
 * Leads Filter under a selection that a narrowing never clears (the spec's §6.8), a phone's card picked by its face, and
 * no accessibility violation in any of the three tables.
 *
 * Read-only against the workspace: every save of the view is answered here and noted, never sent, and no act on a
 * selection is pressed.
 */

type SavedView = { view?: { widths?: Record<string, number>; order?: string[] } };

/** The view's saves, answered here and kept for the test to read: none reaches the member's real view. */
async function holdSaves(page: Page, scope: "people" | "leads" = "people"): Promise<SavedView[]> {
  const saved: SavedView[] = [];
  await page.route(new RegExp(`/api/v1/views/${scope}(?:[?#]|$)`), async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    saved.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { views: {} } }),
    });
  });
  return saved;
}

/** People on a desk, with somebody to show, or the test is skipped. */
async function openPeople(page: Page, hash = "/#/clients") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(hash);
  await page.waitForLoadState("networkidle");
  test.skip((await page.locator(".cl-table tbody tr[id]").count()) === 0, "this workspace has nobody to show");
}

const widthOf = (page: Page, key: string) =>
  page.locator(`thead th[data-key='${key}']`).evaluate((th) => Math.round(th.getBoundingClientRect().width));
/** The table against its box: how wide each is, and how far the box can scroll sideways. */
const room = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector<HTMLElement>("[data-testid='people-table-scroll']")!;
    const table = box.querySelector("table")!;
    return {
      box: box.clientWidth,
      table: Math.round(table.getBoundingClientRect().width),
      over: box.scrollWidth - box.clientWidth,
    };
  });
const headingKeys = (page: Page) =>
  page.locator("table thead th[data-key]").evaluateAll((ths) => ths.map((th) => th.getAttribute("data-key")));

/** The Columns menu's way back from every width and place. */
async function resetLayout(page: Page) {
  await page.getByTestId("people-columns").click();
  await page.getByRole("menuitem", { name: "Reset widths and order" }).click();
  await page.keyboard.press("Escape");
}

test.describe("The kit's table on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Person dragged sizes the table to its columns, never past nearly half its box; the way back fills the box again", async ({
    page,
  }) => {
    const saved = await holdSaves(page);
    await openPeople(page);
    const table = page.locator(".cl-table");
    await expect(table, "until a member sizes a column, Person fills the room").toHaveAttribute("data-sizing", "fill");
    const person = await widthOf(page, "name");
    const drag = async (by: number) => {
      const at = (await page.locator("thead th[data-key='name'] [role='slider']").boundingBox())!;
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      await page.mouse.move(at.x + at.width / 2 + by, at.y + at.height / 2, { steps: 8 });
      await page.mouse.up();
    };
    // Narrower: a width of the fill column's own is a member's sizing, and the table is as wide as its columns.
    await drag(-80);
    await expect(table, "a width of Person's own is a member's sizing").toHaveAttribute("data-sizing", "sized");
    expect(Math.abs((await widthOf(page, "name")) - (person - 80)), "Person follows the pointer").toBeLessThanOrEqual(
      4,
    );
    const narrower = await room(page);
    expect(narrower.table, "the table is as wide as its columns, and leaves the box room after them").toBeLessThan(
      narrower.box,
    );
    expect(narrower.over, "nothing to scroll to").toBeLessThanOrEqual(1);
    await expect.poll(() => saved.some((s) => typeof s.view?.widths?.name === "number")).toBe(true);
    // Far wider: Person, pinned at the left while the table scrolls, stops at 45% of the box (kit/table/widths.ts
    // PIN_SHARE), so it never covers the columns that scroll under it, and the table past its box scrolls to them.
    await drag(400);
    const wide = await room(page);
    expect(
      Math.abs((await widthOf(page, "name")) - Math.round(wide.box * 0.45)),
      "Person stops at 45%",
    ).toBeLessThanOrEqual(2);
    expect(wide.over, "the table past its box scrolls sideways").toBeGreaterThan(0);
    await resetLayout(page);
    await expect(table, "the way back").toHaveAttribute("data-sizing", "fill");
    const back = await room(page);
    expect(Math.abs(back.table - back.box), "the table fills its box again").toBeLessThanOrEqual(1);
    await expect.poll(() => saved.length > 0 && !saved[saved.length - 1]!.view?.widths?.name).toBe(true);
  });

  test("a column moves a place by its keys, the view keeps the order, and the way back puts it home", async ({
    page,
  }) => {
    const saved = await holdSaves(page);
    await openPeople(page);
    const keys = await headingKeys(page);
    const from = keys.indexOf("state");
    test.skip(from < 0 || from + 1 >= keys.length - 1, "State is not followed by a column it can pass");
    await page.locator("thead th[data-key='state'] .dtable-sort").focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(async () => (await headingKeys(page)).indexOf("state")).toBe(from + 1);
    await expect(
      page.locator("thead th[data-key='state'] .dtable-sort"),
      "the keyboard stays on the moved heading",
    ).toBeFocused();
    await expect.poll(() => saved.some((s) => (s.view?.order ?? []).includes("state"))).toBe(true);
    await resetLayout(page);
    await expect.poll(async () => (await headingKeys(page)).indexOf("state")).toBe(from);
  });

  test("Shift picks the range from the last row picked, and Esc lets go of all of it", async ({ page }) => {
    await holdSaves(page);
    await openPeople(page);
    const rows = page.locator(".cl-table tbody tr[id]");
    const shown = await rows.count();
    test.skip(shown < 3, "this workspace has fewer than three people to show");
    // From the first row to one short of the last, so a row after the range shows where it ends.
    const end = Math.min(3, shown - 2);
    await rows.nth(0).getByTestId("row-select").click();
    await rows
      .nth(end)
      .getByTestId("row-select")
      .click({ modifiers: ["Shift"] });
    for (let i = 0; i <= end; i++)
      await expect(rows.nth(i), `row ${i + 1} is picked`).toHaveAttribute("aria-selected", "true");
    await expect(rows.nth(end + 1), "and the range ends where it was pressed").not.toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("bulk-bar")).toContainText(String(end + 1));
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    await expect(page.locator(".cl-table tbody tr[aria-selected='true']")).toHaveCount(0);
  });

  test("a width set outlives a reload: the view this device keeps draws it again", async ({ page }) => {
    await holdSaves(page);
    await openPeople(page);
    const state = await widthOf(page, "state");
    await page.locator("thead th[data-key='state'] [role='slider']").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => widthOf(page, "state")).toBeGreaterThanOrEqual(state + 30);
    // The view this device keeps holds the width before the page is left (People's, in this browser's storage).
    const kept = () =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => /people-view/.test(k));
        const view = key ? (JSON.parse(localStorage.getItem(key) ?? "{}") as { widths?: Record<string, number> }) : {};
        return view.widths?.state ?? 0;
      });
    await expect.poll(kept, { message: "the device keeps the width" }).toBeGreaterThanOrEqual(state + 30);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect
      .poll(() => widthOf(page, "state"), { message: "State is as wide as it was left" })
      .toBeGreaterThanOrEqual(state + 30);
    await resetLayout(page);
  });

  test("the Leads Filter narrows the rows, select-all picks those alone, and taking the Filter off keeps them picked", async ({
    page,
  }) => {
    await holdSaves(page, "leads");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    // The nightly's seeded search (tooling/scripts/ops/e2e-workspace.mjs LEADS); another workspace's leads, as they come.
    const search = page.locator(".cl-rail-row", { hasText: "Personal trainers · Austin" }).locator(".ld-search-pick");
    if ((await search.count()) > 0) await search.first().click();
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr[id^='lead-']");
    const picked = page.locator(".cl-table tbody tr[aria-selected='true']");
    const flip = async (word: string) => {
      await page.getByTestId("leads-filter").click();
      await page.getByRole("menuitemcheckbox", { name: word }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");
    };
    // The first view and switch that keep some of the leads and not all of them: the view at rest, then the leads that
    // need review (the seeded search's qualified leads all have a checked email, and those under review none).
    const views: Array<string | null> = [null, "lead-class-review"];
    let found: { word: string; all: number; kept: number } | null = null;
    for (const view of views) {
      if (view && (await page.getByTestId(view).count()) === 0) continue;
      if (view) {
        // The chip says how many it holds; its rows are drawn once the view has them.
        const chip = page.getByTestId(view);
        const holds = Number((await chip.locator(".n").textContent()) ?? "0");
        await chip.click();
        await expect(chip).toHaveAttribute("aria-selected", "true");
        await expect(rows).toHaveCount(holds);
      }
      const all = await rows.count();
      for (const word of ["Checked email", "Checked phone"]) {
        if (all === 0) break;
        await flip(word);
        const kept = await rows.count();
        if (kept > 0 && kept < all) {
          found = { word, all, kept };
          break;
        }
        await flip(word);
      }
      if (found) break;
    }
    test.skip(!found, "no view here has leads the Filter keeps beside leads it leaves out");
    const { word, all, kept } = found!;
    await page.getByTestId("select-all").check();
    await expect(picked, "every row the Filter shows").toHaveCount(kept);
    // The bar says the picks and offers its act for them alone; nothing is pressed.
    await expect(page.getByText(`${kept} selected`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Add ${kept} to a sequence`) }).first()).toBeVisible();
    await flip(word);
    await expect(rows, "the Filter off shows every lead again").toHaveCount(all);
    await expect(picked, "and the leads picked stay picked: a narrowing never clears a selection").toHaveCount(kept);
  });

  test("on a phone a card's face is its box: a tap there picks the row and starts a selection", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const cards = page.locator(".cl-table tbody tr[data-card][id]");
    test.skip((await cards.count()) === 0, "this workspace has nobody to show");
    const first = cards.first();
    await first.getByTestId("row-select").click({ force: true });
    await expect(first, "the card is picked").toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveClass(/\bselected\b/);
    await expect(page.locator(".cl-table tbody tr[aria-selected='true']"), "and only it").toHaveCount(1);
  });

  for (const [scope, hash] of [
    ["People", "/#/clients"],
    ["Leads", "/#/clients/leads"],
    ["the Pipeline", "/#/clients/pipeline"],
  ] as const) {
    test(`${scope}'s table has no accessibility violation (axe, WCAG 2 A and AA)`, async ({ page }) => {
      await holdSaves(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(hash);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("people-table-scroll")).toBeVisible();
      const found = await new AxeBuilder({ page })
        .include("[data-testid='people-table-scroll']")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(
        found.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}: ${v.nodes[0]?.target.join(" ")})`),
        `${scope}'s table`,
      ).toEqual([]);
    });
  }
});
