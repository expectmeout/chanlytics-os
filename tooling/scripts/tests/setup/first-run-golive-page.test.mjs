/**
 * The first run's Go live (decision 0073, canvas 5A–5C), drawn on the page without a browser: Pay (what starts, the plan at
 * Stripe's price as it is, the press that opens Stripe in the page, a trial's plan started now, a workspace that already
 * pays), confirming with the bank, no line provider here, Switch it on (the number bought once, the forwarding's questions
 * and its code, the owner's own call through "Check my line", WhatsApp's approval with Meta's steps for keeping the app,
 * what came in, Setup's own rows for what the list cannot do), and You're live (what answers, Ask's three moves, what was
 * set up, and Open Today switching calls on). The world is _first-run-world.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HELPERS, GET_YES_ROUTE, KEEP_ROW, TRY_SKIPPED } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import {
  KEEP,
  answering,
  answeringLine,
  atLive,
  byTestId,
  allByTestId,
  businessTabSave,
  choose,
  chosen,
  draftOf,
  emptyTab,
  flashes,
  forwardedRow,
  forwardingSays,
  heldTicks,
  heldWaits,
  keepChoice,
  liveCall,
  mount,
  open,
  page,
  phoneReady,
  phoneWorld,
  readyActivate,
  replaced,
  restoreSetupVerbs,
  setLive,
  setSettings,
  setSetup,
  setupVerbs,
  textOf,
  tick,
  tryWorld,
  optionsOf,
  walk,
  went,
  withFacts,
} from "./_first-run-world.mjs";

const { waConnect } = await importSrc("apps/dashboard/src/surfaces/settings/connections/whatsapp.ts");
const PW = FIRST_RUN_HELPERS.phoneWords;
const settle = async () => {
  await tick();
  await tick();
};

/* ---- Pay (canvas 5A) ---- */
test("Go live, pay (canvas 5A): what starts and what it asks after, the plan at Stripe's price as it is, and the press opens Stripe's checkout", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(atLive(phoneReady()));
  const tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "live");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your receptionist is ready to go live");
  assert.equal(
    textOf(byTestId(tree, "first-run")).includes(
      "Everything you chose starts at once. One thing needs you for a minute after.",
    ),
    true,
    "the lead counts the hands it will need: the code and the call for the number kept",
  );
  assert.equal(textOf(byTestId(tree, "fr-phone-line")), "5 of 5 · Go live");
  assert.equal(
    textOf(byTestId(tree, "fr-pay-start-calls")),
    "Calls to +1 (305) 555-0100 nobody picks upone code, then one call",
  );
  assert.equal(byTestId(tree, "fr-pay-start-whatsapp"), null, "WhatsApp not chosen");
  // The plan as it is: the trial is what FIRST_RUN_TRIAL_DAYS says, never a promise the checkout does not keep.
  assert.equal(
    textOf(byTestId(tree, "fr-pay-plan")),
    "$49.00 a month Charged today" +
      "Its number, calls and WhatsApp included. Cancel anytime from Billing." +
      "After you press" +
      "Its number is bought for youThen on your phone: dial one code, call your number once",
  );
  const go = byTestId(tree, "fr-pay-go");
  assert.equal(textOf(go), "Start my plan");
  assert.match(textOf(byTestId(tree, "fr-pay-card")), /Secured by Stripe$/);
  byTestId(tree, "fr-back").props.onClick();
  assert.equal(went.at(-1), "start/channels", "Back goes to Where it answers, where the choice is changed");
  await go.props.onClick();
  await settle();
  assert.deepEqual(asked.checkout, ["start"], "Stripe comes back to the first run");
  assert.equal(draftOf("first-run-phone").pending, true, "the choice waits in the tab for Stripe's round trip");
  assert.deepEqual(asked.buy, [], "nothing is bought before the plan");
});

test("Go live, pay: a checkout that will not open says so, and the choice lets go for another press", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld({ checkoutInPage: { ok: false, message: "Checkout could not be opened." } });
  setSetup(atLive(phoneReady()));
  flashes.length = 0;
  await byTestId(open(), "fr-pay-go").props.onClick();
  await settle();
  assert.equal(textOf(flashes.at(-1).msg), "Checkout could not be opened.");
  assert.equal(draftOf("first-run-phone").pending, false);
  assert.ok(byTestId(mount(), "fr-pay-go"), "still Pay, to press again");
});

test("Go live on a free trial: the trial covers no number, so the press starts the plan now, then the buy; a start Stripe refuses is said, and nothing is bought", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(atLive(phoneReady({ status: "trialing", trial_end: "2026-09-21T15:00:00Z" })));
  let tree = open();
  const go = byTestId(tree, "fr-pay-go");
  assert.equal(textOf(go), "Start my plan and go live");
  await go.props.onClick();
  await settle();
  assert.equal(asked.startNow, 1, "the plan started from here, not Stripe's checkout");
  assert.deepEqual(asked.checkout, []);
  assert.equal(draftOf("first-run-phone").pending, true, "the choice waits for the plan");
  assert.deepEqual(asked.buy, [], "nothing bought on the trial");
  // The start taken: Setup reads the plan, Switch it on is drawn, and its number row buys.
  setSetup(atLive(phoneReady({ status: "active" })));
  tree = open();
  await settle();
  assert.ok(byTestId(tree, "fr-switch"));
  assert.deepEqual(asked.buy, [["+13055550142", "305"]]);

  // Stripe refuses (a card that did not pay): said, and the choice lets go.
  const refused = phoneWorld({
    startNow: { ok: false, message: "Your plan started, but the charge did not go through." },
  });
  setSetup(atLive(phoneReady({ status: "trialing", trial_end: "2026-09-21T15:00:00Z" })));
  flashes.length = 0;
  await byTestId(open(), "fr-pay-go").props.onClick();
  await settle();
  assert.equal(draftOf("first-run-phone").pending, false);
  assert.equal(textOf(flashes.at(-1).msg), "Your plan started, but the charge did not go through.");
  assert.deepEqual(refused.asked.buy, []);
});

test("Go live: back from Stripe before the plan lands is confirming with the bank, a reload included; then the number is bought in the kept number's area code, once", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld({ outcome: "success" });
  keepChoice({ way: "keep", number: null, pick: null, pending: true });
  setSetup(atLive(phoneReady()));
  open();
  assert.equal(replaced.at(-1), "start/live", "Stripe returns to the bare address; the step it left is Go live");
  page.param = "live";
  // Stripe's answer is read in an effect, after the first draw, as React draws again once it is kept.
  const confirming = mount();
  assert.equal(
    textOf(byTestId(confirming, "fr-pay-confirming")),
    "Confirming with your bank…Some banks ask you to approve in their app. This page moves on by itself.Usually a few seconds",
  );
  // A reload before the webhook lands: the tab remembers the card was given, and offers no second checkout.
  globalThis.window.__billing.outcome = () => null;
  assert.ok(byTestId(open("live"), "fr-pay-confirming"), "a reload says confirming, not Pay again");
  assert.deepEqual(asked.buy, []);
  // The webhook lands: the plan runs, and the number row buys. (This stub runs an effect on a component's first draw
  // only, where React runs it again when the stage it depends on moves: a fresh draw stands in for that.)
  setSetup(atLive(phoneReady({ status: "active" })));
  const buying = open("live");
  await settle();
  assert.equal(byTestId(buying, "fr-number").props["data-stage"], "buying");
  assert.equal(
    textOf(byTestId(buying, "fr-phone-status")),
    "Waiting on usGetting your receptionist's number in 305…Usually a minute or two; this page updates by itself",
  );
  assert.deepEqual(asked.search, ["305"]);
  assert.deepEqual(asked.buy, [["+13055550142", "305"]], "the first number offered: customers never see it");
  // A new draw of the page (the tab reloaded, the step opened again) before the line reaches Setup: the tab says the buy
  // went out, so nothing is sent again.
  open("live");
  await settle();
  assert.equal(asked.buy.length, 1, "a draw before the line reaches Setup sends nothing again");
  assert.deepEqual(asked.request, [], "keeping asks nobody to move anything");
});

test("Go live for a workspace that already pays: the press buys; the number picked at Where it answers is the one bought; a move asks a person", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(atLive(phoneReady({ status: "active" })));
  const go = byTestId(open(), "fr-pay-go");
  assert.equal(textOf(go), "Go live", "no plan to start: the press goes live");
  assert.equal(byTestId(open(), "fr-pay-plan") !== null, true, "what starts is still said");
  await go.props.onClick();
  assert.equal(draftOf("first-run-phone").pending, true);
  open();
  await settle();
  assert.deepEqual(asked.buy, [["+13055550142", "305"]]);

  // A new number picked at Where it answers: that number, with no search.
  const picked = phoneWorld();
  setSetup(atLive(phoneReady({ status: "active" }), { want: { way: "new", number: "+13055550177" } }));
  await byTestId(open(), "fr-pay-go").props.onClick();
  open();
  await settle();
  assert.deepEqual(picked.asked.search, []);
  assert.deepEqual(picked.asked.buy, [["+13055550177", "305"]]);

  // A move forwards meanwhile, so it buys a line too, and asks a person to file the move.
  const moving = phoneWorld();
  keepChoice({ way: "move", number: null, pick: null, pending: true });
  setSetup(atLive(phoneReady({ status: "active" }), { want: { way: "move", number: "+13055550100" } }));
  open();
  await settle();
  await tick();
  assert.deepEqual(moving.asked.buy, [["+13055550142", "305"]]);
  assert.deepEqual(moving.asked.request, ["port"]);
});

test("Go live: Stripe closed before finishing says so, and the choice waits for another press", (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld({ outcome: "cancel" });
  keepChoice({ way: "keep", number: null, pick: null, pending: true });
  flashes.length = 0;
  setSetup(atLive(phoneReady()));
  open("live");
  const tree = mount();
  assert.equal(draftOf("first-run-phone").pending, false);
  assert.equal(textOf(flashes.at(-1).msg), "Checkout was closed before finishing; nothing was charged.");
  assert.ok(byTestId(tree, "fr-pay-go"), "Pay again");
});

test("Go live with no line provider here (canvas 5A·d): a person sets the line up, and what is connected goes live now -- nothing said of what is not", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  const noLines = { ...phoneReady(), lines: { ...phoneReady().lines, ready: false } };
  setSetup(
    atLive({
      ...noLines,
      channels: {
        ...noLines.channels,
        whatsapp: { present: true, active: true, number: "+13055550142", quality: "GREEN", lastInboundAt: null },
      },
      email: {
        ready: true,
        domain: null,
        mailbox: null,
        sending: { providers: ["google"], mailboxes: [{ address: "sam@getharbor.example" }] },
      },
    }),
  );
  flashes.length = 0;
  let tree = open();
  const none = byTestId(tree, "fr-no-provider");
  assert.match(textOf(none), /^We set up your line with you/);
  assert.match(textOf(none), /WhatsApp goes live now; emails keep coming to the Inbox/);
  await byTestId(tree, "fr-no-provider-ask").props.onClick();
  assert.deepEqual(asked.request, ["line"]);
  assert.match(textOf(flashes.at(-1).msg), /^Phone lines aren't automatic here yet\./);
  byTestId(tree, "fr-no-provider-without").props.onClick();
  assert.equal(went.at(-1), "today");
  // Nothing connected yet: only the calls, once the line is ready.
  setSetup(atLive(noLines));
  tree = open();
  assert.doesNotMatch(textOf(byTestId(tree, "fr-no-provider")), /goes live now|keep coming to the Inbox/);
  assert.match(textOf(byTestId(tree, "fr-no-provider")), /Calls, once your line is ready/);
});

/* ---- Switch it on (canvas 5B): the number ---- */
test("Switch it on: a buy marked sent long ago never landed (its tab closed on it), so the number row sends it again", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  const choice = { way: "keep", number: null, pick: null, pending: true };
  heldWaits.length = 0;
  keepChoice({ ...choice, sent: Date.now() - 10_000 });
  setSetup(atLive(phoneReady({ status: "active" })));
  open();
  await settle();
  assert.deepEqual(asked.buy, [], "sent seconds ago: on its way");
  assert.equal(heldWaits.length, 1, "and the row looks again once the mark goes stale");
  const left = heldWaits[0].ms;
  assert.ok(left > 100_000 && left <= 110_100, `about 110 s left of the two minutes, not ${left}`);
  keepChoice({ ...choice, sent: Date.now() - 600_000 });
  open();
  await settle();
  assert.deepEqual(asked.buy, [["+13055550142", "305"]], "ten minutes and no line: it never landed");
});

test("Switch it on: the number row and the forwarding row are both drawn while the number gets ready, and only one of them buys", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  keepChoice({ way: "keep", number: null, pick: null, pending: true });
  setSetup(atLive(phoneReady({ status: "active" })));
  const tree = open();
  await settle();
  assert.equal(allByTestId(tree, "fr-number").length, 1, "the number's part, once");
  assert.ok(byTestId(tree, "fr-forward"), "and the forwarding's row beside it");
  assert.deepEqual(asked.buy, [["+13055550142", "305"]], "one buy, never two");
  assert.equal(byTestId(tree, "fr-check-line"), null, "no call to check before the number is bought");
});

test("Switch it on: a buy refused (the number was taken) says so, back to Pay, and the next press buys", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  let refuse = true;
  const buy = globalThis.window.__setup.lines.buy;
  globalThis.window.__setup.lines.buy = async (e164, area) => {
    if (!refuse) return buy(e164, area);
    asked.buy.push(["refused", e164]);
    return { ok: false, queued: false, message: "That number was just taken. Pick another.", code: "conflict" };
  };
  flashes.length = 0;
  keepChoice({ way: "keep", number: null, pick: null, pending: true });
  setSetup(atLive(phoneReady({ status: "active" })));
  open();
  await settle();
  assert.deepEqual(asked.buy, [["refused", "+13055550142"]]);
  assert.match(textOf(flashes.at(-1).msg), /That number was just taken/);
  const tree = mount();
  assert.ok(byTestId(tree, "fr-pay-go"), "back to the press");
  refuse = false;
  await byTestId(tree, "fr-pay-go").props.onClick();
  open();
  await settle();
  assert.deepEqual(asked.buy.at(-1), ["+13055550142", "305"], "the second press buys");
});

test("Switch it on: what the list cannot do is Setup's own rows above it -- a card that did not pay -- and no plan is said to have started", (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  setSetup(atLive(phoneReady({ status: "past_due" })));
  const tree = open();
  assert.ok(byTestId(tree, "fr-switch"));
  assert.equal(byTestId(tree, "fr-switch-plan"), null, "no plan runs by card: nothing says it started");
  assert.ok(byTestId(tree, "setup-row-billing"), "Billing's own row, with its verb");
  assert.equal(byTestId(tree, "fr-number"), null, "nothing is bought on a card that did not pay");
});

/* ---- Switch it on: the forwarding of the number kept ---- */
test("Switch it on (canvas R4): while the number gets ready, the forwarding's two questions, kept as they are answered, the buy still on", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  keepChoice({ way: "keep", number: null, pick: null, pending: true, sent: Date.now() });
  setSetup(atLive(phoneReady({ status: "active" })));
  let tree = open();
  assert.equal(byTestId(tree, "fr-number").props["data-stage"], "buying");
  assert.equal(
    textOf(byTestId(tree, "fr-switch-forward")).startsWith("Needs youSend missed calls to it · on +1 (305) 555-0100"),
    true,
  );
  assert.equal(
    textOf(byTestId(tree, "fr-phone-questions")),
    "Which phone rings when customers call +1 (305) 555-0100?A mobileA landlineAn office phone system",
  );
  assert.equal(textOf(byTestId(tree, "fr-phone-held")), "Ready in a moment");
  choose(tree, "rings", "A mobile");
  tree = mount();
  choose(tree, "company", "T-Mobile");
  tree = mount();
  assert.equal(chosen(tree, "company"), "T-Mobile");
  const kept = draftOf("first-run-phone");
  assert.deepEqual(
    [kept.rings, kept.company, kept.pending],
    ["mobile", "tmobile", true],
    "the buy is still on its way",
  );
  await settle();
  assert.deepEqual(asked.buy, [], "sent from this tab moments ago: not sent again");
});

test("Switch it on: the line answers and the questions were answered at Where it answers, so the forwarding saves by itself -- every call, where that was chosen", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  let saved = forwardingSays();
  setSetup(atLive(answeringLine(), { want: { ...KEEP, rings: "landline" } }));
  open();
  await settle();
  assert.deepEqual(saved, [{ number: "+13055550100", carrier: "other", mode: "unanswered" }], "a landline's codes");
  // Another tab, another choice: the tab's own draft of the first stood in for the saved view's.
  emptyTab();
  saved = forwardingSays();
  setSetup(atLive(answeringLine(), { want: { ...KEEP, mode: "always", rings: "mobile", company: "verizon" } }));
  open();
  await settle();
  assert.deepEqual(saved, [{ number: "+13055550100", carrier: "verizon", mode: "always" }]);
});

test("Switch it on: unanswered, Show me what to dial waits for both answers, then saves the forwarding they choose", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const saved = forwardingSays();
  setSetup(atLive(answeringLine()));
  let tree = open();
  await settle();
  assert.deepEqual(saved, [], "nothing to save by itself");
  assert.equal(byTestId(tree, "fr-phone").props["data-stage"], "ask");
  const go = byTestId(tree, "fr-phone-go");
  assert.equal(textOf(go), "Show me what to dial");
  assert.equal(textOf(byTestId(tree, "fr-phone-held")), PW.answerFirst);
  await go.props.onClick();
  assert.deepEqual(saved, [], "held: nothing sent");
  choose(tree, "rings", "A landline");
  tree = mount();
  await byTestId(tree, "fr-phone-go").props.onClick();
  assert.deepEqual(saved, [{ number: "+13055550100", carrier: "other", mode: "unanswered" }]);
});

test("Switch it on (canvas R5, P5): the code from the forwarding saved, its help, Check my line, and changing the answers", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  forwardingSays();
  setSetup(
    atLive(answeringLine([forwardedRow("tmobile")]), { want: { ...KEEP, rings: "mobile", company: "tmobile" } }),
  );
  setLive({ now: [], recent: [] });
  t.after(() => setLive(undefined));
  let tree = open();
  assert.equal(byTestId(tree, "fr-phone").props["data-stage"], "code");
  const dial = byTestId(tree, "fr-phone-dial");
  assert.equal(textOf(dial), "**004*+13055550142#");
  assert.equal(
    dial.props.href,
    undefined,
    "words to dial: an iPhone refuses a link with * or #, and a desk has no dialer",
  );
  assert.equal(byTestId(tree, "fr-phone-tap"), null, "no tap where the phone cannot dial one");
  const ua = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "Mozilla/5.0 (Linux; Android 14)" },
    configurable: true,
  });
  try {
    assert.equal(
      byTestId(mount(), "fr-phone-tap").props.href,
      "tel:**004*%2B13055550142%23",
      "Android's dialer takes it",
    );
  } finally {
    if (ua) Object.defineProperty(globalThis, "navigator", ua);
    else delete globalThis.navigator;
  }
  assert.match(textOf(byTestId(tree, "fr-phone-warn")), /^Voicemail on this phone\?/);
  assert.equal(byTestId(tree, "fr-phone-notes"), null);
  byTestId(tree, "fr-phone-help").props.onClick();
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-phone-notes")), /T-Mobile takes the number with \+1 in front\./);
  assert.equal(byTestId(tree, "fr-phone-go"), null, "the code's way on is Check my line");
  // Check my line: the owner's own call through the number kept, listened for in place of the code.
  byTestId(tree, "fr-check-line").props.onClick();
  tree = mount();
  assert.equal(byTestId(tree, "fr-try").props["data-stage"], "listen");
  assert.equal(
    textOf(byTestId(tree, "fr-try-heading")),
    FIRST_RUN_HELPERS.tryIt({
      dto: answeringLine([forwardedRow("tmobile")]),
      calls: [],
      since: Date.now(),
      nowMs: Date.now(),
    }).heading,
  );
  // The answers asked again: the same answers save nothing (it would drop what a test call proved), and the code comes back.
  open();
  tree = mount();
  byTestId(tree, "fr-phone-change").props.onClick();
  tree = mount();
  assert.equal(byTestId(tree, "fr-phone").props["data-stage"], "ask", "the answers asked again");
  const saved = forwardingSays();
  await byTestId(tree, "fr-phone-go").props.onClick();
  assert.deepEqual(saved, []);
  assert.equal(byTestId(mount(), "fr-phone").props["data-stage"], "code");
});

test("Switch it on: asked again with the answers lost, the questions are about the number forwarded, and Keep the code goes back", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const saved = forwardingSays();
  keepChoice({ way: "keep", number: null, pick: null, pending: false });
  const row = { ...forwardedRow("other"), e164: "+13055550177" };
  setSetup(atLive(answeringLine([row])));
  let tree = open();
  assert.equal(
    textOf(byTestId(tree, "fr-phone-code")).startsWith("Another carrier or a landline"),
    true,
    "neither said",
  );
  byTestId(tree, "fr-phone-change").props.onClick();
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-q-rings")), /\+1 \(305\) 555-0177/, "the forwarded number, not the listing's");
  choose(tree, "rings", "A mobile");
  tree = mount();
  choose(tree, "company", "Verizon");
  tree = mount();
  await byTestId(tree, "fr-phone-go").props.onClick();
  assert.deepEqual(saved, [{ number: "+13055550177", carrier: "verizon", mode: "unanswered" }]);
  keepChoice({ way: "keep", number: null, pick: null, pending: false, redo: true });
  tree = open();
  byTestId(tree, "fr-phone-keep").props.onClick();
  assert.equal(byTestId(mount(), "fr-phone").props["data-stage"], "code", "back to the code, nothing saved");
});

test("Switch it on: a role that may not save the forwarding sees the questions and a press that says why it is held, and saves nothing", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const saved = forwardingSays();
  setSetup(atLive(answeringLine(), { want: { ...KEEP, rings: "landline" } }));
  // The line's presses are the channel permission (contracts ROLE_PERMS `disconnect`), which an operator lacks.
  globalThis.window.canDo = (what) => what === "approve" || what === "autonomy";
  try {
    const tree = open();
    await settle();
    assert.deepEqual(saved, [], "nothing saved by itself for a role that may not");
    const go = byTestId(tree, "fr-phone-go");
    await go.props.onClick();
    assert.deepEqual(saved, []);
  } finally {
    globalThis.window.canDo = () => true;
  }
});

test("Switch it on (canvas V6): an office phone system is shown the number, and Do it with me asks a person, once a day", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  forwardingSays();
  flashes.length = 0;
  setSetup(atLive(answeringLine([forwardedRow("office")]), { want: { ...KEEP, rings: "office" } }));
  const tree = open();
  assert.equal(textOf(byTestId(tree, "fr-phone-dial")), "+1 (305) 555-0142");
  await byTestId(tree, "fr-phone-with-me-go").props.onClick();
  assert.deepEqual(asked.request, ["forwarding"]);
  assert.equal(textOf(flashes.at(-1).msg), "We'll email you to find a time for a call.");
  setSetup(
    atLive(
      {
        ...answeringLine([forwardedRow("office")]),
        requests: { line: null, forwarding: new Date(Date.now() - 3_600_000).toISOString() },
      },
      { want: { ...KEEP, rings: "office" } },
    ),
  );
  const later = open();
  assert.equal(byTestId(later, "fr-phone-with-me-go"), null);
  assert.match(textOf(byTestId(later, "fr-phone-with-me-asked")), /^Asked /);
});

test("a number kept is the member's own choice, on any tab: Go live asks its forwarding from their saved view, and Set up forwarding later puts it off by name", async (t) => {
  t.after(restoreSetupVerbs);
  // A tab with nothing kept: the choice was made somewhere else (a reload, another device, checkout's way back).
  const { asked } = phoneWorld();
  setSetup(atLive(answeringLine()));
  const tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "live", "not done: its forwarding is owed");
  assert.equal(byTestId(tree, "fr-phone").props["data-stage"], "ask");
  assert.match(textOf(byTestId(tree, "fr-q-rings")), /^Which phone rings when customers call \+1 \(305\) 555-0100\?/);
  const off = byTestId(tree, "fr-phone-put-off");
  assert.equal(textOf(off), "Set up forwarding later");
  flashes.length = 0;
  await off.props.onClick();
  await tick();
  assert.deepEqual(
    asked.later,
    [[KEEP_ROW, { on: true, why: "rest" }]],
    "Setup's own Later, on the number kept: a week, then back on Today",
  );
  assert.equal(
    textOf(flashes.at(-1).msg),
    "Put off for a week, then it's back on Today. Until it is set up, only calls to your receptionist's own number are answered.",
  );
  assert.equal(replaced.at(-1), "start/live", "Go live still: the owner's own call is next");
  const after = mount();
  assert.equal(byTestId(after, "fr-switch-forward").props["data-state"], "later", "the row says it was put off");
});

test("the code is a press to copy, for the phone it is typed on; a browser that will not copy says so", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  forwardingSays();
  setSetup(
    atLive(answeringLine([forwardedRow("tmobile")]), { want: { ...KEEP, rings: "mobile", company: "tmobile" } }),
  );
  const copy = byTestId(open(), "fr-phone-copy");
  assert.equal(textOf(copy), "Copy");
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copied = [];
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "", clipboard: { writeText: async (text) => void copied.push(text) } },
    });
    flashes.length = 0;
    await copy.props.onClick();
    await tick();
    assert.deepEqual(copied, ["**004*+13055550142#"], "the code as it is dialled");
    assert.equal(textOf(flashes.at(-1).msg), "Copied");
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "" } });
    await copy.props.onClick();
    await tick();
    assert.equal(textOf(flashes.at(-1).msg), "Not copied. Select the code and copy it yourself.");
  } finally {
    if (nav) Object.defineProperty(globalThis, "navigator", nav);
    else delete globalThis.navigator;
  }
});

test("a step that waits looks again at its own pace: the number on its way asks Setup, quietly, and Pay asks nothing", (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const looked = [];
  const wasPeek = setupVerbs.peek;
  setupVerbs.peek = async () => void looked.push("setup");
  try {
    setSetup(atLive(phoneReady({ status: "active" })));
    heldTicks.length = 0;
    open();
    assert.equal(heldTicks.filter((x) => x.ms === 6000).length, 0, "no look while the owner has not pressed");
    // The number is on its way: the live feed says when it lands, and the page looks too, in case it did not.
    const provisioning = answeringLine();
    provisioning.channels = {
      ...provisioning.channels,
      voice: { present: false, active: false, number: null, lastInboundAt: null },
    };
    provisioning.lines = {
      ...provisioning.lines,
      rows: [
        {
          ...provisioning.lines.rows[0],
          voice_state: "provisioning",
          step: "number",
          state_since: new Date().toISOString(),
        },
      ],
    };
    setSetup(atLive(provisioning));
    heldTicks.length = 0;
    const tree = open();
    assert.equal(byTestId(tree, "fr-number").props["data-stage"], "getting");
    const look = heldTicks.find((x) => x.ms === 6000);
    assert.ok(look, "a look every six seconds while the step waits");
    look.fn();
    assert.deepEqual(looked, ["setup"], "Setup's quiet look: one that fails changes nothing on screen");
  } finally {
    setupVerbs.peek = wasPeek;
  }
});

/* ---- Switch it on: the owner's own call ---- */
const VOICE_OWN = "+13055550123";
const untried = {
  ...withFacts,
  channels: { ...withFacts.channels, voice: { present: true, active: true, number: VOICE_OWN, lastInboundAt: null } },
  lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
};
const OWN = { way: "new", number: VOICE_OWN };

test("Check my line (canvas R6): calls answered and none yet, it listens for the owner's call, and skipping asks once first", async (t) => {
  const asked = tryWorld(t);
  t.after(restoreSetupVerbs);
  setLive({ now: [], recent: [] });
  t.after(() => setLive(undefined));
  setSetup(atLive(untried, { want: OWN }));
  let tree = open();
  assert.equal(
    textOf(byTestId(tree, "fr-switch-forward")).startsWith("Needs youCall +1 (305) 555-0123 once from your cell."),
    true,
  );
  byTestId(tree, "fr-check-line").props.onClick();
  tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-try-heading")), "Call your receptionist from your cell.");
  assert.equal(byTestId(tree, "fr-try").props["data-stage"], "listen");
  assert.equal(textOf(byTestId(tree, "fr-try-number")), "+1 (305) 555-0123");
  // The number is a press that dials it (a phone's foot draws it; a desk has nothing to dial with).
  const dial = byTestId(tree, "fr-try-dial");
  assert.equal(textOf(dial), "Call +1 (305) 555-0123");
  assert.equal(dial.props.href, "tel:+13055550123");
  await byTestId(tree, "fr-try-skip-go").props.onClick();
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-try-nudge")), /^Most owners call once/);
  assert.deepEqual(asked.later, [], "one nudge first");
  await byTestId(tree, "fr-try-skip-go").props.onClick();
  await tick();
  assert.deepEqual(
    asked.later,
    [[TRY_SKIPPED, { on: true, why: "answer" }]],
    "then the wait is put off for this member",
  );
  // Check my line's other way: Do it later, from the row itself.
  const later = tryWorld(t);
  tree = open();
  await byTestId(tree, "fr-check-later").props.onClick();
  assert.deepEqual(later.later, [[TRY_SKIPPED, { on: true, why: "answer" }]]);
});

test("Check my line (canvas R7, R8): it picked up with the words, then the call and the transfer saved through the Business tab's saver", async (t) => {
  const asked = tryWorld(t);
  t.after(restoreSetupVerbs);
  t.after(() => setLive(undefined));
  setSetup(atLive(untried, { want: OWN }));
  setLive({ now: [liveCall()], recent: [] });
  let tree = open();
  // A call on screen: the row opens on it, whatever was pressed.
  assert.equal(textOf(byTestId(tree, "fr-try-heading")), "It picked up.");
  assert.match(textOf(byTestId(tree, "fr-try-proof")), /^Your receptionist answered · on the call now · 0:[12]\d$/);
  assert.equal(
    textOf(byTestId(tree, "fr-try-turns")),
    "ReceptionistThank you for calling Harbor Moving!YouAre you open on Sunday?",
  );
  setLive({ now: [], recent: [liveCall({ live: false, status: "ended", duration: "0:48" })] });
  tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-try-heading")), "That's your receptionist.");
  assert.equal(textOf(byTestId(tree, "fr-try-meta")), "0:48 · from +1 (786) 555-0199 · 2:59 PM");
  // Where a caller goes is the kit's choice of a few: the phone they called from first, a message last. Arrow keys move
  // the choice: shown at once, saved once they settle, the last one only.
  const transfer = (tree0, key) => {
    const options = optionsOf(tree0, "fr-try-transfer");
    return key === "caller" ? options[0] : options.at(-1);
  };
  transfer(mount(), "message").props.onClick();
  transfer(mount(), "caller").props.onClick();
  tree = mount();
  assert.equal(transfer(tree, "caller").props["aria-checked"], true, "shown at once");
  assert.equal(asked.saves.length, 0, "nothing sent while the keys still move");
  await new Promise((r) => setTimeout(r, 650));
  assert.equal(asked.saves.length, 1, "one save, of the last choice");
  assert.equal(asked.saves[0].row, "handoff_number");
  assert.equal(asked.saves[0].change({}, {}).profile.handoff_number, "+17865550199", "the phone they called from");
  byTestId(tree, "fr-try-inbox").props.onClick();
  assert.equal(went.at(-1), "conversations/cv-c1", "the call itself, in the Inbox");
  // The settings read not in yet: the saver would send nothing, so the page says so rather than showing a choice.
  businessTabSave.saver.base = () => null;
  flashes.length = 0;
  tree = open();
  transfer(tree, "caller").props.onClick();
  assert.equal(asked.saves.length, 1, "nothing sent");
  assert.equal(textOf(flashes.at(-1).msg), "Your settings are still being read. Try again in a moment.");
});

test("Check my line stays on screen when Setup hears of the call mid-call: the words and the transfer are still to come, then Continue says what answers", (t) => {
  tryWorld(t);
  t.after(restoreSetupVerbs);
  t.after(() => setLive(undefined));
  setSetup(atLive(untried, { want: OWN }));
  setLive({ now: [liveCall()], recent: [] });
  assert.equal(textOf(byTestId(open(), "fr-try-heading")), "It picked up.");
  // The call reached the receptionist: Setup reads it, and every step is done.
  const heard = {
    ...untried,
    channels: { ...untried.channels, voice: { ...untried.channels.voice, lastInboundAt: new Date().toISOString() } },
  };
  setSetup(atLive(heard, { want: OWN }));
  setLive({ now: [], recent: [liveCall({ live: false, status: "ended", duration: "0:48" })] });
  const after = mount();
  assert.equal(textOf(byTestId(after, "fr-try-heading")), "That's your receptionist.", "not jumped on to You're live");
  assert.ok(byTestId(after, "fr-try-transfer"), "where transfers go is asked");
  byTestId(after, "fr-try-go").props.onClick();
  assert.equal(replaced.at(-1), "start/live");
  assert.ok(byTestId(mount(), "fr-youre-live"), "and then what answers");
});

/* ---- Switch it on: WhatsApp, the booking-link message, what came in ---- */
/** Go live still connecting: the line answers and the code is saved, not yet proved by a call. */
const connecting = (over = {}) => ({ ...answeringLine([forwardedRow("tmobile")]), ...over });
/** Everything proved: the forwarding by a call through it, so every step is done. */
const proved = (over = {}) => ({
  ...answeringLine([forwardedRow("tmobile", "verified")]),
  channels: {
    ...answeringLine().channels,
    voice: { present: true, active: true, number: "+13055550142", lastInboundAt: "2026-09-07T14:00:00Z" },
  },
  ...over,
});
/** Meta's door as the row asks it, remembering what was asked; its SDK fetched ahead as the row opens. */
const metaWorld = (t, answer = { ok: true, number: "+13055550100", verifiedName: null, qualityRating: null }) => {
  const asked = { start: [], prepared: 0 };
  const was = { ...waConnect };
  t.after(() => Object.assign(waConnect, was));
  Object.assign(waConnect, {
    config: async () => ({ ready: true, canConnect: true, app_id: "1", config_id: "2", graph_version: "v23.0" }),
    prepare: () => {
      asked.prepared += 1;
    },
    start: async (o) => {
      asked.start.push(o ?? null);
      return answer;
    },
  });
  return asked;
};

test("Switch it on (canvas 5B·g): WhatsApp on the number customers call keeps the app -- Meta's steps said first, what sharing the history brings, and the way to skip", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const meta = metaWorld(t);
  const choices = { whatsapp: "same" };
  setSetup(atLive(connecting(), { choices }));
  let tree = open();
  await settle();
  assert.equal(meta.prepared, 1, "Meta's SDK in hand before the press");
  const wa = byTestId(tree, "fr-switch-whatsapp");
  assert.equal(wa.props["data-state"], "needs");
  const steps = textOf(byTestId(tree, "fr-wa-steps"));
  assert.match(steps, /^Connect WhatsApp, keep the app/);
  assert.match(steps, /In Meta's window, \+1 \(305\) 555-0100 is filled in\. Copy the code it shows\./);
  assert.match(steps, /your one-to-one chats of the last 6 months come into Inbox/);
  assert.equal(byTestId(tree, "fr-wa-not-shared"), null);
  let toggle = null;
  walk(byTestId(tree, "fr-wa-steps"), (n) => {
    if (!toggle && n.props?.["aria-expanded"] !== undefined) toggle = n;
  });
  toggle.props.onClick();
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-wa-not-shared")), /Meta offers the history once, while the number connects/);
  assert.equal(textOf(byTestId(tree, "fr-wa-open")), "Open Meta's window");
  await byTestId(tree, "fr-wa-open").props.onClick();
  assert.deepEqual(meta.start, [{ keepApp: true }], "Meta's own flow for business app users");
  assert.equal(
    textOf(byTestId(tree, "fr-switch-template")),
    "Your booking-link message · Meta is reviewing it · until then it takes a caller's details",
  );
  // Skip WhatsApp for now: the choice kept as later, and the row goes.
  await byTestId(tree, "fr-wa-skip").props.onClick();
  assert.equal(byTestId(mount(), "fr-switch-whatsapp"), null, "WhatsApp later: nothing to approve");
});

test("Switch it on: WhatsApp on its own number opens Meta's window at once; a window closed is said quietly, a failure as a warning", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const meta = metaWorld(t, { ok: false, reason: "cancelled", message: "WhatsApp was not connected." });
  flashes.length = 0;
  setSetup(atLive(connecting(), { choices: { whatsapp: "own" } }));
  const tree = open();
  assert.equal(byTestId(tree, "fr-wa-not-shared"), null);
  assert.doesNotMatch(textOf(byTestId(tree, "fr-wa-steps")), /keep the app/);
  assert.equal(textOf(byTestId(tree, "fr-wa-open")), "Connect WhatsApp");
  await byTestId(tree, "fr-wa-open").props.onClick();
  assert.deepEqual(meta.start, [{ keepApp: false }]);
  assert.equal(flashes.at(-1).tone, "info");
  waConnect.start = async () => ({ ok: false, reason: "failed", message: "Meta refused the number." });
  await byTestId(open(), "fr-wa-open").props.onClick();
  assert.equal(flashes.at(-1).tone, "warn");
  assert.equal(textOf(flashes.at(-1).msg), "Meta refused the number.");
});

test("Switch it on (canvas 5B·i): what came in, a line a source, the kept app's chats in Meta's three parts; Ask's count beside, and Open Today keeps it going", (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const history = {
    source: "whatsapp_history",
    state: "running",
    counts: { messages: 120, people: 30 },
    parts_done: 1,
    parts_total: 3,
    oldest: null,
    started_at: "2026-09-07T14:50:00Z",
    finished_at: null,
    last_error: null,
    via: null,
  };
  setSetup(
    atLive(
      connecting({
        imports: [history],
        channels: {
          ...connecting().channels,
          whatsapp: { present: true, active: false, number: "+13055550100", quality: null, lastInboundAt: null },
        },
      }),
      { choices: { whatsapp: "same" } },
    ),
  );
  const tree = open();
  const imports = allByTestId(tree, "fr-switch-imports");
  assert.equal(imports.length, 1);
  const parts = byTestId(imports[0], "fr-wa-parts");
  assert.ok(parts, "Meta's three parts under its line");
  const shown = [];
  walk(parts, (n) => {
    if (n.type === "li") shown.push(n.props["data-state"]);
  });
  assert.equal(shown.length, 3, "a line a part");
  const ask = byTestId(tree, "fr-on-ask");
  assert.match(textOf(ask), /^Getting your receptionist ready\d+ of \d+ done/);
  assert.match(textOf(ask), /EmailWaits for you in the Inbox/);
  assert.match(textOf(ask), /WhatsAppOn/, "connected: on");
  assert.match(textOf(ask), /CallsOnce your line is proved/, "the code saved, not yet proved by a call");
  assert.equal(byTestId(tree, "fr-switch-whatsapp").props["data-state"], "done", "connected: nothing to approve here");
  byTestId(tree, "fr-switch-today").props.onClick();
  assert.equal(went.at(-1), "today");
});

/* ---- You're live (canvas 5C) ---- */
test("You're live never waited on WhatsApp: chosen and not connected, its steps are offered there; left for later, the way back to Where it answers", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const meta = metaWorld(t);
  setSetup(atLive(proved(), { choices: { whatsapp: "same" } }));
  let tree = open();
  assert.ok(byTestId(tree, "fr-youre-live"), "every step done: what answers now");
  const note = byTestId(tree, "fr-live-whatsapp_connect");
  assert.match(textOf(note), /^WhatsApp · approve the connection in WhatsApp Business on that phone/);
  assert.match(textOf(note), /Calls and email answer now\. WhatsApp joins once you approve it on your phone/);
  await byTestId(note, "fr-wa-open").props.onClick();
  assert.deepEqual(meta.start, [{ keepApp: true }]);
  // Left for later: said once, and its press goes back to the step that chooses.
  setSetup(atLive(proved(), { choices: { whatsapp: "later" } }));
  tree = open();
  assert.equal(byTestId(tree, "fr-live-whatsapp_connect"), null);
  const later = byTestId(tree, "fr-live-whatsapp_later");
  assert.match(textOf(later), /^WhatsApp · later/);
  const choose = byTestId(later, "fr-live-whatsapp-choose");
  assert.equal(textOf(choose), "Connect WhatsApp now");
  went.length = 0;
  choose.props.onClick();
  assert.equal(went.at(-1), "start/channels", "Where it answers, where WhatsApp is chosen");
});

test("You're live (canvas 5C): what answers now, Ask's three moves each waiting for a yes, what was set up, and Open Today switches calls on", async (t) => {
  t.after(restoreSetupVerbs);
  const activated = [];
  setupVerbs.activate = async (kind) => {
    activated.push(kind);
    return { ok: true, message: "" };
  };
  setSetup(atLive(answering, { want: { way: "new", number: "+13055550123" } }));
  setSettings({
    config: { brain: { business_name: "Harbor Moving" }, notifications: { escalation_emails: ["owner@example.com"] } },
  });
  t.after(() => setSettings(null));
  const tree = open();
  assert.equal(textOf(byTestId(tree, "fr-live-channels")), "Calls to +1 (305) 555-0123 · your emails in the Inbox");
  assert.deepEqual(
    ["yes", "remind", "winBack"].map((k) => textOf(byTestId(tree, `fr-move-go-${k}`))),
    ["Get the QR", "Turn on", "See the draft"],
    "the yes first, then the day-before reminder (a calendar is linked), then the win-back",
  );
  assert.match(textOf(byTestId(tree, "fr-live-whatsapp_later")), /^WhatsApp · later/);
  byTestId(tree, "fr-move-go-yes").props.onClick();
  assert.equal(went.at(-1), GET_YES_ROUTE);
  assert.equal(
    textOf(byTestId(tree, "fr-live-emails")),
    "Emails you atowner@example.com, when someone needs youChange",
  );
  assert.match(
    textOf(byTestId(tree, "fr-live-greeting")),
    /^Every caller hears “Hi, Harbor Moving\. I'm the automated assistant, and calls are recorded\./,
  );
  assert.equal(textOf(byTestId(tree, "fr-live-note")), "We'll email you a copy of this.");
  await byTestId(tree, "fr-onward").props.onClick();
  await tick();
  assert.deepEqual(activated, ["voice"], "the owner's own act, recorded");
  assert.equal(went.at(-1), "today");
});

test("You're live: a refused Open Today stays and says why, and again goes on; a teammate's promises no email", async (t) => {
  t.after(restoreSetupVerbs);
  let answer = { ok: false, message: "Not ready to activate: the line is switched off." };
  const asked = [];
  setupVerbs.activate = async (kind, opts) => {
    asked.push([kind, opts]);
    return answer;
  };
  setSetup(atLive(answering, { want: { way: "new", number: "+13055550123" } }));
  setSettings({
    config: { brain: { business_name: "Harbor Moving" }, notifications: { escalation_emails: ["owner@example.com"] } },
  });
  t.after(() => setSettings(null));
  try {
    flashes.length = 0;
    const before = went.length;
    let tree = open();
    await byTestId(tree, "fr-onward").props.onClick();
    assert.deepEqual(asked, [["voice", { firstRun: true }]], "the first run's own Finish, so its first time emails");
    assert.equal(went.length, before, "refused: the step stays, so the refusal is read");
    assert.match(textOf(flashes.at(-1).msg), /line is switched off/);
    tree = mount();
    await byTestId(tree, "fr-onward").props.onClick();
    assert.equal(asked.length, 1, "not asked again");
    assert.equal(went.at(-1), "today", "again goes on");
    // A teammate: Open Today switches nothing on (the channel permission), so nothing promises an email.
    globalThis.window.canDo = (what) => what === "approve" || what === "autonomy";
    assert.equal(byTestId(open(), "fr-live-note"), null);
  } finally {
    globalThis.window.canDo = () => true;
    setupVerbs.activate = readyActivate;
    answer = null;
  }
});
