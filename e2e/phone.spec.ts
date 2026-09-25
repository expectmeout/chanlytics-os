import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

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
    expect(json.name).toBe("Chanlytics OS");
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
      .getByRole("button")
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
    await expect
      .poll(async () => (await sidebar.boundingBox())?.x, { message: "the drawer slides in to the edge" })
      .toBe(0);
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

  test("the tab bar replaces the menu button, and the Inbox shows one pane at a time", async ({ page }) => {
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("phone-tabs")).toBeVisible();
    await expect(page.locator(".tb-menu")).toBeHidden();
    // The four places a thumb reaches, and what is NOT among them: a call is
    // live for minutes a week, so it is a bar while it is happening rather
    // than a slot that is empty the rest of the time. Calendar took it.
    const tabs = page.getByTestId("phone-tabs").getByRole("button");
    await expect(tabs).toHaveText(["Today", "Inbox", "Calendar", "People", "More"]);
    await tabs.filter({ hasText: "Calendar" }).click();
    await expect(page).toHaveURL(/#\/calendar/);
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
      const chip = page.locator(".ix-bucket", { hasText: name }).first();
      if ((await chip.count()) === 0) continue;
      await chip.click();
      await expect(chip, `${name} is the bucket on screen`).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".ix-list"), `${name} shows its list`).toBeVisible();
      await expect(page.locator(".ix-thread-pane"), `${name} opens no conversation`).toBeHidden();
    }
  });

  test("the tab bar navigates, and Conversations takes turns too", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("phone-tabs").getByRole("button", { name: "People" }).click();
    await expect(page).toHaveURL(/#\/clients/);
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
   * Broadcasts had no phone case at all, and its primary control was off the
   * screen: .bc-actions is a flex row with no wrap, its children need 491px, the
   * page column is 283px, and .main-scroll is overflow-x: hidden -- so "Send
   * now" sat 208px past the right edge with no scrollbar to reach it. A case
   * that only looks for the button would have passed the whole time.
   *
   * The page opens on the ledger now, and the send is its own screen behind New
   * broadcast (#758), so both are measured: the ledger, with its act on the
   * first screen, then the send. Links too, since the ledger's "Print a desk
   * sign" and "Download QR" are links drawn as buttons.
   */
  test("Campaigns: every control on Broadcasts is inside the screen, and the page opens on the work", async ({
    page,
  }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("broadcasts-real");
    await expect(real).toBeVisible();
    const width = page.viewportSize()?.width ?? 390;
    const insideTheScreen = async (screen: Locator) => {
      for (const el of await screen.getByRole("button").or(screen.getByRole("link")).all()) {
        const box = await el.boundingBox();
        if (!box) continue;
        expect(
          box.x + box.width,
          `${(await el.textContent())?.trim()} runs off a ${width}px screen`,
        ).toBeLessThanOrEqual(width + 1);
      }
      // Nothing scrolls sideways: the row wraps rather than being clipped.
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, "the page scrolls sideways").toBeLessThanOrEqual(1);
    };
    // The work first: New broadcast whole on the first screen, and not the
    // seeded page's title block (.ct-h2) under a top bar that already says Broadcasts.
    await expect(real.getByTestId("bc-new")).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".ct-h2")).toHaveCount(0);
    await insideTheScreen(real);
    await real.getByTestId("bc-new").click();
    const composer = real.getByTestId("bc-composer");
    await expect(composer).toBeVisible();
    await insideTheScreen(composer);
  });

  /**
   * Live's call panel head wraps before it squeezes. Its titles were `flex: 1` beside controls that would
   * not shrink, so on a phone the name had ~90px and the meta line's number and start time fell into
   * columns one word wide. With nobody on the line the panel still opens on the last call, so the head is
   * there whenever the workspace has had a call at all. Read-only: nothing here is pressed.
   */
  test("Live: the call panel's head gives the name the width, and each fact stays on one line", async ({ page }) => {
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("live-real")).toBeVisible();
    const head = page.locator(".lm-head").first();
    test.skip((await head.count()) === 0, "no call on this workspace yet: no panel head to measure");
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
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    // The send is its own screen, behind New broadcast.
    await page.getByTestId("bc-new").click();
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
    for (const id of ["people-phone-lists", "people-phone-search-open"])
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
      "the first person is on the first screen, under one bar and one line",
    ).toBeLessThan(240);
    const face = (await row.locator(".pl-card-face").boundingBox())!;
    expect(Math.abs(face.width - face.height), "a face is round").toBeLessThanOrEqual(1);
    expect(
      (await row.locator(".pl-card > .pill").boundingBox())!.height,
      "a state is a pill, not a 36px button",
    ).toBeLessThanOrEqual(22);
    // Search: the bar becomes the field, at 16px (a phone zooms into anything smaller), and Cancel gives it back.
    await bar.getByTestId("people-phone-search-open").click();
    const field = page.getByTestId("people-phone-search");
    await expect(field).toBeFocused();
    expect(await field.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByTestId("people-phone-search-cancel").click();
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
    // Add a person: a sheet whose one button is on the screen.
    await bar.locator(".more-wrap > button").click();
    const add = page.getByRole("menuitem", { name: "Add a person" });
    test.skip((await add.count()) === 0, "this member cannot add people");
    await add.click();
    await expect(page.getByTestId("add-person-sheet")).toBeVisible();
    await expect(page.getByTestId("add-person-save")).toBeInViewport({ ratio: 1 });
    await page.getByTestId("add-person-sheet-close").click();
    await expect(page.getByTestId("add-person-sheet")).toHaveCount(0);
  });
  /**
   * A sheet stands on the keyboard (25 Sep). A phone lays its keyboard over the page and keeps the layout's height, so
   * Add a person's Save sat under the keys. The shell says what the keyboard covers as --kb (data-bits watchKeyboard;
   * keyboard-inset.test.mjs proves the measure); here a keyboard 300px tall is said as the phone would say it, and the
   * sheet stands on it, whole, with its Save above the keys, and goes back down when the keyboard goes.
   */
  test("a sheet stands on the keyboard: whole on the screen, its Save above the keys", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const said = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--kb"));
    expect(await said(), "the shell measures it, and no keyboard is up").toBe("0px");
    await page.getByTestId("people-phone-bar").locator(".more-wrap > button").click();
    const add = page.getByRole("menuitem", { name: "Add a person" });
    test.skip((await add.count()) === 0, "this member cannot add people");
    await add.click();
    const sheet = page.getByTestId("add-person-sheet");
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
    const save = (await page.getByTestId("add-person-save").boundingBox())!;
    expect(save.y + save.height, "Save above the keys").toBeLessThanOrEqual(tall - keys);
    await page.evaluate(() => document.documentElement.style.setProperty("--kb", "0px"));
    await expect.poll(foot, { message: "back down when the keyboard goes" }).toBe(tall);
  });
  /**
   * The switch holds two scopes, or three where deals are on (People › Pipeline, 0008), and the bar holds them beside
   * the list, search and the scope's last control at the narrowest phone we draw for: nothing past its edge, nothing
   * scrolled sideways. The nightly workspace answers that its customers book, so it proves the two; a workspace with
   * deals on proves the three, and the Pipeline's own bar.
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
    if ((await pipeline.count()) === 0) return;
    await pipeline.click();
    await expect.poll(() => new URL(page.url()).hash).toBe("#/clients/pipeline");
    await fits("pipeline-phone-bar");
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await fits("leads-phone-bar");
  });
  /**
   * Selecting on a phone (the same spec, 4.5): the face is the checkbox, and a selection is one row standing on the tab
   * bar -- ✕, the count, Add to list and ⋯ -- whose ⋯ opens a sheet with the rest. On 22 Sep the bar was a pill 188px
   * wide at the middle of the screen, its seven controls stacked 312px tall over the rows.
   */
  test("a selection is one row on the tab bar, and ⋯ opens its sheet whole on the screen", async ({ page }) => {
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
    await expect(bar).toContainText("1 selected");
    const vp = page.viewportSize()!;
    const box = (await bar.boundingBox())!;
    expect(box.x, "edge to edge").toBeLessThanOrEqual(0.5);
    expect(box.x + box.width).toBeGreaterThanOrEqual(vp.width - 0.5);
    expect(box.height, "one row").toBeLessThanOrEqual(64);
    expect(await bar.evaluate((el) => el.scrollWidth - el.clientWidth), "nothing past its edge").toBeLessThanOrEqual(1);
    const tabs = (await page.getByTestId("phone-tabs").boundingBox())!;
    expect(box.y + box.height, "it stands on the tab bar, not under it").toBeLessThanOrEqual(tabs.y + 1);
    await bar.getByTestId("bulk-more").click();
    const sheet = page.getByTestId("bulk-sheet");
    await expect(sheet).toBeVisible();
    const rows = sheet.locator(".pp-sheet-row");
    expect(await rows.count(), "the rest of what a selection can become").toBeGreaterThan(0);
    await expect(rows.last()).toBeInViewport({ ratio: 1 });
    await page.getByTestId("bulk-sheet-close").click();
    await expect(sheet).toHaveCount(0);
    await expect(bar, "Cancel shuts the sheet and keeps the selection").toContainText("1 selected");
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
    await read("inbox", ".ix-thread", ".ix-thread-avatar", ".ix-thread-who", "a thread");
    await read("conversations", ".cv-row", ".cv-row-avatar", ".cv-row-who", "a conversation");
    await read("clients", ".pl-table tbody tr.pl-card-row", ".pl-card-face", ".pl-card-name", "a person");
    await read("clients/leads", ".pl-table tbody tr.pl-card-row", ".pl-card-face", ".pl-card-name", "a lead");
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
   * One strip for every page's views (25 Sep). On a phone the Inbox's and People's tabs stood in a strip 4px taller
   * than Campaigns', 2px apart where Campaigns' were 4px, with their words a pixel above the middle and the strip's
   * side at 12px where the rows' gutter is 16; and Campaigns' underline was ink where theirs is the accent. Ruben kept
   * Campaigns' spacing and the others' accent. This holds the three to one strip: its height and side, a tab's height
   * and where its words sit, the step to the next tab, and the underline under the one picked.
   */
  test("the section tabs are one strip: the Inbox's views, People's scopes and Campaigns' tabs", async ({ page }) => {
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
      ["the Inbox", "inbox", page.locator(".stabs.stabs-inbox")],
      ["People", "clients", page.getByTestId("people-phone-scopes")],
      ["Campaigns", "outbound", page.locator(".stabs.stabs-campaigns")],
      ["Settings", "admin/workspace", page.locator(".stabs.stabs-settings")],
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
    for (const [label, shape] of shapes.slice(1))
      expect(shape, `the strip on ${label} is the one on ${first}`).toEqual(firstShape);
    expect(firstShape.side, "the strip starts at the rows' gutter (--row-pad-x)").toBe(16);
    expect(firstShape.middle, "a tab's words sit in the middle of it, over its 2px underline").toBe(
      Math.round((firstShape.tab - 2) / 2),
    );
    expect(firstShape.underline, "the tab picked is underlined in the accent").toBe(accent);
    expect(firstShape.inScroller, "the strip stands over what scrolls: a pull down moves the rows, never it").toBe(
      false,
    );
  });

  /**
   * Every list pulls under a thumb, however short (25 Sep). A list rubber-bands on a touch screen only when it holds
   * more than its box: Needs you with two threads and Live with no calls could not be pulled at all, where
   * Conversations could, and Live's panel cut its last lines off with no way to scroll to them. Each list's scroller
   * holds a pixel more than its box (mobile.css, "Every list pulls"), so a short list gives way as a long one does.
   */
  test("every list pulls under a thumb, however short: the Inbox's views, People's scopes and Campaigns' tabs", async ({
    page,
  }) => {
    const pulls: Record<string, boolean> = {};
    for (const [hash, sel] of [
      ["inbox", ".ix-threads"],
      ["conversations", ".cv-rows"],
      ["live", ".lm-list"],
      ["live", ".lm-panel"],
      ["clients", ".cl-main-scroll"],
      ["clients/leads", ".cl-main-scroll"],
      ["clients/pipeline", ".cl-main-scroll"],
      ["outbound", ".rp-body"],
      ["broadcasts", ".route-view:has(> .bc-page)"],
      ["messages", ".rp-body"],
    ] as const) {
      await page.goto(`/#/${hash}`);
      await page.waitForLoadState("networkidle");
      const box = page.locator(sel).first();
      if ((await box.count()) === 0) continue; // a surface this workspace (or the local harness) does not draw
      pulls[`${hash} ${sel}`] = await box.evaluate((el) => {
        const oy = getComputedStyle(el).overflowY;
        return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight;
      });
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
    await check("outbound", '[data-testid="pb-open"]', "h", 42);
    await check("broadcasts", '[data-testid="bc-open-who"]', "h", 42);
    await check("messages", '[data-testid="template-open"]', "h", 42);
    await check("reports", '[data-testid="reports-ask"]', "w", 40);
    // The crumb's row clips what passes its edge: 38 is the room it has.
    await check("conversations", "button.crumb-link", "w", 37);
    test.skip(seen.length === 0, "none of these drawn here");
  });

  /**
   * Reports' period stands over what scrolls (25 Sep). The head was sticky inside the page's one scroller, so a pull
   * down took it with the charts; now only the body scrolls, edge to edge, and the head holds its place.
   */
  test("Reports' period stands over the charts, and only they scroll", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const head = page.locator(".rpt-head");
    test.skip((await head.count()) === 0, "no Reports on this workspace");
    const shape = await head.evaluate(async (el) => {
      let scrolls = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === "auto" || oy === "scroll") scrolls = true;
      }
      const body = document.querySelector(".rpt-body") as HTMLElement;
      const before = el.getBoundingClientRect().top;
      body.scrollTop = 300;
      await new Promise((r) => setTimeout(r, 50));
      const after = el.getBoundingClientRect().top;
      const b = body.getBoundingClientRect();
      return {
        scrolls,
        still: Math.round(after - before),
        edge: [Math.round(b.left), Math.round(innerWidth - b.right)],
      };
    });
    expect(shape.scrolls, "the head stands over what scrolls").toBe(false);
    expect(shape.still, "and holds its place as the charts scroll").toBe(0);
    expect(shape.edge, "the charts scroll edge to edge").toEqual([0, 0]);
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
    const row = pop.locator(".tbn-item").first();
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
   * The Calendar holds its bar and walks its days (25 Sep). Its range, steps and views scrolled away with the days, and
   * a pull dragged them, as People's strip did before #1041: now only the days scroll and pull, and a swipe across them
   * walks to the next or previous days, as the steps do. The views keep their 38px look, with 44px to press.
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
    const pulls = await page
      .getByTestId("cal-pane")
      .evaluate((el) => getComputedStyle(el).overflowY === "auto" && el.scrollHeight > el.clientHeight);
    expect(pulls, "the days scroll, and pull however few").toBe(true);
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
  test("a swipe across the page walks its strip: the Inbox, People and Campaigns, and never past an end", async ({
    page,
  }) => {
    const swipe = (from: number, to: number) => swipeAcross(page, from, to);
    const inbox = page.locator(".stabs.stabs-inbox .stabs-tab.active");
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(inbox).toHaveText(/^Needs you/);
    await swipe(300, 90);
    await expect(page).toHaveURL(/#\/conversations/);
    await expect(inbox).toHaveText(/^Conversations/);
    await swipe(90, 300);
    await expect(page).toHaveURL(/#\/inbox/);
    await expect(inbox).toHaveText(/^Needs you/);
    await swipe(90, 300);
    await page.waitForTimeout(800);
    await expect(page, "nothing before the first tab").toHaveURL(/#\/inbox$/);

    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("people-phone-scopes")).toBeVisible();
    await swipe(300, 90);
    // The address is the tab's own route: the Leads view draws its strip once Leads is read.
    await expect(page).toHaveURL(/#\/clients\/leads/);

    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".stabs.stabs-campaigns")).toBeVisible();
    await swipe(300, 90);
    await expect(page).toHaveURL(/#\/broadcasts/);

    // Settings' sections are the same strip on a phone (25 Sep): Business, then Team.
    await page.goto("/#/admin/workspace");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".stabs.stabs-settings")).toBeVisible();
    await swipe(300, 90);
    await expect(page).toHaveURL(/#\/admin\/team/);
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
      tabs = await page.locator(".cl-tl-filters .cl-tab").count();
      if (tabs > 2) break;
    }
    await expect(page.locator(".cl-prof-back")).toBeHidden();
    await expect(page.locator(".crumbs .crumb-link").first()).toHaveText("People");
    const face = (await page.locator(".cl-prof-avatar").first().boundingBox())!;
    expect(face.x, "the face stands at the page's gutter, not after an arrow of its own").toBeLessThanOrEqual(17);
    test.skip(tabs <= 2, "no one here has a History with more than one kind in it");
    const strip = page.locator(".cl-tl-filters");
    await page.locator(".cl-profile").evaluate((box) => {
      const s = box.querySelector(".cl-tl-filters");
      if (s) box.scrollTop += s.getBoundingClientRect().top - 120;
    });
    const top = async () => Math.round((await strip.boundingBox())!.y);
    const start = await top();
    for (const tab of await strip.locator(".cl-tab").all()) {
      const word = (await tab.textContent())?.trim();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-pressed", "true");
      expect(Math.abs((await top()) - start), `${word} moved the tabs from under the thumb`).toBeLessThanOrEqual(1);
    }
    await page.locator(".crumbs .crumb-link").first().click();
    await expect.poll(() => new URL(page.url()).hash).toBe("#/clients");
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
    await expect(who).toHaveAttribute("href", /^#\/clients\/[\w-]+$/);
    expect(
      (await who.boundingBox())!.height,
      "the face, the name and the line under it, a thumb tall",
    ).toBeGreaterThanOrEqual(40);
    await who.click();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/clients\/[\w-]+$/);
    await expect(page.locator(".cl-profile")).toBeVisible();
  });
});
