/**
 * People view models, EXECUTED.
 *
 * The six states are the product's vocabulary for "where do I matter", and
 * each is a column fact rather than a score. These tests pin the rule, its
 * evaluation order, the honesty rules around imported history, and the
 * profile's timeline ordering. No literal clock strings: CI runs UTC and dev
 * runs America/New_York, so every assertion is relative or a regex.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  personStateFor,
  toPersonRowVM,
  repliesWords,
  toPersonVM,
  peopleAggregates,
  PEOPLE_LISTS,
  PEOPLE_TABS,
  PERSON_STATE_LABELS,
} from "@chanlytics/contracts";
// A namespace too: a word this change adds is missing from the module until the dist is rebuilt, and a named import
// of it would fail the whole file instead of the one test that reads it.
import * as contracts from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const S = 1000,
  M = 60 * S,
  H = 60 * M,
  D = 24 * H;
const NOW = new Date("2026-09-04T16:00:00Z");
const nowMs = NOW.getTime();
const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();

/** An ordinary active person: wrote two hours ago, known for two months. */
function row(over = {}) {
  return {
    id: "c1",
    display_name: "Daniela R.",
    wa_profile_name: "Dani",
    phone_e164: "+17865550181",
    consent: "unknown",
    consent_source: null,
    consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: "cv1",
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: iso(2 * H),
    last_message_at: iso(2 * H),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "Can I move Saturday to 11?",
    last_inbound_at: iso(2 * H),
    last_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: iso(60 * D),
    earliest_row_at: iso(60 * D),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    ...over,
  };
}

const list = (id) => PEOPLE_LISTS.find((l) => l.id === id);

/* ------------------------------ the state rule --------------------------- */

test("an open escalation is needs_you, even for someone who opted out", () => {
  assert.equal(
    personStateFor(row({ open_escalation_reason: "human_token", open_escalation_since: iso(H) }), nowMs, ZONE),
    "needs_you",
  );
  assert.equal(
    personStateFor(row({ open_escalation_reason: "human_token", consent: "opted_out" }), nowMs, ZONE),
    "needs_you",
  );
  assert.equal(personStateFor(row({ needs_human: true }), nowMs, ZONE), "needs_you");
  assert.equal(
    personStateFor(
      row({
        open_escalation_reason: "policy_block",
        needs_human: true,
        latest_state: "needs_human",
        latest_paused_until: iso(-20 * H),
      }),
      nowMs,
    ),
    "needs_you",
    "the receptionist's own pause on a handoff is nobody's — it still needs you",
  );
});

test("waiting_on_you means a human owns the thread AND the last word was theirs", () => {
  assert.equal(
    personStateFor(row({ latest_assignee_user_id: "u1", latest_paused_until: iso(-3 * H) }), nowMs, ZONE),
    "waiting_on_you",
    "taken over: their name, and the receptionist paused for them",
  );
  // A name left on a thread nobody is working is not a claim (standing.ts): the receptionist answers it, as the
  // Inbox and the person's page say ("Answering"). The list said Waiting on you over the same thread.
  assert.equal(
    personStateFor(row({ latest_assignee_user_id: "u1" }), nowMs, ZONE),
    "active",
    "REGRESSION: a quiet thread with a name on it was waiting on you while the receptionist answered it",
  );
  assert.equal(
    personStateFor(row({ latest_paused_until: iso(-3 * H) }), nowMs, ZONE),
    "waiting_on_you",
    "paused into the future = owned",
  );
  assert.equal(
    personStateFor(
      row({ latest_assignee_user_id: "u1", last_message_direction: "outbound", last_message_sender: "human" }),
      nowMs,
    ),
    "active",
    "you replied — nobody is waiting",
  );
  assert.equal(
    personStateFor(row({ latest_paused_until: iso(3 * H) }), nowMs, ZONE),
    "active",
    "a pause that expired is not ownership",
  );
});

test("opted_out outranks new: a fresh STOP is not a new customer to chase", () => {
  assert.equal(personStateFor(row({ consent: "opted_out", first_contact_at: iso(D) }), nowMs, ZONE), "opted_out");
  assert.equal(personStateFor(row({ dnc: true, first_contact_at: iso(D) }), nowMs, ZONE), "opted_out");
});

test("new needs evidence: first contact within 7 days and NO imported history", () => {
  assert.equal(personStateFor(row({ first_contact_at: iso(3 * D) }), nowMs, ZONE), "new");
  assert.equal(personStateFor(row({ first_contact_at: iso(8 * D) }), nowMs, ZONE), "active");
  // A backfilled person whose first REAL timestamp is recent is still not new:
  // the import proves they existed before we started keeping time.
  assert.equal(personStateFor(row({ first_contact_at: iso(3 * D), has_backfill: true }), nowMs, ZONE), "active");
});

test("quiet is more than 30 of the workspace's days since THEY wrote or called; our own sends are not their word", () => {
  const old = { last_message_at: iso(31 * D), last_inbound_at: iso(31 * D), latest_wa_inbound_at: iso(31 * D) };
  assert.equal(personStateFor(row(old), nowMs, ZONE), "quiet");
  // Decision 0009: the row's pill says Quiet 30+ days' own rule.
  assert.equal(
    personStateFor(row({ ...old, last_message_at: iso(29 * D), last_message_direction: "outbound" }), nowMs, ZONE),
    "quiet",
    "a broadcast of ours does not make them recent",
  );
  assert.equal(
    personStateFor(row({ ...old, last_inbound_at: iso(29 * D) }), nowMs, ZONE),
    "active",
    "their own message does",
  );
  assert.equal(
    personStateFor(row({ ...old, last_call_at: iso(2 * D), last_inbound_call_at: iso(2 * D) }), nowMs, ZONE),
    "active",
    "a call they placed rescues",
  );
  assert.equal(
    personStateFor(row({ ...old, last_call_at: iso(2 * D), last_inbound_call_at: null }), nowMs, ZONE),
    "quiet",
    "a call we placed does not",
  );
  assert.equal(
    personStateFor(
      row({ last_message_at: null, last_message_direction: null, last_call_at: null, last_inbound_at: null }),
      nowMs,
      ZONE,
    ),
    "unheard",
    "never heard from is its own word: not quiet, not active",
  );
  assert.equal(PERSON_STATE_LABELS.unheard, "Not heard from");
});

test("the tabs are the states, in the order they are evaluated", () => {
  assert.deepEqual(
    PEOPLE_TABS.map((t) => t.id),
    ["all", "needs_you", "waiting_on_you", "new", "quiet", "active"],
  );
});

/* --------------------------------- names --------------------------------- */

test("name falls back display name → WhatsApp name → phone, and phone-only initials are the last two digits", () => {
  assert.equal(toPersonRowVM(row(), ZONE, NOW).name, "Daniela R.");
  assert.equal(toPersonRowVM(row({ display_name: null }), ZONE, NOW).name, "Dani");
  const phoneOnly = toPersonRowVM(row({ display_name: null, wa_profile_name: null }), ZONE, NOW);
  assert.match(phoneOnly.name, /81$/);
  assert.equal(phoneOnly.initials, "81");
  assert.equal(toPersonRowVM(row(), ZONE, NOW).initials, "DR");
});

/* ----------------------------- first contact ----------------------------- */

test("first contact is a date when there is evidence, and 'Before <import>' when there is only imported history", () => {
  const dated = toPersonRowVM(row({ first_contact_at: "2026-07-14T12:00:00Z" }), ZONE, NOW).firstContact;
  assert.equal(dated.label, "Jul 14");
  assert.equal(dated.estimate, false);

  const imported = toPersonRowVM(
    row({ first_contact_at: null, has_backfill: true, earliest_row_at: "2026-08-27T12:00:00Z" }),
    ZONE,
    NOW,
  ).firstContact;
  assert.equal(imported.label, "Before Aug 27");
  assert.equal(imported.estimate, true);

  assert.equal(
    toPersonRowVM(row({ first_contact_at: null, earliest_row_at: null }), ZONE, NOW).firstContact.label,
    "—",
  );
});

/* ------------------------------ last contact ----------------------------- */

test("last contact says who and how long ago, and the newer of message vs call wins", () => {
  assert.equal(toPersonRowVM(row(), ZONE, NOW).lastContact.label, "They wrote · 2h ago");
  assert.equal(
    toPersonRowVM(
      row({ last_message_at: iso(3 * D), last_message_direction: "outbound", last_message_sender: "ai" }),
      ZONE,
      NOW,
    ).lastContact.label,
    "Receptionist replied · 3d ago",
  );
  assert.equal(
    toPersonRowVM(
      row({ last_message_at: iso(3 * D), last_message_direction: "outbound", last_message_sender: "human" }),
      ZONE,
      NOW,
    ).lastContact.label,
    "Your team replied · 3d ago",
  );
  const called = toPersonRowVM(row({ last_call_at: iso(H), last_inbound_call_at: iso(H) }), ZONE, NOW).lastContact;
  assert.equal(called.kind, "call");
  assert.equal(called.label, "Phoned · 1h ago");
  // A call the receptionist placed is the last contact too, but nobody phoned us (the 2 Oct 2026 audit).
  const weCalled = toPersonRowVM(row({ last_call_at: iso(H), last_inbound_call_at: null }), ZONE, NOW).lastContact;
  assert.equal(weCalled.label, "We called · 1h ago");
  assert.equal(weCalled.who, "system");
  assert.match(
    toPersonRowVM(row({ last_message_at: iso(20 * D) }), ZONE, NOW).lastContact.label,
    /^They wrote · [A-Z][a-z]{2} \d{1,2}$/,
  );
  assert.equal(
    toPersonRowVM(row({ last_message_at: null, last_call_at: null }), ZONE, NOW).lastContact.label,
    "No contact recorded",
  );
  // The two parts the table draws on two lines, when over who; together they are the label (8 Oct 2026).
  const lc = toPersonRowVM(row(), ZONE, NOW).lastContact;
  assert.deepEqual([lc.by, lc.when], ["They wrote", "2h ago"]);
  assert.equal(`${lc.by} · ${lc.when}`, lc.label);
  const none = toPersonRowVM(row({ last_message_at: null, last_call_at: null }), ZONE, NOW).lastContact;
  assert.deepEqual([none.by, none.when], ["No contact recorded", ""]);
});

/* --------------------------- channels are facts -------------------------- */

test("channels come from identities OR from what actually happened — a chat implies WhatsApp, a call implies phone", () => {
  // Production: the backfilled thread's contact carries only a 'voice'
  // identity, yet has a WhatsApp transcript. The glyphs must not lie.
  const vm = toPersonRowVM(row({ channels: ["voice"], has_chat: true, call_count: 3 }), ZONE, NOW);
  assert.deepEqual(vm.channels, ["whatsapp", "voice"]);
  assert.deepEqual(toPersonRowVM(row({ channels: [], has_chat: false, call_count: 1 }), ZONE, NOW).channels, ["voice"]);
});

test("a person who only ever wrote by email is not on WhatsApp: the list says which wires their words travelled (00127), and a row read without it keeps the old reading", () => {
  const emailOnly = toPersonRowVM(
    row({
      channels: ["email"],
      has_chat: true,
      message_channels: ["email"],
      call_count: 0,
      phone_e164: null,
      email: "ana@example.com",
    }),
    ZONE,
    NOW,
  );
  assert.deepEqual(emailOnly.channels, ["email"], "REGRESSION guard: has_chat alone read as WhatsApp");
  assert.deepEqual(
    toPersonRowVM(
      row({ channels: ["whatsapp", "email"], has_chat: true, message_channels: ["email", "whatsapp"], call_count: 2 }),
      ZONE,
      NOW,
    ).channels,
    ["whatsapp", "voice", "email"],
  );
  // A text is its own wire now. It still wears the chat bubble (ChannelGlyph
  // draws sms as chat); what changed is the WORD -- a person who had only ever
  // texted was introduced as "WhatsApp" at the top of their page.
  const texter = toPersonRowVM(
    row({ channels: [], has_chat: true, message_channels: ["sms"], call_count: 0 }),
    ZONE,
    NOW,
  );
  assert.deepEqual(texter.channels, ["sms"]);
  assert.equal(texter.channelWords, "Text");
  assert.deepEqual(
    toPersonRowVM(row({ channels: [], has_chat: true, call_count: 0 }), ZONE, NOW).channels,
    ["whatsapp"],
    "no message_channels on the row: the old reading, which is the strictest",
  );
});

test("a bounced address (00298) rides the row as emailSuppressed, and by email there is then nobody to send to; a good or unread one is not suppressed", () => {
  const withAddress = (over) =>
    toPersonRowVM(row({ email: "ana@example.com", consent: "opted_in", ...over }), ZONE, NOW);
  const dead = withAddress({ email_suppressed_at: iso(3 * D) });
  assert.equal(dead.emailSuppressed, true);
  // A People row's "can get your messages" is the visit and proposal moments' (theirs), which by email asks an address and no yes.
  assert.equal(
    contracts.whyNotReceive(dead, "conversational", "email", "theirs"),
    "address_stopped",
    "the address is on file and mail to it has stopped: not 'no address'",
  );
  assert.equal(
    contracts.whyNotReceive(dead, "conversational", "whatsapp", "theirs"),
    null,
    "their number is still good",
  );
  for (const good of [withAddress({ email_suppressed_at: null }), withAddress({})]) {
    assert.equal(good.emailSuppressed, false, "null, or a row read before the column: not suppressed");
    assert.equal(contracts.whyNotReceive(good, "conversational", "email", "theirs"), null);
  }
});

test("REGRESSION: a person reached only by email is not held by WhatsApp's window, and their page does not say Phone", () => {
  // Found live: an email-only person's page said "Phone since Sep 17", "Reply
  // window: Closed · template only" and offered to "Send the booking-link
  // template" -- three answers to "which wire is this person on", each wrong,
  // each derived somewhere different.
  const emailOnly = toPersonRowVM(
    row({
      channels: ["email"],
      has_chat: true,
      message_channels: ["email"],
      call_count: 0,
      phone_e164: null,
      email: "ana@example.com",
      latest_wa_inbound_at: null,
    }),
    ZONE,
    NOW,
  );
  assert.equal(emailOnly.channelWords, "Email");
  assert.equal(emailOnly.replyVia, "Email");
  assert.equal(emailOnly.replyWindow.open, true, "only WhatsApp has a window");
  assert.deepEqual(emailOnly.bookingLinkAction, {
    label: "Email the booking link",
    short: "Email the link",
    title: "Opens the thread with the link ready to send by email",
    ready: true,
    offered: true,
  });

  // WhatsApp's own words are unchanged, open and shut.
  const open = toPersonRowVM(
    row({ message_channels: ["whatsapp"], latest_wa_inbound_at: iso(2 * 3_600_000) }),
    ZONE,
    NOW,
  );
  assert.equal(open.replyVia, "WhatsApp");
  assert.equal(open.bookingLinkAction.label, "Text the booking link");
  assert.equal(open.bookingLinkAction.ready, true);
  const shut = toPersonRowVM(row({ message_channels: ["whatsapp"], latest_wa_inbound_at: iso(3 * D) }), ZONE, NOW);
  assert.deepEqual([shut.bookingLinkAction.label, shut.bookingLinkAction.ready], ["Send the booking link", false]);

  // A row that cannot tell which wire came last reads WhatsApp's window, the
  // strictest there is: it may say a reply is held when it is not, never the reverse.
  const both = toPersonRowVM(
    row({ message_channels: ["email", "whatsapp"], latest_wa_inbound_at: iso(3 * D) }),
    ZONE,
    NOW,
  );
  assert.equal(both.replyWindow.open, false);

  // Somebody who has only phoned has no reply wire at all.
  const caller = toPersonRowVM(row({ has_chat: false, message_channels: [], call_count: 2 }), ZONE, NOW);
  assert.deepEqual([caller.replyVia, caller.replyWindow], [null, null]);
});

test("REGRESSION: a row replies on the wire they last wrote on (00320), so a texter is not held by WhatsApp's window", () => {
  // Found on production, 8 Oct 2026: four of five people had only ever texted. Their Reach read "Text", and the same
  // row's booking-link button said "Only an approved message reaches them until they write again": WhatsApp's rule,
  // on a wire that has no window. The row read WhatsApp for anyone who had written and was not email-only.
  const shutWa = iso(3 * D);
  const texter = toPersonRowVM(
    row({
      channels: [],
      has_chat: true,
      message_channels: ["sms"],
      last_inbound_channel: "sms",
      call_count: 0,
      latest_wa_inbound_at: null,
    }),
    ZONE,
    NOW,
  );
  assert.equal(texter.replyVia, "Text");
  assert.deepEqual(texter.replyWindow, { open: true, hoursLeft: 0 }, "only WhatsApp has a window");
  assert.deepEqual(texter.bookingLinkAction, {
    label: "Text the booking link",
    short: "Text the link",
    title: "Opens the thread with the link ready to send as a text",
    ready: true,
    offered: true,
  });

  // Both wires: the one they wrote on last decides, as the reply route does (verbs replyChannelOf).
  const both = (last, over = {}) =>
    toPersonRowVM(
      row({ message_channels: ["sms", "whatsapp"], last_inbound_channel: last, latest_wa_inbound_at: shutWa, ...over }),
      ZONE,
      NOW,
    );
  const lastText = both("sms");
  assert.deepEqual(
    [lastText.replyVia, lastText.bookingLinkAction.ready],
    ["Text", true],
    "WhatsApp's shut window holds no text",
  );
  const lastWa = both("whatsapp");
  assert.equal(lastWa.replyVia, "WhatsApp");
  assert.equal(lastWa.replyWindow.open, false);
  assert.deepEqual(
    [lastWa.bookingLinkAction.label, lastWa.bookingLinkAction.ready],
    ["Send the booking link", false],
    "last on WhatsApp, a day and more ago: only an approved message goes",
  );
  const waOpen = both("whatsapp", { latest_wa_inbound_at: iso(2 * 3_600_000) });
  assert.deepEqual([waOpen.replyWindow, waOpen.bookingLinkAction.ready], [{ open: true, hoursLeft: 22 }, true]);

  // WhatsApp and email, last by email: the reply goes by email, which no window holds...
  const mail = (over = {}) =>
    toPersonRowVM(
      row({
        email: "ana@example.com",
        message_channels: ["email", "whatsapp"],
        last_inbound_channel: "email",
        latest_wa_inbound_at: shutWa,
        ...over,
      }),
      ZONE,
      NOW,
    );
  assert.deepEqual([mail().replyVia, mail().bookingLinkAction.label], ["Email", "Email the booking link"]);
  // ...and where that address stopped accepting mail the row offers nothing, as the route would refuse it. The row
  // read WhatsApp here and offered a send that could not go.
  const stopped = mail({ email_suppressed_at: iso(2 * D) });
  assert.equal(stopped.emailSuppressed, true);
  assert.deepEqual([stopped.replyVia, stopped.bookingLinkAction.ready], ["Email", false]);
  assert.equal(stopped.bookingLinkAction.title, "Email can't reach them: their address stopped accepting mail");

  // A row that does not say where they last wrote (they have written nothing themselves, or it was read before
  // 00320) knows only which wires words have travelled between them. Where that is one wire alone the reply goes
  // there, whoever wrote: the reply route answers a thread nothing has come to where our own words last went (the
  // dashboard's replyChannelOf). A person a member texted first read WhatsApp here, behind its window, beside a
  // thread and a page that said Text.
  const silent = (wrote) =>
    toPersonRowVM(
      row({
        channels: [],
        has_chat: true,
        email: "ana@example.com",
        message_channels: wrote,
        last_inbound_channel: null,
        latest_wa_inbound_at: null,
      }),
      ZONE,
      NOW,
    );
  const textedFirst = silent(["sms"]);
  assert.deepEqual(
    [
      textedFirst.replyVia,
      textedFirst.replyWindow,
      textedFirst.bookingLinkAction.label,
      textedFirst.bookingLinkAction.ready,
    ],
    ["Text", { open: true, hoursLeft: 0 }, "Text the booking link", true],
  );
  assert.equal(silent(["email"]).replyVia, "Email", "as it always read");
  assert.deepEqual(
    [silent(["whatsapp"]).replyVia, silent(["whatsapp"]).bookingLinkAction.ready],
    ["WhatsApp", false],
    "WhatsApp alone is still WhatsApp, behind its window",
  );
  // On more than one wire it cannot tell which was last, and keeps the strictest reading: it may say a reply is held
  // when it is not, never the reverse.
  for (const wrote of [
    ["sms", "whatsapp"],
    ["email", "sms"],
    ["email", "sms", "whatsapp"],
  ])
    assert.deepEqual(
      [silent(wrote).replyVia, silent(wrote).bookingLinkAction.ready],
      ["WhatsApp", false],
      JSON.stringify(wrote),
    );
  // A wire that is not a written one is not "one wire alone": a row whose words went by something this build does not
  // name keeps the strictest reading too, and so does a row read before the wires were said (00127).
  assert.equal(silent(["voice"]).replyVia, "WhatsApp");
  assert.equal(silent(["sms", "voice"]).replyVia, "WhatsApp");
  assert.equal(silent(undefined).replyVia, "WhatsApp");
  assert.equal(silent([]).replyVia, "WhatsApp");
  // A value this build does not know is no wire, not a wire: the same strictest reading.
  const odd = toPersonRowVM(
    row({ message_channels: ["whatsapp"], last_inbound_channel: "voice", latest_wa_inbound_at: shutWa }),
    ZONE,
    NOW,
  );
  assert.equal(odd.replyVia, "WhatsApp");
  // No chat, no thread to reply in: no wire, whatever the column says.
  const noChat = toPersonRowVM(row({ has_chat: false, message_channels: [], last_inbound_channel: "sms" }), ZONE, NOW);
  assert.deepEqual([noChat.replyVia, noChat.replyWindow], [null, null]);
});

/* ------------------------- lists and aggregates -------------------------- */

test("smart lists: phoned-only, and opted-out includes someone who also needs you", () => {
  const phoned = toPersonRowVM(
    row({
      has_chat: false,
      call_count: 1,
      last_message_at: null,
      last_message_direction: null,
      last_call_at: iso(2 * D),
    }),
    ZONE,
    NOW,
  );
  assert.equal(list("phoned_only").test(phoned), true);
  assert.equal(list("phoned_only").test(toPersonRowVM(row(), ZONE, NOW)), false);
  const both = toPersonRowVM(row({ open_escalation_reason: "human_token", consent: "opted_out" }), ZONE, NOW);
  assert.equal(both.state, "needs_you");
  assert.equal(list("opted_out").test(both), true, "the list is a fact, not the state");
  assert.equal(list("needs_you").test(both), true);
});

test("aggregates count measured facts and honour the evidence rule", () => {
  const rows = [
    row({ id: "a", open_escalation_reason: "human_token", open_escalation_since: iso(3 * H) }),
    row({ id: "b", first_contact_at: iso(2 * D) }),
    row({ id: "c", first_contact_at: iso(5 * D), has_backfill: true }),
    row({ id: "d", last_message_at: iso(35 * D), last_inbound_at: iso(35 * D), first_contact_at: iso(90 * D) }),
  ].map((r) => toPersonRowVM(r, ZONE, NOW));
  const agg = peopleAggregates(rows, nowMs);
  assert.equal(agg.total, 4);
  assert.equal(agg.needsYou, 1);
  assert.equal(agg.needsYouOldestMs, nowMs - 3 * H);
  assert.equal(agg.newThisMonth, 1, "the backfilled person is not new however recent the timestamp");
  assert.equal(agg.reachedWeek, 3);
});

/* -------------------------------- profile -------------------------------- */

function msg(over) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "hi",
    media: null,
    meta: {},
    status: "received",
    created_at: over.at,
    channel_ts: over.at,
    ...over,
  };
}

function detail(over = {}) {
  return {
    row: row(),
    identities: [{ channel: "whatsapp", external_id: "17865550181", created_at: iso(60 * D) }],
    conversations: [
      {
        id: "cv1",
        state: "open",
        paused_until: null,
        snooze_until: null,
        assignee_user_id: null,
        last_wa_inbound_at: iso(2 * H),
        last_message_at: iso(2 * H),
        contact: {
          id: "c1",
          display_name: "Daniela R.",
          wa_profile_name: "Dani",
          phone_e164: "+17865550181",
          consent: "unknown",
          dnc: false,
        },
        messages: [
          msg({ id: "m1", at: iso(60 * D), body: "Hi! Do you have anything Thursday?" }),
          msg({
            id: "m2",
            at: iso(D),
            direction: "outbound",
            sender: "human",
            status: "delivered",
            body: "Yes we can do 4pm Thursday",
          }),
          msg({ id: "m3", at: iso(2 * H), body: "Can I move Saturday to 11?" }),
          msg({
            id: "m4",
            at: iso(2 * H - 30 * S),
            direction: "outbound",
            sender: "ai",
            status: "delivered",
            body: "Of course — let me get someone.",
          }),
          msg({
            id: "m5",
            at: iso(7 * D),
            sender: "system",
            type: "call_summary",
            body: "Inbound call · 2 min — asked about balayage",
          }),
          msg({
            id: "m6",
            at: iso(2 * D),
            direction: "outbound",
            sender: "ai",
            status: "canceled",
            body: "never sent",
          }),
        ],
      },
    ],
    calls: [
      {
        id: "k1",
        retell_call_id: "r1",
        direction: "inbound",
        call_type: "phone_call",
        status: "ended",
        from_e164: "+17865550181",
        from_raw: null,
        to_e164: null,
        started_at: iso(7 * D),
        ended_at: iso(7 * D - 112 * S),
        duration_ms: 112000,
        disconnection_reason: null,
        sentiment: null,
        call_successful: true,
        in_voicemail: false,
        summary: "Asked about balayage pricing. Wants Saturday.",
        transcript_object: null,
        recording: { fetch_state: "stored" },
        conversation_id: "cv1",
        contact_id: "c1",
        message_id: "m5",
        contact: null,
      },
    ],
    escalations: [
      {
        id: "e1",
        conversation_id: "cv1",
        reason: "human_token",
        state: "open",
        details: null,
        created_at: iso(2 * H - 40 * S),
        updated_at: iso(2 * H - 40 * S),
        resolved_by_user_id: null,
      },
    ],
    decisions: [
      {
        id: "d1",
        verb: "take_over",
        subject_type: "conversation",
        subject_id: "cv1",
        actor_type: "user",
        actor_user_id: "u1",
        created_at: iso(D + H),
        payload: null,
      },
      {
        id: "d2",
        verb: "hand_back",
        subject_type: "conversation",
        subject_id: "cv1",
        actor_type: "user",
        actor_user_id: "u1",
        created_at: iso(D - H),
        payload: null,
      },
    ],
    ...over,
  };
}

test("the timeline merges messages, calls, escalations and decisions in true order, newest first", () => {
  const vm = toPersonVM(detail(), ZONE, NOW);
  assert.deepEqual(
    vm.timeline.map((i) => i.kind),
    ["escalation", "receptionist", "customer", "decision", "team", "decision", "receptionist", "call", "customer"],
  );
  assert.equal(vm.timeline[3].who, "Handed back");
  assert.equal(vm.timeline[5].who, "Took over");
  // A teammate's reply is the team's, never "You": the row does not say which member sent it.
  assert.equal(vm.timeline[4].who, "Your team");
  // A canceled reply is a line that says so, in the thread's words (messageStatusLabel), and not a hole.
  const canceled = vm.timeline[6];
  assert.equal(canceled.text, "never sent");
  assert.equal(canceled.sub, "Canceled before sending");
  assert.ok(!vm.timeline.some((i) => i.kind === "system"), "the call_summary row is represented by the call itself");
  const call = vm.timeline.find((i) => i.kind === "call");
  assert.match(call.who, /^Inbound call · 1:52/);
  assert.equal(call.link.to, "conversations/cv-k1");
  // How it ended is the one word Live, Conversations and the thread's call card say (callOutcomeFor), then where it is kept.
  assert.equal(call.sub, "Handled · Recording and transcript in Conversations");
  for (let i = 1; i < vm.timeline.length; i++) assert.ok(vm.timeline[i - 1].ts >= vm.timeline[i].ts, "sorted desc");
});

test('REGRESSION: a call with no length reads the same on the timeline as on its card, NaN and the infinities included -- the timeline said "Inbound call · NaN:NaN", and "Infinity:NaN" for an unbounded one', () => {
  const withLength = (duration_ms) => {
    const d = detail();
    return { ...d, calls: d.calls.map((k) => ({ ...k, duration_ms })) };
  };
  for (const none of [null, undefined, 0, -5000, NaN, Infinity, -Infinity]) {
    const d = withLength(none);
    const call = toPersonVM(d, ZONE, NOW).timeline.find((i) => i.kind === "call");
    assert.equal(call.who, "Inbound call", `a length of ${none} is no length on the timeline`);
    assert.equal("duration" in contracts.toCallVM(d.calls[0], ZONE, NOW), false, `nor on the card, for ${none}`);
    assert.equal(contracts.callLength(none), undefined, `nor by the rule itself, for ${none}`);
  }
  const d = withLength(112_000);
  assert.equal(toPersonVM(d, ZONE, NOW).timeline.find((i) => i.kind === "call").who, "Inbound call · 1:52");
  assert.equal(contracts.toCallVM(d.calls[0], ZONE, NOW).duration, "1:52");
  assert.equal(contracts.callLength(112_000), "1:52");
});

test("last exchange is the customer's last line and the reply that followed it, verbatim", () => {
  const vm = toPersonVM(detail(), ZONE, NOW);
  assert.equal(vm.lastExchange.customer.text, "Can I move Saturday to 11?");
  assert.equal(vm.lastExchange.reply.text, "Of course — let me get someone.");
  assert.equal(vm.lastExchange.reply.who, "Receptionist");
});

test("right now: escalation → paused-for-you with a deep link; queued, owned, opted-out and answering each have their own shape", () => {
  const esc = toPersonVM(detail(), ZONE, NOW).rightNow;
  assert.equal(esc.tone, "escalated");
  assert.equal(esc.cta.to, "inbox/th-cv1");

  const bare = (over) => toPersonVM(detail({ row: row(over), escalations: [], decisions: [] }), ZONE, NOW).rightNow;
  assert.equal(bare({ queued_reply_at: iso(5 * S) }).tone, "queued");
  // A thread somebody has: flagged, and they claimed it (the standing rule; no one looking, so whose is not said).
  assert.equal(bare({ latest_assignee_user_id: "u1", needs_human: true, latest_state: "needs_human" }).tone, "paused");
  // A name left on a thread nobody is working is not a claim: the assignee is never cleared, and the receptionist answers.
  assert.equal(bare({ latest_assignee_user_id: "u1" }).tone, "answering");
  assert.equal(bare({ consent: "opted_out" }).tone, "silent");
  assert.equal(bare({ latest_state: "snoozed", latest_snooze_until: iso(-18 * H) }).tone, "snoozed");
  assert.equal(bare({}).tone, "answering");
});

test("REGRESSION: right now says a thread the owner answered is theirs, as the Receptionist fact beside it does, for every flag a row carries", () => {
  // Found live on 18 Sep 2026: the owner answered an email. The reply claimed
  // the thread (an assignee, a day's pause) and its state stayed needs_human,
  // so the card said "Needs you · Stopped, and nobody has taken the thread
  // yet" while the Receptionist fact said a person owns it.
  const vmOf = (over) => toPersonVM(detail({ row: row(over), escalations: [], decisions: [] }), ZONE, NOW);
  const answered = vmOf({
    needs_human: true,
    latest_state: "needs_human",
    latest_assignee_user_id: "u1",
    latest_paused_until: iso(-23 * H),
    last_message_direction: "outbound",
    last_message_sender: "human",
  });
  assert.equal(answered.rightNow.tone, "paused");
  assert.doesNotMatch(answered.rightNow.detail, /nobody has taken/);

  // Both read one row; the card is receptionistOf's answer in more words.
  let n = 0;
  for (const assignee of [null, "u1"])
    for (const paused of [null, iso(-H)])
      for (const reason of [null, "human_token"])
        for (const nh of [false, true])
          for (const queued of [null, iso(5 * S)])
            for (const snoozed of [false, true])
              for (const [consent, dnc] of [
                ["unknown", false],
                ["opted_out", false],
                ["unknown", true],
              ]) {
                const over = {
                  latest_assignee_user_id: assignee,
                  latest_paused_until: paused,
                  open_escalation_reason: reason,
                  open_escalation_since: reason ? iso(H) : null,
                  needs_human: nh,
                  latest_state: snoozed ? "snoozed" : nh ? "needs_human" : "open",
                  latest_snooze_until: snoozed ? iso(-18 * H) : null,
                  queued_reply_at: queued,
                  consent,
                  dnc,
                };
                assert.equal(
                  vmOf(over).rightNow.tone,
                  toPersonRowVM(row(over), ZONE, NOW).receptionist.tone,
                  JSON.stringify(over),
                );
                n++;
              }
  assert.equal(n, 192, "every combination was drawn");
});

test("the profile's facts, about rail and thread link are measured, and a phone-only person has no thread to open", () => {
  const vm = toPersonVM(detail(), ZONE, NOW);
  assert.deepEqual(
    vm.facts.map((f) => f.label),
    ["First contact", "Last contact", "Conversations", "Calls", "Receptionist"],
  );
  assert.equal(vm.facts[3].value, 1);
  assert.equal(vm.openThread, "inbox/th-cv1");
  assert.ok(vm.about.some((a) => a.k === "Phone"));
  assert.ok(vm.about.some((a) => a.k === "Replies"));

  const phoneOnly = toPersonVM(
    detail({ row: row({ has_chat: false, call_count: 1, latest_conversation_id: "cv1" }), conversations: [] }),
    ZONE,
    NOW,
  );
  assert.equal(phoneOnly.openThread, null);
  assert.ok(!phoneOnly.about.some((a) => a.k === "Replies"), "no WhatsApp thread, no reply window");
});

test("the view model never carries a number the schema does not hold", () => {
  const vm = toPersonVM(detail(), ZONE, NOW);
  const banned = /ltv|revenue|visits|no.?show|health|temperature|package|therapist/i;
  for (const k of Object.keys(vm)) assert.ok(!banned.test(k), `field ${k}`);
  for (const f of vm.facts) assert.ok(!banned.test(f.label), f.label);
});

test('a person known only by number is never called "+1": the speaker label is the whole number', () => {
  const d = detail({ row: row({ display_name: null, wa_profile_name: null }) });
  d.conversations[0].contact.display_name = null;
  d.conversations[0].contact.wa_profile_name = null;
  const vm = toPersonVM(d, ZONE, NOW);
  const customer = vm.timeline.find((i) => i.kind === "customer");
  assert.notEqual(customer.who, "+1");
  assert.equal(customer.who, vm.name);
  assert.match(vm.name, /81$/);
});

test("the profile carries the person's own receptionist mode and the workspace's, and never invents one", () => {
  const vm = toPersonVM(detail({ receptionist_mode: "never", workspace_reply_mode: "veto" }), ZONE, NOW);
  assert.deepEqual(
    vm.receptionistMode,
    { person: "never", workspace: "auto" },
    "veto answers after a hold, so it reads as Answer",
  );
  const following = toPersonVM(detail({ receptionist_mode: null, workspace_reply_mode: "ask" }), ZONE, NOW);
  assert.deepEqual(following.receptionistMode, { person: null, workspace: "ask" });
  const junk = toPersonVM(detail({ receptionist_mode: "sometimes", workspace_reply_mode: undefined }), ZONE, NOW);
  assert.deepEqual(junk.receptionistMode, { person: null, workspace: null });
});

test("consent reads with how it was given; the offers list is exactly the opted-in", () => {
  const yes = toPersonRowVM(
    row({ consent: "opted_in", consent_source: "in_person", consent_updated_at: iso(2 * D) }),
    ZONE,
    NOW,
  );
  assert.equal(yes.consent.state, "opted_in");
  assert.ok(yes.consent.sub.startsWith("In person · "), yes.consent.sub);
  assert.equal(yes.consent.source, "in_person");
  assert.equal(list("opted_in").test(yes), true);
  assert.equal(list("opted_out").test(yes), false);
  const stop = toPersonRowVM(
    row({ consent: "opted_out", dnc: true, consent_source: "customer_message", consent_updated_at: iso(D) }),
    ZONE,
    NOW,
  );
  assert.ok(stop.consent.sub.startsWith("STOP received"), stop.consent.sub);
  assert.equal(list("opted_in").test(stop), false);
  const no = toPersonRowVM(
    row({ consent: "opted_out", dnc: true, consent_source: "phone", consent_updated_at: iso(D) }),
    ZONE,
    NOW,
  );
  assert.ok(no.consent.sub.startsWith("On the phone · "), no.consent.sub);
  assert.equal(list("opted_in").test(toPersonRowVM(row(), ZONE, NOW)), false, "not asked is not a yes");
});

test("the offers answer in a word, as People's Offers column says it -- so a list's Offers column can never show the other answer", () => {
  assert.equal(toPersonRowVM(row(), ZONE, NOW).consent.marketingLabel, "Not asked");
  assert.equal(
    toPersonRowVM(row({ consent: "opted_in", marketing_consent: "opted_in" }), ZONE, NOW).consent.marketingLabel,
    "Yes",
  );
  assert.equal(
    toPersonRowVM(row({ consent: "opted_in", marketing_consent: "opted_out" }), ZONE, NOW).consent.marketingLabel,
    "No",
  );
  assert.equal(
    toPersonRowVM(row({ consent: "opted_in", marketing_consent: null }), ZONE, NOW).consent.marketingLabel,
    "Not asked",
    "a yes to messages is not a yes to offers",
  );
  assert.equal(
    toPersonRowVM(row({ consent: "opted_out", marketing_consent: "opted_in" }), ZONE, NOW).consent.marketingLabel,
    "No",
    "a STOP stops offers too",
  );
});

test("where a person came from, in the words People says it: one per stored value, and nothing for what this build does not know", () => {
  assert.deepEqual(contracts.PERSON_CAME_FROM_WORDS, {
    whatsapp: "WhatsApp",
    sms: "Text",
    email: "Email",
    call: "Phone",
    calendar: "Your calendar",
    manual: "Added by hand",
    import: "Imported",
    lead: "A lead you found",
    ad: "An ad",
  });
  for (const [key, label] of Object.entries(contracts.PERSON_CAME_FROM_WORDS))
    assert.deepEqual(contracts.cameFromOf({ came_from: key }), { key, label });
  assert.equal(contracts.cameFromOf({ came_from: null }), null, "nothing known, nothing said");
  assert.equal(contracts.cameFromOf({}), null, "a row read before 00138 has no came_from at all");
  assert.equal(
    contracts.cameFromOf({ came_from: "carrier_pigeon" }),
    null,
    "a value this build does not know is never shown raw",
  );
  assert.equal(contracts.cameFromOf({ came_from: "toString" }), null, "nor one every object answers to");
  assert.deepEqual(
    toPersonRowVM(row({ came_from: "calendar" }), ZONE, NOW).cameFrom,
    { key: "calendar", label: "Your calendar" },
    "the row carries it",
  );
  assert.equal(toPersonRowVM(row(), ZONE, NOW).cameFrom, null);
});

test("proposalAction: the send-the-proposal button's words by the wire, 'again' once it went out, and no button where a closed window would make it a lie", () => {
  // The reach as every reach sentence reads it (ReplyReach): the wire, its window, whether mail to them has stopped.
  const f = (via, window, sent) => contracts.proposalAction({ via, window, emailStopped: false }, sent);
  assert.deepEqual(f("Email", { open: true, hoursLeft: 0 }, null), {
    label: "Email the proposal",
    title: "Opens the thread with the proposal link ready to send by email",
    ready: true,
  });
  assert.deepEqual(f("Text", { open: true, hoursLeft: 0 }, "Sep 22, 2026 · Text"), {
    label: "Text the proposal again",
    title: "Opens the thread with the proposal link ready to send as a text · sent Sep 22, 2026 · Text",
    ready: true,
  });
  assert.deepEqual(f("WhatsApp", { open: true, hoursLeft: 5 }, null), {
    label: "Send the proposal",
    title: "Opens the thread with the proposal link ready to send · any message for 5h more",
    ready: true,
  });
  assert.equal(f("WhatsApp", { open: false, hoursLeft: 0 }, null).ready, false);
  assert.equal(f(null, null, null).ready, false);
});

test("a person's proposal: the address, its host in About, and the newest message that carried it and went out", () => {
  const url = "https://www.docs.example.com/p/dani";
  // Deals are on (0008): a proposal is a deal's, and where they are off the page says none (below).
  const d = detail({ proposal_url: url });
  d.conversations[0].messages.push(
    msg({
      id: "m-q",
      at: iso(2 * H),
      body: contracts.proposalMessage(url),
      direction: "outbound",
      sender: "human",
      status: "queued",
      channel: "whatsapp",
    }),
    msg({
      id: "m-s",
      at: iso(5 * H),
      body: contracts.proposalMessage(url),
      direction: "outbound",
      sender: "human",
      status: "sent",
      channel: "whatsapp",
    }),
  );
  const vm = toPersonVM(d, ZONE, NOW);
  assert.equal(vm.proposal.url, url);
  assert.equal(vm.proposal.host, "docs.example.com");
  assert.equal(vm.proposal.sent.via, "WhatsApp");
  assert.equal(vm.proposal.sent.at, iso(5 * H), "the one that went out, not the one still in its cancel window");
  assert.ok(vm.about.some((a) => a.k === "Proposal" && a.v === "docs.example.com"));
  assert.match(vm.proposalAction.label, /again$/);
  assert.match(vm.proposalAction.title, /sent .* · WhatsApp$/);
  assert.equal(toPersonVM(detail(), ZONE, NOW).proposal, null);
  assert.equal(
    toPersonVM(detail(), ZONE, NOW).about.some((a) => a.k === "Proposal"),
    false,
  );
  const fresh = toPersonVM(detail({ proposal_url: "https://docs.example.com/p/new" }), ZONE, NOW);
  assert.equal(fresh.proposal.sent, null, "a new address has not gone out");
  assert.equal(fresh.proposalAction.label, "Send the proposal");
  assert.equal(contracts.proposalMessage(url), `Here's the proposal we put together for you: ${url}`);
});

test("the Replies row says what a reply may be in the owner's words: no 'window', no 'template'", () => {
  const at = (hoursAgo) =>
    toPersonVM(
      detail({
        row: row({
          has_chat: true,
          latest_wa_inbound_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
        }),
      }),
      ZONE,
      NOW,
    ).about.find((a) => a.k === "Replies");
  const open = at(19);
  assert.ok(
    open && /^Any message, for \d+ more hours?$|^Any message, for less than an hour$/.test(open.v),
    open && open.v,
  );
  assert.equal(
    at(30).v,
    "Approved messages only, until they write again",
    "REGRESSION: it said Closed · template only",
  );
});

test("a row says how to reach a person in words: the wire a reply goes on over the one identifier, and what a reply may be only where that matters", () => {
  const { rowReachWords } = contracts;
  const base = {
    name: "Zoë",
    phone: "+1 (786) 555-0181",
    email: null,
    channels: ["whatsapp", "voice"],
    lastChannel: "whatsapp",
    replyVia: "WhatsApp",
    replyWindow: { open: true, hoursLeft: 9 },
    emailSuppressed: false,
    stopped: false,
    channelWords: "WhatsApp · Phone",
  };
  // Named, with an open window: the wire, the number, nothing more to say; every wire in the tip.
  assert.deepEqual(rowReachWords(base, true), {
    wire: "WhatsApp",
    id: "+1 (786) 555-0181",
    may: null,
    tip: "WhatsApp · Phone · Any message, for 9 more hours",
  });
  // The window shut is the ordinary state of a WhatsApp thread (it shuts a day after they last wrote), so it is the
  // tip's to say and never a line on the row: on a line it stood on nearly every row, a third one, and widened the column.
  const shutRow = rowReachWords({ ...base, replyWindow: { open: false, hoursLeft: 0 } }, true);
  assert.deepEqual(
    [shutRow.may, shutRow.tip],
    [null, "WhatsApp · Phone · Approved messages only, until they write again"],
  );
  // Named by their number: the number is the name, so the cell says the wire alone.
  const byNumber = rowReachWords({ ...base, name: "+1 (786) 555-0181" }, false);
  assert.deepEqual([byNumber.wire, byNumber.id], ["WhatsApp", null]);
  // By email: the address is the identifier, even beside a number, and a stopped address says so.
  const mail = {
    ...base,
    email: "zoe@example.com",
    lastChannel: "email",
    replyVia: "Email",
    replyWindow: { open: true, hoursLeft: 0 },
    channelWords: "Email",
  };
  assert.deepEqual(rowReachWords(mail, true), {
    wire: "Email",
    id: "zoe@example.com",
    may: null,
    tip: "Email · Any time, by email",
  });
  assert.equal(rowReachWords({ ...mail, emailSuppressed: true }, true).may, "Stopped accepting mail");
  // Only ever phoned: the wire is the phone, and no window to speak of.
  const phoned = {
    ...base,
    channels: ["voice"],
    lastChannel: null,
    replyVia: null,
    replyWindow: null,
    channelWords: "Phone",
  };
  assert.deepEqual(rowReachWords(phoned, true), { wire: "Phone", id: "+1 (786) 555-0181", may: null, tip: "Phone" });
  // Nothing at all (added by hand, never wrote): the identifier alone.
  const quiet = { ...phoned, channels: [], channelWords: "" };
  assert.deepEqual(rowReachWords(quiet, true), { wire: null, id: "+1 (786) 555-0181", may: null, tip: "" });
  // Opted out: the State says it; the row's reach says only the wire and the number.
  const stopped = rowReachWords({ ...base, stopped: true }, true);
  assert.deepEqual([stopped.may, stopped.tip], [null, "WhatsApp · Phone"]);
  // REGRESSION (the review of 8 Oct 2026): the wire is the one they last wrote on. Drawn through the row itself from
  // here on, as People draws it, so the cell's words and the row's own reply wire are read together.
  const rowOf = (over) => toPersonRowVM(row({ channels: [], call_count: 0, has_chat: true, ...over }), ZONE, NOW);
  const reach = (over) => rowReachWords(rowOf(over), true);
  const shutWa = iso(3 * D);
  // A person who only ever texted is on Text, with nothing held. They were said to be on WhatsApp, behind its window.
  assert.deepEqual(reach({ message_channels: ["sms"], last_inbound_channel: "sms", latest_wa_inbound_at: null }), {
    wire: "Text",
    id: "+1 (786) 555-0181",
    may: null,
    tip: "Text · Any time, by text",
  });
  // On two wires, the last one written on is the one a reply goes out on: WhatsApp's shut window is not a text's.
  const both = { message_channels: ["sms", "whatsapp"], latest_wa_inbound_at: shutWa };
  const lastText = reach({ ...both, last_inbound_channel: "sms" });
  assert.deepEqual([lastText.wire, lastText.may, lastText.tip], ["Text", null, "WhatsApp · Text · Any time, by text"]);
  const lastWa = reach({ ...both, last_inbound_channel: "whatsapp" });
  assert.deepEqual(
    [lastWa.wire, lastWa.tip],
    ["WhatsApp", "WhatsApp · Text · Approved messages only, until they write again"],
  );
  // A row that does not say where they last wrote names the first wire words travelled, WhatsApp before a text.
  assert.equal(reach({ ...both, last_inbound_channel: null }).wire, "WhatsApp");
  // And what a reply may be is the row's own answer, the one its booking-link button is written from. Someone a
  // member texted first, who has written nothing, is answered by text (the reply route carries a conversation the
  // business began on where it began), and the tip and the button say so together.
  const never = rowOf({ message_channels: ["sms"], last_inbound_channel: null, latest_wa_inbound_at: null });
  assert.deepEqual(
    [rowReachWords(never, true).wire, rowReachWords(never, true).tip],
    ["Text", "Text · Any time, by text"],
  );
  assert.equal(never.bookingLinkAction.ready, true, "the button on the same row says the same");
  // Words on two wires and none of them theirs: the row cannot tell which was last, so the tip says the strictest
  // rule and the button holds with it. The tip once said "Any time, by text" beside a button that said the opposite.
  const neverTwo = rowOf({ ...both, last_inbound_channel: null });
  assert.equal(rowReachWords(neverTwo, true).tip, "WhatsApp · Text · Approved messages only, until they write again");
  assert.equal(neverTwo.bookingLinkAction.ready, false);
  // Every row the cell draws says one thing with its button: what the tip says a reply may be is free text exactly
  // where the button fills the composer.
  for (const last of ["whatsapp", "sms", "email", null])
    for (const wa of [iso(2 * H), shutWa, null])
      for (const wrote of [["sms"], ["whatsapp"], ["email"], ["sms", "whatsapp"], ["email", "whatsapp"]]) {
        const vm = rowOf({
          email: "zoe@example.com",
          message_channels: wrote,
          last_inbound_channel: last,
          latest_wa_inbound_at: wa,
        });
        const free = /Any (time|message)/.test(rowReachWords(vm, true).tip);
        assert.equal(free, vm.bookingLinkAction.ready, `${JSON.stringify(wrote)}, last ${last}, WhatsApp ${wa}`);
      }
});

test("a person's proposal is their deal's (0008): the deal's link while it is out, their own with no open deal, a client's none", () => {
  const own = "https://docs.example.com/p/own";
  const onDeal = "https://docs.example.com/p/deal";
  const dealRow = (stage, link) => ({
    id: "d1",
    contact_id: "c1",
    service: null,
    stage,
    proposed_at: iso(3 * D),
    decided_at: stage === "proposed" ? null : iso(D),
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version: 2,
    created_at: iso(3 * D),
    proposal_url: link,
    valid_until: null,
    lost_reason: null,
  });
  const vmWith = (stage, link) =>
    toPersonVM(
      detail({
        proposal_url: own,
        deals: [dealRow(stage, link)],
        row: row({
          deal_id: "d1",
          deal_stage: stage,
          deal_service: null,
          deal_proposed_at: iso(3 * D),
          deal_decided_at: stage === "proposed" ? null : iso(D),
          deal_ended_at: null,
          deal_amount_cents: 120_000,
          deal_per: "once",
          deal_proposal_url: link,
        }),
      }),
      ZONE,
      NOW,
    );
  const out = vmWith("proposed", onDeal);
  assert.equal(out.proposal.url, onDeal, "the deal's link, not the one left on the person");
  assert.ok(out.about.some((a) => a.k === "Proposal" && a.v === "docs.example.com"));
  // Its first send is the deal card's next act (deal-sheet.ts dealNextAct), so the More menu does not say it again; a
  // link left on someone with no deal is the menu's own to send (below).
  assert.ok(!out.acts.some((a) => a.id === "proposal"), "the card leads with the first send");
  assert.equal(vmWith("proposed", null).proposal, null, "a proposal recorded without a link has none to send");
  assert.equal(vmWith("won", onDeal).proposal, null, "a client is not sent a proposal");
  // Changed on purpose in review: a pass is a deal, so the person's own link no longer stands in for it.
  assert.equal(vmWith("lost", null).proposal, null, "they passed: none");
  assert.equal(vmWith("ended", null).proposal, null, "it ended: none");
  assert.ok(!vmWith("lost", null).about.some((a) => a.k === "Proposal"), "and no About row says one");
  assert.equal(
    toPersonVM(detail({ proposal_url: own }), ZONE, NOW).proposal.url,
    own,
    "no deal at all: the person's own, read until it retires",
  );
  assert.deepEqual(
    toPersonVM(detail({ proposal_url: own }), ZONE, NOW)
      .acts.filter((a) => a.id === "proposal")
      .map((a) => a.label),
    ["Send proposal"],
    "and the More menu sends it",
  );
  // Its value rides on the deal's facts, at every stage.
  assert.ok(
    out.facts.some((f) => f.label === "Deal" && f.meta === "Proposal out · since Sep 1 · $1,200"),
    out.facts,
  );
});

test("every workspace's page says its deal: the fact, the timeline line and the proposal, whatever the retired answer said (0008, amended 18 Oct 2026)", () => {
  const own = "https://docs.example.com/p/own";
  const deal = {
    id: "d1",
    contact_id: "c1",
    service: "Ad management",
    stage: "proposed",
    proposed_at: iso(3 * D),
    decided_at: null,
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version: 1,
    created_at: iso(3 * D),
    proposal_url: "https://docs.example.com/p/deal",
  };
  const columns = {
    deal_id: "d1",
    deal_stage: "proposed",
    deal_service: "Ad management",
    deal_proposed_at: iso(3 * D),
    deal_decided_at: null,
    deal_ended_at: null,
    deal_amount_cents: 120_000,
    deal_per: "once",
    deal_proposal_url: "https://docs.example.com/p/deal",
  };
  for (const word of ["appointment", "meeting", undefined]) {
    const vm = toPersonVM(
      detail({ proposal_url: own, deals: [deal], appointment_word: word, row: row(columns) }),
      ZONE,
      NOW,
    );
    assert.equal(vm.deal.stage, "proposed", String(word));
    assert.ok(vm.facts.some((f) => f.label === "Deal"));
    assert.ok(vm.timeline.some((i) => i.kind === "deal"));
    assert.equal(vm.proposal.url, "https://docs.example.com/p/deal", "the deal's link over the person's own");
  }
});

test("the proposal's send is a deal's, offered in every workspace (0008, amended 18 Oct 2026)", () => {
  const url = "https://docs.example.com/p/dani";
  const acts = (over = {}) =>
    toPersonVM(detail({ proposal_url: url, booking_link: "https://book.example/dani", ...over }), ZONE, NOW).acts.map(
      (a) => a.id,
    );
  assert.ok(acts().includes("proposal"));
  assert.ok(acts({ appointment_word: "visit" }).includes("proposal"), "a salon's More menu offers it too");
  // More's first group is reaching them (canvas A): Call, Text them, then the booking link's send, which stays.
  assert.deepEqual(acts().slice(0, 3), ["call", "text", "booking"], "the booking link's send stays in the reach group");
});

/* ---- the person page is honest about a stop, the reason, the team and the attempts (the 2 Oct 2026 audit) ---- */
test("Replies says nothing can be sent to a person who asked to stop, in the composer's own words", () => {
  assert.equal(
    repliesWords("Text", null, { optedOut: true, who: "Ben Example", emailStopped: false }),
    "Ben Example asked to stop receiving messages. Nothing can be sent — they can text START to opt back in.",
  );
  assert.equal(
    repliesWords("Text", null, { optedOut: false, who: "Ben Example", emailStopped: false }),
    "Any time, by text",
  );
  assert.equal(repliesWords("Email", null, { optedOut: false, who: "x", emailStopped: false }), "Any time, by email");
  assert.equal(
    repliesWords("WhatsApp", { open: true, hoursLeft: 5 }, { optedOut: false, who: "x", emailStopped: false }),
    "Any message, for 5 more hours",
  );
});
