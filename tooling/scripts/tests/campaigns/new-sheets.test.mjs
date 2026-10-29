/**
 * New's sheets (sequences/new/new-sheets.tsx, new-message-sheets.tsx; decision 0065 step 7, where the send screen's
 * pickers moved), each drawn open on the stub React as the draft draws it, over what the page reads:
 *
 * - When it goes: Pick a day opens on tomorrow's first sending hour by the business's clock, and a day picked keeps its
 *   day and time pickers even where the time picked is Later today's, which stays a row of its own; Now clears it.
 * - A step's message: one of the workspace's that names a visit, or a proposal, is picked only where its run fills that
 *   value -- the first step of a sequence on a visit moment, or a deal moment -- and said otherwise by why: step 1 only
 *   where this draft's step 1 would take it, else where a visit or a deal starts it.
 * - How it goes: a way the message holds that the workspace hasn't connected says so, with the door that connects it,
 *   and a text is never offered to carry an offer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, byTestId, classes, textOf, press } from "../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const W = contracts.NEW_WORDS;

const went = [];
installLegacyReact({
  location: {
    pathname: "/w/studio/campaigns",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
  setInterval: () => 1,
  clearInterval() {},
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// The shell's own components the sheets draw by name, and its door to a route: the frame's JSX.
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
Object.assign(globalThis, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate() {},
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { WhenSheet, ChannelsSheet, FromSheet } = await import(`${SRC}/surfaces/campaigns/sequences/new/new-sheets.tsx`);
const { MessageSheet } = await import(`${SRC}/surfaces/campaigns/sequences/new/new-message-sheets.tsx`);
const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);
const { cmOfferedMessages } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);
const { DatePicker } = await import(`${SRC}/surfaces/kit/datepicker/datepicker.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { Switch } = await import(`${SRC}/surfaces/kit/switch/switch.tsx`);

/** The host element a testid names (a kit Button is its own node and the host it draws, both carrying the id). */
const hostOf = (tree, id) => find(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
/** A sheet drawn open on its own, afresh and drawn again, as the draft draws it; `draw` draws it again over the same cells. */
const sheet = (type, props) => {
  fresh();
  const draw = () => again(() => globalThis.React.createElement(type, props()));
  draw();
  return draw;
};
/** "09:00": the first hour a send goes at, as an input value says it. */
const FIRST_HOUR = `${String(contracts.PLAYBOOK_HOURS.min).padStart(2, "0")}:00`;

/* ---------------------------------- When it goes ---------------------------------- */

/** New's When sheet over a one-off's time, every time it picks kept as the draft keeps it (new-model.ts setAt). */
function whenSheet(start) {
  const picked = [];
  let at = start;
  const draw = sheet(WhenSheet, () => ({
    open: true,
    at,
    tz: ZONE,
    onAt: (next) => {
      picked.push(next);
      at = next;
    },
    onClose() {},
  }));
  return { draw, picked };
}
const WHEN_ROWS = ["sq-nw-when-now", "sq-nw-when-later", "sq-nw-when-day"];
/** The rows ticked: the one the time is said by. */
const ticked = (tree) => WHEN_ROWS.filter((id) => hostOf(tree, id)?.props["aria-pressed"] === true);

test("Pick a day opens on tomorrow at the first sending hour by the business's clock, whatever day it is by UTC or the device", (t) => {
  // Half past ten at night in New York on 21 October: already the 22nd by UTC, and in Auckland.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-22T02:30:00Z") });
  const when = whenSheet(null);
  const tree = when.draw();
  assert.deepEqual(ticked(tree), ["sq-nw-when-now"], "a one-off opens on now");
  assert.equal(hostOf(tree, "sq-nw-when-later"), null, "past its sending hours there is no later today");
  assert.equal(byTestId(tree, "sq-nw-when-daytime"), null, "and no pickers until a day is picked");
  press(hostOf(tree, "sq-nw-when-day"));
  assert.deepEqual(when.picked, [`2026-10-22T${FIRST_HOUR}`], "the 22nd in New York, at nine");
  assert.ok(byTestId(when.draw(), "sq-nw-when-daytime"), "its pickers, under it");
});

test("Pick a day is the business's next calendar day across a clock change, never two days on", (t) => {
  // Half past eleven at night in New York on 13 March 2027, the night the clocks go forward: 24 hours on is the 15th.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2027-03-14T04:30:00Z") });
  const when = whenSheet(null);
  press(hostOf(when.draw(), "sq-nw-when-day"));
  assert.deepEqual(when.picked, [`2027-03-14T${FIRST_HOUR}`], "the 14th, the next day by the business's calendar");
});

test("a day picked keeps its pickers, even at Later today's time; Later today is a row of its own, and Now clears both", (t) => {
  // Half past ten in the morning in New York: Later today is five in the afternoon.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-21T14:30:00Z") });
  const later = "2026-10-21T17:00";
  // Opened on a day picked before: its pickers, under Pick a day.
  const when = whenSheet("2026-10-23T11:00");
  let tree = when.draw();
  assert.deepEqual(ticked(tree), ["sq-nw-when-day"]);
  assert.ok(byTestId(tree, "sq-nw-when-daytime"), "a day picked shows its day and time");
  // Now clears it, and its pickers go.
  press(hostOf(tree, "sq-nw-when-now"));
  tree = when.draw();
  assert.deepEqual(when.picked, [null]);
  assert.deepEqual(ticked(tree), ["sq-nw-when-now"]);
  assert.equal(byTestId(tree, "sq-nw-when-daytime"), null);
  // Later today is its own row: ticked, with no pickers.
  press(hostOf(tree, "sq-nw-when-later"));
  tree = when.draw();
  assert.equal(when.picked.at(-1), later);
  assert.deepEqual(ticked(tree), ["sq-nw-when-later"]);
  assert.equal(byTestId(tree, "sq-nw-when-daytime"), null);
  // Pick a day: tomorrow at nine, with its pickers.
  press(hostOf(tree, "sq-nw-when-day"));
  tree = when.draw();
  assert.equal(when.picked.at(-1), `2026-10-22T${FIRST_HOUR}`);
  assert.deepEqual(ticked(tree), ["sq-nw-when-day"]);
  // The pickers moved to today -- nine is gone by, so the first quarter hour still ahead -- then to five: Later today's.
  find(tree, (n) => n.type === DatePicker).props.onValueChange("2026-10-21");
  tree = when.draw();
  assert.equal(when.picked.at(-1), "2026-10-21T10:45");
  find(tree, (n) => n.type === Picker && n.props["data-testid"] === "bc-when-time").props.onValueChange("17:00");
  tree = when.draw();
  assert.equal(when.picked.at(-1), later, "the time picked is Later today's");
  assert.ok(byTestId(tree, "sq-nw-when-daytime"), "REGRESSION: the pickers went as the time picked met Later today's");
  assert.deepEqual(ticked(tree), ["sq-nw-when-day"], "the day was picked: Later today is not what it says");
  // Now clears it, whatever was picked.
  press(hostOf(tree, "sq-nw-when-now"));
  tree = when.draw();
  assert.equal(when.picked.at(-1), null);
  assert.deepEqual(ticked(tree), ["sq-nw-when-now"]);
  assert.equal(byTestId(tree, "sq-nw-when-daytime"), null);
});

/* ---------------------------------- A step's message ---------------------------------- */

/** A starter as WhatsApp holds it once approved: the library's words and slots (campaigns-drafts.test.mjs's). */
const starterRow = (key, id) => {
  const s = contracts.starterByKey(key);
  const t = contracts.starterText(s, "en_US");
  return {
    id,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing",
    source: "starter",
    title: null,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  };
};
/**
 * The Library as New reads it (new-page.tsx useNewReads): the messages Campaigns offers, made of the settings read as the
 * surface makes them (parts/channels.ts), and the rows their values are read from. A win-back that names nobody's booking,
 * a reminder whose slots default to the visit's time and service, and a follow-up that names the proposal.
 */
const OFFERED = cmOfferedMessages({
  templates: [
    starterRow("winback_offer", "tpl-winback"),
    starterRow("visit_reminder", "tpl-visit"),
    starterRow("proposal_follow_up", "tpl-proposal"),
  ],
});
const LIBRARY = { messages: OFFERED.flatMap((t) => (t.message ? [t.message] : [])), rows: OFFERED };

const VIP = { kind: "list", token: "seg:vip", label: "VIP clients" };
/** A one-off to a list, by hand, its message still to pick. */
const ONCE = M.setWho(M.draftByHand("once", "people", "Northside Studio"), VIP);
/** A sequence of two messages starting on a moment, or on a list, as New builds one by hand. */
const sequenceOn = (who) =>
  M.addStep(M.setWho(M.draftByHand("sequence", "people", "Northside Studio"), who), "message");
const VISIT_MOMENT = sequenceOn({ kind: "moment", trigger: "visit_tomorrow", label: "the day before a visit" });
const DEAL_MOMENT = sequenceOn({ kind: "moment", trigger: "proposal_waiting", label: "while a proposal waits" });
const ON_A_LIST = sequenceOn(VIP);

/** The message sheet for step `i` of a draft, and the messages it was pressed for. */
function messageSheet(draft, i) {
  const picked = [];
  const draw = sheet(MessageSheet, () => ({
    open: true,
    draft,
    i,
    library: LIBRARY,
    onMessage: (m) => picked.push(m),
    onWrite() {},
    onClose() {},
  }));
  return { tree: draw(), picked };
}
/**
 * One of the workspace's messages on the sheet: why it can't be picked here, said on its row, with no press -- or null
 * where it can be, and then a press picks it.
 */
const whyNot = (tree, id) => {
  const row = hostOf(tree, `sq-nw-message-${id}`);
  assert.ok(row, `${id} is offered`);
  const off = classes(row).includes("is-off");
  assert.equal(typeof row.props.onClick === "function", !off, `${id}: a press where it can be picked, none where not`);
  return off ? textOf(find(row, (n) => classes(n).includes("list-row-said"))) : null;
};

test("a message naming a visit or a proposal is picked only where its run fills that value, and said otherwise by why", () => {
  // A one-off knows no visit and no deal: both are off, each said by what would start it.
  let s = messageSheet(ONCE, 0);
  assert.equal(whyNot(s.tree, "tpl-visit"), W.sheets.visitOnly);
  assert.equal(whyNot(s.tree, "tpl-proposal"), W.sheets.dealOnly);
  assert.equal(whyNot(s.tree, "tpl-winback"), null, "one naming neither goes anywhere");
  // A sequence on a list knows neither either.
  s = messageSheet(ON_A_LIST, 0);
  assert.equal(whyNot(s.tree, "tpl-visit"), W.sheets.visitOnly);
  assert.equal(whyNot(s.tree, "tpl-proposal"), W.sheets.dealOnly);

  // On a visit moment, its first step fills the visit's time and service: picked there, as the Library holds it.
  s = messageSheet(VISIT_MOMENT, 0);
  assert.equal(whyNot(s.tree, "tpl-visit"), null);
  press(hostOf(s.tree, "sq-nw-message-tpl-visit"));
  assert.equal(s.picked.length, 1);
  assert.equal(s.picked[0].template_id, "tpl-visit");
  assert.deepEqual(
    s.picked[0].params.map((p) => p.kind),
    ["first_name", "business_name", "visit_when", "visit_service"],
    "the values its run fills",
  );
  assert.equal(whyNot(s.tree, "tpl-proposal"), W.sheets.dealOnly, "a visit is no deal");
  // Its second step is no visit's: step 1 only, which this draft's step 1 would take.
  s = messageSheet(VISIT_MOMENT, 1);
  assert.equal(whyNot(s.tree, "tpl-visit"), W.sheets.firstStepOnly);
  assert.equal(whyNot(s.tree, "tpl-winback"), null);

  // On a deal moment, likewise the proposal: its first step, and step 1 only after it.
  s = messageSheet(DEAL_MOMENT, 0);
  assert.equal(whyNot(s.tree, "tpl-proposal"), null);
  assert.equal(whyNot(s.tree, "tpl-visit"), W.sheets.visitOnly, "a deal is no visit");
  s = messageSheet(DEAL_MOMENT, 1);
  assert.equal(whyNot(s.tree, "tpl-proposal"), W.sheets.proposalFirstOnly);
  assert.deepEqual(s.picked, [], "nothing off is picked");
});

/* ---------------------------------- How it goes ---------------------------------- */

/** One of the workspace's messages as New holds it (heldMessageOf): news by WhatsApp, email or text. */
const NEWS = {
  template_id: "tpl-hours",
  title: "Late hours",
  body: "Hi {{1}}, we are open late on Thursdays.",
  channels: ["whatsapp", "email", "sms"],
  params: [{ kind: "first_name" }],
  offer: false,
  written: null,
  labels: ["First name"],
};
/** And an offer by WhatsApp or text, whose text version can never carry it. */
const OFFER = { ...NEWS, template_id: "tpl-offer", title: "Autumn offer", channels: ["whatsapp", "sms"], offer: true };

/** The channels sheet over a one-off of `message`, where the workspace sends on `ready` alone. */
function channelsSheet(message, ready) {
  const draft = M.setMessage(ONCE, 0, message, ready);
  return sheet(ChannelsSheet, () => ({ open: true, draft, ready, onChannels() {}, onClose() {} }))();
}
/** A channel's row on the sheet, by its name. */
const rowOf = (tree, name) =>
  find(
    tree,
    (n) => classes(n).includes("sq-nw-switchrow") && !!find(n, (m) => m.type === Switch && m.props.label === name),
  );
const switchOf = (row) => find(row, (n) => n.type === Switch);

test("How it goes: a way the message holds that isn't connected says so, with the door that connects it; a text is never offered for an offer", () => {
  went.length = 0;
  // News by WhatsApp, email or text, where only WhatsApp is connected.
  let tree = channelsSheet(NEWS, ["whatsapp"]);
  const whatsapp = rowOf(tree, W.channels.whatsapp);
  assert.equal(hostOf(whatsapp, "sq-nw-connect-whatsapp"), null, "connected: nothing to connect");
  assert.ok(textOf(whatsapp).includes(W.channels.can));
  assert.deepEqual([switchOf(whatsapp).props.checked, switchOf(whatsapp).props.readOnly], [true, false]);
  for (const [c, name] of [
    ["email", W.channels.email],
    ["sms", W.channels.sms],
  ]) {
    const row = rowOf(tree, name);
    assert.ok(textOf(row).includes(W.channels.notReady), `${c}: not connected yet`);
    const door = hostOf(row, `sq-nw-connect-${c}`);
    assert.equal(textOf(door), W.reach.connect(c), `${c}: the door that connects it`);
    assert.deepEqual([switchOf(row).props.checked, switchOf(row).props.readOnly], [false, true], `${c}: not to tick`);
  }
  press(hostOf(tree, "sq-nw-connect-email"));
  assert.deepEqual(went, [contracts.CHANNELS_DOOR], "where every can't-send-on door lands");

  // An offer with a text version, texting not connected: connecting it would carry no offer, so no door; no email
  // version, so nothing to connect there either.
  tree = channelsSheet(OFFER, ["whatsapp"]);
  const text = rowOf(tree, W.channels.sms);
  assert.ok(textOf(text).includes(W.channels.noOffer));
  assert.equal(hostOf(text, "sq-nw-connect-sms"), null, "REGRESSION: Connect texting offered for an offer");
  const email = rowOf(tree, W.channels.email);
  assert.ok(textOf(email).includes(W.channels.noVersion));
  assert.equal(hostOf(email, "sq-nw-connect-email"), null);
});

test("Where a sequence to leads sends from says the pace it starts at, the one its make writes (0077, D7)", () => {
  const draft = M.setWho(M.draftByHand("sequence", "leads", "x"), { kind: "search", id: "s-1", label: "Plumbers" });
  const tree = sheet(FromSheet, () => ({ open: true, draft, onOwnerSends() {}, onClose() {} }))();
  const note = find(tree, (n) => classes(n).includes("sq-nw-note"));
  assert.equal(textOf(note), W.checks.pace(contracts.REACH_OUT_GAP_FIRST));
  assert.match(textOf(note), /every 20 minutes/);
});
