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
  openWeekWords,
  closuresAheadWords,
  closureDatesLabel,
  closuresFrom,
  servicesWords,
  servicesToldWords,
  servicesSaveWords,
  serviceUndoName,
  servicesFoundWords,
  blockShareWords,
  bookingRulesWords,
  BOOKING_RULE_HINTS,
  bookingRuleRefusal,
  needsConsultation,
  BookingRulesSchema,
  BOOKING_DEFAULTS,
  violatesNoPrices,
  TONE_PRESETS,
  handoffWords,
  handoffChatWords,
  handoffCallWords,
  notesWords,
  instructionsWords,
  fallbacksWords,
  RULES_WITHOUT_FIELDS_WORDS,
  BusinessProfileSchema,
  FALLBACK_DEFAULTS,
  INSTRUCTIONS_MAX,
  promptBlocks,
  resolveSystemPrompt,
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

/* ---- When you're open ---- */

const WEEK = { mon: { open: "09:30", close: "18:00" }, tue: { open: "09:30", close: "18:00" }, wed: { open: "09:30", close: "18:00" }, thu: { open: "09:30", close: "18:00" }, fri: { open: "09:30", close: "19:00" }, sat: { intervals: [{ open: "09:30", close: "13:00" }, { open: "14:00", close: "19:00" }] }, sun: {} };

test("the open card's line counts the days the composer would state times for, and names whose clock they are on", () => {
  assert.equal(openWeekWords(WEEK, "America/New_York"), "Six days a week, in New York time");
  assert.equal(openWeekWords({ ...WEEK, sun: { open: "10:00", close: "14:00" } }, "America/Los_Angeles"), "Seven days a week, in Los Angeles time");
  assert.equal(openWeekWords({ mon: WEEK.mon }, "Europe/Madrid"), "One day a week, in Madrid time");
  // A day stated half-way is one the receptionist calls closed (dayIntervals), so it is not counted as open.
  assert.equal(openWeekWords({ mon: WEEK.mon, tue: { open: "09:00" } }, "America/New_York"), "One day a week, in New York time");
  // No week to count: only whose clock it is, and the Hours row under it says they are not set.
  for (const none of [null, undefined, {}, { sun: {} }]) assert.equal(openWeekWords(none, "America/New_York"), "Times are in New York time");
});

test("the closures ahead are counted on the business's own day, soonest first, and the next is named as the board names it", () => {
  const closures = [
    { date: "2026-12-24", until: "2026-12-26", note: "Christmas" },
    { date: "2026-09-21" },
    { date: "2026-09-01", note: "Long gone" },
    { date: "2026-12-30", until: "2027-01-02" },
  ];
  // 03:30 UTC on the 22nd is still the 21st in New York: today's closure is still ahead there, and gone in Madrid.
  const now = new Date("2026-09-22T03:30:00Z");
  assert.deepEqual(closuresAheadWords(closures, "America/New_York", now), { count: 3, line: "3 ahead · next Sep 21" });
  assert.deepEqual(closuresAheadWords(closures, "Europe/Madrid", now), { count: 2, line: "2 ahead · next Dec 24 – 26 · Christmas" });
  // The dates as the Calendar's own list spells them, from the one function.
  assert.equal(closureDatesLabel(closures[3]), "Dec 30 – Jan 2");
  assert.equal(closuresFrom(closures, "2026-12-27").length, 1);
  assert.deepEqual(closuresAheadWords([closures[3]], "America/New_York", now), { count: 1, line: "1 ahead · Dec 30 – Jan 2" });
  // A closure that ends today is still ahead; one whose `until` is before its `date` is that one day.
  assert.equal(closuresAheadWords([{ date: "2026-09-19", until: "2026-09-21" }], "America/New_York", now).count, 1);
  assert.equal(closuresAheadWords([{ date: "2026-09-25", until: "2026-09-01" }], "America/New_York", now).line, "1 ahead · Sep 25");
  // None ahead is no line at all: the row says "None ahead". A row nobody finished has no date and is not counted.
  for (const none of [null, undefined, [], [closures[2]], [{ date: "", note: "half typed" }]]) assert.deepEqual(closuresAheadWords(none, "America/New_York", now), { count: 0, line: null });
  // A zone the clock cannot use is read as UTC (clock.ts), where it is already the 22nd: the row is never lost to one.
  assert.equal(closuresAheadWords(closures, "Not/AZone", now).count, 2);
});

/* ---- What you offer ---- */

const svc = (name, duration_min, price_note) => ({ name, ...(duration_min ? { duration_min } : {}), ...(price_note ? { price_note } : {}) });
const MANY = Array.from({ length: 33 }, (_, i) => svc(`Service ${i + 1}`, 30 + i, "quoted at consult"));

test("the services row counts them, names the first four with how long each takes, and says how many more", () => {
  const vm = servicesWords([svc("Balayage", 180, "quoted at consult"), svc("Highlights", 45, "quoted at consult"), svc("Haircut", null, "quoted at consult"), svc("Blowout", 120, "quoted at consult"), ...MANY.slice(0, 29)]);
  assert.equal(vm.count, 33);
  assert.equal(vm.line, "33 on record", "the canvas's words");
  // In the stored order, which is the order the receptionist reads them in: never sorted.
  // "180 min", never "180m", which a screen reader may say as metres.
  assert.deepEqual(vm.chips, [{ name: "Balayage", takes: "180 min" }, { name: "Highlights", takes: "45 min" }, { name: "Haircut", takes: null }, { name: "Blowout", takes: "120 min" }]);
  assert.equal(vm.more, "+29 more");
  // Four or fewer are all chips, with no "more".
  assert.deepEqual([servicesWords(MANY.slice(0, 4)).chips.length, servicesWords(MANY.slice(0, 4)).more], [4, null]);
  assert.deepEqual([servicesWords(MANY.slice(0, 5)).more, servicesWords(MANY.slice(0, 1)).line], ["+1 more", "1 on record"]);
  // None is no line at all: the row says it has none. A row nobody finished (no name) is not counted, as no save writes it.
  // And a stored list that is not one (a hand-edited record) is none, never a throw: the row is drawn as the page draws.
  for (const none of [null, undefined, [], [{ name: "" }], [{ name: "   ", duration_min: 30 }], { Balayage: 180 }, "Balayage"]) {
    assert.deepEqual(servicesWords(none), { count: 0, line: null, priced: null, chips: [], more: null });
  }
  assert.equal(servicesWords([svc("Balayage", 180), { name: "" }]).count, 1);
});

test("how they are priced is one sentence, judged by the detector the replies are checked by", () => {
  // Every one sent to a consultation, in the owner's own note: the canvas's sentence.
  assert.equal(servicesWords(MANY).priced, "Every one quoted at consult — none names a price.");
  assert.equal(servicesWords(MANY.map((s) => ({ ...s, price_note: "By consultation" }))).priced, "Every one by consultation — none names a price.", "the note as a sentence reads it");
  assert.equal(servicesWords(MANY.map((s, i) => ({ ...s, price_note: i % 2 ? "Quoted at consult" : "quoted at consult " }))).priced, "Every one quoted at consult — none names a price.", "the same note, whatever its case or its space");
  assert.equal(servicesWords([svc("Balayage", 180, "quoted at consult")]).priced, "Quoted at consult — it names no price.", "one service is not 'every one'");
  // A note the detector takes for a price is counted, whatever the rest say.
  const priced = MANY.map((s, i) => (i < 2 ? { ...s, price_note: i ? "45 dollars" : "from $45" } : s));
  assert.ok(violatesNoPrices("from $45") && violatesNoPrices("45 dollars") && !violatesNoPrices("quoted at consult"), "the one predicate");
  assert.equal(servicesWords(priced).priced, "2 name a price.");
  assert.equal(servicesWords([svc("Balayage", 180, "$120"), svc("Cut", 30)]).priced, "1 names a price.");
  assert.equal(servicesWords(MANY.map((s) => ({ ...s, price_note: "$60" }))).priced, "33 name a price.");
  // A duration or a length is not a price: the detector ignores bare numbers, and so does the row.
  assert.equal(servicesWords([svc("Braids", 240, "varies by length, 2 to 6 hours")]).priced, "None names a price.");
  // No price at all, notes that differ, or one note for all that sends no price to a consult: none names one, and no more.
  assert.equal(servicesWords([svc("Balayage", 180), svc("Cut", 30)]).priced, "None names a price.");
  assert.equal(servicesWords([svc("Balayage", 180, "quoted at consult"), svc("Cut", 30, "varies")]).priced, "None names a price.");
  assert.equal(servicesWords([svc("Balayage", 180, "quoted at consult"), svc("Cut", 30)]).priced, "None names a price.", "a service with no note is not 'quoted at consult'");
  assert.equal(servicesWords(MANY.map((s) => ({ ...s, price_note: "varies by length" }))).priced, "None names a price.");
});

test("a block's share of the prompt is a rough fraction in words, never a percentage", () => {
  // The canvas's: 1,190 characters of a 4,345-character prompt.
  assert.equal(blockShareWords(1190, 4345), "a quarter of everything it reads");
  assert.equal(blockShareWords(500, 1000), "half of everything it reads");
  assert.equal(blockShareWords(1000, 3000), "a third of everything it reads");
  assert.equal(blockShareWords(290, 1000), "about a quarter of everything it reads", "the nearest, and said to be rough when it is some way off");
  assert.equal(blockShareWords(50, 1000), "less than a tenth of everything it reads");
  assert.equal(blockShareWords(980, 1000), "nearly everything it reads");
  assert.equal(blockShareWords(1200, 1000), "nearly everything it reads", "never more than all of it");
  for (const [chars, total] of [[0, 1000], [100, 0], [null, 1000], [100, undefined], [Number.NaN, 10]]) assert.equal(blockShareWords(chars, total), null);
});

test("the services sheet's foot says how many it will be told of, how long they are, and what share of the prompt", () => {
  assert.equal(servicesToldWords({ count: 33, chars: 1190, total: 4345 }), "33 services, 1,190 characters — a quarter of everything it reads.", "the canvas's foot");
  assert.equal(servicesToldWords({ count: 1, chars: 40, total: 4000 }), "1 service, 40 characters — less than a tenth of everything it reads.");
  assert.equal(servicesToldWords({ count: 3, chars: null, total: 4000 }), "3 services.", "with no block to measure, the count alone");
  assert.equal(servicesToldWords({ count: 3, chars: 120, total: null }), "3 services, 120 characters.");
  assert.equal(servicesToldWords({ count: 0, chars: null, total: 4000 }), "No services, so it cannot say what you offer.");
  // One sentence, one home: the foot says what the standing line's gap says of a receptionist with no services.
  const gap = standingLine({ business_name: "A", booking_link: "https://a.example", profile: { hours: { mon: { open: "09:00", close: "17:00" } } } }).missing;
  assert.deepEqual([gap.row, gap.sentence], ["services", "It cannot say what you offer."]);
  assert.equal(servicesToldWords({ count: 0, chars: null, total: null }), `No services, so it ${gap.sentence.slice("It ".length)}`);
  assert.deepEqual([33, 1, 0].map(servicesSaveWords), ["Save 33 services", "Save 1 service", "Save with no services"]);
  // The Undo left where one was taken out is named for what it puts back.
  assert.deepEqual(["Balayage", "  Cut ", "", null].map(serviceUndoName), ["Undo removing Balayage", "Undo removing Cut", "Undo removing a service", "Undo removing a service"]);
});

test("the booking rules are one sentence of the rules that are set, in the fold's order, with the owner's notes as sentences", () => {
  const vm = bookingRulesWords({ lead_hours: 2, slot_min: 30, max_days_ahead: 14, party_max: 4, consult_first: ["Color correction"], notes: ["No chemical services after 4 PM", "Bridal parties are booked by phone."] });
  assert.equal(vm.line, "At least 2 hours' notice · 30-minute slots · up to 14 days ahead · up to 4 people", "the canvas's line");
  assert.equal(vm.notes, "No chemical services after 4 PM. Bridal parties are booked by phone.");
  // Only what is set is said, each in its own words, the first capitalised.
  assert.equal(bookingRulesWords({ party_max: 1 }).line, "Up to 1 person");
  assert.equal(bookingRulesWords({ lead_hours: 1, buffer_min: 15 }).line, "At least 1 hour's notice · 15 minutes between appointments");
  assert.equal(bookingRulesWords({ lead_hours: 0, buffer_min: 0, max_days_ahead: 1 }).line, "Same-day bookings · no gap between appointments · up to 1 day ahead");
  assert.equal(bookingRulesWords({ slot_min: 45, buffer_min: 1 }).line, "45-minute slots · 1 minute between appointments");
  // Consult-first is a row of its own, and a line of the rules nowhere here.
  assert.equal(bookingRulesWords({ consult_first: ["Extensions"] }).line, null);
  // With none set, what the openings are worked out with is said, from the defaults the calendar applies: not "no rule".
  for (const none of [null, undefined, {}, { notes: [] }, { lead_hours: null }]) {
    const empty = bookingRulesWords(none);
    assert.deepEqual([empty.line, empty.notes], [null, null]);
  }
  assert.equal(bookingRulesWords({}).none, "The calendar's own — at least 2 hours' notice, up to 14 days ahead, in 30-minute slots");
  assert.deepEqual(BOOKING_DEFAULTS, { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 }, "the numbers it says are the ones freeWindows applies");
  assert.equal(bookingRulesWords({ notes: ["  ", "Walk-ins welcome!"] }).notes, "Walk-ins welcome!");
});

test("a booking rule's box says what empty means, from the defaults the openings are worked out with", () => {
  assert.deepEqual(BOOKING_RULE_HINTS, {
    // The canvas said "Empty means no rule." of the least notice; an empty least notice is two hours'.
    lead_hours: "Empty uses 2 hours.",
    slot_min: "Empty uses the calendar's 30.",
    buffer_min: null,
    max_days_ahead: "Empty uses 14.",
    party_max: "Larger groups go to a person.",
  });
});

test("a booking rule's refusal says its range and what an empty box uses, each with its unit, from the schema and the defaults", () => {
  // The quality review: "leave it empty to use 2" named no unit, and the sentences were the page's.
  assert.deepEqual(["lead_hours", "slot_min", "buffer_min", "max_days_ahead", "party_max"].map(bookingRuleRefusal), [
    "Least notice is 0 to 168 hours; leave it empty to use 2 hours.",
    "A slot is 15 to 240 minutes; leave it empty for the calendar’s 30 minutes.",
    "The gap is 0 to 120 minutes; leave it empty for none.",
    "Times are offered 1 to 90 days ahead; leave it empty to use 14 days.",
    // No default: a party of any size is booked when none is set, and the composer says nothing of one.
    "A booking is for 1 to 20 people; leave it empty for no rule.",
  ]);
  // Its range is the save's own schema's, and what empty uses is the one BOOKING_DEFAULTS, which the hint reads too.
  const lead = BookingRulesSchema.shape.lead_hours.unwrap();
  assert.match(bookingRuleRefusal("lead_hours"), new RegExp(`^Least notice is ${lead.minValue} to ${lead.maxValue} hours; leave it empty to use ${BOOKING_DEFAULTS.lead_hours} hours\\.$`));
  assert.match(BOOKING_RULE_HINTS.lead_hours, new RegExp(`^Empty uses ${BOOKING_DEFAULTS.lead_hours} hours\\.$`));
  for (const bad of ["notes", "consult_first", "", undefined]) assert.throws(() => bookingRuleRefusal(bad), TypeError, String(bad));
});

test("a hand-edited record whose lists are not lists is read as none, never a throw", () => {
  // The quality review's probe: a stored booking_rules.notes that is a string threw as the row drew, and took the page
  // down with it. The page is drawn from whatever the record holds.
  assert.equal(bookingRulesWords({ lead_hours: 2, notes: "Cash only" }).notes, null);
  assert.equal(bookingRulesWords({ lead_hours: 2, notes: "Cash only" }).line, "At least 2 hours' notice");
  assert.equal(bookingRulesWords({ notes: { a: 1 } }).notes, null);
  // And the consult-first question, which the sheet asks of each row.
  assert.equal(needsConsultation("Extensions", { consult_first: "Extensions" }), false);
  assert.equal(needsConsultation("Extensions", { consult_first: ["extensions"] }), true);
});

test("the services search says how many rows it found, for a screen reader to hear as it narrows", () => {
  assert.equal(servicesFoundWords(11, 33), "11 of 33 services");
  assert.equal(servicesFoundWords(1, 33), "1 of 33 services");
  assert.equal(servicesFoundWords(1, 1), "1 of 1 service");
  assert.equal(servicesFoundWords(0, 33), "No service is called that.");
  assert.equal(servicesFoundWords(0, 0), "No services yet.");
});

/* ---- How it answers ---- */

test("the voice's three starting points are sentences the profile keeps, each named as the canvas names it", () => {
  assert.deepEqual(TONE_PRESETS.map((p) => p.label), ["Warm and brief", "Professional, no small talk", "Chatty, first names"]);
  for (const p of TONE_PRESETS) {
    assert.ok(BusinessProfileSchema.safeParse({ tone: p.tone }).success, `${p.label} is a voice the save takes`);
    assert.match(p.tone, /^[A-Z].*\.$/, `${p.label} is a sentence`);
  }
  assert.equal(new Set(TONE_PRESETS.map((p) => p.tone)).size, 3, "three different voices");
});

test("the hand-off row at rest counts the reasons and quotes their opening, and says what a call does", () => {
  const two = handoffWords(["They ask for a person, for the owner", "They are upset, or have a complaint"], "+1 (646) 932-5775");
  assert.equal(two.phone, "transfers to +1 (646) 932-5775");
  assert.equal(two.chat, "on 2 reasons — They ask for a person, for the owner · They are upset, or have a…", "cut at a word");
  assert.equal(handoffWords(["Refunds"], null).chat, "on 1 reason — Refunds", "short enough to say whole, with no ellipsis");
  // With no reasons it still hands over, on the composer's own triggers, in the words the ability card says them in.
  const none = handoffWords([], "  ");
  assert.equal(none.chat, "when a customer asks for a person or it can't help");
  assert.equal(none.phone, "takes a message");
  assert.ok(handoffChatWords({ hasEscalateWhen: false, pauseHours: undefined }).startsWith(`When ${none.chat.slice("when ".length)}, it`));
  // A hand-edited record whose list is not one is no reasons, never a throw.
  assert.equal(handoffWords("Refunds", undefined).chat, none.chat);
  assert.equal(handoffWords([" ", null, 3], undefined).chat, none.chat);
});

test("the hand-off sentences are the ability card's own, written once", () => {
  // What the fold says happens on WhatsApp and what a transfer does ARE the ability card's two rows: one sentence each.
  for (const hasEscalateWhen of [true, false]) {
    for (const pauseHours of [undefined, 4, 72]) {
      assert.equal(handoffChatWords({ hasEscalateWhen, pauseHours }), idOf(abilityRows({ ...live, hasEscalateWhen, pauseHours })).handoff.detail);
    }
  }
  assert.match(handoffChatWords({ hasEscalateWhen: true, pauseHours: undefined }), /the thread turns Needs you in the Inbox, and anyone set to be alerted is emailed\. It holds off for a day, then answers/);
  assert.doesNotMatch(handoffChatWords({ hasEscalateWhen: true, pauseHours: 24 }), /your staff/, "REGRESSION: the canvas emailed a staff the Notifications tab never named");
  for (const hasHandoffNumber of [true, false]) {
    assert.ok(handoffCallWords({ hasHandoffNumber, hasEscalateWhen: true }).endsWith(idOf(abilityRows({ ...live, hasHandoffNumber })).transfer.detail));
  }
});

test("on a call the reasons count too, as the composer writes them there", () => {
  // The canvas said the phone agent's own transfer kept the reasons from reaching it. The composer writes them under the
  // call's hand-off heading too ("and whenever:").
  const brain = { business_name: "Northside Studio", booking_link: "https://example.com/book", system_prompt: "x", fallbacks: FALLBACK_DEFAULTS, profile: { escalate_when: ["They want a refund"], handoff_number: "+16465550100" } };
  assert.match(resolveSystemPrompt(brain, "voice", "America/New_York", new Date(), {}, null), /- They want a refund/);
  assert.match(handoffCallWords({ hasHandoffNumber: true, hasEscalateWhen: true }), /^Your reasons reach a call too\. During opening hours it rings the number you gave/);
  assert.doesNotMatch(handoffCallWords({ hasHandoffNumber: true, hasEscalateWhen: true }), /do not reach it/);
  assert.equal(handoffCallWords({ hasHandoffNumber: false, hasEscalateWhen: false }), "No number yet, so it takes a message instead — which is better than a number nobody picks up.");
});

test("the notes row names the first four by title, and how many more", () => {
  const six = ["Parking", "Gift cards", "Second location", "Wi-Fi", "Pets", "Payment"].map((title) => ({ title, text: "…" }));
  assert.deepEqual(notesWords(six), { count: 6, chips: ["Parking", "Gift cards", "Second location", "Wi-Fi"], more: "+2 more" });
  assert.equal(notesWords(six.slice(0, 4)).more, null);
  assert.deepEqual(notesWords([]), { count: 0, chips: [], more: null });
  assert.deepEqual(notesWords([{ title: " ", text: "half" }, null, { title: "Parking" }]).chips, ["Parking"], "a note with no title is a row nobody finished");
  assert.deepEqual(notesWords("Parking"), { count: 0, chips: [], more: null });
});

test("the owner's own words are said by their size and their opening, cut at a word, and counted near the end", () => {
  const words = "Never discuss competitors. A first name is all the personal data you need, and nothing is ever booked by text.";
  const said = instructionsWords(`  ${words}  `);
  assert.equal(said.size, `${words.length} characters`);
  assert.equal(said.opening, "“Never discuss competitors. A first name is all the personal data you…”");
  assert.equal(said.nearFull, null, "far from the end, nothing is counted");
  assert.equal(instructionsWords("Short.").opening, "“Short.”", "short enough to quote whole");
  assert.equal(instructionsWords("One").size, "3 characters");
  assert.equal(instructionsWords("x".repeat(1180)).size, "1,180 characters");
  assert.deepEqual(instructionsWords("   "), { size: null, opening: null, nearFull: null });
  // Past four fifths of what the receptionist takes, the box says how close it is: the old form's count.
  const near = "x".repeat(INSTRUCTIONS_MAX * 0.8 + 1);
  assert.equal(instructionsWords(near).nearFull, `${near.length.toLocaleString("en-US")} of ${INSTRUCTIONS_MAX.toLocaleString("en-US")} characters`);
  assert.equal(instructionsWords("x".repeat(INSTRUCTIONS_MAX * 0.8)).nearFull, null, "at four fifths exactly, not yet");
});

test("the three messages say how many differ from the default wording, never who wrote them", () => {
  assert.deepEqual(fallbacksWords(FALLBACK_DEFAULTS), { line: "3 messages sent in your name", own: "all in the default wording" });
  assert.equal(fallbacksWords(null).own, "all in the default wording", "a workspace that stores none sends the default");
  assert.equal(fallbacksWords({ ...FALLBACK_DEFAULTS, error: "Sorry, something went wrong on our side." }).own, "1 differs from the default wording");
  assert.equal(fallbacksWords({ greeting: "Hi!", error: "Sorry.", non_text: "Thanks." }).own, "3 differ from the default wording");
  assert.equal(fallbacksWords({ ...FALLBACK_DEFAULTS, error: `  ${FALLBACK_DEFAULTS.error}\n` }).own, "all in the default wording", "space around a message is not a word of it");
  assert.equal(fallbacksWords({ ...FALLBACK_DEFAULTS, error: "" }).own, "all in the default wording", "a message stored empty is sent in the default wording");
  assert.doesNotMatch(fallbacksWords({ greeting: "Hi!" }).own, /you wrote/);
});

test("a record whose details compose nothing is told the stored prompt and Autonomy's rules, and the rules fold's sentence says so", () => {
  const brain = { business_name: "Northside Studio", booking_link: "https://example.com/book", system_prompt: "You answer for Northside Studio.", fallbacks: FALLBACK_DEFAULTS, profile: { guardrails: { never_quote_prices: false } } };
  const text = resolveSystemPrompt(brain, "whatsapp", "America/New_York", new Date(), { booking: { mode: "ask" } }, null);
  const blocks = promptBlocks(text, "whatsapp", brain);
  assert.deepEqual(blocks.map((b) => b.row), ["extra_instructions", "autonomy"], "the stored prompt as it stands, then only Autonomy's rules");
  assert.equal(blocks.find((b) => b.row === "guardrails"), undefined, "no rules block for the fold to show");
  // The fold's sentence agrees with the prompt view's note on the same page: nothing on it is composed yet.
  assert.match(blocks[0].note, /None of the details on this page are composed into it yet/);
  assert.match(RULES_WITHOUT_FIELDS_WORDS, /^Nothing on this page is composed into what it reads yet/);
  assert.match(RULES_WITHOUT_FIELDS_WORDS, /stored instructions, followed only by any rules your Autonomy tab adds\.$/);
});
