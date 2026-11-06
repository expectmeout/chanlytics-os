import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { motionSettled } from "../signals";
import { notATimeSelector, SAYS_A_TIME } from "./says-a-time";

/**
 * The rows a phone last showed are drawn before the app's code has run (contracts shell/first-rows.ts, the load speed review of
 * 6 Nov 2026), and the page takes their place standing exactly where they stood. Each case is a phone's second visit: once with
 * the page drawn whole and put away, which keeps its copy, once with the app's code refused, so the document's copy is all there
 * is, and once again drawn whole. The rows and the chrome stand within PX of the frame's own, a press made on the copy opens what
 * it was made on, nothing moves as the page takes over, and a sign-out leaves nothing of them on the device.
 */
const PX = 2;
const PICTURE = "#first-rows";
const FRAME = ".app-root:not(.frame-outline)";
/** The app's code: refused, the document stands as the server sent it. */
const CODE = /\/_next\/static\/.*\.js(\?|$)/;
const SLOT = "chanlytics.rows.v1:";
/** What each page's first screen stands by. */
const PARTS: Record<string, string[]> = {
  inbox: [
    ".frame-top",
    ".pg-head-slot",
    ".stabs",
    ".ix-list",
    ".ix-thread",
    ".ix-thread-who",
    ".tab-bar",
    ".tab-bar-tab",
  ],
  people: [".frame-top", ".pg-head-slot", ".stabs", ".pl-card-row", ".list-row-name", ".tab-bar", ".tab-bar-tab"],
  // The setup card's own parts where the workspace shows it: dashboard-a-v2.css draws them by their test ids.
  today: [".frame-top", ".pg-head-slot", ".tq", ".setup-card-title", ".setup-card-left", ".tab-bar", ".tab-bar-tab"],
};
/** What says a page's copy is up: a block of its rows. */
const ROWS: Record<string, string> = { inbox: ".ix-thread", people: ".pl-card-row", today: ".tq" };

type Rect = [number, number, number, number];

const boxesUnder = (page: Page, root: string, parts: string[]): Promise<Record<string, Rect[]>> =>
  page.evaluate(
    ([root, parts]) => {
      const out: Record<string, [number, number, number, number][]> = {};
      const top = document.querySelector(root as string);
      for (const sel of parts as string[]) {
        out[sel] = [...(top ? top.querySelectorAll(sel) : [])]
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0 && r.top < innerHeight)
          .map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]);
      }
      return out;
    },
    [root, parts] as const,
  );

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.describe("the rows a phone last showed", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  let slug = "";

  test.beforeEach(async ({ page }) => {
    // A browser a suite drives keeps no copy, unless its own spec asks (contracts FIRST_ROWS_TEST).
    await page.addInitScript(() => sessionStorage.setItem("chanlytics.rows.test", "1"));
    await signIn(page);
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
  });

  /** The page drawn whole at its address, then put away, which keeps its copy. */
  async function visited(page: Page, word: string): Promise<void> {
    await page.goto(`/w/${slug}/${word}`);
    await expect(page.locator(`${FRAME} .topbar`)).toBeAttached({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await motionSettled(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await expect
      .poll(() => page.evaluate((s) => Object.keys(localStorage).filter((k) => k.startsWith(s)).length, SLOT))
      .toBeGreaterThan(0);
  }

  for (const word of ["inbox", "people", "today"]) {
    test(`${word}: the document draws the copy where the frame draws the page`, async ({ page }) => {
      await visited(page, word);
      await page.route(CODE, (r) => r.abort());
      await page.goto(`/w/${slug}/${word}`, { waitUntil: "load" });
      await expect(page.locator(PICTURE)).toBeAttached();
      await expect(page.locator(`${PICTURE} ${ROWS[word]}`).first()).toBeVisible();
      const picture = await boxesUnder(page, PICTURE, PARTS[word] ?? []);
      await page.unroute(CODE);

      await page.goto(`/w/${slug}/${word}`);
      await expect(page.locator(PICTURE)).toHaveCount(0, { timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await motionSettled(page);
      const frame = await boxesUnder(page, FRAME, PARTS[word] ?? []);

      for (const sel of PARTS[word] ?? []) {
        const a = picture[sel] ?? [];
        const b = frame[sel] ?? [];
        expect(a.length, `${sel}: as many`).toBe(b.length);
        a.forEach((box, i) =>
          box.forEach((n, k) =>
            expect(Math.abs(n - (b[i]?.[k] ?? 0)), `${sel}[${i}] ${box} vs ${b[i]}`).toBeLessThanOrEqual(PX),
          ),
        );
      }
    });
  }

  // A copy some minutes old draws no time, and what it hides is what says it says one (kit/says-when.ts): the workspace's real
  // rows, walked as the copy keeps them. A person's own words, a name and a press are no time the app claims (NOT_A_TIME).
  for (const word of ["inbox", "people", "today"]) {
    test(`${word}: every time on the copy says so`, async ({ page }) => {
      await visited(page, word);
      const offenders = await page.evaluate(
        ([slot, word, shape, flags, skip]) => {
          const key = Object.keys(localStorage).find((k) => k.startsWith(slot) && k.endsWith(`:${word}`));
          const html = (JSON.parse(localStorage.getItem(key ?? "") ?? "{}") as { html?: string }).html ?? "";
          const doc = new DOMParser().parseFromString(html, "text/html");
          const said = new RegExp(shape, flags);
          const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
          const out: string[] = [];
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const el = n.parentElement;
            if (el && said.test(n.textContent ?? "") && !el.closest("[data-when]") && !el.closest(skip))
              out.push(`${el.className}: ${n.textContent}`);
          }
          return out;
        },
        [SLOT, word, SAYS_A_TIME.source, SAYS_A_TIME.flags, notATimeSelector()] as const,
      );
      expect(offenders).toEqual([]);
    });
  }

  test("a copy some minutes old draws no time, and the rest of it stands", async ({ page }) => {
    await visited(page, "people");
    // Set back as the next document starts: leaving this one keeps a fresh copy over anything done to the slot now.
    await page.addInitScript((s) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith(s) && k.endsWith(":people"));
      if (!key) return;
      const kept = JSON.parse(localStorage.getItem(key) ?? "{}") as { at: number };
      localStorage.setItem(key, JSON.stringify({ ...kept, at: Date.now() - 6 * 60_000 }));
    }, SLOT);
    await page.route(CODE, (r) => r.abort());
    await page.goto(`/w/${slug}/people`, { waitUntil: "load" });
    await expect(page.locator(PICTURE)).toHaveAttribute("data-aged", "");
    const times = page.locator(`${PICTURE} [data-when]`);
    expect(await times.count()).toBeGreaterThan(0);
    for (const t of await times.all()) await expect(t).toHaveCSS("visibility", "hidden");
    await expect(page.locator(`${PICTURE} .pl-card-row .list-row-name`).first()).toBeVisible();
  });

  test("nothing moves as the page takes the copy's place", async ({ page }) => {
    await visited(page, "inbox");
    await page.addInitScript(() => {
      const w = window as unknown as { __shift: number };
      w.__shift = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (!e.hadRecentInput) w.__shift += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`/w/${slug}/inbox`);
    await expect(page.locator(PICTURE)).toHaveCount(0, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBeLessThan(0.01);
    // And the document is the app's own: no second frame, nothing left of the copy.
    await expect(page.locator(FRAME)).toHaveCount(1);
    await expect(page.locator("html")).not.toHaveAttribute("data-first-rows");
  });

  test("a press on a row of the copy opens that row once the page is there", async ({ page }) => {
    await visited(page, "inbox");
    let letCodeIn: () => void = () => {};
    const codeIn = new Promise<void>((go) => (letCodeIn = go));
    await page.route(CODE, async (r) => {
      await codeIn;
      await r.continue();
    });
    await page.goto(`/w/${slug}/inbox`, { waitUntil: "commit" });
    const row = page.locator(`${PICTURE} [data-thread-id]`).first();
    await expect(row).toBeAttached();
    const id = await row.getAttribute("data-thread-id");
    const at = await row.boundingBox();
    if (!at) throw new Error("the copy's row stands nowhere");
    await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
    await expect(page.locator(PICTURE)).toHaveAttribute("data-press", `thread:${id}`);
    letCodeIn();
    await page.waitForURL(new RegExp(`/inbox/${id}`), { timeout: 30_000 });
  });

  test("a session that ended leaves no copy on the device", async ({ page }) => {
    await visited(page, "inbox");
    // What every way out calls: the surface cache's seal, reached here as the app reaches it when a read answers 401.
    await page.route("**/api/v1/**", (r) =>
      r.fulfill({ status: 401, json: { ok: false, error: { code: "unauthorized", message: "x" } } }),
    );
    await page.goto(`/w/${slug}/today`);
    // The ended session sends the tab on to sign in: a read caught by that move says nothing, and the next one asks again.
    await expect
      .poll(
        () =>
          page.evaluate((s) => Object.keys(localStorage).filter((k) => k.startsWith(s)).length, SLOT).catch(() => null),
        { timeout: 30_000 },
      )
      .toBe(0);
  });
});
