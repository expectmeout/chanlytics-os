import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { askLine, answerWithThreeCards, dropTheTurn, FIRST_CARD_SAYS, holdWrites, WHATSAPP_REVIEW } from "./ask-turn";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { atRoute, routeOf } from "./address";
import { motionSettled } from "./signals";
import { activeWorkspace, scoped, apiGet } from "./workspace";
import { WAITING_QUESTION, WAITING_SEARCH_NAME, refuseAnswers, waitingSearch } from "./waiting-search";

/**
 * Ask on a real workspace, as the Line: it opens from ⌘K and the top bar's
 * button, shows the workspace and nothing seeded, draws no key, jumps,
 * answers the quick questions without a model, and runs a real turn that
 * reads and cites.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };
const INVENTED = ["Aisha", "Jordan", "Lena", "Drifting VIP", "revenue pacing", "Serenity", "Sarah Chen"];
/**
 * A real turn spends model tokens on whichever workspace the run signs in to.
 * The nightly runs without them and each of the five says so in its skip;
 * E2E_PAID_MODEL=1 puts them back for a run that should spend.
 */
const PAID = process.env.E2E_PAID_MODEL === "1";
const WHY_UNPAID = "a real model turn costs money: set E2E_PAID_MODEL=1 to run it";

test.describe("Ask, without a session", () => {
  test("the turn route refuses a cross-site POST and an unauthenticated one", async ({ request }) => {
    const anon = await request.post("/api/v1/ask", { data: { text: "who needs me?" }, ...fromTheApp });
    expect([401, 403]).toContain(anon.status());
  });
});

test.describe("Ask on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("⌘K opens the Line on the workspace; the top bar's button is the one door; nothing invented, no key drawn", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("tb-ask")).toBeEnabled();
    await expect(page.getByTestId("tb-ask")).not.toContainText("Soon");
    await expect(page.getByRole("button", { name: "New Chat" }), "one door to Ask (the Line, D8)").toHaveCount(0);
    await page.keyboard.press("Control+k");
    const pal = page.getByTestId("ask-real");
    await expect(pal).toBeVisible();
    const text = await pal.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    expect(text, "no key is drawn in the Line (D17)").not.toMatch(/[↵⌘]|\besc\b/i);
    // At rest: Right now first, then the page's own questions.
    await expect(pal.getByTestId("ask-row-now")).toBeVisible();
    await expect(pal.locator(".ask-rows-label", { hasText: "Ask about Today" })).toBeVisible();
    await page.screenshot({ path: "test-results/ask-line.png" });
    await page.keyboard.press("Escape");
    await expect(pal).toBeHidden();
    await page.getByTestId("tb-ask").click();
    await expect(page.getByTestId("ask-real")).toBeVisible();
    // Ask's face: the three are the button's icon, and stand in the line while it is open (surfaces/kit/face/ask-face.tsx).
    await expect(page.getByTestId("ask-real").getByTestId("ask-line-face")).toBeVisible();
  });

  test("two words jump; a quick question is answered without a model, as the Line draws an answer", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill("rep");
    await expect(page.getByTestId("ask-row-jump").first()).toContainText("Reports");
    await input.fill("who needs me?");
    await input.press("Enter");
    const say = page.getByTestId("ask-say");
    await expect(say).toBeVisible();
    await expect(say).toContainText(/waiting/);
    await expect(page.getByTestId("ask-trace")).toHaveCount(0);
    await page.screenshot({ path: "test-results/ask-quick.png" });
  });

  test("Right now says a search is waiting: its pill and its clause, and Brief me names it with a door to the pile it asks about", async ({
    page,
  }) => {
    // Brief me asks "Who needs me right now?", which the Line answers from what the page holds, without a model;
    // refuseAnswers holds that to it (a turn that reached the model would be refused and counted).
    const attempts = await refuseAnswers(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const search = await waitingSearch(page);
    await page.keyboard.press("Control+k");
    const pal = page.getByTestId("ask-real");
    const now = pal.getByTestId("ask-row-now");
    await expect(now).toBeInViewport({ ratio: 1 });
    // Its counts are the hero's pills, under the three (surfaces/ask/line/), on a desk as on a phone.
    await expect(
      pal
        .getByTestId("ask-hero")
        .getByTestId("ask-pill")
        .filter({ hasText: /search/ }),
    ).toHaveText("1 search waiting");
    // The search's clause of the sentence: first, capitalised, when nobody else is waiting; after a "; " otherwise.
    await expect(now.locator(".ask-row-label")).toContainText(
      new RegExp(`(^|; )[Yy]our search for ${WAITING_SEARCH_NAME} is waiting for your answer[.;]`),
    );
    await now.getByTestId("ask-row-brief").click();
    await expect(pal.getByTestId("ask-say")).toBeVisible();
    await expect(pal.getByTestId("ask-trace")).toHaveCount(0);
    const item = pal.getByTestId("ask-item").filter({ hasText: WAITING_SEARCH_NAME });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("Leads");
    await expect(item).toContainText(WAITING_QUESTION);
    await item.click();
    await expect.poll(() => routeOf(page.url())).toBe(search.route);
    await expect(page.getByTestId("lead-strip").getByTestId("strip-title")).toHaveText(WAITING_QUESTION);
    expect(attempts, "Brief me spent no turn and answered nothing").toEqual([]);
  });

  test("a real turn reads the workspace and answers with what it read", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(120_000);
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/ask", ws), {
      data: { text: "what are our opening hours this week?", thread_id: null, scope: null, surface: "today" },
      ...fromTheApp,
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("x-ndjson");
    const lines = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(lines[0].t).toBe("thread");
    const final = lines.find((l) => l.t === "final");
    expect(final, "a final message").toBeTruthy();
    expect(final.message.text.length).toBeGreaterThan(0);
    if (!final.message.failed) {
      // Hours come from the prompt now: a one-round answer with no read is the
      // intended shape, and it is grounded (the facts are the workspace's).
      expect(final.message.rounds).toBeGreaterThanOrEqual(1);
      expect(final.message.ungrounded).toBe(false);
    }
    // The thread is the person's own and reads back.
    const list = await apiGet(page, "/api/v1/ask/threads");
    const { data } = await list.json();
    expect(data.threads.some((t: { id: string }) => t.id === lines[0].id)).toBe(true);
    const one = await apiGet(page, `/api/v1/ask/threads/${lines[0].id}`);
    const { data: d1 } = await one.json();
    expect(d1.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    const del = await page.request.delete(scoped(`/api/v1/ask/threads/${lines[0].id}`, ws), fromTheApp);
    expect(del.status()).toBe(200);
  });

  test("a request to act becomes a card with Approve and Not now, and the test never approves it", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(120_000);
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/ask", ws), {
      data: { text: "add a note on Robin Example: prefers mornings", thread_id: null, scope: null, surface: "people" },
      ...fromTheApp,
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const lines = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const final = lines.find((l) => l.t === "final");
    expect(final).toBeTruthy();
    if (!final.message.failed) {
      const note = final.message.proposals.find((p: { kind: string }) => p.kind === "note");
      expect(note, "a note card").toBeTruthy();
      expect(note.title).toBe("Note on Robin Example");
      expect(note.payload.body).toMatch(/morning/i);
      expect(final.message.text).not.toMatch(/\bI (have )?(added|saved|noted)\b/i);
      // Dismissing is recorded on the turn; approving would write the note.
      const out = await page.request.post(scoped(`/api/v1/ask/messages/${final.message.id}/proposals/${note.id}`, ws), {
        data: { state: "dismissed", receipt: "Not now", atMs: Date.now() },
        ...fromTheApp,
      });
      expect(out.status()).toBe(200);
      const back = await apiGet(page, `/api/v1/ask/threads/${lines[0].id}`);
      const { data } = await back.json();
      const stored = data.messages[1].proposals.find((p: { id: string }) => p.id === note.id);
      expect(stored.outcome.state).toBe("dismissed");
    }
    await page.request.delete(scoped(`/api/v1/ask/threads/${lines[0].id}`, ws), fromTheApp);
  });

  test("opening a call from the palette lands on the call, in its thread", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(150_000);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill("open the transcript of the most recent call");
    await input.press("Enter");
    // The answer lands and the page beside the panel goes there by itself; on a desk Ask stays open beside it with
    // the conversation (Ruben, 16 Oct 2026).
    await page.waitForURL(atRoute(/^conversations\/cv-/), { timeout: 120_000 });
    await expect(page.getByTestId("ask-real")).toBeVisible();
    await expect(page.getByTestId("ask-turn").first()).toBeVisible();
    // A call is drawn as its card: in its thread, opened there, or alone in the thread's frame (calls-in-the-thread).
    await expect(page.getByTestId("tl-call").first()).toBeAttached({ timeout: 20_000 });
    await page.screenshot({ path: "test-results/ask-clickthrough.png" });
  });

  test("the same question twice is one thread, not twins", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(150_000);
    // A question of its own, so older threads that also mention today's
    // writers (the eval set asks about them) are not counted as twins.
    const nonce = Date.now().toString(36).slice(-5);
    const question = `who wrote today? check ${nonce}`;
    const ws = await activeWorkspace(page);
    const ask = async () => {
      const res = await page.request.post(scoped("/api/v1/ask", ws), {
        data: { text: question, thread_id: null, scope: null, surface: "today" },
        ...fromTheApp,
        timeout: 90_000,
      });
      expect(res.status()).toBe(200);
      return (await res.text())
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((l) => l.t === "thread").id as string;
    };
    const first = await ask();
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill(`Who wrote today? Check ${nonce}`);
    await input.press("Enter");
    await expect(page.getByTestId("ask-turn").first()).toBeVisible({ timeout: 120_000 });
    await expect(page.locator(".ask-cursor")).toHaveCount(0, { timeout: 120_000 });
    const list = await apiGet(page, "/api/v1/ask/threads");
    const { data } = await list.json();
    const twins = data.threads.filter((t: { title: string }) => t.title.includes(nonce));
    expect(twins.length, "one thread for one question").toBe(1);
    expect(twins[0].id).toBe(first);
    await page.request.delete(scoped(`/api/v1/ask/threads/${first}`, ws), fromTheApp);
  });

  test("the Line streams a turn and shows its answer or a plain failure, with New to end it", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(120_000);
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill("what are our hours this week?");
    await input.press("Enter");
    const turn = page.getByTestId("ask-turn");
    await expect(turn.first()).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".ask-cursor")).toHaveCount(0, { timeout: 90_000 });
    const text = await page.getByTestId("ask-say").innerText();
    expect(text.length).toBeGreaterThan(10);
    for (const s of INVENTED) expect(text).not.toContain(s);
    await page.screenshot({ path: "test-results/ask-turn.png" });
    // New, in the head, ends the conversation; the Line is home again.
    await page.getByTestId("ask-clear-head").click();
    await expect(page.getByTestId("ask-row-now")).toBeVisible();
  });
});

/**
 * One paid question on each of five surfaces, each carrying its page the way the palette sends it: the context is the
 * palette's own (window.__ask.context, legacy-bridge/ask/context.ts, over what the page drew), warmed as the Line
 * warms it on open (POST ask/warm), then sent with the question. The turn answers, carries no failure and names
 * nothing the workspace does not hold. The eval's cases on these surfaces (tooling/evals/ask-cases.json) grade the
 * answers; this proves the page rides a real turn end to end.
 */
const ON_THE_PAGE: Array<{ surface: string; hash: string; text: string; rows: boolean }> = [
  { surface: "today", hash: "today", text: "who needs me right now?", rows: false },
  { surface: "inbox", hash: "inbox", text: "what does the person in this list want?", rows: false },
  { surface: "people", hash: "clients", text: "how many people are on this list?", rows: true },
  { surface: "leads", hash: "clients/leads", text: "which of these leads has a website?", rows: true },
  { surface: "reports", hash: "reports", text: "how did this period go?", rows: false },
];

test.describe("Ask with the page it is asked on", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const q of ON_THE_PAGE)
    test(`a question on ${q.surface} carries its page, and the turn answers from this workspace alone`, async ({
      page,
    }) => {
      test.skip(!PAID, WHY_UNPAID);
      test.setTimeout(120_000);
      await page.goto(`/#/${q.hash}`);
      await page.waitForLoadState("networkidle");
      test.skip(!(await page.evaluate(() => !!(window as { __ask?: unknown }).__ask)), "no Ask client on this page");
      const context = await page.evaluate((words) => {
        const { CHANLY } = window as unknown as { CHANLY: { address: { route: () => string } } };
        const [p, ...rest] = CHANLY.address.route().split("/");
        const ask = (window as unknown as { __ask: { context: (r: unknown, w: string) => unknown } }).__ask;
        return ask.context({ page: p || "today", param: rest.length ? rest.join("/") : null }, words) as {
          surface: string;
          rows: Array<{ kind: string; id: string }>;
        };
      }, q.text);
      expect(context.surface).toBe(q.surface);
      if (q.rows) expect(context.rows.length, "the rows the page drew ride along").toBeGreaterThan(0);
      const ws = await activeWorkspace(page);
      const warm = await page.request.post(scoped("/api/v1/ask/warm", ws), { data: context, ...fromTheApp });
      expect(warm.status(), "the palette's warm is taken").toBe(200);
      const res = await page.request.post(scoped("/api/v1/ask", ws), {
        data: { text: q.text, thread_id: null, scope: null, surface: q.surface, context },
        ...fromTheApp,
        timeout: 90_000,
      });
      expect(res.status()).toBe(200);
      const lines = (await res.text())
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const final = lines.find((l) => l.t === "final");
      expect(final, "a final message").toBeTruthy();
      expect(final.message.failed, final.message.text).toBeFalsy();
      expect(final.message.text.length).toBeGreaterThan(0);
      for (const s of INVENTED) expect(final.message.text, `invented: "${s}"`).not.toContain(s);
      await page.request.delete(scoped(`/api/v1/ask/threads/${lines[0].id}`, ws), fromTheApp);
    });
});

/**
 * Ask as the marketing manager (docs/superpowers/specs/2026-10-10-ask-the-marketing-manager-design.md, decision
 * 0055), on the suite's workspace as tooling/scripts/ops/e2e-workspace.mjs seeds it: a +1 WhatsApp number, whose
 * offers WhatsApp pauses, no mailbox, and nobody's yes to offers. An offer asked for there can go by nothing, so its
 * plan is refused in its own words (contracts PLAN_WORDS.noChannel) and nothing that sends is proposed: no broadcast
 * card, no campaign card, and no words claiming one was made. That holds whatever else the model writes on that seed.
 * A plan approved, the message it writes in the Library, the receptionist's note and Undo need a workspace that sends
 * offers by email: the node tests prove them (tooling/scripts/tests/ask/plan/), and so does Ruben's own run on such a
 * workspace. Written and typechecked with the lane, never run by it: its first run is after 00415 and 00416 are
 * applied to production, with E2E_PAID_MODEL=1.
 */
const OFFER_ASKED = "I want to offer 10% off everything from today until the end of next month.";
const CLAIMS_A_SEND = /\bI(?:['’]ve| have)? (?:sent|scheduled|set up|created)\b/i;

test.describe("Ask as the marketing manager", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("an offer where nothing can carry one proposes no send and no campaign, and claims none", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(120_000);
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/ask", ws), {
      data: { text: OFFER_ASKED, thread_id: null, scope: null, surface: "campaigns" },
      ...fromTheApp,
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const lines = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    try {
      const final = lines.find((l) => l.t === "final");
      expect(final, "a final message").toBeTruthy();
      if (!final.message.failed) {
        const kinds = final.message.proposals.map((p: { kind: string }) => p.kind);
        expect(kinds, "no one-off send is proposed").not.toContain("broadcast");
        expect(kinds, "no campaign is proposed").not.toContain("playbook");
        expect(final.message.text).not.toMatch(CLAIMS_A_SEND);
      }
    } finally {
      // The thread is the run's own, deleted whatever the turn said, so a failed run leaves none behind; no card was
      // pressed.
      const del = await page.request.delete(scoped(`/api/v1/ask/threads/${lines[0].id}`, ws), fromTheApp);
      expect(del.status()).toBe(200);
    }
  });
});

test.describe("Ask on a phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the ✦ opens the takeover; words typed survive a close by Back and come back on the next open", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("phone-ask").tap();
    const ask = page.getByTestId("ask-real");
    await expect(ask).toBeVisible();
    await ask.getByTestId("ask-input").fill("how did the");
    // The takeover pushed one entry of its own as it opened (surfaces/ask/line/, S8): Back closes it and stays on Today.
    await page.goBack();
    await expect(ask).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^today$/));
    // The words are kept as typed (S9) and are back in the field on the next open.
    await page.getByTestId("phone-ask").tap();
    await expect(ask).toBeVisible();
    await expect(ask.getByTestId("ask-input")).toHaveValue("how did the");
  });
});

/**
 * A turn of cards (decision 0088), on a desk and a phone, answered in the page (e2e/ask-turn.ts): no model behind it and
 * no write leaves it, so it runs on every nightly. The first Approve stands on the first screen, what it depends on above
 * it, and each warning is said once; a press lands somewhere a keyboard and a screen reader can follow; and axe finds
 * nothing serious in any state.
 *
 * Axe says "incomplete", not a pass, for the contrast of words on Ask's glass: it cannot read the ground through a
 * backdrop filter. The words of a card turn were sampled by hand on 2 Nov 2026 (the decision says how).
 */
/** The device preferences' key (contracts DEVICE_PREFS_STORAGE), restated: a spec compiles apart from the package. */
const DEVICE_PREFS = "chanlytics-os-prefs";
/** Serious or critical findings in Ask, as lines a failure reads. Anything less is a report, not a gate. */
async function scanAsk(page: Page, state: string) {
  await expect(page.getByTestId("ask-real")).toBeVisible();
  await motionSettled(page); // a part fading in is read at the contrast it has so far
  const found = await new AxeBuilder({ page }).include("[data-testid='ask-real']").analyze();
  expect(
    found.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}: ${v.nodes[0]?.target.join(" ")})`),
    state,
  ).toEqual([]);
}

for (const view of [
  { name: "a desk", use: { viewport: { width: 1280, height: 800 } } },
  { name: "a phone", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
]) {
  test.describe(`A turn of cards on ${view.name}`, () => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);
    test.use(view.use);
    const phone = !!view.use.viewport && view.use.viewport.width < 721;
    const openAsk = async (page: Page) => {
      await page.goto("/#/today");
      await page.waitForLoadState("networkidle");
      if (phone) await page.getByTestId("phone-ask").tap();
      else await page.getByTestId("tb-ask").click();
      await expect(page.getByTestId("ask-real")).toBeVisible();
    };
    test.beforeEach(async ({ page }) => {
      await signIn(page);
      await holdWrites(page);
    });

    test("the first Approve is on the first screen with what it depends on, one card open, and the warning all three share said once above them", async ({
      page,
    }) => {
      await answerWithThreeCards(page);
      await openAsk(page);
      await askLine(page, "set up a campaign");
      const ask = page.getByTestId("ask-real");
      const approve = ask.getByTestId("ask-card-approve");
      await expect(approve, "one card stands open").toHaveCount(1);
      await motionSettled(page); // the three still shrinking stand the answer lower
      const body = (await ask.locator(".ask-line-body").boundingBox())!;
      const box = (await approve.boundingBox())!;
      expect(box.y + box.height, "the press clears the field, unscrolled").toBeLessThanOrEqual(body.y + body.height);

      const cards = ask.getByTestId("ask-card");
      await expect(cards).toHaveCount(3);
      for (const says of FIRST_CARD_SAYS) await expect(cards.first()).toContainText(says);
      await expect(cards.nth(1), "a card not reached says its line").toContainText("Follows up with everyone");
      await expect(cards.nth(1), "and offers no press").not.toContainText("Approve");

      await expect(ask.getByText(WHATSAPP_REVIEW), "said once, the answer's own line and the cards' gone").toHaveCount(
        1,
      );
      const alike = ask.getByTestId("ask-holds-alike");
      await expect(alike).toContainText("All 3.");
      const warned = (await alike.boundingBox())!;
      expect(warned.y + warned.height, "and read before the press").toBeLessThanOrEqual(box.y);

      const next = ask.getByTestId("ask-next").first();
      await next.scrollIntoViewIfNeeded();
      const asked = (await next.boundingBox())!;
      const last = (await cards.last().boundingBox())!;
      expect(asked.y, "the next questions stand under the cards").toBeGreaterThanOrEqual(last.y + last.height);

      // The sheet keeps what no press turns on behind Details, and gives it back.
      await expect(cards.first()).not.toContainText("Each run waits for you on Today");
      await ask.getByTestId("ask-card-details").click();
      await expect(cards.first()).toContainText("Each run waits for you on Today");

      // A press decides the card and opens the next; the warning stands while one still waits.
      await approve.click();
      await expect(cards.first().locator(".ask-card-receipt")).toBeVisible();
      await expect(cards.nth(1)).toContainText("Daily, 11:00 AM");
      await expect(ask.getByTestId("ask-card-approve")).toHaveCount(1);
      await expect(alike).toBeVisible();

      // Any card opens by its head, and the one open folds.
      await cards.nth(2).getByTestId("ask-card-fold").click();
      await expect(cards.nth(2)).toContainText("Daily, 10:00 AM, up to 25");
      await expect(cards.nth(1)).not.toContainText("Daily, 11:00 AM");
    });

    test("a press lands on what became of the card, which is announced; Not now and Try again land too", async ({
      page,
    }) => {
      await answerWithThreeCards(page);
      await openAsk(page);
      await askLine(page, "set up a campaign");
      const ask = page.getByTestId("ask-real");
      const cards = ask.getByTestId("ask-card");
      await ask.getByTestId("ask-card-approve").click();
      const receipt = cards.first().locator(".ask-card-receipt");
      await expect(receipt, "not the page's body, and not the field").toBeFocused();
      await expect(cards.first().getByRole("status")).toContainText("Reminder");
      // The outcome is noted on the conversation a beat later, which brings the field's focus back on a desk: not here.
      await expect(page.locator(".ask-card-receipt")).toHaveCount(1);
      await expect(receipt).toBeFocused();

      await cards.nth(1).getByRole("button", { name: "Not now" }).click();
      await expect(cards.nth(1).locator(".ask-card-receipt")).toBeFocused();

      // A press refused says why where the press stood, and Try again gives Approve back, with the focus.
      await page.route(/\/api\/v1\/playbooks/, (route) =>
        route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: { code: "invalid", message: "That campaign needs a message first." },
          }),
        }),
      );
      await ask.getByTestId("ask-card-approve").click();
      await expect(cards.nth(2).locator(".ask-card-receipt")).toBeFocused();
      await cards.nth(2).getByRole("button", { name: "Try again" }).click();
      await expect(cards.nth(2).getByTestId("ask-card-approve")).toBeFocused();
    });

    test("axe finds nothing serious, in either theme: at rest, a thread, a card, a receipt, a failed turn", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      for (const theme of ["dark", "light"]) {
        await page.addInitScript(
          ([key, t]) => localStorage.setItem(key, JSON.stringify({ theme: t })),
          [DEVICE_PREFS, theme],
        );
        await openAsk(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await scanAsk(page, `${theme}, at rest`);
        await answerWithThreeCards(page);
        await askLine(page, "set up a campaign");
        const ask = page.getByTestId("ask-real");
        await expect(ask.getByTestId("ask-card-approve")).toBeVisible();
        await scanAsk(page, `${theme}, a thread with its cards`);
        await ask.getByTestId("ask-card-details").click();
        await scanAsk(page, `${theme}, a card with its details`);
        await ask.getByTestId("ask-card-approve").click();
        await expect(ask.locator(".ask-card-receipt")).toBeVisible();
        await scanAsk(page, `${theme}, a receipt`);
        await page.unroute(/\/api\/v1\/ask(\?|$)/);
        await dropTheTurn(page);
        await askLine(page, "and the next one?");
        await expect(ask.getByTestId("ask-retry")).toBeVisible();
        await scanAsk(page, `${theme}, a failed turn`);
        await page.unroute(/\/api\/v1\/ask(\?|$)/);
      }
    });

    test("a failed turn offers Try again, and neither Copy nor Read aloud", async ({ page }) => {
      await dropTheTurn(page);
      await openAsk(page);
      await askLine(page, "who needs a word?");
      const ask = page.getByTestId("ask-real");
      await expect(ask.getByTestId("ask-retry")).toBeVisible();
      await expect(ask.getByTestId("ask-acts")).toHaveCount(0);
    });
  });
}
