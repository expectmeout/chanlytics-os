import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute, routeOf } from "../address";

/**
 * The phone shell, on a real workspace at a phone's width.
 *
 * The tab bar is there and the hamburger is not; Ask is the ✦ in the tab bar,
 * and the top bar has no second Ask and no theme button; the Inbox shows its
 * list and not its thread until a tap, then the thread and a Back;
 * Conversations does the same. And the installable pieces are served to a
 * browser with no session, because that is how a phone's installer asks for
 * them.
 */
test.describe("Installable shell, no session", () => {
  test("the manifest, the worker and the icons are public", async ({ request }) => {
    const m = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(m.status()).toBe(200);
    expect(m.headers()["content-type"]).toContain("manifest");
    const json = await m.json();
    expect(json.name).toBe("Chanlytics");
    expect(json.display).toBe("standalone");
    expect(json.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    const sw = await request.get("/sw.js", { maxRedirects: 0 });
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("skipWaiting");
    const icon = await request.get("/icons/icon-192.png", { maxRedirects: 0 });
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/png");
  });
});

/**
 * Every button and link of a screen is inside the width the phone has, and the page scrolls nowhere sideways: the row wraps
 * rather than being clipped. Links too, since some of a page's acts are links drawn as buttons.
 */
const controlsInsideTheScreen = async (page: Page, screen: Locator) => {
  const width = page.viewportSize()?.width ?? 390;
  for (const el of await screen.getByRole("button").or(screen.getByRole("link")).all()) {
    const box = await el.boundingBox();
    if (!box) continue;
    expect(box.x + box.width, `${(await el.textContent())?.trim()} runs off a ${width}px screen`).toBeLessThanOrEqual(
      width + 1,
    );
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "the page scrolls sideways").toBeLessThanOrEqual(1);
};

/** A thumb down the screen from (x, y), by `by` pixels, through the browser's own input (CDP): six moves, then let go. */
const pullDown = async (page: Page, x: number, y: number, by: number) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i += 1)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (by * i) / 6 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

/** A thumb across the screen, through the browser's own input (CDP): six moves from one x to another, then let go. */
const swipeAcross = async (page: Page, from: number, to: number, y = 560) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
  for (let i = 1; i <= 6; i += 1) {
    const x = from + ((to - from) * i) / 6;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

test.describe("Phone shell on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the ✦ in the tab bar opens Ask as the takeover and hides while the takeover is open, and the top bar says neither Ask nor the theme again", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const fab = page.getByTestId("phone-ask");
    await expect(fab).toBeVisible();
    // The ✦ is Ask's face too: the three on the cards' surface, a beam on its rim (components/ask-face.jsx).
    await expect(fab.getByTestId("phone-ask-face")).toBeVisible();
    // In the tab bar's own row, clear of the tabs: it floated 126px up, over the page.
    const bar = await page.getByTestId("phone-tabs").boundingBox();
    const at = await fab.boundingBox();
    expect(
      bar && at && at.y >= bar.y,
      `the ✦ at ${JSON.stringify(at)} sits in the tab bar at ${JSON.stringify(bar)}`,
    ).toBe(true);
    const rightmost = await page
      .getByTestId("phone-tabs")
      .locator(".tab-bar-tab")
      .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
    expect(rightmost, "no tab runs under it").toBeLessThanOrEqual((at?.x ?? 0) + 1);
    await expect(page.getByTestId("tb-ask")).toBeHidden();
    await expect(page.locator(".tb-theme")).toBeHidden();
    await fab.click();
    const pal = page.getByTestId("ask-real");
    await expect(pal).toBeVisible();
    await expect(fab).toBeHidden();
    await expect(page.getByTestId("ask-input")).toBeVisible();
    // The line is at the thumb: docked at the foot of the takeover, what it answers rising above it (the Line, 6.7).
    const line = (await page.getByTestId("ask-line").boundingBox())!;
    expect(line.y + line.height, "the line sits at the foot").toBeGreaterThan(page.viewportSize()!.height - 120);
    await page.screenshot({ path: "test-results/phone-ask.png" });
    await page.keyboard.press("Escape");
    await expect(pal).toBeHidden();
    await expect(fab).toBeVisible();
  });

  test("the drawer is off the page when shut, a dialog while open, and off the page again once it has closed", async ({
    page,
  }) => {
    // Safari on iOS 26 colours its own status-bar strip from the fixed element under the top edge and keeps that
    // colour for as long as the element that gave it is still rendered (WebKit, Page::updateFixedContainerEdges).
    // A drawer parked at translateX(-102%) is rendered, so the scrim's grey outlived the drawer until a reload; one
    // that is display: none is not. The scrim carries a backdrop-filter, which that sampler reads as glass and leaves
    // the strip alone, as it does for Ask's takeover. Safari's bar itself is Ruben's to look at; this proves the shape
    // the bar reads.
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const sidebar = page.locator(".side-wrap .sidebar");
    const rendered = () => sidebar.evaluate((el) => el.getClientRects().length > 0);
    await expect(sidebar).toBeHidden();
    expect(await rendered(), "shut, the drawer has no box").toBe(false);

    await page.getByTestId("phone-tabs").getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(1);
    await expect(sidebar).toBeVisible();
    // In Glass the drawer is the desk's card, standing at its own margin from the screen's edge.
    const edge = await sidebar.evaluate((el) => Number.parseFloat(getComputedStyle(el).marginLeft));
    await expect
      .poll(async () => (await sidebar.boundingBox())?.x, { message: "the drawer slides in to the edge" })
      .toBe(edge);
    const scrim = page.locator(".nav-backdrop");
    await expect(scrim).toBeVisible();
    expect(await scrim.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    expect(await scrim.evaluate((el) => getComputedStyle(el).backdropFilter), "the scrim is glass to the bar").not.toBe(
      "none",
    );

    await scrim.click({ position: { x: 370, y: 500 } });
    await expect(sidebar, "once the slide-out has ended, the drawer has no box").toBeHidden();
    expect(await rendered()).toBe(false);
    await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  });

  /**
   * An app on a phone's home screen has the home bar's inset at its foot, and a tab has none. The drawer is a card as
   * tall as what it holds: the inset once stood inside it as 34px of empty glass under the account's row (7 Oct 2026).
   * The inset is the browser's own here (CDP), read by the page's env().
   */
  test("the drawer keeps no room under the account's row, with a home bar's inset or without", async ({ page }) => {
    const sidebar = page.locator(".side-wrap .sidebar");
    const under = async () => {
      await page.goto("/#/today");
      await page.waitForLoadState("networkidle");
      await page.getByTestId("phone-tabs").getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(1);
      return sidebar.evaluate((el) =>
        Math.round(el.getBoundingClientRect().bottom - el.querySelector(".user-chip")!.getBoundingClientRect().bottom),
      );
    };
    const plain = await under();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34, bottomMax: 34 } });
    expect(await page.evaluate(() => CSS.supports("padding-bottom: env(safe-area-inset-bottom)"))).toBe(true);
    expect(await under(), "the home bar's inset adds nothing inside the drawer").toBe(plain);
  });

  /**
   * The drawer is the desk's sidebar, 248px (Ruben, 25 Sep: at 300 its words ended by 190 and the rest was empty), and a
   * thumb slides it away (data-bits touchSwipe onAway): it follows the finger, a short slide settles it back, past a
   * third it goes. Nothing opens it by a swipe, because from the screen's edge that is the phone's own back: More does.
   * Real touches through the browser's own input (CDP).
   */
  test("the drawer is the desk's width, a thumb slides it away, and no swipe opens it", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("dialog", { name: "Navigation" });
    const sidebar = page.locator(".side-wrap .sidebar");
    const x = async () => Math.round((await sidebar.boundingBox())?.x ?? -999);
    await page.getByTestId("phone-tabs").getByRole("button", { name: "Menu" }).click();
    // In Glass the drawer is the desk's card, standing at its own margin from the screen's edge.
    const edge = Math.round(await sidebar.evaluate((el) => Number.parseFloat(getComputedStyle(el).marginLeft)));
    await expect.poll(x, { message: "the drawer slides in to the edge" }).toBe(edge);
    expect(Math.round((await sidebar.boundingBox())!.width), "the desk's 248px").toBe(248);

    await swipeAcross(page, 200, 170, 420);
    await expect.poll(x, { message: "30px: it settles back" }).toBe(edge);
    await expect(nav).toHaveCount(1);

    await swipeAcross(page, 200, 60, 420);
    await expect(nav, "past a third: it goes").toHaveCount(0);
    await expect(sidebar, "and once it has slid shut it has no box").toBeHidden();

    await swipeAcross(page, 30, 260, 420);
    await page.waitForTimeout(400);
    await expect(nav, "a swipe in from the side opens nothing").toHaveCount(0);
  });

  test("the tab bar replaces the menu button, and the Inbox shows one pane at a time", async ({ page }) => {
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("phone-tabs")).toBeVisible();
    await expect(page.locator(".tb-menu")).toBeHidden();
    // The four places a thumb reaches, and what is NOT among them: a call is
    // live for minutes a week, so it is a bar while it is happening rather
    // than a slot that is empty the rest of the time. Calendar took it.
    // The places are links (a door is a link) and More, which is no place, a button after them: the kit's TabBar.
    const tabs = page.getByTestId("phone-tabs").locator(".tab-bar-tab");
    await expect(tabs).toHaveText(["Today", "Inbox", "Calendar", "People", "More"]);
    await tabs.filter({ hasText: "Calendar" }).click();
    await expect(page).toHaveURL(atRoute(/^calendar/));
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".ix-list")).toBeVisible();
    await expect(page.locator(".ix-thread-pane")).toBeHidden();
    await page.screenshot({ path: "test-results/phone-inbox-list.png" });

    const row = page.locator(".ix-thread").first();
    test.skip((await row.count()) === 0, "no threads in this workspace");
    await row.click();
    await expect(page.locator(".ix-thread-pane")).toBeVisible();
    await expect(page.locator(".ix-list")).toBeHidden();
    await expect(page.getByTestId("ix-back")).toBeVisible();
    await page.screenshot({ path: "test-results/phone-inbox-thread.png" });
    await page.getByTestId("ix-back").click();
    await expect(page.locator(".ix-list")).toBeVisible();
    await expect(page.locator(".ix-thread-pane")).toBeHidden();

    // A bucket is a list, never a conversation. Picking Handled or Snoozed opened that bucket's first thread over
    // the rows -- the list gone, a customer nobody asked for on the phone -- and a bucket with nothing in it left
    // neither on the screen.
    for (const name of ["Handled", "Snoozed"]) {
      const chip = page.locator(".subtab", { hasText: name }).first();
      if ((await chip.count()) === 0) continue;
      await chip.click();
      await expect(chip, `${name} is the bucket on screen`).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".ix-list"), `${name} shows its list`).toBeVisible();
      await expect(page.locator(".ix-thread-pane"), `${name} opens no conversation`).toBeHidden();
    }
  });

  test("the tab bar navigates, and Conversations takes turns too", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("phone-tabs").getByRole("link", { name: "People" }).click();
    await expect(page).toHaveURL(atRoute(/^clients/));
    await page.goto("/#/conversations");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".cv-list")).toBeVisible();
    // The reading pane is the one thread (thread-pane.jsx) -- a call opens at its card -- or a call alone in its frame.
    const reading = page.locator(".conversations .ix-thread-pane");
    await expect(reading).toBeHidden();
    const row = page.locator(".cv-row").first();
    test.skip((await row.count()) === 0, "no conversations in this workspace");
    await row.click();
    await expect(reading).toBeVisible();
    const back = page.getByTestId("ix-back");
    await expect(back).toBeVisible();
    await back.click();
    await expect(page.locator(".cv-list")).toBeVisible();
  });
  /**
   * Campaigns on a phone is Sequences (decision 0060; Sent's list and the home that stood here went in its S6): the list,
   * every control of it inside the screen, its New whole on the first screen. The one-off composer a date opens, in a
   * sheet from the bottom at its own address, holds nothing past the edge either: Broadcasts' "Send now" once sat 208px
   * past it (.bc-actions, a flex row with no wrap in a 283px column, under .main-scroll's overflow-x: hidden), where a case
   * that only looked for the button would have passed the whole time. Read-only: New and its date are pressed, and the
   * composer is left unsaved.
   */
  test("Campaigns: every control on Sequences is inside the screen, New on the first screen, and a one-off's composer too", async ({
    page,
  }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));
    const list = page.getByTestId("sq-page");
    await expect(list).toBeVisible();
    const open = page.getByTestId("sq-new-open");
    await expect(open).toBeInViewport({ ratio: 1 });
    await controlsInsideTheScreen(page, list);
    await open.click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new$/));
    const pane = page.getByTestId("sq-new");
    await expect(pane).toBeVisible();
    await controlsInsideTheScreen(page, pane);
    await pane.getByTestId("sq-new-on-date").click();
    await pane.getByTestId("sq-new-open-date").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/new$/));
    const composer = page.getByTestId("cmh-composer").getByTestId("bc-composer");
    await expect(composer).toBeVisible();
    await controlsInsideTheScreen(page, composer);
  });

  /**
   * Live's call panel head wraps before it squeezes. Its titles were `flex: 1` beside controls that would
   * not shrink, so on a phone the name had ~90px and the meta line's number and start time fell into
   * columns one word wide. The head is there only with a call open (one on the line, or one a link names), so a
   * workspace with nobody on the line skips it. Read-only: nothing here is pressed.
   */
  test("Live: the call panel's head gives the name the width, and each fact stays on one line", async ({ page }) => {
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("live-real")).toBeVisible();
    const head = page.locator(".lm-head").first();
    test.skip((await head.count()) === 0, "nobody is on the line: no panel head to measure");
    const width = page.viewportSize()?.width ?? 390;
    const titles = await page.locator(".lm-head-titles").first().boundingBox();
    expect(titles && titles.width >= Math.min(260, width - 40), `the name and its facts had ${titles?.width}px`).toBe(
      true,
    );
    for (const fact of await page.locator(".lm-head-meta > *").all()) {
      const box = await fact.boundingBox();
      if (!box || box.height < 4) continue; // the separator dots
      expect(box.height, `"${(await fact.textContent())?.trim()}" broke across lines`).toBeLessThanOrEqual(24);
    }
    for (const el of await page.locator(".lm-head-actions").getByRole("button").all()) {
      const box = await el.boundingBox();
      if (!box) continue;
      expect(box.x + box.width, `${(await el.textContent())?.trim()} runs off a ${width}px screen`).toBeLessThanOrEqual(
        width + 1,
      );
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, "the page scrolls sideways").toBeLessThanOrEqual(1);
  });

  test("Campaigns: Send now asks before it sends", async ({ page }) => {
    // The send is Campaigns' composer, a sheet over Sequences at its own address.
    await page.goto("/#/campaigns/new");
    await page.waitForLoadState("networkidle");
    const send = page.getByTestId("bc-send");
    test.skip(!(await send.isEnabled().catch(() => false)), "nothing approved to send in this workspace");
    await send.click();
    await expect(page.getByTestId("bc-send-confirm")).toBeVisible();
    await expect(page.getByTestId("bc-send-yes")).toBeVisible();
    // Nothing has gone: the question can be dismissed and the button comes back.
    await page.getByTestId("bc-send-no").click();
    await expect(page.getByTestId("bc-send")).toBeVisible();
  });

  /**
   * People on a phone (docs/superpowers/specs/2026-09-22-people-on-a-phone-design.md): one bar, one line and the
   * rows. On 22 Sep the first person stood 299px down under a search box and three text buttons, each person a boxed
   * card 119 to 168px tall with the face squeezed to an oval and the state 36px tall, and Add a person opened a form
   * 479px wide on a 375px screen.
   */
  test("People is one bar, one line and the rows: a face is round, a state one line, nothing past the edge", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const bar = page.getByTestId("people-phone-bar");
    await expect(bar).toBeVisible();
    for (const id of ["people-phone-lists", "people-phone-search"])
      await expect(bar.getByTestId(id)).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".cl-controls")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      "nothing past the edge",
    ).toBe(0);
    const row = page.locator(".pl-table tbody tr.pl-card-row").first();
    test.skip((await row.count()) === 0, "nobody on this workspace");
    await expect(row).toBeInViewport({ ratio: 1 });
    expect(
      (await row.boundingBox())!.y,
      "the first person is on the first screen, under the Inbox's tiers (the strip, the list, the search) and one line",
    ).toBeLessThan(300);
    const face = (await row.locator(".list-row-face").boundingBox())!;
    expect(Math.abs(face.width - face.height), "a face is round").toBeLessThanOrEqual(1);
    expect(
      (await row.locator(".pl-card > .list-row-end").boundingBox())!.height,
      "a state is a pill, not a 36px button",
    ).toBeLessThanOrEqual(22);
    // Search: the field from the first draw, at 16px (a phone zooms into anything smaller). Nothing focuses it by
    // itself, and ONE tap begins the typing: it rested as a capsule a tap only swapped for the field, and a second tap
    // raised the keyboard (Ruben, 11 Oct 2026). The clear (×) empties it from the first word and keeps it in focus
    // (there is no Cancel).
    const field = page.getByTestId("people-phone-search");
    await expect(field).toBeVisible();
    await expect(field).not.toBeFocused();
    await field.tap();
    await expect(field).toBeFocused();
    expect(await field.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await field.fill("zz");
    await page.getByTestId("people-phone-search-clear").tap();
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await field.blur();
    await expect(bar.getByTestId("people-phone-lists")).toBeVisible();
    // A list picked in the sheet closes it and leaves no tip behind: the tap focused its row, the sheet took the row
    // away, and the tip was placed at the corner of the top bar 280ms later.
    await bar.getByTestId("people-phone-lists").click();
    const sheet = page.getByTestId("people-lists-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("rail-everyone").click();
    await expect(sheet).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.locator(".ui-tip.show")).toHaveCount(0);
    // Add people: the page's act opens a sheet whose Save is on the screen.
    const add = page.getByTestId("add-people");
    test.skip((await add.count()) === 0, "this member cannot add people");
    await add.click();
    await expect(page.getByTestId("people-add-sheet")).toBeVisible();
    await expect(page.getByTestId("rec-sheet-save-people-add")).toBeInViewport({ ratio: 1 });
    // On a phone the sheet closes from its foot: its Cancel there, the corner's Close out of sight (#1592: the corner's
    // Close comes back for a keyboard alone).
    await page.getByTestId("rec-sheet-cancel-people-add").click();
    await expect(page.getByTestId("people-add-sheet")).toHaveCount(0);
  });
  /**
   * A sheet stands on the keyboard (25 Sep). A phone lays its keyboard over the page and keeps the layout's height, so
   * Add people's Save sat under the keys. The shell says what the keyboard covers as --kb (data-bits watchKeyboard;
   * keyboard-inset.test.mjs proves the measure); here a keyboard 300px tall is said as the phone would say it, and the
   * sheet stands on it, whole, with its Save above the keys, and goes back down when the keyboard goes.
   */
  test("a sheet stands on the keyboard: whole on the screen, its Save above the keys", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const said = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--kb"));
    expect(await said(), "the shell measures it, and no keyboard is up").toBe("0px");
    // Add people, the page's act, opens its sheet (Ruben, 10 Oct 2026: it was a ⋯'s item).
    const add = page.getByTestId("add-people");
    test.skip((await add.count()) === 0, "this member cannot add people");
    await add.click();
    const sheet = page.getByTestId("people-add-sheet");
    await expect(sheet).toBeVisible();
    const tall = page.viewportSize()!.height;
    const foot = async () => {
      const b = (await sheet.boundingBox())!;
      return Math.round(b.y + b.height);
    };
    await expect.poll(foot, { message: "at rest on the bottom" }).toBe(tall);
    const keys = 300;
    await page.evaluate((kb) => document.documentElement.style.setProperty("--kb", `${kb}px`), keys);
    await expect.poll(foot, { message: "standing on the keys" }).toBe(tall - keys);
    expect((await sheet.boundingBox())!.y, "its top on the screen").toBeGreaterThanOrEqual(0);
    const save = (await page.getByTestId("rec-sheet-save-people-add").boundingBox())!;
    expect(save.y + save.height, "Save above the keys").toBeLessThanOrEqual(tall - keys);
    await page.evaluate(() => document.documentElement.style.setProperty("--kb", "0px"));
    await expect.poll(foot, { message: "back down when the keyboard goes" }).toBe(tall);
  });
  /**
   * A thumb pulls a sheet down to close it (the kit's Sheet, through data-bits touchSwipe, 5 Oct 2026): from its handle,
   * past a third of its height, it leaves the way it was pulled and is gone.
   */
  test("a sheet pulled down from its handle past a third closes", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    // Add people, the page's act, opens its sheet (Ruben, 10 Oct 2026: it was a ⋯'s item).
    const add = page.getByTestId("add-people");
    test.skip((await add.count()) === 0, "this member cannot add people");
    await add.click();
    const sheet = page.getByTestId("people-add-sheet");
    await expect(sheet).toBeVisible();
    // Its handle where the sheet comes to rest: measured as it rose, the thumb landed below the handle.
    let b = (await sheet.boundingBox())!;
    await expect
      .poll(async () => {
        const was = b;
        b = (await sheet.boundingBox())!;
        return Math.round(b.y) === Math.round(was.y) && Math.round(b.height) === Math.round(was.height);
      })
      .toBe(true);
    await pullDown(page, b.x + b.width / 2, b.y + 10, b.height * 0.6);
    await expect(sheet, "pulled past a third, it closed").toHaveCount(0);
  });
  /**
   * The switch holds three scopes (People, Leads and the Pipeline, every workspace's: 0008, amended 18 Oct 2026), and
   * the bar holds them beside the list, search and the scope's last control at the narrowest phone we draw for: nothing
   * past its edge, nothing scrolled sideways, and the Pipeline's own bar.
   */
  test("at 375px the bar holds every scope it offers, with nothing past its edge", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const fits = async (testid: string) => {
      const bar = page.getByTestId(testid);
      await expect(bar).toBeVisible();
      expect(
        await bar.evaluate((el) => el.scrollWidth - el.clientWidth),
        `${testid}: nothing inside the bar runs past it`,
      ).toBeLessThanOrEqual(0);
      for (const tab of await bar.getByRole("tab").all()) {
        await expect(tab).toBeInViewport({ ratio: 1 });
        // Each tab keeps the touch floor's 44px across: the bar's spacing gives way, never a tab.
        expect((await tab.boundingBox())!.width, `${testid}: a tab a thumb can hit`).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        `${testid}: the page does not scroll sideways`,
      ).toBe(0);
    };
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await fits("people-phone-bar");
    const pipeline = page.getByTestId("people-phone-bar").getByRole("tab", { name: "Pipeline" });
    await pipeline.click();
    await expect.poll(() => routeOf(page.url())).toBe("clients/pipeline");
    await fits("pipeline-phone-bar");
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await fits("leads-phone-bar");
  });
  /**
   * Selecting on a phone (the same spec, 4.5): the face is the checkbox, and a selection is one capsule docked at the foot, the tab
   * bar standing down -- ✕, the count, then Add to list, Note and More as its tabs are drawn -- whose More opens a sheet with the rest. On 22 Sep the bar was a pill 188px
   * wide at the middle of the screen, its seven controls stacked 312px tall over the rows.
   */
  test("a selection is one docked capsule at the foot, and More opens its sheet whole on the screen", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const row = page.locator(".pl-table tbody tr.pl-card-row").first();
    test.skip((await row.count()) === 0, "nobody on this workspace");
    const pick = row.getByTestId("row-select");
    test.skip((await pick.count()) === 0, "this member can neither edit nor export people");
    // The box is laid over the face at no opacity: the face is what a finger sees.
    await pick.click({ force: true });
    const bar = page.getByTestId("bulk-bar");
    await expect(bar).toBeVisible();
    // The count is the dock's name; its face is the acts, docked where the tab bar stood (#1553).
    await expect(bar).toHaveAccessibleName("1 person selected");
    const vp = page.viewportSize()!;
    const box = (await bar.boundingBox())!;
    expect(box.x, "docked in from the edges, a capsule").toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width - 8);
    expect(box.height, "one row").toBeLessThanOrEqual(64);
    expect(await bar.evaluate((el) => el.scrollWidth - el.clientWidth), "nothing past its edge").toBeLessThanOrEqual(1);
    await expect(page.getByTestId("phone-tabs"), "the tab bar stands down for the docked bar (data-dock)").toBeHidden();
    expect(box.y + box.height, "it stands at the foot of the screen").toBeGreaterThanOrEqual(vp.height - 40);
    await bar.getByTestId("bulk-more").click();
    const sheet = page.getByTestId("bulk-sheet");
    await expect(sheet).toBeVisible();
    const rows = sheet.locator(".pp-sheet-row");
    expect(await rows.count(), "the rest of what a selection can become").toBeGreaterThan(0);
    await expect(rows.last()).toBeInViewport({ ratio: 1 });
    await page.getByTestId("bulk-sheet-close").click();
    await expect(sheet).toHaveCount(0);
    await expect(bar, "Cancel shuts the sheet and keeps the selection").toHaveAccessibleName("1 person selected");
    await bar.getByTestId("bulk-clear").click();
    await expect(bar).toHaveCount(0);
  });
  /**
   * One row for every list (22 Sep). People's row, the Inbox's, Conversations' and a lead's each had their own
   * numbers -- measured on production at 375px: 84px, 83, 100 and 131, with two name sizes, three gutters and a
   * 56px photograph among them. They read as four products. tokens.css's --row-* is the one row now, and this
   * holds them to it: same height, same face, same gutter, the name at one size. Above 900px each list keeps its
   * own row, so this is a phone's test only.
   */
  test("the lists wear one row: a person, a thread, a conversation and a lead are the same row", async ({ page }) => {
    // The first row of a list, measured against the list's own left edge, and the type its name is set in.
    const shapeOf = async (row: Locator, faceSel: string, nameSel: string) => {
      return await row.evaluate(
        (el, sels) => {
          const q = (s: string) => el.querySelector(s) as HTMLElement | null;
          const face = q(sels.face);
          const name = q(sels.name);
          const r = el.getBoundingClientRect();
          const f = face ? face.getBoundingClientRect() : null;
          const n = name ? getComputedStyle(name) : null;
          return {
            height: Math.round(r.height),
            face: f ? Math.round(f.width) : null,
            gutter: f ? Math.round(f.left - r.left) : null,
            // Size and leading, not weight: an unread thread's name is bolder on purpose (inbox.css), the row is the same.
            name: n ? `${Number.parseFloat(n.fontSize)}/${Number.parseFloat(n.lineHeight)}` : null,
            past: Math.round(el.scrollWidth - el.clientWidth),
          };
        },
        { face: faceSel, name: nameSel },
      );
    };
    const shapes: Record<string, Awaited<ReturnType<typeof shapeOf>>> = {};
    const read = async (hash: string, rowSel: string, faceSel: string, nameSel: string, label: string) => {
      await page.goto(`/#/${hash}`);
      await page.waitForLoadState("networkidle");
      const row = page.locator(rowSel).first();
      if ((await row.count()) === 0) return; // an empty list on this workspace proves nothing
      shapes[label] = await shapeOf(row, faceSel, nameSel);
    };
    await read("inbox", ".ix-thread", ".ix-thread-pic", ".ix-thread-who", "a thread");
    await read("conversations", ".cv-row", ".cv-row-pic", ".cv-row-who", "a conversation");
    // People's and Leads' rows are the kit's list row (kit/list-row/list-row.tsx).
    await read("clients", ".pl-table tbody tr.pl-card-row", ".list-row-face", ".list-row-name", "a person");
    await read("clients/leads", ".pl-table tbody tr.pl-card-row", ".list-row-face", ".list-row-name", "a lead");
    const seen = Object.entries(shapes);
    test.skip(seen.length < 2, "this workspace has fewer than two lists with anything in them");
    const [first, firstShape] = seen[0];
    // The same row, drawn with its facts line (84px) or without one: a thread with no second agent, confidence, tags
    // or value (the nightly's threads) is name and sub alone, one 19px line shorter (inbox.css .ix-thread-foot draws
    // only when there is something to say). The face, the gutter and the name's type are the row's either way.
    const rowHeights = [84, 65];
    for (const [label, shape] of seen.slice(1)) {
      expect(shape.face, `${label}'s face is ${first}'s`).toBe(firstShape.face);
      expect(shape.gutter, `${label} starts where ${first} does`).toBe(firstShape.gutter);
      expect(shape.name, `${label}'s name is set like ${first}'s`).toBe(firstShape.name);
    }
    for (const [label, shape] of seen) {
      expect(rowHeights, `${label} is the row tokens.css draws, with or without its facts line`).toContain(
        shape.height,
      );
      expect(shape.face, `${label}'s face is --row-face`).toBe(32);
      expect(shape.gutter, `${label} keeps --row-pad-x`).toBe(16);
      expect(shape.past, `nothing on ${label} is past its right edge`).toBeLessThanOrEqual(1);
    }
  });

  /**
   * A hairline between two rows (16 Oct 2026). The rows stood on the page as lozenges with nothing between them, and
   * on a phone the eye had nothing to follow from a name to its time or its state (Ruben: "a divider between each row
   * to make it easier to follow, a subtle one"). Every list draws one line, the kit's row's (kit.css) and the pages'
   * own rows' (mobile.css; Messages', campaigns.css, on the lozenge inside its row): none over a list's first row, and
   * over each one after it from under the name to the row's far padding, a hairline, in one colour on every list.
   */
  test("a hairline parts two rows of every list, from under the name, in one colour", async ({ page }) => {
    test.slow(); // seven pages, each opened and read whole
    type Rule = { first: string; left: number; right: number; height: number; colour: string; name: number };
    const rules: Record<string, Rule> = {};
    // A row's line is drawn on the row, or on the part of it named (a message's lozenge, inset from its row's sides).
    const read = async (hash: string, rowSel: string, nameSel: string, label: string, drawnOn?: string) => {
      await page.goto(`/#/${hash}`);
      await page.waitForLoadState("networkidle");
      // The first two rows of the list that stand one after the other: a group's head between two parts them itself.
      const rule = await page.locator(rowSel).evaluateAll(
        (els, sels) => {
          const lineOf = (row: Element) => (sels.drawnOn ? row.querySelector(sels.drawnOn) : row) ?? row;
          const at = els.findIndex((el, i) => els[i + 1]?.previousElementSibling === el);
          if (at < 0) return null;
          const row = lineOf(els[at + 1]);
          const line = getComputedStyle(row, "::after");
          const words = row.querySelector(sels.name);
          return {
            first: getComputedStyle(lineOf(els[0]), "::after").content,
            left: Math.round(Number.parseFloat(line.left)),
            right: Math.round(Number.parseFloat(line.right)),
            height: Number.parseFloat(line.height),
            colour: line.backgroundColor,
            name: words ? Math.round(words.getBoundingClientRect().left - row.getBoundingClientRect().left) : -1,
          };
        },
        { name: nameSel, drawnOn },
      );
      if (rule) rules[label] = rule; // a list of one row has nothing to part
    };
    await read("inbox", ".ix-thread", ".ix-thread-who", "the Inbox");
    await read("conversations", ".cv-row", ".cv-row-who", "Conversations");
    await read("live", ".lm-row", ".lm-row-who", "Live");
    await read("clients", ".pl-table tbody tr.pl-card-row", ".list-row-name", "People");
    await read("clients/leads", ".pl-table tbody tr.pl-card-row", ".list-row-name", "Leads");
    await read("campaigns", ".sq-group > .list-row", ".list-row-name", "Sequences");
    await read("templates", ".msg-list > .msg-row", ".msg-row-title", "Messages", ".msg-row-line");
    const seen = Object.entries(rules);
    test.skip(seen.length === 0, "this workspace has no list of two rows");
    const [first, firstRule] = seen[0];
    for (const [label, rule] of seen) {
      expect(rule.first, `${label}'s first row has no line over it`).toBe("none");
      expect(rule.left, `${label}'s line starts under the name`).toBe(rule.name);
      expect(rule.right, `${label}'s line ends at --row-pad-x`).toBe(16);
      expect(rule.height, `${label}'s line is a hairline`).toBe(1);
      expect(rule.colour, `${label}'s line is ${first}'s colour`).toBe(firstRule.colour);
      expect(rule.colour, `${label}'s line is drawn`).not.toBe("rgba(0, 0, 0, 0)");
    }
  });

  /**
   * One strip for every page's views (25 Sep). On a phone the Inbox's and People's tabs stood in a strip 4px taller
   * than Campaigns', 2px apart where Campaigns' were 4px, with their words a pixel above the middle and the strip's
   * side at 12px where the rows' gutter is 16; and Campaigns' underline was ink where theirs is the accent. Ruben kept
   * Campaigns' spacing and the others' accent. This holds them to one strip: its height and side, a tab's height
   * and where its words sit, the step to the next tab, and the underline under the one picked. Campaigns' three tabs
   * went with its strip (3 Oct 2026), and its strip came back as Sequences | Messages (decision 0060), the same strip.
   */
  test("the section tabs are one strip: the Inbox's views, People's scopes and Settings' sections", async ({
    page,
  }) => {
    const shapeOf = async (strip: Locator) =>
      await strip.evaluate((el) => {
        const s = el.getBoundingClientRect();
        const tabs = [...el.querySelectorAll<HTMLElement>(".stabs-tab")];
        const t = tabs[0].getBoundingClientRect();
        // Where the words are, not the box: a Range over the label's own text (a tab can carry a count after it).
        const label = [...tabs[0].childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())!;
        const range = document.createRange();
        range.selectNodeContents(label);
        const w = range.getBoundingClientRect();
        const picked = tabs.find((b) => b.classList.contains("active"));
        return {
          height: Math.round(s.height),
          side: Math.round(t.left - s.left),
          tab: Math.round(t.height),
          words: Math.round(w.left - t.left),
          middle: Math.round((w.top + w.bottom) / 2 - t.top),
          step: Math.round(tabs[1].getBoundingClientRect().left - t.right),
          underline: picked ? getComputedStyle(picked).borderBottomColor : null,
          // Nothing that holds it scrolls: what scrolls is what a pull down drags, and People's strip went with its rows.
          inScroller: (() => {
            for (let n = el.parentElement; n; n = n.parentElement) {
              const oy = getComputedStyle(n).overflowY;
              if (oy === "auto" || oy === "scroll") return true;
            }
            return false;
          })(),
        };
      });
    const shapes: [string, Awaited<ReturnType<typeof shapeOf>>][] = [];
    for (const [label, hash, strip] of [
      // The Inbox's strip stands on every view, the list's included (Ruben, 2 Oct 2026); it is read over Conversations,
      // where the list's buckets do not stand under it.
      ["the Inbox's views", "conversations", page.locator(".stabs.stabs-inbox")],
      ["People", "clients", page.getByTestId("people-scope")],
      // Settings has no strip on a phone since 17 Oct 2026: it opens on its list of sections (settings/frame/list.tsx).
    ] as const) {
      await page.goto(`/#/${hash}`);
      await page.waitForLoadState("networkidle");
      await expect(strip, `${label} draws its strip`).toBeVisible();
      shapes.push([label, await shapeOf(strip)]);
    }
    // The accent as the page resolves it, in the notation getComputedStyle gives a border.
    const accent = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--accent)";
      document.querySelector(".app-root")!.appendChild(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    const [first, firstShape] = shapes[0];
    // The Inbox's and People's strips stand beside the page's act and give 4px of each tab's side to it (components.css,
    // "Beside the act the strip has 44px less"); Settings' has no act beside it, so a tab's words sit further in there.
    // The Inbox's act says a word since #1508 ("+ New": a plus alone said nothing), and beside that capsule its strip
    // gives 2px more of each side, so its three views still stand on one line on a phone 360 wide. So that one measure
    // is held between the two that share the row with an act: People's words start 2px further in than the Inbox's.
    const { words: firstWords, ...firstRest } = firstShape;
    for (const [label, shape] of shapes.slice(1)) {
      const { words, ...rest } = shape;
      expect(rest, `the strip on ${label} is the one on ${first}`).toEqual(firstRest);
      if (label === "People")
        expect(words - firstWords, `a tab's words on ${label} start 2px further in than on ${first}`).toBe(2);
    }
    expect(
      Math.abs(firstShape.middle - firstShape.tab / 2),
      "a tab's words sit in the middle of it (Glass draws the strip as one capsule)",
    ).toBeLessThanOrEqual(1);
    expect(firstShape.underline, "the tab picked is underlined in the accent").toBe(accent);
    expect(firstShape.inScroller, "the strip stands over what scrolls: a pull down moves the rows, never it").toBe(
      false,
    );
  });

  /**
   * Every list pulls under a thumb, however short (25 Sep). A list rubber-bands on a touch screen only when it holds
   * more than its box: Needs you with two threads and Live with no calls could not be pulled at all, where
   * Conversations could, and Live's panel cut its last lines off with no way to scroll to them. On a phone the window
   * scrolls a page's list (mobile.css, "The window scrolls"), and the window gives way under a thumb however short the
   * page: the list is no box of its own there, and nothing holds the window's pull. A page that holds still keeps its
   * own scroller (Live), which holds a pixel more than its box (mobile.css, "Every list pulls"), so a short list gives
   * way as a long one does.
   */
  test("every list pulls under a thumb, however short: the Inbox's views, People's scopes and Campaigns' rooms", async ({
    page,
  }) => {
    const pulls: Record<string, boolean> = {};
    for (const [hash, sel, own] of [
      ["inbox", ".ix-threads", false],
      ["conversations", ".cv-rows", false],
      ["live", ".lm-list", true],
      ["live", ".lm-panel", true],
      ["clients", ".cl-main-scroll", false],
      ["clients/leads", ".cl-main-scroll", false],
      ["clients/pipeline", ".cl-main-scroll", false],
      // Sequences' list, as Messages' is (parts/split.tsx CmSplit).
      ["campaigns/sequences", ".sq-page > .cm-list", false],
      // Messages' list (parts/split.tsx CmSplit: .cm-list), where .rp-body is its failed state.
      ["messages", ".tpl-page > .cm-list", false],
    ] as const) {
      await page.goto(`/#/${hash}`);
      await page.waitForLoadState("networkidle");
      const box = page.locator(sel).first();
      // A surface this workspace (or the local harness) does not draw, or a pane a phone leaves out while nothing is open.
      if ((await box.count()) === 0 || !(await box.isVisible())) continue;
      pulls[`${hash} ${sel}`] = await box.evaluate((el, ownBox) => {
        const oy = getComputedStyle(el).overflowY;
        const scrolls = oy === "auto" || oy === "scroll";
        if (ownBox) return scrolls && el.scrollHeight > el.clientHeight;
        return !scrolls && getComputedStyle(document.documentElement).overscrollBehaviorY !== "none";
      }, own);
    }
    test.skip(Object.keys(pulls).length === 0, "no list drawn here");
    for (const [where, ok] of Object.entries(pulls)) expect(ok, `${where} gives way under a thumb`).toBe(true);
  });

  /**
   * A thumb's press area where the look is smaller (25 Sep). These keep the size they are drawn at and answer a press
   * toward 44px, as far as the controls around each leave room (mobile.css, "A thumb's press area"): walked outward from
   * the drawn box, one pixel at a time, while a point still lands on the control.
   */
  test("small controls answer a thumb past the size they are drawn at", async ({ page }) => {
    const pressOf = (el: Element) => {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const walk = (dx: number, dy: number) => {
        let k = 0;
        while (k < 40) {
          const x = dx ? (dx < 0 ? r.left - k - 1 : r.right + k + 1) : cx;
          const y = dy ? (dy < 0 ? r.top - k - 1 : r.bottom + k + 1) : cy;
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(el === hit || el.contains(hit))) break;
          k += 1;
        }
        return k;
      };
      return { w: Math.round(r.width + walk(-1, 0) + walk(1, 0)), h: Math.round(r.height + walk(0, -1) + walk(0, 1)) };
    };
    const seen: string[] = [];
    const check = async (hash: string, sel: string, side: "w" | "h", atLeast: number) => {
      await page.goto(`/#/${hash}`);
      await page.waitForLoadState("networkidle");
      const el = page.locator(sel).first();
      if ((await el.count()) === 0) return; // nothing of that kind on this workspace
      const press = await el.evaluate(pressOf);
      expect(press[side], `${hash} ${sel}: ${JSON.stringify(press)}`).toBeGreaterThanOrEqual(atLeast);
      seen.push(sel);
    };
    await check("campaigns", '[data-testid="cmh-open"]', "h", 42);
    await check("broadcasts", '[data-testid="bc-open-who"]', "h", 42);
    await check("messages", '[data-testid="template-open"]', "h", 42);
    // The crumb's row clips what passes its edge: 38 is the room it has.
    await check("conversations", "button.crumb-link", "w", 37);
    test.skip(seen.length === 0, "none of these drawn here");
  });

  /**
   * Reports' date range stands over what scrolls (25 Sep): it is the head's act now, a capsule beside the strip of lenses
   * that says what the page is on (6 and 9 Oct), in the frame's top, which stands over the page as the window scrolls it
   * (mobile.css, "The window scrolls"), and only the charts scroll, edge to edge.
   */
  test("Reports' period stands over the charts, and only they scroll", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const open = page.getByTestId("reports-period-open");
    test.skip((await open.count()) === 0, "no Reports on this workspace");
    const shape = await open.evaluate(async (el) => {
      let scrolls = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === "auto" || oy === "scroll") scrolls = true;
      }
      const body = document.querySelector(".rpt-body") as HTMLElement;
      const before = el.getBoundingClientRect().top;
      window.scrollBy(0, 300);
      await new Promise((r) => setTimeout(r, 50));
      const after = el.getBoundingClientRect().top;
      const b = body.getBoundingClientRect();
      const strip = document.querySelector('[data-testid="reports-lenses"]')?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        scrolls,
        still: Math.round(after - before),
        edge: [Math.round(b.left), Math.round(innerWidth - b.right)],
        beside: !!strip && r.left >= strip.right && Math.abs(r.top + r.height / 2 - (strip.top + strip.height / 2)) < 4,
      };
    });
    expect(shape.scrolls, "the period stands over what scrolls").toBe(false);
    expect(shape.still, "and holds its place as the charts scroll").toBe(0);
    expect(shape.edge, "the charts scroll edge to edge").toEqual([0, 0]);
    expect(shape.beside, "a capsule beside the strip of lenses, on its line").toBe(true);
  });

  /**
   * A strip wider than a phone scrolls across, and the view picked stands inside it (6 Oct 2026): Reports' six lenses
   * passed the screen's edge, and on Reviews the strip stood at its start, with the lens picked out of sight.
   */
  test("the lens picked stands inside a strip wider than the phone", async ({ page }) => {
    await page.goto("/#/reports/reviews");
    await page.waitForLoadState("networkidle");
    const strip = page.getByTestId("reports-lenses");
    test.skip((await strip.count()) === 0, "no Reports on this workspace");
    const shape = () =>
      strip.evaluate((el) => {
        const s = el.getBoundingClientRect();
        const t = (el.querySelector(".stabs-tab.active") as HTMLElement).getBoundingClientRect();
        return { wider: el.scrollWidth > el.clientWidth, inside: t.left >= s.left - 1 && t.right <= s.right + 1 };
      });
    test.skip(!(await shape()).wider, "the strip fits this phone");
    // Asked until the strip has scrolled the lens into view: it glides there as the page lands.
    await expect
      .poll(async () => (await shape()).inside, { message: "REGRESSION: the lens picked stood past the screen's edge" })
      .toBe(true);
  });

  /**
   * A note is dismissed with a thumb (25 Sep). Its × waited for a pointer to hover the row, so on a phone it was
   * invisible and took no press (48 notes, and only Mark all read cleared them). On a touch screen it stands in each
   * row at its own size, with a press area a thumb wide, and the time beside it rather than under it. Read, not
   * pressed: a dismissal is kept for the person, and the nightly's feed is shared.
   */
  test("the bell's × is there on a phone, its own size, a thumb wide to press, and clear of the time", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const pop = page.getByRole("dialog", { name: "Notifications" });
    await expect(pop).toBeVisible();
    const row = pop.locator(".tbn-item:not(.tbn-item-group)").first();
    test.skip((await row.count()) === 0, "all caught up on this workspace");
    const shape = await row.locator(".tbn-x").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const y = r.top + r.height / 2;
      // 16px either side of its middle: past the 22px it shows, inside the thumb's width it answers to.
      const hits = [-16, 16].map((dx) => el.contains(document.elementFromPoint(r.left + r.width / 2 + dx, y)));
      const time = el.closest(".tbn-item")!.querySelector(".tbn-time");
      const t = time ? time.getBoundingClientRect() : null;
      return {
        opacity: cs.opacity,
        events: cs.pointerEvents,
        width: Math.round(r.width),
        hits,
        clear: t ? t.right <= r.left : true,
      };
    });
    expect(shape.opacity, "shown without a hover").toBe("1");
    expect(shape.events, "and it takes a press").toBe("auto");
    expect(shape.width, "at its own size").toBeLessThanOrEqual(24);
    expect(shape.hits, "a thumb wide around it").toEqual([true, true]);
    expect(shape.clear, "the time stands beside it, not under it").toBe(true);
  });

  /**
   * On a phone the bell's notes are a sheet from the bottom, as every other sheet there is (25 Sep): edge to edge, a
   * handle, and a thumb pulls it down to close (data-bits touchSwipe). It was a 568px popover hung from the top bar, as
   * far from the thumb as the screen allows. A real touch through the browser's own input (CDP), as Ask's is pulled.
   */
  test("the bell's notes are a sheet from the bottom, and a thumb pulls it down to close", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await bell.click();
    const pop = page.getByRole("dialog", { name: "Notifications" });
    await expect(pop).toBeVisible();
    const size = page.viewportSize()!;
    const edges = async () => {
      const b = (await pop.boundingBox())!;
      return [Math.round(b.x), Math.round(b.x + b.width), Math.round(b.y + b.height)];
    };
    await expect.poll(edges, { message: "edge to edge, on the bottom" }).toEqual([0, size.width, size.height]);
    await expect(pop.locator(".tbn-handle")).toBeVisible();
    const y = Math.round((await pop.boundingBox())!.y) + 20;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: y + 80 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: y + 220 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(pop).toHaveCount(0);
    await expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  /**
   * A note is a list row (25 Sep): two single lines and a time at the Inbox's numbers, the note itself the press, no
   * row of buttons under it. They were 114 to 182px each, 48 of them in a 6,677px list, each with its own boxed button.
   */
  test("the bell's notes are rows a thumb scans: one press each, two lines, no taller than the Inbox's", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const pop = page.getByRole("dialog", { name: "Notifications" });
    await expect(pop).toBeVisible();
    test.skip((await pop.locator(".tbn-item").count()) === 0, "all caught up on this workspace");
    const shape = await pop.evaluate((el) =>
      [...el.querySelectorAll(".tbn-item")].map((n) => ({
        h: Math.round(n.getBoundingClientRect().height),
        presses: n.querySelectorAll("button:not(.tbn-x)").length,
      })),
    );
    for (const n of shape) {
      expect(n.h, "a note is no taller than an Inbox row").toBeLessThanOrEqual(80);
      expect(n.presses, "and is one press").toBe(1);
    }
    const head = await pop
      .locator(".tbn-sec")
      .first()
      .evaluate((el) => getComputedStyle(el).textTransform);
    expect(head, "a section says its name in sentence case").toBe("none");
    // It scrolls down and nowhere else: no width to drag it sideways, no rubber band at its ends (25 Sep).
    const list = await pop.locator(".tbn-list").evaluate((el) => ({
      extra: el.scrollWidth - el.clientWidth,
      x: getComputedStyle(el).overflowX,
      touch: getComputedStyle(el).touchAction,
      over: getComputedStyle(el).overscrollBehaviorY,
    }));
    expect(list).toEqual({ extra: 0, x: "hidden", touch: "pan-y", over: "none" });
  });

  /**
   * A thumb slides a note (25 Sep): a short slide left or right follows the finger and settles the note back, nothing
   * dismissed or read (a long one dismisses or marks read, which bell-rows.test.mjs proves; a dismissal here is kept for
   * the person). The × is its own 22px, and the list holds still under the sheet's pull. Real touches (CDP).
   */
  test("a thumb slides a note and a short slide settles it back; the × is its own size; the list holds still", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const pop = page.getByRole("dialog", { name: "Notifications" });
    await expect(pop).toBeVisible();
    const note = pop.locator(".tbn-item:not(.tbn-item-group)").first();
    test.skip((await note.count()) === 0, "all caught up on this workspace");
    expect(await pop.locator(".tbn-list").evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("none");
    const x = (await note.locator(".tbn-x").boundingBox())!;
    expect([Math.round(x.width), Math.round(x.height)], "the × at its own size").toEqual([22, 22]);
    const before = await pop.locator(".tbn-item").count();
    const box = (await note.boundingBox())!;
    const y = Math.round(box.y + box.height / 2);
    const moved = () => note.evaluate((el) => el.style.transform || "");
    await swipeAcross(page, 250, 220, y);
    await expect.poll(moved, { message: "left 30px: back where it was" }).toMatch(/^(|translate3d\(0, 0, 0\))$/);
    await swipeAcross(page, 200, 230, y);
    await expect.poll(moved, { message: "right 30px: back where it was" }).toMatch(/^(|translate3d\(0, 0, 0\))$/);
    await page.waitForTimeout(300);
    expect(await pop.locator(".tbn-item").count(), "nothing dismissed").toBe(before);
    await expect(note).toBeVisible();
  });

  /**
   * The Calendar holds its bar and walks its days (25 Sep). Its range, steps and views scrolled away with the days, and
   * a pull dragged them, as People's strip did before #1041: now the bar stands over a pane that holds still (8 Oct
   * 2026: the board takes the room the page leaves, so nothing of the page is under the tab bar to scroll to, and the
   * pane never pulls), and a swipe across the days walks to the next or previous days, as the steps do. The views keep
   * their 38px look, with 44px to press.
   */
  test("the Calendar's bar stays over its days, a swipe walks them, and its views are a thumb tall to press", async ({
    page,
  }) => {
    await page.goto("/#/calendar");
    await page.waitForLoadState("networkidle");
    const range = page.getByTestId("cal-range");
    await expect(range).toBeVisible();
    const barScrolls = await page.getByTestId("cal-bar").evaluate((el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === "auto" || oy === "scroll") return true;
      }
      return false;
    });
    expect(barScrolls, "the bar stands over what scrolls").toBe(false);
    const still = await page
      .getByTestId("cal-pane")
      .evaluate((el) => getComputedStyle(el).overscrollBehaviorY === "none" && el.scrollHeight <= el.clientHeight + 1);
    expect(still, "the pane holds still: nothing of it is off the screen, and it never pulls").toBe(true);
    const tall = await page.getByTestId("cal-view-week").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      return (
        el.contains(document.elementFromPoint(x, r.top - 2)) && el.contains(document.elementFromPoint(x, r.bottom + 2))
      );
    });
    expect(tall, "a view is pressed 2px over and under its edge").toBe(true);
    const before = await range.innerText();
    await swipeAcross(page, 300, 90, 520);
    await expect(range, "a swipe left is the next days").not.toHaveText(before);
    await swipeAcross(page, 90, 300, 520);
    await expect(range, "and a swipe right comes back").toHaveText(before);
  });

  /**
   * A swipe across the page walks its strip (25 Sep, docs/superpowers/specs/2026-09-25-swipe-between-tabs-design.md):
   * the page follows the thumb, and let go past a third of the screen the tab beside is pressed; before the first tab
   * there is nothing to go to. Real touches through the browser's own input (CDP), as today.spec.ts pulls Ask down.
   */
  test("a swipe across the page walks its strip: the Inbox, People and Settings, and never past an end", async ({
    page,
  }) => {
    const swipe = (from: number, to: number) => swipeAcross(page, from, to);
    const inbox = page.locator(".stabs.stabs-inbox .stabs-tab.active");
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(inbox).toHaveText(/^Needs you/);
    await swipe(300, 90);
    await expect(page).toHaveURL(atRoute(/^conversations/));
    await expect(inbox).toHaveText(/^Conversations/);
    await swipe(90, 300);
    await expect(page).toHaveURL(atRoute(/^inbox/));
    await expect(inbox).toHaveText(/^Needs you/);
    await swipe(90, 300);
    await page.waitForTimeout(800);
    await expect(page, "nothing before the first tab").toHaveURL(atRoute(/^inbox$/));

    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("people-scope")).toBeVisible();
    await swipe(300, 90);
    // The address is the tab's own route: the Leads view draws its strip once Leads is read.
    await expect(page).toHaveURL(atRoute(/^clients\/leads/));

    // Campaigns is Sequences, its strip Sequences | Messages (decision 0060): its address lands on the first tab, lit.
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));
    await expect(page.locator(".stabs.stabs-campaigns")).toBeVisible();
    await expect(page.getByTestId("campaigns-view-sequences")).toHaveAttribute("aria-current", "page");

    // Settings on a phone is a list of its sections, not a strip (17 Oct 2026): a row opens its section as a page, and
    // the way back is the list, where it opened Business again when the sections were a strip of nine.
    await page.goto("/#/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("set-list")).toBeVisible();
    await expect(page.locator(".stabs-settings")).toHaveCount(0);
    await page.getByTestId("set-list-team").tap();
    await expect(page).toHaveURL(atRoute(/^admin\/team$/));
    await page.locator(".pg-back").tap();
    await expect(page).toHaveURL(atRoute(/^admin$/));
    await expect(page.getByTestId("set-list")).toBeVisible();
  });

  /**
   * A touch under a strip keeps the axis it began on (9 Oct 2026, Ruben's recording of Reports): a swipe across that
   * drifts down walks the strip and scrolls nothing, and a scroll down that drifts across scrolls and walks nothing.
   * The reader chose one axis at 8px from the start (data-bits touchSwipe), but the browser was told nothing of it and
   * panned the page's list under a page already moving sideways, so a thumb could carry the page in circles. Each
   * strip page's phone scroller says `touch-action: pan-y` (components.css; swipe-axis.test.mjs holds the list), and
   * the browser keeps to the axis it was given, as a phone's own pagers do. Real touches through CDP, as the swipe
   * above; the scroll is read while the finger is still down, before the page the swipe lands on is drawn.
   */
  test("a touch under a strip keeps its axis: a swipe that drifts down scrolls nothing, a scroll that drifts across walks nothing", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const body = page.locator(".rpt-body");
    test.skip((await body.count()) === 0, "no Reports on this workspace");
    // The window scrolls the body on a phone (mobile.css, "The window scrolls"); touch-action is still the body's.
    const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    test.skip(room < 60, "Reports' Overview does not scroll on this workspace");
    const lit = page.getByTestId("reports-lenses").locator(".stabs-tab.active");
    await expect(lit).toHaveText(/^Overview/);
    /** A thumb from one point to another through the browser's own input, in eight moves; `read` before it lets go. */
    const drift = async (from: [number, number], to: [number, number], read: () => Promise<number>) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from[0], y: from[1] }] });
      for (let i = 1; i <= 8; i += 1) {
        const x = from[0] + ((to[0] - from[0]) * i) / 8;
        const y = from[1] + ((to[1] - from[1]) * i) / 8;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      }
      const held = await read();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      return held;
    };
    const scrolled = () => page.evaluate(() => window.scrollY);
    // Across first (the first move is wider than it is tall), then down by two thirds as much: the page walks, the
    // body stands.
    const whileAcross = await drift([300, 420], [96, 560], scrolled);
    expect(whileAcross, "a swipe that drifts down scrolls nothing while the finger is down").toBe(0);
    await expect(lit, "and still walks the strip").toHaveText(/^Receptionist/);
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    await expect(lit).toHaveText(/^Overview/);
    // Down first (the first move is taller than it is wide), then across by half as much: the body scrolls, the page
    // stands.
    const whileDown = await drift([300, 560], [200, 380], scrolled);
    expect(whileDown, "a scroll that drifts across still scrolls").toBeGreaterThan(20);
    await page.waitForTimeout(600);
    await expect(lit, "and walks nothing").toHaveText(/^Overview/);
  });

  /**
   * Settings holds still under a pull (25 Sep, Ruben): a thumb moves a Settings page sideways, to the tab beside it,
   * and never down. Each page still scrolls through what it holds, but none stretches past its top or its foot, and
   * while Settings is open the screen around it does not either (a short page, or the strip, would otherwise hand the
   * pull to the screen: iOS bounces it, Android reloads it). Every list elsewhere gives way under a thumb on purpose
   * ("every list pulls"), so the screen is left as it was on every other page.
   */
  test("no Settings page gives way under a pull: its pane stops at its top and foot, and so does the screen", async ({
    page,
  }) => {
    const held = () =>
      page.evaluate(() =>
        [document.querySelector(".set-pane"), document.documentElement, document.body].map((n) =>
          n ? getComputedStyle(n).overscrollBehaviorY : "missing",
        ),
      );
    for (const pane of ["workspace", "team", "notifications"]) {
      await page.goto(`/#/admin/${pane}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".set-pane")).toBeVisible();
      expect(await held(), pane).toEqual(["none", "none", "none"]);
    }
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".set-pane")).toHaveCount(0);
    expect(await held(), "People: the screen as it was").toEqual(["missing", "auto", "auto"]);
  });

  /**
   * A switch holds still (23 Sep). With History's tabs parked under the top bar, Consent put them 328px further down a
   * phone and Visits 439px: a shorter list made the page shorter and the browser pulled the scroll back to fit
   * (data-bits holdStill now holds it). And the head starts at the page's edge: the way back is the top bar's crumb.
   */
  test("a person's head starts at the page's edge with the way back in the top bar, and History's tabs hold still under the thumb", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const ids = await page.evaluate(() =>
      ((window as unknown as { __PEOPLE?: { rows: { id: string }[] } }).__PEOPLE?.rows ?? [])
        .slice(0, 8)
        .map((r) => r.id),
    );
    test.skip(ids.length === 0, "nobody on this workspace");
    let tabs = 0;
    for (const id of ids) {
      await page.goto(`/#/clients/${id}`);
      await expect(page.getByTestId("person-now")).toBeVisible();
      await page.waitForLoadState("networkidle");
      tabs = await page.locator(".cl-tl-filters .subtab").count();
      if (tabs > 2) break;
    }
    await expect(page.locator(".cl-prof-back")).toBeHidden();
    // In Glass the way back stands where the date does, in the top bar's row (kit/head/frame-head.tsx): ‹ People.
    await expect(page.locator(".pg-back")).toContainText("People");
    // Its capsule is the height of what stands at the bar's right, on its line: the bell, or, for a person opened from
    // the list, their ‹ › in the bell's place (the bell stands down while it is there, #1578). A touch screen's floor for
    // a button once drew it 44px, twelve taller than the bell beside it (7 Oct 2026); the 44px a thumb needs is a margin
    // round it instead.
    const back = (await page.locator(".pg-back").boundingBox())!;
    const walk = page.locator(".pg-back-after");
    const right = (await walk.count()) > 0 ? walk : page.getByRole("button", { name: /^Notifications/ });
    const bell = (await right.boundingBox())!;
    expect(
      [Math.round(back.y), Math.round(back.height)],
      "the way back is as tall as what stands at the bar's right, on its line",
    ).toEqual([Math.round(bell.y), Math.round(bell.height)]);
    const underThumb = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest(".pg-back"),
      [back.x + back.width / 2, back.y + back.height + 5],
    );
    expect(underThumb, "a thumb a little under the capsule still presses it").toBe(true);
    const face = (await page.locator(".cl-prof-id .face").first().boundingBox())!;
    expect(face.x, "the face stands at the page's gutter, not after an arrow of its own").toBeLessThanOrEqual(17);
    test.skip(tabs <= 2, "no one here has a History with more than one kind in it");
    const strip = page.locator(".cl-tl-filters");
    // The window scrolls a person's page on a phone (mobile.css, "The window scrolls").
    await page.locator(".cl-profile").evaluate((box) => {
      const s = box.querySelector(".cl-tl-filters");
      if (s) window.scrollBy(0, s.getBoundingClientRect().top - 120);
    });
    const top = async () => Math.round((await strip.boundingBox())!.y);
    const start = await top();
    for (const tab of await strip.locator(".subtab").all()) {
      const word = (await tab.textContent())?.trim();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      expect(Math.abs((await top()) - start), `${word} moved the tabs from under the thumb`).toBeLessThanOrEqual(1);
    }
    await page.locator(".pg-back").click();
    await expect.poll(() => routeOf(page.url())).toBe("clients");
  });

  /** A door is a link (23 Sep): who a thread is with opened their page only from the Actions menu. */
  test("a thread's header names who it is with as a link to their page, a thumb tall", async ({ page }) => {
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    const row = page.locator(".ix-thread").first();
    test.skip((await row.count()) === 0, "no thread on this workspace");
    await row.click();
    await expect(page.locator(".ix-th-head").first()).toBeVisible();
    const who = page.getByTestId("ix-th-person").first();
    test.skip((await who.count()) === 0, "the first thread is with no one in People");
    await expect(who).toHaveAttribute("href", /\/people\/[\w-]+$/);
    // In Glass the header is one 52px pill and who it is stands 36px tall inside it, the face and two lines at its
    // height; a thumb's press reaches the pill's edges (inbox.css). So the press is measured where a finger lands: the
    // rows down the link's middle whose press is the link's.
    const press = await who.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      let rows = 0;
      for (let y = Math.floor(r.top) - 20; y <= Math.ceil(r.bottom) + 20; y++) {
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) rows++;
      }
      return rows;
    });
    expect(press, "the face, the name and the line under it, a thumb tall").toBeGreaterThanOrEqual(40);
    await who.click();
    await expect.poll(() => routeOf(page.url())).toMatch(/^clients\/[\w-]+$/);
    await expect(page.locator(".cl-profile")).toBeVisible();
  });
});
