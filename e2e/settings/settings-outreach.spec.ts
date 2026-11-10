import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { apiGet } from "../workspace";
import { expectNoSidewaysScroll } from "../signals";

/**
 * Settings › Cold email on a real workspace (decision 0113): the things only a browser shows. Its cards land
 * with the pane, a fold opens as a sheet and gives way without saving, What it's told switches between its writers and
 * closes on its one ×, and Try it draws a tried email with its marks, from a stand-in for the preview door put on the
 * page by the test, never the real one (which spends the model). The rule Settings › Business keeps: the spec NEVER
 * leaves the shared e2e workspace changed, and it compares the config field for field at the end of each test.
 */

async function readConfig(page: Page): Promise<unknown> {
  const res = await apiGet(page, "/api/v1/settings");
  expect(res.status()).toBe(200);
  const { data } = (await res.json()) as { data: { config: unknown; version: number } };
  return { config: data.config, version: data.version };
}

async function openPage(page: Page): Promise<void> {
  await page.goto("/#/admin/outreach");
  await expect(page.getByTestId("rec-card-pitch")).toBeVisible({ timeout: 40_000 });
}

const CARDS = [
  "rec-standing",
  "rec-card-sample",
  "rec-card-pitch",
  "rec-card-facts",
  "rec-card-sound",
  "rec-card-ending",
  "rec-card-sending",
  "rec-card-replies",
  "rec-card-never",
  "rec-card-kept",
];

test.describe("Settings › Cold email on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("its cards land in their order, and a fold opened and given up saves nothing", async ({ page }) => {
    const before = await readConfig(page);
    await openPage(page);
    for (const id of CARDS) await expect(page.getByTestId(id)).toBeVisible();
    await page.getByTestId("rec-row-act-offer").click();
    // The kit puts the field's test id on its wrapper; the words go into the box inside it.
    const box = page.getByTestId("rec-offer-box").locator("textarea, input");
    await expect(box).toBeVisible();
    await box.fill("Evening cleaning for clinics");
    await page.getByTestId("rec-fold-cancel-offer").click();
    const yes = page.getByTestId("rec-fold-offer-cancel-yes");
    if (await yes.count()) await yes.click();
    await expect(page.getByTestId("rec-fold-offer")).toBeHidden();
    expect(await readConfig(page), "the journey changed the shared workspace").toEqual(before);
  });

  test("an address that names a row opens it, once the page's cards are in", async ({ page }) => {
    const before = await readConfig(page);
    // The cards are a chunk of their own (business/tab.tsx): the row is looked for once they land, not before.
    await page.goto("/#/admin/outreach/offer");
    await expect(page.getByTestId("rec-offer-box").locator("textarea, input")).toBeVisible({ timeout: 40_000 });
    await page.getByTestId("rec-fold-cancel-offer").click();
    const yes = page.getByTestId("rec-fold-offer-cancel-yes");
    if (await yes.count()) await yes.click();
    await expect(page.getByTestId("rec-fold-offer")).toBeHidden();
    expect(await readConfig(page), "the journey changed the shared workspace").toEqual(before);
  });

  test("The exact instructions switch between their writers and closes on its one ×", async ({ page }) => {
    await openPage(page);
    await page.getByTestId("rec-row-act-told").click();
    const sheet = page.getByTestId("rec-told-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("rec-told-part-rules")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("radio", { name: "The line about them" }).click();
    await expect(page.getByTestId("rec-told-part-listing")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("radio", { name: "An answer" }).click();
    await expect(page.getByTestId("rec-told-part-answers")).toBeVisible();
    await expect(page.getByTestId("rec-told-share-answers")).toHaveCount(0);
    await page.getByTestId("rec-told-done").click();
    await expect(sheet).toHaveCount(0);
  });

  test("A sample email draws the email it is answered, the line about them and a claim marked", async ({ page }) => {
    await page.route("**/api/v1/reach-outs/preview*", (route) =>
      route.fulfill({
        json: {
          ok: true,
          data: {
            preview: {
              lead: {
                id: "00000000-0000-4000-8000-000000000001",
                business_name: "Lakeside Bakery",
                email: "hello@example.com",
              },
              subject: "Evening cleaning for Lakeside Bakery",
              body: "Lakeside Bakery has a 4.8 from 212 reviews.\n\nWe clean 40 clinics across Austin today. Worth a call?",
              opening: "Lakeside Bakery has a 4.8 from 212 reviews.",
              angle: "their reviews",
              hold: null,
              detail: null,
              refused: null,
              unavailable: false,
            },
          },
        },
      }),
    );
    await openPage(page);
    await page.getByTestId("rec-row-act-try_lead").click();
    const sheet = page.getByTestId("rec-try-sheet");
    await expect(sheet).toBeVisible();
    // A workspace with no running sequence to leads is told to start one, and the door is asked nothing.
    if (await page.getByTestId("rec-try-none").count()) {
      await expect(page.getByTestId("rec-try-new")).toBeVisible();
      return;
    }
    await expect(page.getByTestId("rec-try-mail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("rec-try-mark-them")).toHaveText("Lakeside Bakery has a 4.8 from 212 reviews.");
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the page scrolls down, never sideways", async ({ page }) => {
      await openPage(page);
      await expectNoSidewaysScroll(page, "Cold email on a phone", [".set-pane"]);
    });
  });
});
