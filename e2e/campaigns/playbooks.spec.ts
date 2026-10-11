import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute } from "../address";
import { apiGet } from "../workspace";
import {
  LIFECYCLE_WORDS,
  VERSION_CHANNEL_WORDS,
  appointmentWordOf,
  journeyOf,
  journeyStageOf,
  type JourneyStageId,
} from "../../packages/contracts/src/index";
import { messagesOffered, momentSlots, type TemplatesRead } from "./offered";

/**
 * Campaigns' home (canvas A, "Lifecycle") on a real workspace: the page that replaced the Playbooks list.
 *
 * The route renders the real page, not the Coming Soon card or the mockup's six invented campaigns: the moments are the
 * journey the workspace follows, with every campaign in the ledger under them, the tiles are what its runs and its People
 * say, and the composer, in a sheet from the side, offers the moments with who each reaches today. A campaign is
 * `campaigns/moment:<id>`, and the ledger's group `campaigns/in:<group>`; every old address (`#/outbound`, `#/outbound/<id>`,
 * `/playbooks`) lands on the home for ever. Nothing is made here: the workspace keeps one campaign once Ask's seed is applied
 * (`tooling/scripts/ops/e2e-workspace.mjs`), a PAUSED Win-back on silence that Ask's evals change, and none before; nothing
 * here resumes, renames or pauses it, every count and state is read from the API's answer, and the composer is cancelled.
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
    const body = (await pb.json()).data as {
      playbooks: { id: string; state: string; trigger: string }[];
      deals_on: boolean;
      calendar?: string | null;
      appointment_word?: string | null;
    };
    const read = (await tpl.json()).data as TemplatesRead;
    const bookingLink = !!(await cfg.json()).data.config?.brain?.booking_link;

    // The rail is the journey this business follows (journeyOf, spec §4.8), worked out from the answer the page reads, as
    // the page works it out (playbooks/surface.ts): four moments, or five where deals are on or a follow-up is held; a
    // stage a campaign stands on always draws.
    const held = new Set(
      body.playbooks.map((p) => journeyStageOf(p.trigger)).filter((id): id is JourneyStageId => id !== null),
    );
    const journey = journeyOf({
      calendarOn: (body.calendar ?? "none") !== "none",
      dealsOn: body.deals_on,
      word: appointmentWordOf({ stored: body.appointment_word ?? null, sellsBy: body.deals_on ? "proposal" : null }),
      held,
    });
    await expect(home.getByTestId("cmh-stage")).toHaveCount(journey.length);
    // In the journey's order, each by its word-free id.
    expect(
      await home.getByTestId("cmh-stage").evaluateAll((els) => els.map((el) => el.getAttribute("data-stage"))),
    ).toEqual(journey.map((s) => s.id));
    const text = await home.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    // Where the workspace stands on its channels, said once at the rail's head: a chip each (Ruben, 11 Oct 2026, where
    // three sentences stood), an open one saying it sends and a closed one pressed for why, in the product's words; a
    // workspace paused for billing says that alone. Where this read carries no readiness the page asks the broadcasts'
    // (lifecycle.ts readyOf), so the chips may still be drawn: only what they say is held, where the read says it.
    type Ready = Record<string, { ready: boolean }> & { paused?: boolean };
    const ready = (await pb.json()).data.ready as Ready | null;
    const channelsLine = home.getByTestId("cmh-channels-rail");
    if (ready) {
      await expect(channelsLine).toBeVisible();
      if (ready.paused) {
        expect(await channelsLine.innerText()).toMatch(/^This workspace is paused/);
      } else {
        for (const channel of ["whatsapp", "sms", "email"] as const) {
          const word = VERSION_CHANNEL_WORDS[channel];
          const chip = ready[channel]?.ready
            ? channelsLine.getByRole("img", { name: LIFECYCLE_WORDS.channels.sending(word) })
            : channelsLine.getByRole("button", { name: LIFECYCLE_WORDS.channels.notSetUp(word) });
          await expect(chip, `${word}'s chip`).toBeVisible();
        }
      }
    }
    // The line is drawn where it is seen and nowhere else: the frame's head, a screen reader's under Glass, holds no
    // copy of it and no door nobody can see.
    await expect(page.getByTestId("cmh-channels")).toHaveCount(0);
    // A moment that is on or paused carries a mark per channel its playbook goes by, in the product's order, said to a
    // screen reader as what it goes by, what waits and what it could go by. One that is off carries none (what Turn on
    // ticks is the composer's to say), and so does one that runs nothing here, as its drawer draws no Goes by row.
    const stages = home.getByTestId("cmh-stage");
    expect(await stages.count(), "the rail draws its moments").toBeGreaterThan(0);
    for (let i = 0; i < (await stages.count()); i++) {
      const stage = stages.nth(i);
      const state = await stage.getAttribute("data-state");
      const marks = stage.getByTestId("cmh-chans");
      if (state === "on" || state === "paused") {
        await expect(marks).toBeVisible();
        await expect(marks).toHaveAttribute("aria-label", /Goes by |waits?\b/);
      } else {
        await expect(marks).toHaveCount(0);
      }
    }
    // Every campaign the workspace keeps is a row of the ledger under the moments, once (spec §4.3); a reach-out's steps
    // are its chain's one row, by its root, which the chains' own read draws. A paused one says so (or that it runs nothing
    // here, where its moment cannot run: contracts rowStatusOf), and its act is Resume, never pressed here.
    for (const p of body.playbooks.filter((x) => !["lead_first", "after_step"].includes(x.trigger))) {
      const row = home.locator(`[data-testid="cmh-row"][data-row="${p.id}"]`);
      await expect(row).toHaveCount(1);
      if (p.state === "paused") await expect(row).toHaveAttribute("data-state", /^(paused|not_here)$/);
    }
    // The three tiles stand once their surfaces have landed: who can hear you, what is coming, what came back.
    await expect(home.getByTestId("cmh-reach")).toBeVisible();
    await expect(home.getByTestId("cmh-coming")).toBeVisible();
    await expect(home.getByTestId("cmh-results")).toBeVisible();
    // A run waiting on the owner is approved or skipped on its row (decision 14: one decision per run per screen): Approve
    // unless the verb would refuse it (its day has passed), and then Skip alone. Read here, never pressed: the workspace
    // keeps no test run, and one that happens to wait is the nightly's own to send or not. Coming up keeps its time.
    const waiting = home.getByTestId("cmh-row").filter({ has: page.getByTestId("cmh-waiting-acts") });
    for (let i = 0; i < (await waiting.count()); i++) {
      const row = waiting.nth(i);
      await expect(row).toHaveAttribute("data-state", "waiting");
      await expect(row.getByTestId("cmh-approve").or(row.getByTestId("cmh-skip")).first()).toBeVisible();
    }
    await expect(home.getByTestId("cmh-coming").getByTestId("cmh-waiting-acts")).toHaveCount(0);

    // New message opens the composer in a sheet from the side, on Send once; Every time is the playbook
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
    await expect(composer.getByTestId("pb-recipe")).toBeVisible();
    // One sentence (Ruben, 11 Oct 2026, "Option B"): the moment and the channels are words of it, over the message.
    const tops: number[] = [];
    for (const id of ["pb-recipe", "pb-message"]) {
      const box = await composer.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      tops.push(box!.y);
    }
    expect(tops, "the sentence, then the message, down the sheet").toEqual([...tops].sort((a, b) => a - b));
    await expect(composer.getByTestId("pb-recipe").getByTestId("pb-moment")).toBeVisible();
    await expect(composer.getByTestId("pb-recipe").getByTestId("pb-via-word")).toBeVisible();
    // The messages it may offer are the ones a send by any of WhatsApp, email and text can carry (messagesOffered: what the
    // route answers, by contracts' rules), left with those whose every slot the moment it opened on can fill -- a visit's
    // time on a visit moment, a proposal's link on the follow-up -- which the picker says by its label. None of it assumes
    // a channel, so a workspace with no WhatsApp number is offered the messages it has written.
    const { groups: usable } = messagesOffered(
      read,
      momentSlots((await composer.getByTestId("pb-moment").innerText()).trim(), bookingLink),
    );
    await expect(composer.getByTestId("pb-message")).toBeVisible();
    // With nothing to send, the moment's own message is offered to add (Turn on adds it), else the honest line says so.
    const starter = (await composer.getByTestId("pb-starter").count()) > 0;
    if (usable.length === 0 && !starter) {
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
    const data = (await res.json()).data as {
      playbooks: { id: string; name: string; trigger: string }[];
      deals_on?: boolean;
    };
    const playbooks = data.playbooks;
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
    // Goes by: the channels it goes by, a word of the drawer's sentence (Ruben, 11 Oct 2026, "Option B") that opens their
    // list, switched there in place (8 Oct 2026). A row per channel, WhatsApp, Text and Email, a switch to a screen
    // reader, each taking no press where the workspace cannot send on it or the message cannot go by it, the group named
    // as it is labelled. Nothing is switched: a press would change the workspace's playbook. A follow-up where deals are
    // off runs nothing here, and has no channels' word.
    const via = drawer.getByTestId("pb-via-word");
    if (first.trigger === "proposal_waiting" && data.deals_on === false) {
      await expect(via).toHaveCount(0);
    } else {
      await expect(via).toBeVisible();
      await via.click();
      const list = page.getByRole("group", { name: "Goes by" });
      await expect(list).toBeVisible();
      await expect(list.getByRole("switch")).toHaveCount(3);
      // Escape closes the list, and only the list.
      await page.keyboard.press("Escape");
      await expect(list).toBeHidden();
      await expect(drawer).toBeVisible();
    }
    // Closed, the address is the home's again, and the home is still there.
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
  });

  /**
   * The ledger's group is the address's own (decision 11 of the spec of 9 October 2026): `campaigns/in:<group>`, a word-free
   * id, narrows the ledger to a moment; its card wears the chosen state, and pressed again it lets go by replacing the
   * address, never pushing. Every row it shows is the moment's, or none matches and the ledger says so. Nothing is
   * changed: the press is the card's body, which only filters.
   */
  test("the ledger's group is the address's own: a moment's card narrows it and lets go, replacing the address, never pushing", async ({
    page,
  }) => {
    await page.goto("/#/campaigns/in:quiet");
    await expect(page).toHaveURL(atRoute(/^campaigns\/in:quiet$/));
    const home = page.getByTestId("campaigns-home");
    await expect(home).toBeVisible();
    await page.waitForLoadState("networkidle");
    const card = home.locator('[data-testid="cmh-stage"][data-stage="quiet"]');
    await expect(card).toHaveAttribute("data-chosen", "true");
    await expect(card.getByTestId("cmh-stage-press")).toHaveAttribute("aria-pressed", "true");
    // Every row shown is the moment's, or nothing matches and the ledger says so.
    const groups = home.getByTestId("cmh-ledger").getByTestId("cmh-group");
    const rows = home.getByTestId("cmh-row");
    if ((await rows.count()) === 0) await expect(home.getByTestId("cmh-ledger-none")).toBeVisible();
    else expect(await groups.evaluateAll((els) => els.map((el) => el.getAttribute("data-group")))).toEqual(["quiet"]);
    const depth = await page.evaluate(() => history.length);
    await card.getByTestId("cmh-stage-press").click();
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
    expect(await page.evaluate(() => history.length), "let go by a replace, no entry added").toBe(depth);
    await expect(card).not.toHaveAttribute("data-chosen", "true");
  });

  /**
   * The rail keeps one line at every desk width (J3 of the spec of 9 October 2026): five columns need about 1100px of page,
   * and under that the rail scrolls across inside its pane, a moment snapping to its edge. Between a phone's 900px and a
   * wide desk nothing may run out of the pane (the rail and the ledger under it), or off the page. Geometry, so it is
   * measured in a real browser. Read-only: nothing is pressed.
   */
  test("the home draws inside its page from 901 to 1440px: the moments keep one line, and the rail scrolls across where they no longer fit", async ({
    page,
  }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    // 1280 to 1440 is where the ledger's six columns stand side by side under the sidebar: nothing of a row may be clipped.
    for (const width of [901, 1000, 1100, 1200, 1280, 1330, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const rail = page.getByTestId("cmh-rail");
      await expect(rail).toBeVisible();
      const tops = await rail
        .getByTestId("cmh-stage")
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(new Set(tops).size, `${width}px: the moments stand on one line`).toBe(1);
      const runOut = await rail.evaluate((el) => {
        const edge = el.getBoundingClientRect();
        // Inside a scroller of the pane's own (the rail, the tool line) a part past its edge is reached by scrolling.
        const scrolled = (n: Element) => {
          for (let p = n.parentElement; p && p !== el; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === "auto" || o === "scroll") return true;
          }
          return false;
        };
        return [...el.querySelectorAll<HTMLElement>("*")]
          .filter((n) => !scrolled(n))
          .filter((n) => {
            const box = n.getBoundingClientRect();
            return box.width > 0 && (box.right > edge.right + 1 || box.left < edge.left - 1);
          })
          .map((n) => n.className || n.tagName);
      });
      expect(runOut, `${width}px: parts of the pane run out of it`).toEqual([]);
      const line = await rail
        .locator(".cmh-rail")
        .evaluate((ol) => ({ wider: ol.scrollWidth > ol.clientWidth + 1, overflow: getComputedStyle(ol).overflowX }));
      if (line.wider) expect(line.overflow, `${width}px: a rail wider than its pane scrolls across`).toBe("auto");
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

  /**
   * Ask's door in the head (the moment spec, A1): a quiet button wearing the three, between the Library and New message,
   * from 721px up (campaigns.css `.cmh-ask`); under it the shell's ✦ is the door. It opens Ask on Campaigns, whose field
   * asks in Campaigns' own words (A3). Nothing is written: no turn is sent.
   */
  test("Ask's door stands in the head from 721px up and opens Ask on Campaigns' own words; under it the shell's ✦ is the door", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    const door = page.getByTestId("cmh-ask");
    await expect(door).toBeVisible();
    await door.click();
    await expect(page.getByTestId("ask-line")).toBeVisible();
    await expect(page.getByTestId("ask-input")).toHaveAttribute("placeholder", "Describe what should go out, and when");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ask-line")).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("cmh-ask")).toBeHidden();
  });
});
