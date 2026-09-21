/**
 * The Business tab's sentence tables, as pure functions: a fact's tone, how far a rule goes, the
 * standing line's three clauses, what the receptionist can do, and what it cannot. The prompt view
 * is prompt-blocks.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stateOf,
  SOURCE_WORDS,
  ruleStrength,
  GUARDRAIL_KEYS,
  standingLine,
  abilityRows,
  cannotRows,
  bookingHeld,
  policyAskClass,
} from "@chanlytics/contracts";

/* ---- A fact says where it came from ---- */

test("a fact's source carries a tone and the words facts.ts already wrote", () => {
  assert.equal(stateOf("fact", "verified").tone, "ok");
  assert.equal(stateOf("fact", "provisioned").tone, "ok");
  assert.equal(stateOf("fact", "typed").tone, "plain");
  assert.equal(stateOf("fact", "workspace").tone, "plain");
  assert.equal(stateOf("fact", "absent").tone, "plain");
  assert.equal(stateOf("fact", "disputed").tone, "warn");
  // One copy of the words: the pill reads facts.ts, it does not restate it. Every
  // source is checked, or the claim holds for two of five and nobody would know.
  for (const source of ["verified", "provisioned", "workspace", "typed", "absent"]) {
    assert.equal(stateOf("fact", source).label, SOURCE_WORDS[source], `${source} reads its words from facts.ts`);
  }
  assert.equal(stateOf("fact", "disputed").label, "doesn't match");
});

test("a source nobody has registered falls back rather than throwing", () => {
  // stateTone's contract, and the reason FACT_SOURCE_TONE is typed: a sixth
  // FactSource would fail to compile there rather than landing here.
  assert.deepEqual(stateOf("fact", "imported_from_somewhere"), { tone: "plain", label: "imported_from_somewhere" });
});

/* ---- A rule says how far it goes ---- */

test("the four rules carry three different guarantees", () => {
  assert.equal(ruleStrength("never_confirm_booking").strength, "structural");
  assert.equal(ruleStrength("never_quote_prices").strength, "checked");
  assert.equal(ruleStrength("disclose_ai").strength, "instructed");
  assert.equal(ruleStrength("no_health_advice").strength, "instructed");
  // Every key the editor writes has a strength, and no key has one it does not write.
  assert.deepEqual([...GUARDRAIL_KEYS].sort(), ["disclose_ai", "never_confirm_booking", "never_quote_prices", "no_health_advice"]);
  for (const k of GUARDRAIL_KEYS) {
    const r = ruleStrength(k);
    assert.ok(r.chip.length > 0 && r.sentence.length > 0, `${k} needs a chip and a sentence`);
  }
  // The structural one says the switch does not decide it.
  assert.match(ruleStrength("never_confirm_booking").sentence, /no appointments table/i);
  // The checked one names both channels, because they differ -- and it names them in
  // checkedOn, not in the sentence: the page draws both, so a sentence that said the
  // channels too would print the same fact twice on one row.
  const priced = ruleStrength("never_quote_prices");
  assert.equal(priced.checkedOn?.length, 2);
  assert.deepEqual(priced.checkedOn.map((c) => c.channel), ["whatsapp", "voice"]);
  // On chat a draft sits in between, so the swap happens before anyone reads it.
  assert.match(priced.checkedOn[0].words, /before the customer sees them/i);
  // On a call there is no before. Saying there is would be the one dishonest sentence
  // on a page whose whole point is that these four rules are not equivalent.
  assert.doesNotMatch(priced.checkedOn[1].words, /before/i);
  assert.match(priced.checkedOn[1].words, /already been heard/i);
  assert.doesNotMatch(priced.sentence, /WhatsApp|call/i);
});

test("a price is caught whatever the switch says, and the rule says so", () => {
  // The owner's decision (20 Sep 2026): a receptionist never states a price. The detector
  // -- violatesNoPrices on a chat reply, spokenBreach on a call -- runs whether the switch
  // is on or off; the switch adds or removes the one prompt line that tells it not to.
  const s = ruleStrength("never_quote_prices").sentence;
  assert.match(s, /whether this switch is on or off/);
  assert.match(s, /On, it is also told not to quote one\./);
  // What the detector actually knows (policy.ts PRICE_PATTERNS): euros and pounds pass it.
  assert.match(s, /dollars or pesos/);
  assert.doesNotMatch(s, /WhatsApp|call/i, "the channels are checkedOn's to say");
});

/* ---- The standing line ---- */

const full = {
  business_name: "Melany's Beauty Salon",
  booking_link: "https://booksy.com/en-us/1817434",
  profile: {
    address: "2581 Pitkin Ave, Brooklyn, NY 11208",
    tone: "Warm and unhurried.",
    hours: { mon: { open: "09:30", close: "18:00" } },
    services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
    escalate_when: ["They ask for Melany"],
    guardrails: { never_quote_prices: true },
  },
};

test("the standing line is three clauses, and never a percentage", () => {
  const s = standingLine(full);
  assert.match(s.can, /where you are/);
  assert.match(s.can, /when you.re open/);
  assert.match(s.can, /how to book/);
  assert.equal(s.missing, null, "a full record is missing nothing");
  assert.match(s.wont ?? "", /consult or the booking link instead of a price/);
  assert.equal(typeof s.percent, "undefined", "there is no score on this page");
});

test("the standing line names the one thing missing, and where to fix it", () => {
  const noVoice = { ...full, profile: { ...full.profile, tone: undefined } };
  const s = standingLine(noVoice);
  assert.match(s.missing.sentence, /no voice of its own/i);
  assert.equal(s.missing.row, "tone");
});

test("it offers a consult or the link instead of a price, switch on or off, and says nothing with nothing to price", () => {
  // The switch no longer decides the clause: the detector runs either way. "By your rule" went
  // with it -- with the switch off, there is no rule of the owner's to point at. And it names
  // both, because chat's replacement offers a consult and a call's correction offers the link.
  for (const guardrails of [{ never_quote_prices: true }, { never_quote_prices: false }, undefined]) {
    const s = standingLine({ ...full, profile: { ...full.profile, guardrails } });
    assert.equal(s.wont, "It offers a consult or the booking link instead of a price.", JSON.stringify(guardrails));
  }
  assert.equal(standingLine({ ...full, profile: { ...full.profile, services: [] } }).wont, null);
});

test("a record with nothing says so without listing every gap", () => {
  const s = standingLine({ business_name: "", booking_link: "", profile: {} });
  assert.match(s.can, /cannot answer anyone yet/i);
  assert.equal(s.wont, null);
  assert.equal(s.missing.row, "name");
});

/* ---- What it can do: one card, every ability, what each runs on ---- */

const live = {
  voiceLive: true, whatsappLive: true, hasCalendarFeed: true, hasBookingLink: true,
  hasBookingTemplate: true, hasHandoffNumber: true, hasEscalateWhen: true, pauseHours: 24, visionOn: false,
  bookingHeld: false,
};
const idOf = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test("an ability names its channels and the row it runs on", () => {
  const rows = abilityRows({
    voiceLive: true,
    whatsappLive: true,
    hasCalendarFeed: true,
    hasBookingLink: true,
    hasHandoffNumber: true,
    hasEscalateWhen: true,
    visionOn: false,
    hasBookingTemplate: true,
    pauseHours: 24,
    bookingHeld: false,
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  assert.deepEqual(byId.open_times.channels, { voice: true, whatsapp: true });
  assert.match(byId.open_times.detail, /at that moment/i, "the phone asks live; chat is handed a snapshot");
  assert.equal(byId.open_times.runsOn.row, "calendar");

  assert.match(byId.booking_link.detail, /caller's WhatsApp/i, "it goes by WhatsApp, never by text");

  assert.deepEqual(byId.transfer.channels, { voice: true, whatsapp: false });
  assert.deepEqual(byId.handoff.channels, { voice: false, whatsapp: true });

  assert.equal(byId.vision.on, false);
});

test("an ability whose input is missing says which row to fill", () => {
  const rows = abilityRows({
    voiceLive: true, whatsappLive: true, hasCalendarFeed: false,
    hasBookingLink: true, hasHandoffNumber: false, hasEscalateWhen: true, visionOn: false, hasBookingTemplate: true, pauseHours: 24,
    bookingHeld: false,
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.open_times.ready, false);
  assert.equal(byId.transfer.ready, false);
  assert.match(byId.transfer.detail, /takes a message instead/i);
});

test("nothing is ready on a channel that is not answering", () => {
  // The contract the doc comment states. An input filled against a dead line is a
  // setting, not an ability: a workspace with nothing picking up must not be told
  // its receptionist sends the booking link.
  const dark = abilityRows({
    voiceLive: false, whatsappLive: false, hasCalendarFeed: true,
    hasBookingLink: true, hasHandoffNumber: true, hasEscalateWhen: true, visionOn: true, hasBookingTemplate: true, pauseHours: 24,
    bookingHeld: false,
  });
  for (const r of dark) assert.equal(r.ready, false, `${r.id} cannot be ready with nothing answering`);
  // And a phone-only workspace has no chat abilities, whatever is filled in.
  const phoneOnly = abilityRows({
    voiceLive: true, whatsappLive: false, hasCalendarFeed: true,
    hasBookingLink: true, hasHandoffNumber: true, hasEscalateWhen: true, visionOn: true, hasBookingTemplate: true, pauseHours: 24,
    bookingHeld: false,
  });
  const byId = Object.fromEntries(phoneOnly.map((r) => [r.id, r]));
  assert.equal(byId.handoff.ready, false, "there is no thread to hand over");
  assert.equal(byId.vision.ready, false, "and no photo to look at");
  assert.equal(byId.transfer.ready, true, "but a caller can still be put through");
});

test("what it records, and how far ahead chat looks, are said as they are", () => {
  // facts_used is the chat brain's; describeOpenings hands chat up to five days.
  assert.match(idOf(abilityRows(live)).answer.detail, /In chat it also records which facts it leaned on/);
  assert.match(idOf(abilityRows(live)).open_times.detail, /next few days' openings/);
});

test("with no calendar it does not guess at times, and promises the link only where the link can go", () => {
  // The link goes where the booking-link row is ready: WhatsApp connected, a link to send, and
  // bookings not held on the Autonomy tab. Anywhere else "it sends the link instead" is not true.
  const noFeed = { ...live, hasCalendarFeed: false };
  const row = idOf(abilityRows(noFeed)).open_times;
  assert.equal(row.detail, "No calendar to read, so it does not guess at open times — it sends the link instead.");
  assert.equal(row.ready, false);
  for (const [what, shape] of [["no WhatsApp", { ...noFeed, whatsappLive: false }], ["no link", { ...noFeed, hasBookingLink: false }], ["bookings held", { ...noFeed, bookingHeld: true }]]) {
    assert.equal(idOf(abilityRows(shape)).open_times.detail, "No calendar to read, so it does not guess at open times.", what);
  }
});

test("with a calendar, the link follows the times only where it can go", () => {
  assert.match(idOf(abilityRows(live)).open_times.detail, /It offers up to three that fit, then the link\.$/);
  // A phone-only workspace offers times on a call, and has no way to send the link after them.
  assert.match(idOf(abilityRows({ ...live, whatsappLive: false })).open_times.detail, /It offers up to three that fit\.$/);
  // With bookings held, the call's tool offers no times (retell-availability.ts) while the call
  // starts with the openings (call-start.ts) and chat is handed them; a request to book gets no link on either.
  const held = idOf(abilityRows({ ...live, bookingHeld: true })).open_times;
  assert.equal(held.detail, "It is handed the openings on a call and in chat, but your Autonomy tab holds bookings for you to confirm, so when someone asks to book, no link follows.");
});

test("on WhatsApp alone, the link goes in the thread", () => {
  const b = idOf(abilityRows({ ...live, voiceLive: false })).booking_link;
  assert.equal(b.detail, "It sends it in the thread.");
  assert.equal(b.ready, true);
  assert.deepEqual(b.channels, { voice: false, whatsapp: true });
});

test("the booking link goes by WhatsApp, so a phone-only workspace cannot send it", () => {
  // send_booking_link delivers a WhatsApp template to the caller's WhatsApp; it never
  // sends an SMS, which is not sold. The first draft said "texts it", and drew it ready
  // on a phone-only workspace with no way to send anything at all.
  const phoneOnly = idOf(abilityRows({ ...live, whatsappLive: false })).booking_link;
  assert.equal(phoneOnly.ready, false);
  assert.equal(phoneOnly.channels.voice, false, "the call cannot send it without WhatsApp");
  assert.match(phoneOnly.detail, /WhatsApp, which isn't connected/i);

  const noTemplate = idOf(abilityRows({ ...live, hasBookingTemplate: false })).booking_link;
  assert.equal(noTemplate.ready, true, "chat can still send it in the thread");
  assert.equal(noTemplate.channels.voice, false, "but a call cannot, without an approved message");
  assert.match(noTemplate.detail, /approved booking-link message/i);

  const full = idOf(abilityRows(live)).booking_link;
  assert.equal(full.channels.voice, true);
  assert.match(full.detail, /caller's WhatsApp, when their number has one/i);

  for (const shape of [live, { ...live, whatsappLive: false }, { ...live, hasBookingTemplate: false }]) {
    assert.doesNotMatch(idOf(abilityRows(shape)).booking_link.detail, /\btexts?\b/i, "never 'text': texting is not sold");
  }
});

test("a transfer happens during opening hours, and it stays on the line", () => {
  const t = idOf(abilityRows(live)).transfer;
  assert.match(t.detail, /during opening hours/i);
  assert.match(t.detail, /stays on until someone picks up/i);
  assert.match(t.detail, /outside them, or if nobody answers, it takes a message/i);
  assert.doesNotMatch(t.detail, /steps out/i);
});

test("a hand-off is a pause that ends, and it says how long", () => {
  // It pauses the thread for pause_hours and no longer; after that the receptionist
  // answers the next message itself, whatever the Inbox says. The first draft said it
  // would never pick the thread back up.
  const said = (h) => idOf(abilityRows({ ...live, pauseHours: h })).handoff.detail;
  assert.match(said(24), /holds off for a day, then answers the customer's next message itself/i);
  assert.match(said(4), /holds off for 4 hours/);
  assert.match(said(72), /holds off for 3 days/);
  assert.match(said(1), /holds off for an hour/);
  assert.doesNotMatch(said(24), /will not pick/i);
  // The reasons widen a hand-off; they do not switch it on.
  const noReasons = idOf(abilityRows({ ...live, hasEscalateWhen: false })).handoff;
  assert.equal(noReasons.ready, true, "it hands over on a request for a person with no reasons set");
  assert.match(noReasons.detail, /asks for a person or it can't help/i);
});

test("a hand-off holds off as long as the Autonomy tab says, and a day when nothing is stored", () => {
  // pauseHours is the Autonomy reply row's pause_hours as stored, read the way that pane reads
  // it (hardLimitsWords) and the way the edge applies it (inbound.ts: nothing, null or 0 is the
  // 24-hour default). Nothing stored is the common case, and it read "holds off for NaN hours";
  // null and 0 read "an hour" where the product holds a day.
  const said = (h) => idOf(abilityRows({ ...live, pauseHours: h })).handoff.detail;
  for (const unset of [undefined, null, 0, ""]) assert.match(said(unset), /holds off for a day,/, JSON.stringify(unset));
  assert.match(said(4), /holds off for 4 hours,/);
  assert.match(said(72), /holds off for 3 days,/);
  // Every value the Autonomy pane offers (settings.jsx AUT_PAUSE: 1h, 4h, 12h, 24h, 3d).
  const pane = { 1: "an hour", 4: "4 hours", 12: "12 hours", 24: "a day", 72: "3 days" };
  for (const [hours, words] of Object.entries(pane)) assert.match(said(Number(hours)), new RegExp(`holds off for ${words},`), `${hours}h`);
  for (const h of [undefined, null, 0, 1, 4, 12, 24, 72]) assert.doesNotMatch(said(h), /NaN/);
});

test("with the owner's reasons, a hand-off still happens when it can't help", () => {
  // The composer hands over whenever the customer asks for a person or asks something the
  // instructions do not cover, "and whenever" the owner's reasons apply. The reasons widen it.
  assert.match(idOf(abilityRows(live)).handoff.detail, /^On your reasons, or when a customer asks for a person or it can't help, it stops answering/);
});

test("with bookings held on the Autonomy tab, the link is not ready, and the row says who holds it", () => {
  // Booking not on auto: a chat reply has the link taken back out (steps.ts layerTwo), and
  // the call's send is refused (outbound-gate.ts, booking_needs_a_person). The row said ready,
  // and "sends it".
  const held = idOf(abilityRows({ ...live, bookingHeld: true })).booking_link;
  assert.equal(held.ready, false);
  assert.equal(held.detail, "Your Autonomy tab holds bookings for you to confirm, so when someone asks to book, it sends no link: it tells them someone from the team will confirm.");
  // Missing the link, or WhatsApp, is still said first: those are what the page can fix here.
  assert.match(idOf(abilityRows({ ...live, bookingHeld: true, hasBookingLink: false })).booking_link.detail, /^No booking link yet/);
  assert.match(idOf(abilityRows({ ...live, bookingHeld: true, whatsappLive: false })).booking_link.detail, /WhatsApp, which isn't connected/);
  // The page computes the input with the predicate the edge asks (policyAskClass, retell-fn.ts):
  // any mode but auto holds it, fail safe, and the Replies row is not the Booking row.
  const policies = [null, {}, { booking: { mode: "auto" } }, { booking: { mode: "ask" } }, { booking: { mode: "never" } }, { booking: { mode: "veto" } }, { reply: { mode: "ask" } }, { faq: { mode: "ask" } }];
  assert.deepEqual(policies.map(bookingHeld), [false, false, false, true, true, true, false, false]);
  for (const p of policies) assert.equal(bookingHeld(p), policyAskClass(p, "booking") === "booking", JSON.stringify(p));
});

test("an input left out throws and says which, rather than drawing a card that lies", () => {
  // The page that calls this is untyped JSX. An omitted boolean is undefined, which is falsy,
  // and the card would say a line is dark or a switch is off with no error anywhere -- the
  // stance promptBlocks already takes on its own argument.
  const { visionOn: _v, bookingHeld: _b, ...missing } = live;
  assert.throws(() => abilityRows(missing), (e) => e instanceof TypeError && /visionOn/.test(e.message) && /bookingHeld/.test(e.message) && !/voiceLive/.test(e.message));
  assert.throws(() => abilityRows({ ...live, voiceLive: "yes" }), (e) => e instanceof TypeError && /voiceLive/.test(e.message));
  assert.throws(() => abilityRows({ ...live, whatsappLive: 1 }), (e) => e instanceof TypeError && /whatsappLive/.test(e.message));
  assert.throws(() => abilityRows(undefined), TypeError);
  // pauseHours is not one of them: whatever is stored is read the way the Autonomy pane reads it.
  assert.doesNotThrow(() => abilityRows({ ...live, pauseHours: undefined }));
});

test("a photo is looked at when the switch is on, and passed to a person when it is off", () => {
  // vision.ts: on, the photo is answered like a message under every rule the prompt carries;
  // off, it is acknowledged where the mode allows and always handed to a person (inbound.ts).
  const on = idOf(abilityRows({ ...live, visionOn: true })).vision;
  assert.equal(on.detail, "It says what it sees and suggests the next step, under the rules it always keeps.");
  assert.deepEqual([on.ready, on.on], [true, true]);
  const off = idOf(abilityRows(live)).vision;
  assert.equal(off.detail, "Off. A photo is passed to a person.");
  assert.deepEqual([off.ready, off.on], [false, false]);
});

test("both halves of a hand-off open the one row the page draws for them", () => {
  const rows = idOf(abilityRows(live));
  assert.equal(rows.transfer.runsOn.row, "handoff");
  assert.equal(rows.handoff.runsOn.row, "handoff");
  assert.equal(rows.vision.runsOn.row, "guardrails", "the photo switch sits with the rules it keeps");
  assert.equal(idOf(abilityRows({ ...live, visionOn: true })).vision.runsOn.label, "Turn it off");
});

/* ---- What it cannot do ---- */

test("what it cannot do is stated, and is not a setting", () => {
  const rows = cannotRows({ smsLive: false });
  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids, ["book", "outbound_call", "sms"]);
  assert.match(rows[0].detail, /no appointments table/i);
  assert.match(rows[1].detail, /never calls a customer/i);
  assert.equal(rows[2].soon, true);
});

test("a text message is not listed as something it cannot do once texting is live", () => {
  // Texting goes live on an active carrier line that is not a rehearsal filing
  // (capabilities.ts). On such a line "not part of what is sold yet" is not true.
  assert.deepEqual(cannotRows({ smsLive: true }).map((r) => r.id), ["book", "outbound_call"]);
  // Left out by an untyped caller, it would quietly read as not live.
  assert.throws(() => cannotRows({}), (e) => e instanceof TypeError && /smsLive/.test(e.message));
  assert.throws(() => cannotRows(), TypeError);
});
