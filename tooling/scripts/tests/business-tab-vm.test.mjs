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
  CANNOT_ROWS,
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
  assert.match(s.wont ?? "", /consult instead of a price/);
  assert.equal(typeof s.percent, "undefined", "there is no score on this page");
});

test("the standing line names the one thing missing, and where to fix it", () => {
  const noVoice = { ...full, profile: { ...full.profile, tone: undefined } };
  const s = standingLine(noVoice);
  assert.match(s.missing.sentence, /no voice of its own/i);
  assert.equal(s.missing.row, "tone");
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
  });
  for (const r of dark) assert.equal(r.ready, false, `${r.id} cannot be ready with nothing answering`);
  // And a phone-only workspace has no chat abilities, whatever is filled in.
  const phoneOnly = abilityRows({
    voiceLive: true, whatsappLive: false, hasCalendarFeed: true,
    hasBookingLink: true, hasHandoffNumber: true, hasEscalateWhen: true, visionOn: true, hasBookingTemplate: true, pauseHours: 24,
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

test("both halves of a hand-off open the one row the page draws for them", () => {
  const rows = idOf(abilityRows(live));
  assert.equal(rows.transfer.runsOn.row, "handoff");
  assert.equal(rows.handoff.runsOn.row, "handoff");
  assert.equal(rows.vision.runsOn.row, "guardrails", "the photo switch sits with the rules it keeps");
  assert.equal(idOf(abilityRows({ ...live, visionOn: true })).vision.runsOn.label, "Turn it off");
});

/* ---- What it cannot do ---- */

test("what it cannot do is stated, and is not a setting", () => {
  const ids = CANNOT_ROWS.map((r) => r.id);
  assert.deepEqual(ids, ["book", "outbound_call", "sms"]);
  assert.match(CANNOT_ROWS[0].detail, /no appointments table/i);
  assert.match(CANNOT_ROWS[1].detail, /never calls a customer/i);
  assert.equal(CANNOT_ROWS[2].soon, true);
});
