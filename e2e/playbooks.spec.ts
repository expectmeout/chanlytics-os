import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Campaigns › Playbooks on a real workspace.
 *
 * The route renders the real page, not the Coming Soon card or the mockup's
 * six invented campaigns: the cards are the workspace's playbooks with what
 * their runs earned, the composer offers the six moments with who each
 * reaches today, and the messages are the approved ones the workspace holds
 * that fit the moment (or the honest line). Nothing is made here — the
 * workspace keeps no test playbook.
 */
const INVENTED = [
  "Birthday offer",
  "Recovery Agent",
  "Review Bot",
  "Referral thank-you",
  "Attributed",
  "Spring couples",
];

test.describe("Playbooks on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the real page from the workspace's playbooks, offers the six triggers, and never invents a number", async ({
    page,
  }) => {
    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("playbooks-real");
    await expect(real).toBeVisible();

    const [pb, tpl] = await Promise.all([apiGet(page, "/api/v1/playbooks"), apiGet(page, "/api/v1/templates")]);
    expect(pb.status()).toBe(200);
    expect(tpl.status()).toBe(200);
    const playbooks = (await pb.json()).data.playbooks as { id: string; state: string }[];
    const approved = ((await tpl.json()).data.templates as { channel: string; meta_status: string }[]).filter(
      (t) => t.channel === "whatsapp" && t.meta_status === "approved",
    );

    // The cards are exactly the route's rows; none, and the page says so.
    await expect(real.getByTestId("pb-card")).toHaveCount(playbooks.length);
    if (playbooks.length === 0) await expect(real.getByTestId("pb-empty")).toBeVisible();

    const text = await real.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);

    // The composer, in a sheet beside the page: the six moments behind its
    // moment, each with who it reaches today; the approved messages that fit
    // it, or the honest line; the clock in the business's zone, and the
    // rules every run keeps. Cancelled — nothing is saved.
    await page.getByTestId("pb-new").click();
    const composer = page.getByTestId("pb-composer");
    await expect(composer).toBeVisible();
    await composer.getByTestId("pb-moment").click();
    await expect(page.getByTestId("pb-moment-pop")).toBeVisible();
    await expect(page.getByTestId("pb-moment-option")).toHaveCount(6);
    await expect(page.getByTestId("pb-moment-option").first()).toContainText("Win-back");
    // Escape closes the list, and only the list.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pb-moment-pop")).toHaveCount(0);
    await expect(composer).toBeVisible();
    await expect(composer.getByTestId("pb-guard")).toBeVisible();
    if (approved.length === 0) {
      await expect(composer.getByTestId("pb-no-template")).toBeVisible();
    } else {
      await expect(composer.getByTestId("pb-message")).toBeVisible();
    }
    await expect(composer.getByTestId("pb-hour")).toBeVisible();
    await composer.getByTestId("pb-cancel").click();
    await expect(page.getByTestId("pb-composer")).toHaveCount(0);
  });

  test("the Campaigns tab is Playbooks, and Today shows a run only when one is waiting", async ({ page }) => {
    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("playbooks-real")).toBeVisible();
    await expect(page.getByRole("button", { name: "Playbooks" }).first()).toBeVisible();

    const bc = await apiGet(page, "/api/v1/broadcasts");
    expect(bc.status()).toBe(200);
    const waiting = ((await bc.json()).data.broadcasts as { state: string }[]).filter(
      (b) => b.state === "pending_approval",
    ).length;
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("brief-run-row")).toHaveCount(Math.min(2, waiting));
  });

  /**
   * The standing line's dots sit the same distance from the words on both sides.
   *
   * `.cm-standing-tap` carried `padding: 0 6px` with `margin-left: -6px`: the
   * negative margin cancelled the flex gap on the LEFT and the padding added to
   * it on the RIGHT, so every dot after a tap sat 12px from the word before it
   * and 6px from the word after. Playbooks is the only Campaigns tab with taps,
   * which is why it read as kerned by hand next to Broadcasts and Templates.
   * Geometry, so it is measured in a real browser rather than read off the CSS.
   */
  test("Playbooks: the standing line is evenly spaced, as the other tabs are", async ({ page }) => {
    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    const line = page.getByTestId("pb-standing");
    await expect(line).toBeVisible();
    const gaps = await line.evaluate((root) => {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const runs: { text: string; left: number; right: number }[] = [];
      let n: Node | null;
      while ((n = walk.nextNode())) {
        const text = (n.nodeValue ?? "").trim();
        if (!text) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const box = r.getBoundingClientRect();
        if (!box.width) continue;
        runs.push({ text, left: box.left, right: box.right });
      }
      const out: number[] = [];
      for (let i = 0; i < runs.length - 1; i += 1) {
        // Only the gaps that touch a separator, and only within one wrapped row.
        if (runs[i].text !== "·" && runs[i + 1].text !== "·") continue;
        const gap = runs[i + 1].left - runs[i].right;
        if (gap >= 0) out.push(Math.round(gap));
      }
      return out;
    });
    test.skip(gaps.length === 0, "this workspace's line has no separators");
    expect(new Set(gaps).size, `every gap around a dot is the same: ${JSON.stringify(gaps)}`).toBe(1);
  });

  /**
   * Three tabs of one nav item keep one page edge.
   *
   * `.bc-page` supplies its children's gutter; `.reports` is full-bleed by design
   * and every direct child carries the pane's own (.cl-head, .cl-controls,
   * .rp-body all do). The standing line replaced .cl-head on Playbooks and
   * Templates and carried none, so on those two tabs it sat flush against the
   * sidebar while everything below it was inset 28px -- and Broadcasts, whose
   * line is inside .bc-page, was inset correctly. Geometry, so it is measured.
   * Broadcasts is not: since #758 its line ends its band's legend, at the right,
   * and the composer it sat above is a screen of its own, so the line has no
   * page edge to share and the check could only skip it.
   */
  test("Campaigns: the standing line shares its page edge with the work below it", async ({ page }) => {
    for (const [route, line] of [
      ["outbound", "pb-standing"],
      ["messages", "messages-standing"],
    ] as const) {
      await page.goto(`/#/${route}`);
      await page.waitForLoadState("networkidle");
      const standing = page.getByTestId(line);
      if ((await standing.count()) === 0) continue;
      // The line's own ink, not its box: a box can be flush while padding insets the words.
      const inkLeft = await standing.evaluate((el) => {
        const lead = el.querySelector(".cm-standing-lead");
        if (!lead?.firstChild) return null;
        const r = document.createRange();
        r.selectNodeContents(lead.firstChild);
        return Math.round(r.getBoundingClientRect().left);
      });
      if (inkLeft === null) continue;
      const below = page.locator(".rp-body > *").first();
      if ((await below.count()) === 0) continue;
      const box = await below.boundingBox();
      expect(
        box && Math.abs(Math.round(box.x) - inkLeft) <= 1,
        `${route}: the line starts at ${inkLeft} and the work below it at ${Math.round(box?.x ?? -1)}`,
      ).toBe(true);
    }
  });
});
