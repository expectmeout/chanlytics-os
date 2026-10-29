import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { motionSettled } from "../signals";

/**
 * What a cold load draws before the app's code has run is the frame's outline (surfaces/frame/outline.tsx, the cold-load
 * review of 28 Oct 2026): the frame's own chrome, standing where the frame will stand it, so the frame lands on its own
 * places and nothing jumps. Until then the document drew a spinner on the page's ground for the second or more it took
 * the code to come (2.5 to 3 s on a phone).
 *
 * Each case is a load twice in one tab: once with the app's scripts refused, so what shows is the document as the server
 * sent it, and once drawn whole. Every part of the chrome the outline draws (the sidebar's rows, its workspace and
 * account rows, Ask and the bell, the phone's tab bar and Ask's disc) stands within PX of the frame's own, part by part
 * and in order, for each sidebar a device keeps and on a small desk, which stands it as a rail whatever is kept.
 */
const PX = 2;
const PARTS = [
  ".sidebar",
  ".sb-team",
  ".sb-team-mark",
  ".sidebar-label",
  ".nav-item",
  ".nav-item svg",
  ".nav-item > span",
  ".sidebar-foot",
  ".user-chip",
  ".avatar",
  ".tb-ask",
  ".tb-ask-label",
  ".tb-bell",
  ".tab-bar",
  ".tab-bar-tab",
  ".tab-bar-glyph",
  ".phone-ask",
];
const OUTLINE = ".frame-outline";
const FRAME = ".app-root:not(.frame-outline)";
/** The app's code: refused, the document stands as the server sent it. */
const CODE = /\/_next\/static\/.*\.js(\?|$)/;

type Rect = [number, number, number, number];
type Parts = Record<string, Rect[]>;

/** Each part's boxes under `root`, the drawn ones only, in the document's order. */
const partsUnder = (page: Page, root: string): Promise<Parts> =>
  page.evaluate(
    ([root, parts]) => {
      const out: Record<string, [number, number, number, number][]> = {};
      const top = document.querySelector(root);
      for (const sel of parts) {
        out[sel] = [...(top ? top.querySelectorAll(sel) : [])]
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]);
      }
      return out;
    },
    [root, PARTS] as const,
  );

/** The workspace's address, as the home sends this tab to it. */
async function workspaceOf(page: Page): Promise<string> {
  await signIn(page);
  await page.goto("/");
  await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
  const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
  return slug;
}

/** This device's kept preferences, as the app keeps them (contracts DEVICE_PREFS_STORAGE), from the document's first script. */
const keep = (page: Page, prefs: Record<string, string>) =>
  page.addInitScript((p) => localStorage.setItem("chanlytics-os-prefs", p), JSON.stringify(prefs));

/** The outline as the document draws it, then the frame over it, at one address. */
async function outlineAndFrame(page: Page, address: string): Promise<{ outline: Parts; frame: Parts }> {
  await page.route(CODE, (r) => r.abort());
  await page.goto(address, { waitUntil: "load" });
  await expect(page.locator(OUTLINE)).toBeAttached();
  const outline = await partsUnder(page, OUTLINE);
  await page.unroute(CODE);
  await page.goto(address);
  await expect(page.locator(`${FRAME} .topbar`)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(OUTLINE)).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await motionSettled(page);
  return { outline, frame: await partsUnder(page, FRAME) };
}

function expectSame({ outline, frame }: { outline: Parts; frame: Parts }) {
  const drawn = PARTS.filter((p) => frame[p].length > 0);
  expect(drawn.length, "the frame draws the chrome the outline is held to").toBeGreaterThan(4);
  for (const part of PARTS) {
    expect(outline[part].length, `how many ${part} the outline draws, against the frame's`).toBe(frame[part].length);
    frame[part].forEach((want, i) => {
      const got = outline[part][i];
      const off = Math.max(...want.map((v, k) => Math.abs(v - got[k])));
      expect(off, `${part} #${i + 1}: outline ${got.join(",")}, frame ${want.join(",")}`).toBeLessThanOrEqual(PX);
    });
  }
}

test.describe("the outline a cold load draws first", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test.describe("on a desk", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the open sidebar, Ask and the bell stand where the frame stands them", async ({ page }) => {
      const slug = await workspaceOf(page);
      await keep(page, { sidebar: "open" });
      expectSame(await outlineAndFrame(page, `/w/${slug}/today`));
    });

    test("a device that keeps the rail is drawn its rail", async ({ page }) => {
      const slug = await workspaceOf(page);
      await keep(page, { sidebar: "rail" });
      expectSame(await outlineAndFrame(page, `/w/${slug}/settings/billing`));
    });

    test("in the light theme too", async ({ page }) => {
      const slug = await workspaceOf(page);
      await keep(page, { sidebar: "open", theme: "light" });
      expectSame(await outlineAndFrame(page, `/w/${slug}/people`));
    });

    test("the first run, drawn full screen, is drawn its ground and none of the frame", async ({ page }) => {
      const slug = await workspaceOf(page);
      await page.route(CODE, (r) => r.abort());
      await page.goto(`/w/${slug}/start`, { waitUntil: "load" });
      await expect(page.locator(`${OUTLINE} .pg-light`)).toBeAttached();
      for (const part of [".sidebar", ".topbar", ".tab-bar", ".phone-ask"])
        await expect(page.locator(`${OUTLINE} ${part}:visible`), `${part} on the first run's outline`).toHaveCount(0);
    });

    test("nothing in it is reached, and a screen reader hears the workspace loading", async ({ page }) => {
      const slug = await workspaceOf(page);
      await page.route(CODE, (r) => r.abort());
      await page.goto(`/w/${slug}/today`, { waitUntil: "load" });
      await expect(page.locator(OUTLINE)).toHaveAttribute("inert", "");
      await expect(page.getByRole("status")).toHaveText("Loading your workspace…");
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => !!document.activeElement?.closest(".frame-outline"));
      expect(focused, "Tab reaches nothing in the outline").toBe(false);
    });
  });

  test.describe("on a small desk", () => {
    test.use({ viewport: { width: 1100, height: 800 } });

    test("the rail, whatever the device keeps, as the frame stands it", async ({ page }) => {
      const slug = await workspaceOf(page);
      await keep(page, { sidebar: "open" });
      expectSame(await outlineAndFrame(page, `/w/${slug}/inbox`));
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("the tab bar, Ask's disc and the bell stand where the frame stands them", async ({ page }) => {
      const slug = await workspaceOf(page);
      expectSame(await outlineAndFrame(page, `/w/${slug}/today`));
    });
  });
});
