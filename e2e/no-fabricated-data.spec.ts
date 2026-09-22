import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { SURFACE_STATES } from "../apps/dashboard/src/legacy-bridge/surface-registry";

/**
 * The one bug this project keeps having.
 *
 * Six times now, in six different places: a fetch that failed, or had not
 * landed yet, falling through to the design mockup's seed data — so "we do not
 * know" rendered as confident invented facts, on a real owner's screen.
 *
 *   * a team card listing Sarah Chen and Marcus Webb beside the real owner
 *   * an unconfigured workspace shown as "Serenity Spa", open Mon–Sun 9–6
 *   * a cold load of Settings painting that same invented salon for a frame
 *   * a canceled message rendered exactly like a delivered one
 *   * a failed /team read falling back to four invented colleagues
 *   * the prompt preview on a config the parser had refused
 *
 * Every one was found by opening the page. None was caught by a unit test,
 * because each was a composition of parts that were individually correct.
 *
 * So this asserts the invariant directly: on a signed-in session, the mockup's
 * people, business and phone numbers must not appear anywhere.
 */

/** Names and numbers that exist only in the design seeds. */
const INVENTED = [
  "Serenity Spa",
  "Sarah Chen",
  "Marcus Webb",
  "Lena Park",
  "Jay Rivera",
  "(415) 555-0100",
  "serenityspa.co",
  // the mockup's clients, now that People is real
  "Aisha Khan",
  "David Chen",
  // the mockup's callers, now that Live is real
  "Selena Cho",
  "Maya Rodriguez",
];

/**
 * Every surface classified `real` in surface-registry.ts, fed by live data.
 * Read from the registry rather than typed here: a hand list had fallen ten
 * surfaces behind it, so half of what a signed-in person could open was
 * never walked for invented names.
 */
const REAL_ROUTES = Object.entries(SURFACE_STATES)
  .filter(([, state]) => state === "real")
  .map(([route]) => `#/${route}`);

async function assertNothingInvented(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  for (const seed of INVENTED) {
    expect(text, `${where} is showing invented data: "${seed}"`).not.toContain(seed);
  }
}

test.describe("a signed-in session never sees the mockup", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const route of REAL_ROUTES) {
    test(`no invented data on ${route}`, async ({ page }) => {
      await page.goto(`/${route}`);
      await page.waitForLoadState("networkidle");
      await assertNothingInvented(page, route);
    });
  }

  test("REGRESSION: a COLD load of Settings never paints the mockup business", async ({ page }) => {
    // The snapshot cache is keyed on build sha, so every deploy cold-starts
    // every user — which made this the first Settings visit after each
    // release, not a rare edge case. Sampling during the load, not after it:
    // the bug was one frame long.
    await page.goto("/");
    await page.evaluate(() => sessionStorage.clear());

    const seen: string[] = [];
    const stop = setInterval(async () => {
      try {
        const t = await page.locator("body").innerText();
        for (const seed of INVENTED) if (t.includes(seed)) seen.push(seed);
      } catch {
        /* mid-navigation */
      }
    }, 60);

    await page.goto("/#/admin/workspace");
    await page.waitForLoadState("networkidle");
    clearInterval(stop);

    expect(seen, "the mockup was painted during the load").toEqual([]);
    await assertNothingInvented(page, "settings after cold load");
  });

  test("an unfinished surface says so, rather than showing invented numbers", async ({ page }) => {
    // `demo` routes are gated on purpose. The honest failure is a "coming
    // soon" pane; the dishonest one is a finished-looking fabrication.
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    await assertNothingInvented(page, "#/reports");
  });

  test("REGRESSION: the business settings form is reachable from the sidebar", async ({ page }) => {
    // It was not: /#/admin with no pane rendered the workspace pane while the
    // gate, asked about "admin", answered demo and replaced it with the
    // coming-soon card. The sidebar link is exactly that route, so a finished
    // form was reachable only by hand-typing the sub-route.
    await page.goto("/#/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText("Business");
    await expect(page.locator("body")).not.toContainText("Coming");
  });

  test("a message that never sent does not read as one that did", async ({ page }) => {
    // Two identical bubbles a minute apart, one canceled before sending, both
    // rendered as ordinary replies — on the surface whose whole job is "what
    // is my receptionist saying to people".
    await page.goto("/#/conversations");
    await page.waitForLoadState("networkidle");
    const undelivered = page.locator(".tl-msg.undelivered");
    if ((await undelivered.count()) > 0) {
      await expect(undelivered.first()).toContainText(/Canceled before sending|Didn't send|Sending/);
    }
  });
});
