import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { atRoute } from "./address";
import { activeWorkspace, apiGet, scoped } from "./workspace";

/**
 * Setup on a real workspace, as the first run draws it (#/start): Setup's own rows, one step to a screen, every row a
 * fact the workspace holds -- a state in words, a sentence, at most one verb -- and what is left after it as one card
 * on Today. The Setup tab left Settings; its old address lands on the first run.
 */

/**
 * A real turn spends model tokens on the workspace the run signs in to (e2e/ask.spec.ts, the same switch). Without it the
 * question the first run asks is stopped in the browser before it leaves, and what it carries is read instead.
 */
const PAID = process.env.E2E_PAID_MODEL === "1";
const SETUP_LEFT = "What is left to set up?";

/** Every step the rail lets the owner open: the ones done, and the one the workspace is on. */
async function stepsReached(page: Page): Promise<string[]> {
  const ids: string[] = [];
  for (const b of await page.locator('[data-testid^="fr-rail-"]').all()) {
    const id = await b.getAttribute("data-testid");
    if (id) ids.push(id.slice("fr-rail-".length));
  }
  return ids;
}

test.describe("Setup on a real workspace, a step at a time", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("every step's rows read a state in words, a sentence and at most one verb, and name no price", async ({
    page,
  }) => {
    await page.goto("/#/start");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("first-run")).toBeVisible();
    const reached = await stepsReached(page);
    expect(reached.length, "the step the workspace is on is always open").toBeGreaterThan(0);
    for (const step of reached) {
      await page.getByTestId(`fr-rail-${step}`).click();
      const rows = page.getByTestId("fr-rows").locator(".cl-attn-row");
      for (const row of await rows.all()) {
        // The row reads across: its glyph, then its words, then its verbs. Today's queue hides its own disc, and while
        // that rule named only .tq -- the card these rows sit in too -- it hid Setup's glyphs as well.
        await expect(row.locator(".cl-attn-avatar")).toBeVisible();
        expect(
          await row.locator(".cl-attn-who").evaluate((el) => el.scrollWidth <= el.clientWidth),
          "the title is whole",
        ).toBe(true);
        await expect(row.locator(".cl-attn-status .lead")).toHaveText(
          /^(Not started|Waiting on you|Waiting on us|Waiting on Meta|Ready)$/,
        );
        expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
        expect(await row.getByTestId("setup-verb").count()).toBeLessThanOrEqual(1);
        // The number is part of the plan (decision 1): nothing here names a price.
        expect(await row.innerText()).not.toMatch(/\$\d/);
      }
    }
  });

  test("Setup is not a Settings tab any more, and its old address opens the first run", async ({ page }) => {
    await page.goto("/#/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".set-nav-row").first()).toHaveText(/Profile/);
    for (const label of await page.locator(".set-nav-row").allInnerTexts()) expect(label).not.toMatch(/^Setup\b/);
    await page.goto("/#/admin/setup");
    await expect(page).toHaveURL(atRoute(/^start$/));
    await expect(page.getByTestId("first-run")).toBeVisible();
  });

  test("Later is this person's: a row put off stays put off after a reload, and comes back when taken back", async ({
    page,
  }) => {
    await page.goto("/#/start");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("first-run")).toBeVisible();
    let step: string | null = null;
    for (const s of await stepsReached(page)) {
      await page.getByTestId(`fr-rail-${s}`).click();
      if ((await page.locator('[data-testid^="setup-later-"]').count()) > 0) {
        step = s;
        break;
      }
    }
    test.skip(step === null, "every optional row this workspace has reached is ready — nothing to put off");
    const btn = page.locator('[data-testid^="setup-later-"]').first();
    const id = await btn.getAttribute("data-testid");
    await expect(btn).toHaveText("Later");
    await btn.click();
    await expect(page.getByTestId(id!)).toHaveText("Undo later");
    // Kept in the member's saved view, not this tab: a reload still has it.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByTestId(`fr-rail-${step}`).click();
    await expect(page.getByTestId(id!)).toHaveText("Undo later");
    await page.getByTestId(id!).click();
    await expect(page.getByTestId(id!)).toHaveText("Later");
  });

  test("Today carries one card of what is left: the first run while nothing answers, Setup's own rows after", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-queue")).toBeVisible();
    const card = page.getByTestId("today-setup");
    if ((await card.count()) === 0) return; // nothing left to set up
    await expect(card.getByTestId("today-setup-left")).toHaveText(/^\d+ (steps? )?left$/);
    const start = card.getByTestId("today-setup-go");
    if ((await start.count()) > 0) {
      // The button says it twice, at length and in a phone's two words (#968); either way it continues.
      await expect(start).toContainText("Continue setting up");
      await start.click();
      await expect(page).toHaveURL(atRoute(/^start/));
      await expect(page.getByTestId("first-run")).toBeVisible();
      return;
    }
    const rows = card.locator('[data-testid^="setup-row-"]');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().locator('[data-testid^="setup-later-"]')).toHaveText("Skip");
  });

  test("the first run asks: ⌘K opens Ask over the step, on the first run's own questions, no key drawn, and what is left to set up goes with the page it is asked on", async ({
    page,
  }) => {
    test.setTimeout(PAID ? 150_000 : 60_000);
    // Without the switch the turn never leaves the browser: its body is kept and the request refused, so no model runs.
    const asked: Array<{ text: string; surface: string; context: { surface: string; route: string } | null }> = [];
    if (!PAID)
      await page.route(/\/api\/v1\/ask(\?|$)/, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        asked.push(route.request().postDataJSON());
        await route.abort();
      });
    await page.goto("/#/start");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("first-run")).toBeVisible();
    await page.keyboard.press("Control+k");
    const line = page.getByTestId("ask-real");
    await expect(line).toBeVisible();
    await expect(page, "the first run stays where it is under the Line").toHaveURL(atRoute(/^start/));
    await expect(page.getByTestId("first-run")).toBeAttached();
    expect(await line.innerText(), "no key is drawn").not.toMatch(/[↵⌘]|\besc\b/i);
    await expect(line.locator(".ask-rows-label", { hasText: "Ask about setting up" })).toBeVisible();
    await page.screenshot({ path: "test-results/ask-first-run.png" });
    // The turn's own answer, whose first line names the conversation it made (the paid run deletes it after).
    const turn = PAID
      ? page.waitForResponse((r) => /\/api\/v1\/ask(\?|$)/.test(r.url()) && r.request().method() === "POST", {
          timeout: 120_000,
        })
      : null;
    await line.getByTestId("ask-input").fill(SETUP_LEFT);
    await line.getByTestId("ask-input").press("Enter");
    if (!turn) {
      await expect.poll(() => asked.length, { message: "the question is asked, once" }).toBe(1);
      expect(asked[0].text).toBe(SETUP_LEFT);
      expect(asked[0].surface, "on the first run's own surface").toBe("start");
      expect(asked[0].context?.surface, "with the page it is asked on").toBe("start");
      expect(asked[0].context?.route).toMatch(/^start/);
      return;
    }
    const first = JSON.parse((await (await turn).text()).split("\n")[0]) as { t: string; id: string };
    expect(first.t, "the stream opens with its conversation").toBe("thread");
    try {
      const say = line.getByTestId("ask-say");
      await expect(say).toBeVisible({ timeout: 120_000 });
      await expect(page.locator(".ask-cursor")).toHaveCount(0, { timeout: 120_000 });
      expect((await say.innerText()).trim().length).toBeGreaterThan(0);
      const { data } = await (await apiGet(page, "/api/v1/ask/threads")).json();
      expect(
        (data.threads as Array<{ id: string }>).some((t) => t.id === first.id),
        "the question is a conversation of the person's own",
      ).toBe(true);
    } finally {
      // The conversation is the run's own, deleted as ask.spec.ts leaves none behind, whatever the answer did.
      const ws = await activeWorkspace(page);
      const origin = { headers: { origin: new URL(page.url()).origin } };
      await page.request.delete(scoped(`/api/v1/ask/threads/${first.id}`, ws), origin);
    }
  });

  test("a workspace whose receptionist answers is not sent to the first run on arrival", async ({ page }) => {
    await page.goto("/#/start");
    await page.waitForLoadState("networkidle");
    const status = await page.getByTestId("fr-card-status").innerText();
    test.skip(/Not answering yet/.test(status), "this workspace answers nowhere yet — the landing rule applies");
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-queue")).toBeVisible();
    await expect(page).toHaveURL(atRoute(/^today/));
  });
});
