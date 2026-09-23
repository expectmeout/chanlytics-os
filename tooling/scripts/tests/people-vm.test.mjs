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
  toPersonVM,
  peopleAggregates,
  recencyCells,
  PEOPLE_LISTS,
  PEOPLE_TABS,
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
    personStateFor(row({ open_escalation_reason: "human_token", open_escalation_since: iso(H) }), nowMs),
    "needs_you",
  );
  assert.equal(
    personStateFor(row({ open_escalation_reason: "human_token", consent: "opted_out" }), nowMs),
    "needs_you",
  );
  assert.equal(personStateFor(row({ needs_human: true }), nowMs), "needs_you");
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
  assert.equal(personStateFor(row({ latest_assignee_user_id: "u1" }), nowMs), "waiting_on_you");
  assert.equal(
    personStateFor(row({ latest_paused_until: iso(-3 * H) }), nowMs),
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
    personStateFor(row({ latest_paused_until: iso(3 * H) }), nowMs),
    "active",
    "a pause that expired is not ownership",
  );
});

test("opted_out outranks new: a fresh STOP is not a new customer to chase", () => {
  assert.equal(personStateFor(row({ consent: "opted_out", first_contact_at: iso(D) }), nowMs), "opted_out");
  assert.equal(personStateFor(row({ dnc: true, first_contact_at: iso(D) }), nowMs), "opted_out");
});

test("new needs evidence: first contact within 7 days and NO imported history", () => {
  assert.equal(personStateFor(row({ first_contact_at: iso(3 * D) }), nowMs), "new");
  assert.equal(personStateFor(row({ first_contact_at: iso(8 * D) }), nowMs), "active");
  // A backfilled person whose first REAL timestamp is recent is still not new:
  // the import proves they existed before we started keeping time.
  assert.equal(personStateFor(row({ first_contact_at: iso(3 * D), has_backfill: true }), nowMs), "active");
});

test("quiet is 30 days without a message or a call; a call counts as contact", () => {
  const old = { last_message_at: iso(31 * D), last_inbound_at: iso(31 * D), latest_wa_inbound_at: iso(31 * D) };
  assert.equal(personStateFor(row(old), nowMs), "quiet");
  assert.equal(personStateFor(row({ ...old, last_message_at: iso(29 * D) }), nowMs), "active");
  assert.equal(personStateFor(row({ ...old, last_call_at: iso(2 * D) }), nowMs), "active", "a recent call rescues");
  assert.equal(
    personStateFor(row({ last_message_at: null, last_message_direction: null, last_call_at: null }), nowMs),
    "quiet",
    "no timestamp at all is not 'active'",
  );
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
    "You replied · 3d ago",
  );
  const called = toPersonRowVM(row({ last_call_at: iso(H) }), ZONE, NOW).lastContact;
  assert.equal(called.kind, "call");
  assert.equal(called.label, "Phoned · 1h ago");
  assert.match(
    toPersonRowVM(row({ last_message_at: iso(20 * D) }), ZONE, NOW).lastContact.label,
    /^They wrote · [A-Z][a-z]{2} \d{1,2}$/,
  );
  assert.equal(
    toPersonRowVM(row({ last_message_at: null, last_call_at: null }), ZONE, NOW).lastContact.label,
    "No contact recorded",
  );
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
    title: "Opens the thread with the link ready to send by email",
    ready: true,
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
  assert.deepEqual(
    [shut.bookingLinkAction.label, shut.bookingLinkAction.ready],
    ["Send the booking-link template", false],
  );

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

test("recency cells put a two-hour-old contact in the first bucket and a quiet one at the tail", () => {
  const cells = recencyCells(
    [
      toPersonRowVM(row(), ZONE, NOW),
      toPersonRowVM(row({ last_message_at: iso(100 * D), last_inbound_at: iso(100 * D) }), ZONE, NOW),
    ],
    nowMs,
  );
  assert.equal(cells[0].count, 1);
  assert.equal(cells[cells.length - 1].count, 1);
  assert.equal(
    cells.reduce((a, c) => a + c.count, 0),
    2,
  );
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
    ["escalation", "receptionist", "customer", "decision", "you", "decision", "call", "customer"],
  );
  assert.equal(vm.timeline[3].who, "Handed back");
  assert.equal(vm.timeline[5].who, "Took over");
  assert.ok(!vm.timeline.some((i) => /never sent/.test(i.text)), "a canceled reply never reached them");
  assert.ok(!vm.timeline.some((i) => i.kind === "system"), "the call_summary row is represented by the call itself");
  const call = vm.timeline.find((i) => i.kind === "call");
  assert.match(call.who, /^Inbound call · 1:52/);
  assert.equal(call.link.to, "conversations/cv-k1");
  for (let i = 1; i < vm.timeline.length; i++) assert.ok(vm.timeline[i - 1].ts >= vm.timeline[i].ts, "sorted desc");
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
  assert.equal(bare({ latest_assignee_user_id: "u1" }).tone, "paused");
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
  assert.ok(vm.about.some((a) => a.k === "Reply window"));

  const phoneOnly = toPersonVM(
    detail({ row: row({ has_chat: false, call_count: 1, latest_conversation_id: "cv1" }), conversations: [] }),
    ZONE,
    NOW,
  );
  assert.equal(phoneOnly.openThread, null);
  assert.ok(!phoneOnly.about.some((a) => a.k === "Reply window"), "no WhatsApp thread, no reply window");
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
    import: "Imported history",
    lead: "A lead you found",
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
  const f = contracts.proposalAction;
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
    title: "Opens the thread with the proposal link ready to send · 5h left in their reply window",
    ready: true,
  });
  assert.equal(f("WhatsApp", { open: false, hoursLeft: 0 }, null).ready, false);
  assert.equal(f(null, null, null).ready, false);
});

test("a person's proposal: the address, its host in About, and the newest message that carried it and went out", () => {
  const url = "https://www.docs.example.com/p/dani";
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
