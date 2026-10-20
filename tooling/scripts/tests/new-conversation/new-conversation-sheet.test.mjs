/**
 * The new conversation sheet (a conversation begins from the Inbox, the design's 4.2 to 4.4), drawn on the stub React
 * from a person's reach as the one rule answers it (contracts writeReachOf): the wire said with what it carries and
 * each wire that cannot go said with why; the words, a subject for an email, or the approved message; who answers,
 * with the note the receptionist will read; the call, its brief and what is kept after it; and the pick, which is the
 * sheet's own. What the sheet decides for itself is proved as functions: who answers, the note shown, and what the tab
 * kept.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEW_CONVERSATION_WORDS as W,
  PLAN_NOTE_MAX,
  channelsReady,
  inboxTemplates,
  writeReachOf,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const { NewMessage } = await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/message.tsx");
const { NewCall } = await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/call.tsx");
const { approvedKey, firstMessageOf, noteDay, noteShown, onSendKey, sayQueued, whoAnswers, writtenFor } =
  await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/state.ts");
const { NewWho } = await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/who.tsx");
const { NewConversationSheet } =
  await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/sheet.tsx");
const { Sheet } = await import("../../../../apps/dashboard/src/surfaces/kit/sheet/sheet.tsx");

const NOW = new Date("2026-10-07T15:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const READY = channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
});
/** People's row for someone nothing is known of but a number and an address. */
const row = (over = {}) => ({
  id: "k1",
  display_name: "Robin Example",
  wa_profile_name: null,
  latest_conversation_id: null,
  phone_e164: "+12125550143",
  email: "robin@example.com",
  email_suppressed_at: null,
  consent: "unknown",
  dnc: false,
  marketing_consent: "unknown",
  consent_channels: null,
  marketing_channels: null,
  email_marketing: "unknown",
  last_inbound_channel: null,
  last_wrote_at: null,
  last_inbound_call_at: null,
  latest_wa_inbound_at: null,
  deal_id: null,
  ...over,
});
const reachOf = (over = {}, mode = null) =>
  writeReachOf(row(over), {
    ready: READY,
    mode,
    facts: { business_name: "Harbor Studio", booking_link: null },
    // No text of ours has reached them: the first one carries the line, as channels says it (SMS_FOOTER).
    firstTextLine: LINE,
    now: NOW,
  });
const LINE = "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

const WRITTEN = { about: "", subject: "", text: "", answers: {}, after: "", tell: true, keepNote: true };
const NOT_ASKED = { busy: false, error: null, asks: [], brief: null, facts: [], note: "" };
/** The sheet's state as its two views read it: the way chosen, who answers, and what was patched, pressed or flashed. */
function stateOf(reach, wire, over = {}) {
  const seen = { patched: [], went: [], wrote: [], flashed: [] };
  const way = reach.ways.find((w) => w.wire === wire) ?? null;
  const s = {
    written: { ...WRITTEN, ...over.written },
    way,
    who: whoAnswers(reach, way ? way.wire : null, over.then ?? null),
    approved: { state: "reading" },
    choice: null,
    chosen: null,
    note: "",
    ask: { asked: NOT_ASKED, write: (tone) => seen.wrote.push(tone ?? null) },
    why: false,
    toggleWhy: () => seen.patched.push("why"),
    sendsTo: null,
    send: () => seen.patched.push("send"),
    finishCall: () => seen.patched.push("keep"),
    patch: (p) => seen.patched.push(p),
    goTo: (to) => seen.went.push(to),
    flashed: (f) => seen.flashed.push(f),
    ...over.state,
  };
  return { s, seen };
}
const h = (type, props) => globalThis.React.createElement(type, props);
const draw = (type, props) => {
  fresh();
  return again(() => h(type, props));
};
const said = (tree, id) => textOf(byTestId(tree, id));

test("someone who phoned: a text carries the member's words, the other wires say theirs, and the receptionist answers", () => {
  const reach = reachOf({ last_inbound_call_at: hoursAgo(30) });
  const { s, seen } = stateOf(reach, "sms", {
    state: { note: "Oct 7: the team wrote to them. It was about: the quote" },
  });
  const tree = draw(NewMessage, { s, reach });
  assert.equal(said(tree, "ix-new-way"), "Text · your own words");
  // Every wire that can carry it is offered, in the house order, the one chosen first among them by the rule.
  const wires = ["whatsapp", "sms", "email"].filter((w) => byTestId(tree, `ix-new-wire-${w}`));
  assert.deepEqual(wires, ["whatsapp", "sms", "email"]);
  assert.ok(byTestId(tree, "ix-new-text"), "the words are the member's to write");
  assert.equal(byTestId(tree, "ix-new-subject"), null, "a text has no subject");
  byTestId(tree, "ix-new-text").props.onValueChange("Hello Robin");
  assert.deepEqual(seen.patched.at(-1), { text: "Hello Robin" });
  // The line their first text carries is said before it is sent, and has its room in what may be typed.
  assert.equal(said(tree, "ix-new-first-text"), W.firstText(LINE));
  assert.match(said(tree, "ix-new-first-text"), /Reply STOP to opt out/);
  assert.equal(byTestId(tree, "ix-new-text").props.maxLength, 1600 - LINE.length - 1);
  // Ctrl or Cmd with Enter in the words sends, as the thread's own box does; Enter alone is a new line.
  const key = (over) => ({ key: "Enter", metaKey: false, ctrlKey: false, preventDefault() {}, ...over });
  byTestId(tree, "ix-new-text").props.onKeyDown(key());
  assert.notEqual(seen.patched.at(-1), "send");
  byTestId(tree, "ix-new-text").props.onKeyDown(key({ ctrlKey: true }));
  assert.equal(seen.patched.at(-1), "send");
  // Who answers: a choice, the receptionist first, and the note it will read is shown and can be left out.
  assert.ok(byTestId(tree, "ix-new-then-receptionist"));
  assert.ok(byTestId(tree, "ix-new-then-me"));
  assert.equal(byTestId(tree, "ix-new-note").props.value, "Oct 7: the team wrote to them. It was about: the quote");
  press(byTestId(tree, "ix-new-note-out"));
  assert.deepEqual(seen.patched.at(-1), { keepNote: false });
});

test("a wire that cannot carry it is said with why, never hidden; and the member who keeps the thread writes no note", () => {
  // Wrote on WhatsApp today, never texted: WhatsApp and email carry words, a text needs their yes.
  const wrote = { last_inbound_channel: "whatsapp", last_wrote_at: hoursAgo(2), latest_wa_inbound_at: hoursAgo(2) };
  const reach = reachOf(wrote);
  const { s } = stateOf(reach, "whatsapp", { then: "me" });
  const tree = draw(NewMessage, { s, reach });
  assert.equal(said(tree, "ix-new-way"), "WhatsApp · your own words, for 22 more hours");
  assert.equal(said(tree, "ix-new-held-sms"), "Text · No yes on record for messages by text.");
  assert.equal(byTestId(tree, "ix-new-wire-sms"), null, "a wire that cannot go is no choice");
  assert.equal(
    byTestId(tree, "ix-new-note"),
    null,
    "the member answers: there is nothing for the receptionist to read",
  );
});

test("an email has its subject, and its answer comes to the team: there is no choice to make", () => {
  const reach = reachOf({ deal_id: "d1" });
  const { s, seen } = stateOf(reach, "email");
  const tree = draw(NewMessage, { s, reach });
  assert.equal(said(tree, "ix-new-way"), "Email · your own words");
  byTestId(tree, "ix-new-subject").props.onValueChange("Your quote");
  assert.deepEqual(seen.patched.at(-1), { subject: "Your quote" });
  assert.equal(said(tree, "ix-new-then-fixed"), W.then.comesToYou);
  assert.equal(byTestId(tree, "ix-new-then-me"), null);
});

test("where WhatsApp carries only an approved message, the ones that can go are offered with the words of the one chosen", () => {
  const reach = reachOf({ consent: "opted_in", consent_channels: ["whatsapp"] });
  const templates = [
    {
      id: "t1",
      channel: "whatsapp",
      name: "visit_follow_up",
      language: "en_US",
      body_preview: "Hello from {{1}}",
      variables: [{ position: 1, label: "Business name", example: "Corner Studio" }],
      category: "utility",
    },
    {
      id: "t2",
      channel: "whatsapp",
      name: "autumn_offer",
      language: "en_US",
      body_preview: "20% off",
      variables: [],
      category: "marketing",
    },
  ];
  const choice = inboxTemplates(templates, { who: reach.person.name, offersOk: reach.offers_ok });
  const { s, seen } = stateOf(reach, "whatsapp", {
    state: { approved: { state: "in", templates }, choice, chosen: choice.sendable[0] },
  });
  const tree = draw(NewMessage, { s, reach });
  assert.equal(said(tree, "ix-new-way"), "WhatsApp · an approved message only, until they write");
  assert.equal(byTestId(tree, "ix-new-text"), null, "no words can go");
  const pick = byTestId(tree, "ix-new-approved-pick");
  assert.deepEqual(
    pick.props.options.map((o) => o.value),
    [approvedKey(templates[0])],
    "a promotion is not offered to someone who has not said yes to offers",
  );
  assert.equal(said(tree, "ix-new-approved-words"), "Hello from Harbor Studio", "as they will read it");
  pick.props.onValueChange("visit_follow_up en_US");
  assert.deepEqual(seen.patched.at(-1), { approved: "visit_follow_up en_US" });
  // Which are not offered, and why, is one press away: never a paragraph under the choice.
  assert.ok(choice.hidden, "the promotion is held back, and the rule says why");
  assert.equal(byTestId(tree, "ix-new-why-said"), null);
  press(byTestId(tree, "ix-new-why"));
  assert.equal(seen.patched.at(-1), "why");
  const told = draw(NewMessage, { s: { ...s, why: true }, reach });
  assert.equal(said(told, "ix-new-why-said"), choice.hidden);
  assert.equal(byTestId(tree, "ix-new-first-text"), null, "no line of a text on WhatsApp");
  // None approved that can go: said, with the person's name.
  const none = stateOf(reach, "whatsapp", {
    state: {
      approved: { state: "in", templates: [] },
      choice: inboxTemplates([], { who: "Robin Example", offersOk: false }),
    },
  });
  assert.match(
    said(draw(NewMessage, { s: none.s, reach }), "ix-new-no-approved"),
    /No approved message can go to Robin Example yet\./,
  );
});

test("no wire at all: each says why, and their page is the way to record a yes", () => {
  const reach = reachOf();
  const { s, seen } = stateOf(reach, null);
  const tree = draw(NewMessage, { s, reach });
  assert.match(said(tree, "ix-new-no-way"), /No message can go to Robin Example yet\./);
  for (const wire of ["whatsapp", "sms", "email"]) assert.ok(byTestId(tree, `ix-new-held-${wire}`), wire);
  // A yes is what is missing, so the door says so; their page is where one is recorded, in their own words.
  assert.equal(said(tree, "ix-new-page"), W.recordYes);
  press(byTestId(tree, "ix-new-page"));
  assert.deepEqual(seen.went, ["clients/k1"]);
  // With no number and no address there is no yes to record: the door is their page, plainly.
  const bare = reachOf({ phone_e164: null, email: null });
  assert.equal(said(draw(NewMessage, { s: stateOf(bare, null).s, reach: bare }), "ix-new-page"), W.page);
});

test("a call: the member's own phone, the brief Ask wrote with what is known said by code, and what is kept after", () => {
  const reach = reachOf();
  const asked = {
    ...NOT_ASKED,
    brief: {
      opening: "Hi Robin, it's Harbor Studio.",
      points: ["Saturday opened up"],
      avoid: ["A price"],
      ask: "Whether 10 suits",
    },
    facts: ["Next visit: Tue, Oct 13 · 2:00 PM"],
  };
  const { s, seen } = stateOf(reach, null, { state: { ask: { asked, write: () => undefined } } });
  const tree = draw(NewCall, { s, reach });
  const call = all(tree, (n) => n.props?.["data-testid"] === "ix-new-call").find((n) => n.type === "a");
  assert.equal(call.props.href, "tel:+12125550143", "a link the phone itself answers: never the receptionist");
  const brief = said(tree, "ix-new-brief");
  for (const part of [
    "What we know",
    "Next visit: Tue, Oct 13 · 2:00 PM",
    "Open with",
    "Hi Robin",
    "Say",
    "Saturday opened up",
    "Leave out",
    "A price",
    "Ask for",
    "Whether 10 suits",
  ])
    assert.ok(brief.includes(part), part);
  byTestId(tree, "ix-new-after").props.onValueChange("They will call back Monday");
  assert.deepEqual(seen.patched.at(-1), { after: "They will call back Monday" });
  assert.ok(byTestId(tree, "ix-new-tell"), "the receptionist answers them, so it can be told");
  press(all(tree, (n) => n.props?.["data-testid"] === "ix-new-copy").find((n) => n.type === "button"));
  assert.equal(seen.flashed.length, 1);
  // One filled act at a time: the call is filled until something is written of how it went (the foot's Keep is then).
  assert.match(call.props.className, /\bbtn-primary\b/);
  const after = stateOf(reach, null, { written: { after: "They will call back Monday" } }).s;
  const later = all(draw(NewCall, { s: after, reach }), (n) => n.props?.["data-testid"] === "ix-new-call");
  assert.doesNotMatch(later.find((n) => n.type === "a").props.className, /\bbtn-primary\b/);
});

test("no call is offered to someone with no number or on the do-not-contact list, and each is told why", () => {
  const dnc = reachOf({ dnc: true });
  assert.equal(said(draw(NewCall, { s: stateOf(dnc, null).s, reach: dnc }), "ix-new-no-call"), W.call.doNotContact);
  const none = reachOf({ phone_e164: null });
  assert.equal(said(draw(NewCall, { s: stateOf(none, null).s, reach: none }), "ix-new-no-call"), W.call.noNumber);
  // A receptionist told to ask first is not told how a call went: the note is the team's.
  const asks = reachOf({}, "ask");
  assert.equal(byTestId(draw(NewCall, { s: stateOf(asks, null).s, reach: asks }), "ix-new-tell"), null);
});

test("who answers: a choice on a phone's wire where the receptionist answers them, else the thread comes back to the team", () => {
  const answers = { receptionist: { answers: true } };
  const quiet = { receptionist: { answers: false } };
  assert.deepEqual(whoAnswers(answers, "sms", null), { choice: true, then: "receptionist" });
  assert.deepEqual(whoAnswers(answers, "whatsapp", "me"), { choice: true, then: "me" });
  assert.deepEqual(whoAnswers(answers, "email", "me"), { choice: false, then: "receptionist" });
  assert.deepEqual(whoAnswers(quiet, "sms", "me"), { choice: false, then: "receptionist" });
  assert.deepEqual(whoAnswers(answers, null, null), { choice: false, then: "receptionist" });
});

test("a plan longer than a note the receptionist reads is cut after a whole word, never refused at the send", () => {
  const shown = noteShown({ note: null, about: "follow up on the quote ".repeat(20) }, "message", "", "Oct 7");
  assert.ok(shown.length <= PLAN_NOTE_MAX, `${shown.length} characters: the send takes no more`);
  assert.match(shown, /^Oct 7: the team wrote to them\. It was about: follow up on the quote/);
  assert.match(shown, /…$/);
});

test("the note shown is the member's where they changed it, else Ask's, else the plan in a sentence with its day", () => {
  const day = noteDay("America/New_York", NOW);
  assert.equal(day, "Oct 7");
  assert.equal(noteShown({ note: null, about: "" }, "message", "", day), "", "nothing said, nothing to keep");
  assert.equal(
    noteShown({ note: null, about: " follow up on the quote " }, "message", "", day),
    "Oct 7: the team wrote to them. It was about: follow up on the quote",
  );
  assert.equal(noteShown({ note: null, about: "x" }, "call", "", day), "Oct 7: the team called them. It was about: x");
  assert.equal(
    noteShown({ note: null, about: "x" }, "message", "Oct 7: offered Saturday.", day),
    "Oct 7: offered Saturday.",
  );
  assert.equal(
    noteShown({ note: "", about: "x" }, "message", "Ask's", day),
    "",
    "emptied by the member: it stays empty",
  );
});

test("what the tab kept comes back for the same person, and never onto another", () => {
  assert.deepEqual(writtenFor("k1", null).personId, "k1");
  const kept = { personId: "k1", about: "the quote", text: "Hello Robin" };
  assert.equal(writtenFor("k1", kept).text, "Hello Robin");
  assert.equal(writtenFor(null, kept).about, "the quote", "opened on nobody in particular: what was being written");
  const other = writtenFor("k2", kept);
  assert.deepEqual([other.personId, other.about, other.text], ["k2", "", ""]);
  assert.equal(writtenFor(null, null).keepNote, true, "the note is kept unless the member leaves it out");
});

test("what the send carries: the wire, the words or the approved message, a subject, who answers, and the plan as a note", () => {
  const reach = reachOf({ last_inbound_call_at: hoursAgo(30) });
  const wayOf = (wire) => reach.ways.find((w) => w.wire === wire);
  const who = whoAnswers(reach, "sms", null);
  const written = { text: " Following up. ", subject: "", keepNote: true };
  assert.deepEqual(firstMessageOf({ way: wayOf("sms"), chosen: null, who }, written, " Oct 7: the team wrote. "), {
    wire: "sms",
    then: "receptionist",
    text: "Following up.",
    note: "Oct 7: the team wrote.",
  });
  // The member who answers sends no note; nor does one who left it out; nor is an empty one sent.
  const me = whoAnswers(reach, "sms", "me");
  assert.equal("note" in firstMessageOf({ way: wayOf("sms"), chosen: null, who: me }, written, "x"), false);
  assert.equal(
    "note" in firstMessageOf({ way: wayOf("sms"), chosen: null, who }, { ...written, keepNote: false }, "x"),
    false,
  );
  assert.equal("note" in firstMessageOf({ way: wayOf("sms"), chosen: null, who }, written, "  "), false);
  // An email: its subject, and no choice of who answers, so no note.
  const mail = whoAnswers(reach, "email", null);
  assert.deepEqual(
    firstMessageOf({ way: wayOf("email"), chosen: null, who: mail }, { ...written, subject: " Your quote " }, "x"),
    { wire: "email", then: "receptionist", text: "Following up.", subject: "Your quote" },
  );
  // WhatsApp past its day: the approved message chosen, and no words.
  const chosen = { template: { name: "visit_follow_up", language: "en_US" } };
  const wa = whoAnswers(reach, "whatsapp", null);
  assert.deepEqual(firstMessageOf({ way: wayOf("whatsapp"), chosen, who: wa }, written, "x"), {
    wire: "whatsapp",
    then: "receptionist",
    template: { name: "visit_follow_up", language: "en_US" },
    note: "x",
  });
  assert.equal(firstMessageOf({ way: null, chosen: null, who }, written, "x"), null, "no way, nothing to send");
  // An email whose address the server asked the member to agree to: sent again, it names that address; a text never does.
  const agreed = { way: wayOf("email"), chosen: null, who: mail, emailTo: "robin@example.com" };
  assert.equal(firstMessageOf(agreed, { ...written, subject: "Your quote" }, "x").email_to, "robin@example.com");
  assert.equal("email_to" in firstMessageOf({ ...agreed, way: wayOf("sms"), who }, written, "x"), false);
});

test("the pick: who is found, each a press; nobody; never 'no one' while nobody has been read", () => {
  const person = { id: "k1", name: "Robin Example", deal: null, lastContact: { label: "Phoned · 1d ago" } };
  const seen = { picked: [], asked: [] };
  const stateOfPick = (pick) => ({
    pick: {
      q: "",
      setQ: (q) => seen.asked.push(q),
      rows: [],
      reading: false,
      ...pick,
    },
    choose: (id) => seen.picked.push(id),
  });
  const tree = draw(NewWho, { s: stateOfPick({ rows: [person] }) });
  assert.match(said(tree, "ix-new-who-pick"), /Robin Example/);
  assert.match(said(tree, "ix-new-who-pick"), /Phoned · 1d ago/, "when they were last heard, in the row's own words");
  press(all(tree, (n) => n.props?.["data-testid"] === "ix-new-who-pick").find((n) => n.type === "button"));
  assert.deepEqual(seen.picked, ["k1"]);
  byTestId(tree, "ix-new-who-search").props.onValueChange("rob");
  assert.deepEqual(seen.asked, ["rob"], "what is typed is the server's to match");
  // Enter takes the first found, once what is shown answers what was typed; never while it is still being read.
  const enter = { key: "Enter", preventDefault() {} };
  byTestId(tree, "ix-new-who-search").props.onKeyDown(enter);
  assert.deepEqual(seen.picked, ["k1", "k1"]);
  const reading = draw(NewWho, { s: stateOfPick({ rows: [person], reading: true }) });
  byTestId(reading, "ix-new-who-search").props.onKeyDown(enter);
  assert.deepEqual(seen.picked, ["k1", "k1"], "what is shown is not yet the answer to what was typed");
  assert.equal(said(draw(NewWho, { s: stateOfPick({}) }), "ix-new-who-none"), W.who.none);
  assert.equal(said(draw(NewWho, { s: stateOfPick({ reading: true }) }), "ix-new-who-none"), W.reading);
});

test("the corner's ✕ steps aside where the foot holds Cancel, as a record sheet's does on a phone, and stays where nothing else closes it", () => {
  // The census of 13 Oct 2026: writing to someone, the sheet showed a ✕ in its head and Cancel in its foot, two ways out.
  const sheetOf = (tree) => all(tree, (n) => n.type === Sheet)[0];
  const opened = (personId) => ({ open: true, personId, onClose() {}, flash() {} });
  assert.equal(
    sheetOf(draw(NewConversationSheet, opened(null))).props.footCloses,
    false,
    "choosing who: no foot, the ✕ is the way out",
  );
  assert.equal(
    sheetOf(draw(NewConversationSheet, opened("k1"))).props.footCloses,
    true,
    "writing to them: the foot's Cancel",
  );
});

test("on a touch screen no field of the pick takes focus as it is drawn; a mouse and keys keep it ready", () => {
  // Ruben, 8 October 2026: the sheet opened with its search in focus, so a phone raised its keyboard over a sheet
  // nobody had read yet and moved the page to the field. A touch screen is the pointer (legacy-verbs.ts), never a width.
  const s = { pick: { q: "", setQ() {}, rows: [], reading: false }, choose() {} };
  const ready = () => byTestId(draw(NewWho, { s }), "ix-new-who-search").props.autoFocus;
  assert.equal(ready(), true, "with keys: N, then type");
  const media = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === "(pointer: coarse)" });
  try {
    assert.equal(ready(), false, "REGRESSION: on a phone the keyboard rose as the sheet did");
  } finally {
    globalThis.matchMedia = media;
  }
});

test("Ctrl or Cmd with Enter is the sheet's own key, and nothing else is", () => {
  let ran = 0;
  let kept = 0;
  const key = onSendKey(() => (ran += 1));
  const press2 = (over) =>
    key({ key: "Enter", metaKey: false, ctrlKey: false, preventDefault: () => (kept += 1), ...over });
  press2({});
  press2({ key: "a", ctrlKey: true });
  assert.deepEqual([ran, kept], [0, 0], "Enter alone is a new line, and another key is that key");
  press2({ ctrlKey: true });
  press2({ metaKey: true });
  assert.deepEqual([ran, kept], [2, 2], "and it is taken, so nothing behind the sheet hears it");
});

test("a queued message is said for as long as it can be stopped, with its Undo; past that, it is on its way", () => {
  const robin = { id: "k1", name: "Robin Example" };
  const said2 = [];
  const until = (ms) => new Date(Date.now() + ms).toISOString();
  sayQueued(
    (f) => said2.push(f),
    robin,
    { message_id: "m1", cancelable_until: until(15_000), note_id: "n1" },
    () => {},
  );
  assert.match(said2[0].msg, /^Message to Robin Example queued · sends in 1[45] s unless you undo$/);
  assert.equal(typeof said2[0].undo, "function", "the reply's own undo, for as long as the send can be stopped");
  assert.ok(said2[0].ms > 14_000 && said2[0].ms <= 15_000, "the toast lives exactly that long");
  sayQueued(
    (f) => said2.push(f),
    robin,
    { message_id: "m1", cancelable_until: until(-1), note_id: null },
    () => {},
  );
  assert.deepEqual(said2[1], { msg: "On its way to Robin Example." }, "nothing left to stop: no Undo is offered");
});
