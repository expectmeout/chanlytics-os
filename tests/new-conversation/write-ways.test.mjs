/**
 * Which wire carries a message to one person now, and why not (a conversation begins from the Inbox, the design's 4.3):
 * the rule the sheet draws and the send route asks again. Each case is a row of the design's table, then each hold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvedWordsFor,
  channelsReady,
  defaultWriteWire,
  mayMessageFor,
  PURPOSE_REFUSALS,
  startsOn,
  writeReachOf,
  writeWaysOf,
  WRITE_HOLDS,
  WRITE_HOLD_WORDS,
} from "@chanlytics/contracts";

const NOW = new Date("2026-10-07T15:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** Every wire ready: a number in good standing, an approved texting line, a mailbox on a deployment that sends. */
const READY = channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
});

/** People's own row, as people_list answers it, for someone nothing is known of but a number and an address. */
const person = (over = {}) => ({
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
const way = (row, wire, ready = READY) => writeWaysOf(row, ready, NOW).find((w) => w.wire === wire);
const said = (row, ready = READY) =>
  Object.fromEntries(writeWaysOf(row, ready, NOW).map((w) => [w.wire, w.ok ? w.carries : w.hold]));

test("someone who wrote on WhatsApp today is answered there in the member's own words", () => {
  const row = person({
    last_inbound_channel: "whatsapp",
    last_wrote_at: hoursAgo(2),
    latest_wa_inbound_at: hoursAgo(2),
  });
  assert.deepEqual(said(row), { whatsapp: "words", sms: "no_yes", email: "words" });
  assert.equal(way(row, "whatsapp").starts, false, "it answers them");
  assert.equal(way(row, "whatsapp").hours_left, 22);
  assert.equal(way(row, "sms").starts, true, "they never texted");
  assert.equal(way(row, "email").about, "theirs", "they have dealt with the business");
});

test("past WhatsApp's day, only an approved message goes there; an email still carries words", () => {
  const row = person({
    last_inbound_channel: "whatsapp",
    last_wrote_at: hoursAgo(700),
    latest_wa_inbound_at: hoursAgo(700),
  });
  assert.deepEqual(said(row), { whatsapp: "approved", sms: "no_yes", email: "words" });
  assert.equal(way(row, "whatsapp").hours_left, null);
});

test("someone who phoned and never wrote is answered at the number they called from", () => {
  const row = person({ last_inbound_call_at: hoursAgo(30) });
  assert.deepEqual(said(row), { whatsapp: "approved", sms: "words", email: "words" });
  assert.equal(way(row, "sms").starts, false, "a text back answers their call");
  assert.equal(way(row, "email").starts, true, "they never wrote by email");
  // A month on, that call is no longer being answered: a message to them starts, and asks the yes a start asks.
  const ago = person({ last_inbound_call_at: hoursAgo(31 * 24) });
  assert.deepEqual(said(ago), { whatsapp: "no_yes", sms: "no_yes", email: "words" });
  assert.equal(way(ago, "sms").starts, true);
});

test("someone with a deal who never wrote or called needs their yes on a phone's wire, and none by email", () => {
  const row = person({ deal_id: "d1" });
  assert.deepEqual(said(row), { whatsapp: "no_yes", sms: "no_yes", email: "words" });
});

test("a yes given in person covers WhatsApp alone, and a stranger's first email goes from Campaigns", () => {
  const row = person({ consent: "opted_in", consent_channels: ["whatsapp"] });
  assert.deepEqual(said(row), { whatsapp: "approved", sms: "no_yes", email: "no_history" });
  assert.equal(way(row, "email").about, "ours");
  assert.match(way(row, "email").why, /Campaigns/);
});

test("a yes that covers a text lets a first text go", () => {
  const row = person({ consent: "opted_in", consent_channels: ["whatsapp", "sms"] });
  assert.equal(way(row, "sms").ok, true);
  assert.equal(way(row, "sms").carries, "words");
});

test("no yes, no history: nothing goes, and each wire says its own reason", () => {
  const row = person();
  assert.deepEqual(said(row), { whatsapp: "no_yes", sms: "no_yes", email: "no_history" });
  assert.equal(way(row, "whatsapp").why, "No yes on record for messages on WhatsApp.");
  assert.equal(way(row, "sms").why, "No yes on record for messages by text.");
});

test("a stop ends every wire, whichever column says it", () => {
  for (const over of [{ consent: "opted_out" }, { dnc: true }]) {
    const row = person({ last_inbound_channel: "whatsapp", latest_wa_inbound_at: hoursAgo(1), ...over });
    assert.deepEqual(said(row), { whatsapp: "stopped", sms: "stopped", email: "stopped" });
  }
});

test("a wire needs its way to reach them", () => {
  const wrote = { last_inbound_channel: "whatsapp", last_wrote_at: hoursAgo(1), latest_wa_inbound_at: hoursAgo(1) };
  assert.deepEqual(said(person({ ...wrote, email: null })), { whatsapp: "words", sms: "no_yes", email: "no_address" });
  assert.deepEqual(said(person({ ...wrote, email_suppressed_at: hoursAgo(5) })).email, "address_stopped");
  assert.deepEqual(said(person({ phone_e164: null, deal_id: "d1" })), {
    whatsapp: "no_number",
    sms: "no_number",
    email: "words",
  });
});

test("a wire the workspace cannot send on says the workspace's own reason", () => {
  const ready = channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: true },
  });
  const row = person({ last_inbound_call_at: hoursAgo(3) });
  assert.equal(way(row, "sms", ready).hold, "not_ready");
  assert.equal(way(row, "sms", ready).why, "No texting line yet.");
  assert.equal(way(row, "email", ready).why, "Set up email in Settings › Connections first.");
});

test("the sheet opens where they last wrote when a message can go there, else on the first wire that can", () => {
  const wrote = person({ last_inbound_channel: "email", last_wrote_at: hoursAgo(50) });
  assert.equal(defaultWriteWire(writeWaysOf(wrote, READY, NOW), wrote.last_inbound_channel), "email");
  const called = person({ last_inbound_call_at: hoursAgo(3) });
  assert.equal(defaultWriteWire(writeWaysOf(called, READY, NOW), null), "whatsapp");
  assert.equal(defaultWriteWire(writeWaysOf(person(), READY, NOW), null), null, "nothing can go");
});

test("a message starts on a wire they are not heard on, and a call is heard for a month", () => {
  assert.equal(startsOn("whatsapp", { lastWrote: "whatsapp", calledAt: null }, NOW), false);
  assert.equal(startsOn("sms", { lastWrote: "whatsapp", calledAt: null }, NOW), true);
  assert.equal(startsOn("sms", { lastWrote: null, calledAt: hoursAgo(29 * 24) }, NOW), false);
  assert.equal(startsOn("email", { lastWrote: null, calledAt: hoursAgo(1) }, NOW), true, "a call is not an email");
  assert.equal(startsOn("sms", { lastWrote: null, calledAt: hoursAgo(31 * 24) }, NOW), true, "a month on, it starts");
});

test("every hold has words, and only a hold the workspace words itself has none here", () => {
  assert.deepEqual(Object.keys(WRITE_HOLD_WORDS).sort(), WRITE_HOLDS.filter((h) => h !== "not_ready").sort());
  for (const wire of ["whatsapp", "sms", "email"]) {
    for (const hold of Object.keys(WRITE_HOLD_WORDS)) assert.ok(WRITE_HOLD_WORDS[hold](wire).length > 10);
  }
});

/** The workspace's own words for an approved message's slots, as the send reads them. */
const FACTS = { business_name: "Harbor Studio", booking_link: "https://book.example/h" };
const LINE = "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
const reachOf = (row, mode = null, facts = FACTS) =>
  writeReachOf(row, { firstTextLine: LINE, emailSigned: null, ready: READY, mode, facts, now: NOW });

test("an email to them says the signature it will carry, where an email can go (decision 0081)", () => {
  const row = {
    ...person({ last_inbound_channel: "email", last_wrote_at: hoursAgo(2) }),
    id: "k1",
    display_name: "Robin Example",
    wa_profile_name: null,
    latest_conversation_id: "c1",
  };
  const at = { firstTextLine: LINE, ready: READY, mode: null, facts: FACTS, now: NOW };
  const SIGNED = "Sam Reyes\nHarbor Studio";
  assert.equal(writeReachOf(row, { ...at, emailSigned: SIGNED }).email_signed, SIGNED, "said before the send");
  assert.equal(writeReachOf(row, { ...at, emailSigned: null }).email_signed, null, "none signs this member's emails");
  const stopped = { ...row, email_suppressed_at: hoursAgo(1) };
  assert.equal(writeReachOf(stopped, { ...at, emailSigned: SIGNED }).email_signed, null, "no email can go to them");
});

test("the reach read's answer: who, their thread, each wire, the call, and whether the receptionist answers", () => {
  const row = {
    ...person({ last_inbound_channel: "whatsapp", last_wrote_at: hoursAgo(2), latest_wa_inbound_at: hoursAgo(2) }),
    id: "k1",
    display_name: "Robin Example",
    wa_profile_name: null,
    latest_conversation_id: "c1",
    marketing_consent: "opted_in",
  };
  const reach = reachOf(row);
  assert.deepEqual(reach.person, {
    id: "k1",
    name: "Robin Example",
    phone: "+12125550143",
    email: "robin@example.com",
  });
  assert.equal(reach.thread, "th-c1");
  assert.equal(reach.default_wire, "whatsapp");
  assert.deepEqual(reach.call, { ok: true, tel: "+12125550143", why: null });
  assert.equal(reach.receptionist.answers, true, "no setting says otherwise");
  assert.equal(reach.offers_ok, true);
  assert.equal(reach.ways.length, 3);
  // The line a first text to them carries, where a text can go: they wrote on WhatsApp, and have no yes by text.
  assert.equal(reach.first_text_line, null, "no text can go to them, so no line is said");
  const texted = reachOf({ ...row, consent: "opted_in", consent_channels: ["whatsapp", "sms"] });
  assert.equal(texted.first_text_line, LINE, "said before the send, as it will leave");
  assert.deepEqual(reach.fills, {
    first_name: "Robin",
    business_name: "Harbor Studio",
    booking_link: "https://book.example/h",
  });
});

test("an approved message is shown as the person will read it: its slots filled as the send fills them", () => {
  const row = {
    ...person(),
    id: "k1",
    display_name: "Robin Example",
    wa_profile_name: null,
    latest_conversation_id: null,
  };
  const after = {
    name: "after_a_visit",
    body_preview: "Hi {{1}}, thanks for coming in to {{2}}. Book your next visit here: {{3}}",
    // The slots as the sync records them: a position, a label, the example filed with WhatsApp. No kind: it is read from the label.
    variables: [
      { position: 1, label: "First name", example: "Dani" },
      { position: 2, label: "Business name", example: "Corner Studio" },
      { position: 3, label: "Booking link", example: "https://example.com/book" },
    ],
  };
  assert.equal(
    approvedWordsFor(after, reachOf(row).fills),
    "Hi Robin, thanks for coming in to Harbor Studio. Book your next visit here: book.example/h",
    "the link without its scheme, as the wire carries it",
  );
  // Nobody has named them: "there", as the send says it.
  assert.match(approvedWordsFor(after, reachOf({ ...row, display_name: null }).fills), /^Hi there,/);
  // No business name on file: nothing to fill from, so the message as it is filed (and the send refuses it in words).
  assert.equal(reachOf(row, null, null).fills, null);
  assert.equal(approvedWordsFor(after, null), after.body_preview);
});

test("no thread, no number, a do-not-contact, and a receptionist told to ask first or never", () => {
  const base = { ...person(), id: "k2", display_name: null, wa_profile_name: null, latest_conversation_id: null };
  assert.equal(reachOf(base).thread, null);
  assert.deepEqual(reachOf({ ...base, phone_e164: null }).call, {
    ok: false,
    tel: null,
    why: "No number on their page.",
  });
  assert.deepEqual(reachOf({ ...base, dnc: true }).call, {
    ok: false,
    tel: null,
    why: "They are on your do-not-contact list.",
  });
  for (const mode of ["ask", "never"]) assert.equal(reachOf(base, mode).receptionist.answers, false);
  for (const mode of ["auto", "veto", null]) assert.equal(reachOf(base, mode).receptionist.answers, true);
});

test("someone who unsubscribed from the business's email is not written a first email, and is still answered by email", () => {
  // A deal on record: an email to them is about something of theirs, and needs no yes. They pressed Unsubscribe.
  const row = person({ deal_id: "d1", email_marketing: "opted_out" });
  const email = way(row, "email");
  assert.deepEqual([email.ok, email.hold, email.starts], [false, "unsubscribed", true]);
  assert.equal(email.why, PURPOSE_REFUSALS.unsubscribed, "in the send door's own sentence for it");
  assert.match(email.why, /No offers or first emails go to them by email/);
  // They wrote by email themselves: writing back is a reply, and a reply still goes.
  const wrote = person({ email_marketing: "opted_out", last_inbound_channel: "email", last_wrote_at: hoursAgo(5) });
  assert.deepEqual([way(wrote, "email").ok, way(wrote, "email").starts], [true, false]);
  // The predicate itself, as the rule and the send door both ask it.
  const bearing = { consent: "unknown", dnc: false, email_marketing: "opted_out", has_relationship: true };
  const ask = (opts) => mayMessageFor(bearing, "conversational", { channel: "email", about: "theirs", ...opts });
  assert.deepEqual(ask({ proactive: true, begins: true }), { ok: false, reason: "unsubscribed" });
  assert.equal(ask({ proactive: true }).ok, true, "a message about their visit still goes, as it did");
  assert.equal(ask({ proactive: false, begins: false }).ok, true, "and so does a reply");
  // On a phone's wire the email answer is not asked: the yes that covers that wire is.
  const phone = { ...bearing, consent: "opted_in", consent_channels: ["whatsapp"] };
  assert.equal(
    mayMessageFor(phone, "conversational", { channel: "whatsapp", about: "theirs", proactive: true, begins: true }).ok,
    true,
  );
});
