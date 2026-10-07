import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute } from "../address";
import { apiGet } from "../workspace";
import { messagesOffered, momentSlots, type TemplatesRead } from "./offered";

/**
 * Campaigns' home (canvas A, "Lifecycle") on a real workspace: the page that replaced the Playbooks list.
 *
 * The route renders the real page, not the Coming Soon card or the mockup's six invented campaigns: the moments are the
 * workspace's own playbooks and their pools, the tiles are what its runs and its People say, and the composer, in a sheet
 * from the side, offers the moments with who each reaches today. A playbook is `campaigns/moment:<id>`, and every old address
 * (`#/outbound`, `#/outbound/<id>`, `/playbooks`) lands on the home for ever. Nothing is made here: the workspace keeps no test
 * playbook, and the composer is cancelled.
 */
const INVENTED = [
  "Birthday offer",
  "Recovery Agent",
  "Review Bot",
  "Referral thank-you",
  "Attributed",
  "Spring couples",
];

test.describe("Campaigns' home on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the real page from the workspace's playbooks, hosts the composer under New message, and never invents a number", async ({
    page,
  }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    const home = page.getByTestId("campaigns-home");
    await expect(home).toBeVisible();

    const [pb, tpl, cfg] = await Promise.all([
      apiGet(page, "/api/v1/playbooks"),
      apiGet(page, "/api/v1/templates"),
      apiGet(page, "/api/v1/settings"),
    ]);
    expect(pb.status()).toBe(200);
    expect(tpl.status()).toBe(200);
    expect(cfg.status()).toBe(200);
    const body = (await pb.json()).data as { playbooks: { id: string; state: string }[]; deals_on: boolean };
    const read = (await tpl.json()).data as TemplatesRead;
    const bookingLink = !!(await cfg.json()).data.config?.brain?.booking_link;

    // The rail is the five moments around a customer (four where deals are off, 0006), each covered or not.
    await expect(home.getByTestId("cmh-stage")).toHaveCount(body.deals_on ? 5 : 4);
    const text = await home.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    // The three tiles stand once their surfaces have landed: who can hear you, what is coming, what came back.
    await expect(home.getByTestId("cmh-reach")).toBeVisible();
    await expect(home.getByTestId("cmh-coming")).toBeVisible();
    await expect(home.getByTestId("cmh-results")).toBeVisible();

    // New message opens the composer in a sheet from the side, on Send once; Every time a moment comes is the playbook
    // composer: the moments behind its moment, each with who it reaches today; the messages that fit it, or the honest
    // line; the clock in the business's zone. Cancelled -- nothing is saved. (In Glass, the default look, the page's act
    // is drawn in the frame's head, outside the page's own element, so it is found on the page.)
    await page.getByTestId("cmh-new").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/new$/));
    const sheet = page.getByTestId("cmh-composer");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("bc-composer")).toBeVisible();
    // The switch stands in the sheet's head, outside its body's test id (home/new-message.tsx, the sheet's tools).
    await page.getByTestId("cmh-kind-every").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/new:every$/));
    const composer = sheet.getByTestId("pb-composer");
    await expect(composer).toBeVisible();
    // (The kit's Picker: its list pops on the body, its options are the page's `option`s, and Escape closes it.)
    await composer.getByTestId("pb-moment").click();
    await expect(page.locator(".rec-combo-pop")).toBeVisible();
    const moments = page.getByRole("option");
    await expect(moments.first()).toBeVisible();
    // The moments this workspace is offered, among them the win-back (by visits or by silence, whichever it can read).
    await expect(moments.filter({ hasText: "Win-back" }).first()).toBeVisible();
    // Escape closes the list, and only the list. (Base UI's Select keeps a list it opened in the page, hidden.)
    await page.keyboard.press("Escape");
    await expect(page.locator(".rec-combo-pop")).toBeHidden();
    await expect(composer).toBeVisible();
    await expect(composer.getByTestId("pb-guard")).toBeVisible();
    // The messages it may offer are the ones a send by any of WhatsApp, email and text can carry (messagesOffered: what the
    // route answers, by contracts' rules), left with those whose every slot the moment it opened on can fill -- a visit's
    // time on a visit moment, a proposal's link on the follow-up -- which the picker says by its label. None of it assumes
    // a channel, so a workspace with no WhatsApp number is offered the messages it has written.
    const { groups: usable } = messagesOffered(
      read,
      momentSlots((await composer.getByTestId("pb-moment").innerText()).trim(), bookingLink),
    );
    await expect(composer.getByTestId("pb-message")).toBeVisible();
    if (usable.length === 0) {
      await expect(composer.getByTestId("pb-no-template")).toBeVisible();
    } else {
      await expect(composer.getByTestId("pb-no-template")).toHaveCount(0);
    }
    await expect(composer.getByTestId("pb-hour")).toBeVisible();
    await composer.getByTestId("pb-cancel").click();
    await expect(page.getByTestId("pb-composer")).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
  });

  test("a moment opens in the sheet by its address, and the old Playbooks addresses land on it", async ({ page }) => {
    const res = await apiGet(page, "/api/v1/playbooks");
    expect(res.status()).toBe(200);
    const playbooks = (await res.json()).data.playbooks as { id: string; name: string }[];
    test.skip(playbooks.length === 0, "this workspace has made no playbook");
    const first = playbooks[0];
    // The old route, as a bell row or an email link writes it, moves to the new address as the frame loads.
    await page.goto("/#/outbound");
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    await page.goto(`/#/outbound/${first.id}`);
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/moment:${first.id}$`)));
    const drawer = page.getByTestId("cmh-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("pb-detail")).toBeVisible();
    // Closed, the address is the home's again, and the home is still there.
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
  });

  /**
   * The rail is five columns, and five columns need about 1100px of page: under that the moments stand down a line (a container
   * rule on the home, campaigns.css), and a "Turn on · 3 tomorrow" wraps inside its card. Between a phone's 900px and a wide
   * desk nothing may run out of the rail, or off the page. Geometry, so it is measured in a real browser.
   */
  test("the home draws inside its page from 901 to 1440px: the rail stands down the line where five columns no longer fit", async ({
    page,
  }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    for (const width of [901, 1000, 1100, 1200, 1330, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const rail = page.getByTestId("cmh-rail");
      await expect(rail).toBeVisible();
      const runOut = await rail.evaluate((el) => {
        const edge = el.getBoundingClientRect();
        return [...el.querySelectorAll<HTMLElement>("*")]
          .filter((n) => {
            const box = n.getBoundingClientRect();
            return box.width > 0 && (box.right > edge.right + 1 || box.left < edge.left - 1);
          })
          .map((n) => n.className || n.tagName);
      });
      expect(runOut, `${width}px: parts of the rail run out of it`).toEqual([]);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${width}px: the page scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });

  test("Campaigns has no strip of tabs, and Today shows a run only when one is waiting", async ({ page }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    await expect(page.locator(".stabs-campaigns")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Playbooks" })).toHaveCount(0);

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
   * Three pages of one nav item keep one page edge.
   *
   * `.cmh` supplies the home's gutter, and its head and its rail are both inside it; the Library's head is inside its own list.
   * A line that sat flush against the sidebar while the work below it was inset 28px was the standing line's bug on the old
   * tabs. Geometry, so it is measured in a real browser rather than read off the CSS.
   */
  test("Campaigns: the home's line shares its page edge with the rail below it", async ({ page }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    const head = page.getByTestId("cmh-head");
    const rail = page.getByTestId("cmh-rail");
    test.skip((await head.count()) === 0 || (await rail.count()) === 0, "this look draws the head in the frame");
    const [h, r] = await Promise.all([head.boundingBox(), rail.boundingBox()]);
    expect(
      h && r && Math.abs(Math.round(h.x) - Math.round(r.x)) <= 1,
      `the head starts at ${h?.x} and the rail at ${r?.x}`,
    ).toBe(true);
  });
});
