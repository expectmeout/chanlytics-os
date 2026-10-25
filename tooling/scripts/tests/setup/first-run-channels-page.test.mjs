/**
 * The first run's Where it answers (decision 0073, canvas 4, 4·a–4·k), drawn on the page without a browser: calls (keep
 * the number customers call, a new one picked in its area code, or move it; which calls go on; the number looked up by the
 * carrier's records, R11), WhatsApp (is it on WhatsApp Business, the three ways), bookings (the tool found, its calendar
 * link, its clients' file, or how people book without one), the owner's own mailbox, the dashboard filling in beside
 * them, and Continue to go live, which keeps the choices in the member's view and buys nothing. The world is
 * _first-run-world.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HELPERS, KEEP_ROW } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import {
  atChannels,
  boxOf,
  byId,
  byTestId,
  flashes,
  mount,
  open,
  optionsOf,
  phoneReady,
  phoneWorld,
  pick,
  replaced,
  restoreSetupVerbs,
  saverWorld,
  setSettings,
  setSetup,
  setupVerbs,
  submit,
  textOf,
  tick,
  walk,
  wayOf,
  went,
} from "./_first-run-world.mjs";

const { waConnect } = await importSrc("apps/dashboard/src/surfaces/settings/connections/whatsapp.ts");
const { connectedMailboxes } = await importSrc(
  "apps/dashboard/src/surfaces/settings/connections/connected-mailboxes.ts",
);
const PW = FIRST_RUN_HELPERS.phoneWords;
const CW = FIRST_RUN_HELPERS.channelsWords;
/** This deployment's Meta door, as the page asks whether it connects keeping the app (R12). */
const metaDoor = (t, keepApp) => {
  const was = waConnect.config;
  t.after(() => {
    waConnect.config = was;
  });
  waConnect.config = async () => ({ ready: true, keep_app: keepApp, canConnect: true });
};
/** A kit sheet by the test id it is given. */
const sheetOf = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.testid === id) hit = n;
  });
  return hit;
};

/* ---- Calls ---- */
test("Where it answers (canvas 4): the calls tile keeps the listing's number first, nothing is bought, and Continue to go live keeps the choice before Go live", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(atChannels(phoneReady()));
  let tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "channels");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Where should it answer?");
  assert.equal(textOf(byTestId(tree, "fr-phone-line")), "4 of 5 · Where it answers");
  assert.match(textOf(byTestId(tree, "first-run")), /Nothing is bought here; it all connects when you go live\./);
  assert.equal(wayOf(tree, "keep").props["aria-checked"], true, "keeping is the default");
  assert.match(textOf(wayOf(tree, "keep")), /^Keep \+1 \(305\) 555-0100Recommended/);
  assert.equal(boxOf(tree, "fr-phone-number-box").props.value, "+1 (305) 555-0100", "from the listing");
  assert.equal(textOf(byTestId(tree, "fr-calls-lookup")), "Your Google listing's number");
  assert.deepEqual(
    optionsOf(tree, "fr-calls-mode").map((o) => [textOf(o).startsWith(PW.mode.unanswered), o.props["aria-checked"]]),
    [
      [true, true],
      [false, false],
    ],
    "the calls nobody picks up, unless every call is chosen",
  );
  assert.doesNotMatch(textOf(byTestId(tree, "fr-channels")), /\$\d/, "no price here: Go live spends");
  assert.equal(textOf(byTestId(tree, "fr-channels-foot")), "1 on · nothing is charged yet");
  byTestId(tree, "fr-back").props.onClick();
  assert.equal(went.at(-1), "start/rehearse");
  // Every call, chosen: kept with the choice, and said to the member's view with it.
  pick(tree, "fr-calls-mode", PW.mode.always);
  tree = mount();
  const onward = byTestId(tree, "fr-onward");
  assert.equal(textOf(onward), "Continue to go live");
  went.length = 0;
  await onward.props.onClick();
  await tick();
  assert.deepEqual(asked.want, [{ way: "keep", number: "+13055550100", mode: "always" }]);
  assert.deepEqual(asked.later, [[KEEP_ROW, false]], "a number kept asks for its forwarding, wherever it was put off");
  assert.equal(replaced.at(-1), "start/channels", "the bare address being left is named for its step");
  assert.equal(went.at(-1), "start/live", "and on to Go live, a new entry");
  assert.deepEqual([asked.checkout, asked.buy], [[], []], "nothing is bought here");
});

test("Where it answers on a deployment that sells no numbers: no calls tile, and Continue keeps that the member went on, then Go live -- never a press that stays put", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(
    atChannels({
      ...phoneReady(),
      lines: { rows: [], ready: false, provider: null, costs: { local_number_month_usd: 1.15 } },
    }),
  );
  const tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "channels");
  assert.equal(byTestId(tree, "fr-calls"), null, "no number to choose here");
  went.length = 0;
  await byTestId(tree, "fr-onward").props.onClick();
  await tick();
  assert.deepEqual(asked.later, [[FIRST_RUN_HELPERS.channelsSeen, true]], "the member's going on, kept as theirs");
  assert.deepEqual(asked.want, [], "no number chosen, none said");
  assert.equal(went.at(-1), "start/live", "and on to Go live");
});

test("(D) Where it answers: what is wrong is said on the field it is about -- the number once the box is left, the area code once Find is pressed -- and Continue holds", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(atChannels(phoneReady()));
  flashes.length = 0;
  let tree = open();
  const box = () => boxOf(tree, "fr-phone-number-box");
  const NUMBER_PROBLEM = "rec-fr-phone-number-problem";
  const AREA_PROBLEM = "rec-fr-phone-area-problem";
  box().props.onChange({ target: { value: "12" } });
  tree = mount();
  assert.equal(byId(tree, NUMBER_PROBLEM), null, "not at the first keystroke");
  box().props.onBlur();
  tree = mount();
  assert.equal(textOf(byId(tree, NUMBER_PROBLEM)), PW.held.us, "left: said under the box");
  assert.deepEqual([box().props["aria-invalid"], box().props["aria-describedby"]], [true, NUMBER_PROBLEM]);
  assert.equal(textOf(byTestId(tree, "fr-channels-foot")), PW.held.us, "and beside Continue, the same words");
  assert.equal(byTestId(tree, "fr-onward").props["aria-disabled"], true);
  await byTestId(tree, "fr-onward").props.onClick();
  assert.deepEqual(asked.want, [], "held: nothing kept");
  box().props.onChange({ target: { value: "(305) 555-0177" } });
  tree = mount();
  assert.equal(byId(tree, NUMBER_PROBLEM), null, "a number it can forward says nothing");
  // A new number: the area code, checked as Find is pressed.
  wayOf(tree, "new").props.onClick();
  tree = mount();
  boxOf(tree, "fr-phone-area").props.onChange({ target: { value: "30" } });
  tree = mount();
  await submit(byTestId(tree, "fr-calls"));
  tree = mount();
  assert.equal(textOf(byId(tree, AREA_PROBLEM)), PW.threeDigits);
  assert.deepEqual(flashes, [], "nothing said in a toast");
  boxOf(tree, "fr-phone-area").props.onChange({ target: { value: "305" } });
  tree = mount();
  assert.equal(byId(tree, AREA_PROBLEM), null, "typing again takes it away");
});

test("Where it answers: a new number is picked from its area code, and Continue keeps that number and puts the kept number's forwarding off", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(atChannels(phoneReady()));
  let tree = open();
  wayOf(tree, "new").props.onClick();
  tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-channels-foot")), "Pick a number first.");
  assert.equal(boxOf(tree, "fr-phone-area").props.value, "305", "the listing's area code");
  assert.match(textOf(byTestId(tree, "fr-calls")), new RegExp(CW.calls.newSays.slice(0, 40)));
  await submit(byTestId(tree, "fr-calls"));
  assert.deepEqual(asked.search, ["305"]);
  tree = mount();
  optionsOf(tree, "fr-phone-numbers")[0].props.onClick();
  tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-channels-foot")), "1 on · nothing is charged yet");
  await byTestId(tree, "fr-onward").props.onClick();
  await tick();
  assert.deepEqual(asked.want, [{ way: "new", number: "+13055550142" }]);
  assert.deepEqual(asked.later, [[KEEP_ROW, true]], "a new number keeps none: Today's card stops asking for it");
  assert.deepEqual(asked.buy, [], "and nothing is bought until Go live");
  // No number free in an area code: said once, in the toast, and nothing to pick.
  phoneWorld({ numbers: [] });
  setSetup(atChannels(phoneReady()));
  flashes.length = 0;
  tree = open();
  wayOf(tree, "new").props.onClick();
  tree = mount();
  await submit(byTestId(tree, "fr-calls"));
  assert.equal(textOf(flashes.at(-1).msg), PW.noneFree("305"));
});

test("Where it answers (R11): the number kept is looked up once it rests in the box, what the carrier says is said, and its answers go on to Go live's code", async (t) => {
  t.after(restoreSetupVerbs);
  // This stub never unmounts: the rests the suite's earlier draws began run out first, so this draw's read is its own.
  await new Promise((r) => setTimeout(r, 750));
  const { asked } = phoneWorld({ lookup: { type: "mobile", carrier: "verizon", name: "Verizon Wireless" } });
  setSetup(atChannels(phoneReady()));
  open();
  assert.deepEqual(asked.lookup, [], "not at once: the box rests first");
  await new Promise((r) => setTimeout(r, 750));
  assert.deepEqual(asked.lookup, ["+13055550100"], "one carrier read");
  const tree = mount();
  assert.equal(
    textOf(byTestId(tree, "fr-calls-lookup")),
    "Your Google listing's number · a Verizon mobile, we checked",
  );
  await byTestId(tree, "fr-onward").props.onClick();
  await tick();
  assert.deepEqual(asked.want, [{ way: "keep", number: "+13055550100", rings: "mobile", company: "verizon" }]);
});

test("Where it answers: moving the number says what moving means, and keeps the move", async (t) => {
  t.after(restoreSetupVerbs);
  const { asked } = phoneWorld();
  setSetup(atChannels(phoneReady()));
  let tree = open();
  wayOf(tree, "move").props.onClick();
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-calls")), new RegExp(CW.calls.moveSays));
  await byTestId(tree, "fr-onward").props.onClick();
  await tick();
  assert.deepEqual(asked.want, [{ way: "move", number: "+13055550100" }]);
  assert.deepEqual(asked.request, [], "a person is asked at Go live, with the buy");
});

/* ---- WhatsApp ---- */
test("Where it answers: WhatsApp asks whether the number is on WhatsApp Business, offers the three ways, keeps each as picked, and Not yet takes the same number away", async (t) => {
  t.after(restoreSetupVerbs);
  metaDoor(t, true);
  phoneWorld();
  setSetup(atChannels(phoneReady()));
  open();
  await tick();
  // The page asks Meta's door whether it connects keeping the app, in an effect: drawn again once it answers.
  let tree = mount();
  const wa = byTestId(tree, "fr-whatsapp");
  assert.match(textOf(wa), /^WhatsAppIs \+1 \(305\) 555-0100 on WhatsApp Business\?/);
  assert.deepEqual(
    optionsOf(tree, "fr-whatsapp-way").map((o) => textOf(o)),
    [
      `WhatsApp on +1 (305) 555-0100${CW.whatsapp.sameSays}`,
      `On its own number${CW.whatsapp.ownSays}`,
      `Later${CW.whatsapp.laterSays}`,
    ],
    "keeping the app, where this deployment connects that way",
  );
  pick(tree, "fr-whatsapp-way", "WhatsApp on");
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-whatsapp")), /Approve on your phone at Go live$/);
  assert.equal(textOf(byTestId(tree, "fr-channels-foot")), "2 on · nothing is charged yet");
  // Not yet: the same number is not on WhatsApp, so it answers on its own.
  pick(tree, "fr-whatsapp-on", CW.whatsapp.notYet);
  await tick();
  tree = mount();
  assert.equal(optionsOf(tree, "fr-whatsapp-way").length, 2, "the same number is gone");
  assert.equal(optionsOf(tree, "fr-whatsapp-way")[0].props["aria-checked"], true, "its own number, kept");
});

test("Where it answers: WhatsApp where this deployment cannot keep the app says what connecting does; already connected, it says so and asks nothing", async (t) => {
  t.after(restoreSetupVerbs);
  metaDoor(t, false);
  phoneWorld();
  setSetup(atChannels(phoneReady()));
  open();
  await tick();
  let tree = mount();
  assert.equal(textOf(optionsOf(tree, "fr-whatsapp-way")[0]), `WhatsApp on +1 (305) 555-0100${CW.whatsapp.sameMoves}`);
  setSetup(
    atChannels({
      ...phoneReady(),
      channels: {
        ...phoneReady().channels,
        whatsapp: { present: true, active: true, number: "+13055550100", quality: null, lastInboundAt: null },
      },
    }),
  );
  tree = open();
  assert.equal(textOf(byTestId(tree, "fr-whatsapp")), "WhatsAppConnected on +1 (305) 555-0100");
  assert.equal(textOf(byTestId(tree, "fr-channels-foot")), "2 on · nothing is charged yet");
});

/* ---- Bookings ---- */
test("Where it answers: the booking tool found on the website, its calendar link read, and the clients' file one press away", (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const calendar = {
    source: "calendar",
    state: "done",
    counts: { past: 412, coming: 9 },
    parts_done: 1,
    parts_total: 1,
    oldest: "2026-03-07T00:00:00Z",
    started_at: "2026-09-07T14:00:00Z",
    finished_at: "2026-09-07T14:01:00Z",
    last_error: null,
    via: "vagaro",
  };
  setSetup(atChannels({ ...phoneReady(), calendar: { state: "ok", tool: "vagaro" }, imports: [calendar] }));
  setSettings({
    config: { brain: { business_name: "Harbor Moving", profile: { website: "https://www.harbor.example" } } },
  });
  t.after(() => setSettings(null));
  let tree = open();
  const b = byTestId(tree, "fr-bookings");
  assert.match(textOf(b), /^Bookings · VagaroVagaro found on harbor\.example/);
  assert.equal(textOf(byTestId(tree, "fr-bookings-link")), "Link read · 412 before today, 9 coming up");
  assert.equal(textOf(byTestId(tree, "fr-bookings-change")), "Change the link");
  assert.equal(byTestId(tree, "fr-bookings-how"), null, "a tool found: nothing to ask of how people book");
  assert.equal(textOf(byTestId(tree, "fr-channels-foot")), "2 on · nothing is charged yet", "calls and bookings");
  assert.equal(sheetOf(tree, "fr-clients").props.open, false);
  byTestId(tree, "fr-bookings-clients-go").props.onClick();
  tree = mount();
  assert.equal(sheetOf(tree, "fr-clients").props.open, true, "Bring your clients, in a sheet");
  assert.equal(sheetOf(tree, "fr-clients").props.title, "Bring your clients from Vagaro");
});

test("Where it answers: with no booking tool, how people book -- by hand or by message kept as the bookings rule, a booking site's calendar link checked before it is kept", (t) => {
  t.after(restoreSetupVerbs);
  const saves = saverWorld(t, { brain: { profile: {} }, calendar: {} });
  phoneWorld();
  setSetup(atChannels(phoneReady()));
  let tree = open();
  assert.match(textOf(byTestId(tree, "fr-bookings")), /^BookingsHow do people book with you\?/);
  pick(tree, "fr-bookings-how", CW.bookings.byHand);
  assert.equal(saves.at(-1).row, "bookings");
  assert.equal(saves.at(-1).patch({}).bookings.by_hand, true);
  // A booking site: its calendar link pasted, read by the one rule a feed is read by.
  tree = mount();
  pick(tree, "fr-bookings-how", CW.bookings.bySite);
  tree = mount();
  const box = () => boxOf(tree, "fr-calendar-link-box");
  box().props.onChange({ target: { value: "http://10.0.0.5/feed.ics" } });
  tree = mount();
  byTestId(tree, "fr-calendar-link-keep").props.onClick();
  tree = mount();
  assert.equal(
    textOf(byId(tree, "rec-fr-calendar-link-box-problem")),
    CW.bookings.linkBroken,
    "a private host is no feed",
  );
  const before = saves.length;
  box().props.onChange({ target: { value: "webcal://calendar.example/harbor.ics" } });
  tree = mount();
  byTestId(tree, "fr-calendar-link-keep").props.onClick();
  assert.equal(saves.length, before + 1);
  assert.equal(saves.at(-1).row, "calendar");
  assert.equal(saves.at(-1).patch({}).calendar.ical_url, "https://calendar.example/harbor.ics");
});

/* ---- Email ---- */
test("Where it answers: the owner's own mailbox -- Gmail and Outlook where this deployment connects them, the address once connected, Coming soon until then", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const asked = [];
  const was = { connect: connectedMailboxes.connect, outcome: connectedMailboxes.outcome };
  t.after(() => Object.assign(connectedMailboxes, was));
  Object.assign(connectedMailboxes, {
    connect: async (p, id, back) => {
      asked.push([p, id, back]);
      return { ok: true, message: "" };
    },
    outcome: () => null,
  });
  setSetup(atChannels({ ...phoneReady(), email: { sending: { providers: ["google", "microsoft"], mailboxes: [] } } }));
  let tree = open();
  assert.equal(byTestId(tree, "fr-email").props["data-state"], "connect");
  assert.equal(textOf(byTestId(tree, "fr-email-google")), "Connect Gmail");
  assert.equal(textOf(byTestId(tree, "fr-email-microsoft")), "Connect Outlook");
  await byTestId(tree, "fr-email-google").props.onClick();
  assert.deepEqual(asked, [["google", null, "start"]], "the consent screen comes back to the first run");
  setSetup(
    atChannels({
      ...phoneReady(),
      email: { sending: { providers: ["google"], mailboxes: [{ address: "owner@harbor.example" }] } },
    }),
  );
  tree = open();
  assert.match(textOf(byTestId(tree, "fr-email")), /^Your emailowner@harbor\.example is connected/);
  assert.equal(byTestId(tree, "fr-email-google"), null);
  setSetup(atChannels(phoneReady()));
  tree = open();
  assert.equal(byTestId(tree, "fr-email").props["data-state"], "soon");
  assert.match(textOf(byTestId(tree, "fr-email")), /^Your emailComing soon/);
  // Back from the consent screen: what came of it, said once.
  connectedMailboxes.outcome = () => ({
    ok: false,
    words: "Gmail did not connect: the sign-in was declined.",
    code: "declined",
  });
  flashes.length = 0;
  open();
  assert.equal(textOf(flashes.at(-1).msg), "Gmail did not connect: the sign-in was declined.");
  assert.equal(flashes.at(-1).tone, "warn");
});

/* ---- Your dashboard, filling in ---- */
test("Where it answers: the dashboard filling in beside it, as what came in counts it, and the sources one by one with Try again where one stopped", async (t) => {
  t.after(restoreSetupVerbs);
  phoneWorld();
  const row = (source, state, counts, over = {}) => ({
    source,
    state,
    counts,
    parts_done: 1,
    parts_total: 1,
    oldest: null,
    started_at: "2026-09-07T14:00:00Z",
    finished_at: state === "done" ? "2026-09-07T14:05:00Z" : null,
    last_error: state === "failed" ? "timeout" : null,
    via: null,
    ...over,
  });
  const imports = [
    row("mailbox", "done", { messages: 300, people: 80 }, { via: "google" }),
    row("whatsapp_history", "done", { messages: 120, people: 30 }),
    row("calendar", "done", { past: 412, coming: 9 }, { via: "vagaro" }),
    row("google_reviews", "failed", { reviews: 0 }),
  ];
  const again = [];
  t.after(() => delete setupVerbs.importAgain);
  setupVerbs.importAgain = async (source) => {
    again.push(source);
    return { ok: true, message: "" };
  };
  setSetup(atChannels({ ...phoneReady(), imports, people: 640 }));
  let tree = open();
  const value = (k) => {
    let v = null;
    walk(byTestId(tree, `fr-filling-${k}`), (n) => {
      if (v === null && n.type === "dd") v = textOf(n);
    });
    return v;
  };
  assert.deepEqual(
    ["people", "inbox", "calendar", "reviews"].map(value),
    ["640", "420", "9", "0"],
    "people, email and chats together, coming up, and the reviews counted",
  );
  assert.match(textOf(byTestId(tree, "fr-filling-calendar")), /coming up · 412 back/);
  assert.equal(sheetOf(tree, "fr-bringing").props.open, false);
  byTestId(tree, "fr-filling-open").props.onClick();
  tree = mount();
  assert.equal(sheetOf(tree, "fr-bringing").props.open, true);
  const retry = byTestId(tree, "fr-import-again-google_reviews");
  assert.ok(retry, "a stopped source offers Try again");
  await retry.props.onClick();
  assert.deepEqual(again, ["google_reviews"]);
});
