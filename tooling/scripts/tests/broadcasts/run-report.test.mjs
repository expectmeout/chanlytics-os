/**
 * A run's report says what came back from THIS run.
 *
 * Reports › Campaigns counts "Said yes" and "Asked to stop" for the whole
 * workspace by day, off the consent ledger both doors write (00013, 00064). A
 * run opened on Broadcasts said neither: it listed who got it and stopped. The
 * report reads the same ledger for this run's people only -- someone the run
 * reached, answering after it reached them and inside the reply window -- and
 * the page draws the five figures Reports draws, scoped to the one run.
 *
 * What came back is read the same way: each reply's own words, who answered
 * it first, and whether its thread waits on a person now -- so "What came
 * back" quotes the customer instead of counting them.
 *
 * And a failed run says how to get past it, not only why it stopped.
 *
 * Run over a database double (getBroadcast) and the contracts' own view model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import * as C from "@chanlytics/contracts";

const TID = "t-salon";
const B = "b1";
const { getBroadcast } = await import("../../../../apps/dashboard/src/server/campaigns/broadcasts.ts");
const H = 3_600_000;
const T0 = Date.parse("2026-09-20T15:00:00Z");
const at = (ms) => new Date(T0 + ms).toISOString();

const bRow = (over = {}) => ({
  id: B,
  tenant_id: TID,
  name: "Autumn colour",
  template_id: "tp1",
  template_name: "quick_note",
  template_language: "en_US",
  params: [],
  audience: { kind: "saved", id: "s1", label: "VIP regulars" },
  state: "sent",
  scheduled_for: at(0),
  started_at: at(0),
  finished_at: at(60_000),
  recipient_count: 5,
  failure: null,
  created_at: at(-H),
  playbook_id: null,
  run_for: null,
  ...over,
});
/** A recipient row as the detail read returns it: the message and the contact embedded, as PostgREST embeds them. */
const rec = (contact_id, over = {}) => ({
  broadcast_id: B,
  tenant_id: TID,
  contact_id,
  state: "sent",
  reason: null,
  sent_at: at(0),
  messages: { conversation_id: `cv-${contact_id}`, status: "delivered", meta: {} },
  contacts: { display_name: contact_id, wa_profile_name: null, phone_e164: "+17865550100", email: null },
  ...over,
});
/** A consent change as both doors write it: the ledger's kind, about a contact, with the new state in data. */
const ev = (contact_id, consent, ms, over = {}) => ({
  id: `e-${contact_id}-${consent}-${ms}`,
  tenant_id: TID,
  kind: "contact.consent_changed",
  category: "contact",
  subject_type: "contact",
  subject_id: contact_id,
  data: { consent },
  created_at: at(ms),
  ...over,
});

test("a run's report counts who said yes and who asked to stop AFTER it reached them, inside the reply window -- and nobody else", async () => {
  const world = {
    broadcasts: [bRow()],
    broadcast_recipients: [
      rec("c-yes"),
      rec("c-stop"),
      rec("c-late"),
      rec("c-before"),
      rec("c-held", { state: "skipped", reason: "no_consent", sent_at: null, messages: null }),
    ],
    messages: [],
    events: [
      ev("c-yes", "opted_in", 2 * H),
      ev("c-stop", "opted_out", 30 * 60_000, { data: { consent: "opted_out", purpose: "marketing" } }),
      ev("c-late", "opted_out", 80 * H), // past the 72-hour window: not this run's doing
      ev("c-before", "opted_in", -H), // before it reached them: not an answer to it
      ev("c-held", "opted_out", H), // never sent to: did not answer it
      ev("c-other", "opted_out", H), // not a recipient at all
      ev("c-yes", "opted_out", 3 * H, { tenant_id: "t-other" }), // another workspace's ledger
    ],
  };
  const d = await getBroadcast({ supabase: fakeDb(world) }, TID, B);
  const by = Object.fromEntries(d.recipients.map((r) => [r.contact_id, r]));
  assert.equal(by["c-yes"].consent_after, "opted_in");
  assert.equal(by["c-yes"].consent_at, at(2 * H), "and when");
  assert.equal(by["c-stop"].consent_after, "opted_out");
  // Which answer it was: the offers door writes the same ledger with its purpose named (00095).
  assert.equal(by["c-stop"].consent_purpose, "marketing", "a stop to offers is not a stop to everything");
  assert.equal(by["c-yes"].consent_purpose, "conversational");
  assert.equal(by["c-late"].consent_purpose, null);
  assert.equal(by["c-late"].consent_after, null, "past the reply window it is not this run's doing");
  assert.equal(by["c-before"].consent_after, null, "a yes before the message reached them is not an answer to it");
  assert.equal(by["c-held"].consent_after, null, "someone the run never reached did not answer it");
  assert.equal(by["c-held"].consent_at, null);
});

test("a run over a thousand people is read whole: its recipients page past PostgREST's 1,000 rows, and each is counted", async () => {
  const world = {
    broadcasts: [bRow()],
    broadcast_recipients: Array.from({ length: 1500 }, (_, i) => rec(`c-${String(i).padStart(4, "0")}`)),
    messages: [],
    events: [],
  };
  const d = await getBroadcast({ supabase: fakeDb(world, {}, {}, { maxRows: 1000 }) }, TID, B);
  assert.equal(d.recipients.length, 1500, "REGRESSION: a large run's report stopped at the thousandth person");
  assert.equal(new Set(d.recipients.map((r) => r.contact_id)).size, 1500, "each once: no page repeats or skips a row");
});

test("the latest answer inside the window is the one that stands: a yes, then a stop, is a stop", async () => {
  const world = {
    broadcasts: [bRow()],
    broadcast_recipients: [rec("c-1")],
    messages: [],
    events: [ev("c-1", "opted_in", H), ev("c-1", "opted_out", 5 * H)],
  };
  const d = await getBroadcast({ supabase: fakeDb(world) }, TID, B);
  assert.equal(d.recipients[0].consent_after, "opted_out");
  assert.equal(d.recipients[0].consent_at, at(5 * H));
});

test("what came back: each reply in its own words, who answered it first and when, and whether its thread waits on a person now", async () => {
  const msg = (conversation_id, direction, sender, ms, body, over = {}) => ({
    id: `m-${conversation_id}-${direction}-${ms}`,
    tenant_id: TID,
    conversation_id,
    direction,
    sender,
    type: "text",
    body,
    created_at: at(ms),
    ...over,
  });
  const world = {
    broadcasts: [bRow()],
    broadcast_recipients: [rec("c-booked"), rec("c-asked"), rec("c-team"), rec("c-quiet"), rec("c-photo")],
    messages: [
      msg("cv-c-booked", "inbound", "customer", -H, "words from before the run"),
      msg("cv-c-booked", "inbound", "customer", H, "Saturday at 2 works —\n  book me in"),
      msg("cv-c-booked", "inbound", "customer", 3 * H, "thanks!"),
      msg("cv-c-booked", "outbound", "ai", H + 2 * 60_000, "Booked you in for Saturday at 2."),
      msg("cv-c-asked", "inbound", "customer", 2 * H, "Can I bring my daughter for a trim too?"),
      msg("cv-c-asked", "outbound", "human", 2 * H + 5 * 60_000, "she wants a price", { type: "note" }),
      msg("cv-c-asked", "outbound", "human", 2 * H + 9 * 60_000, "Next week's offer", { type: "template" }),
      msg("cv-c-team", "inbound", "customer", H, "Do you do beards?"),
      msg("cv-c-team", "outbound", "human", H + 10 * 60_000, "We do! Tuesdays and Fridays."),
      msg("cv-c-photo", "inbound", "customer", 30 * 60_000, null, { type: "media" }),
    ],
    conversations: [
      { id: "cv-c-booked", tenant_id: TID, state: "open" },
      { id: "cv-c-asked", tenant_id: TID, state: "needs_human" },
      { id: "cv-c-team", tenant_id: TID, state: "open" },
      { id: "cv-c-quiet", tenant_id: TID, state: "needs_human" },
      { id: "cv-c-photo", tenant_id: TID, state: "open" },
    ],
    events: [],
  };
  const d = await getBroadcast({ supabase: fakeDb(world) }, TID, B);
  const by = Object.fromEntries(d.recipients.map((r) => [r.contact_id, r]));
  assert.equal(
    by["c-booked"].reply_words,
    "Saturday at 2 works — book me in",
    "their FIRST reply after the run, on one line",
  );
  assert.equal(by["c-booked"].answered_by, "receptionist");
  assert.equal(by["c-booked"].answered_at, at(H + 2 * 60_000));
  assert.equal(by["c-booked"].waiting_on_you, false);
  assert.equal(by["c-asked"].reply_words, "Can I bring my daughter for a trim too?");
  assert.equal(
    by["c-asked"].answered_by,
    null,
    "a note to the team is not an answer, and neither is the next template the machine sent",
  );
  assert.equal(by["c-asked"].answered_at, null);
  assert.equal(by["c-asked"].waiting_on_you, true, "its thread waits on a person");
  assert.equal(by["c-team"].answered_by, "team");
  assert.equal(by["c-team"].answered_at, at(H + 10 * 60_000));
  assert.equal(by["c-quiet"].replied, false);
  assert.equal(by["c-quiet"].reply_words, null);
  assert.equal(by["c-quiet"].waiting_on_you, false, "a thread waiting for some other reason is not this run's answer");
  assert.equal(by["c-photo"].replied, true);
  assert.equal(by["c-photo"].reply_words, null, "a photo has no words, and none are made up for it");
});

test("a failed run says how to get past it, in words for each reason it can stop -- and nothing for a code nobody has written words for", () => {
  for (const code of Object.keys(C.BROADCAST_FAILURE_WORDS)) {
    const fix = C.broadcastFailureFix(code);
    assert.ok(fix && fix.endsWith("."), `${code}: ${fix}`);
  }
  assert.equal(C.broadcastFailureFix("something_new"), null, "a code with no words gets none, not a guess");
  assert.equal(C.broadcastFailureFix(null), null);
  // A run that reached some people first: nothing sends to "the rest" -- a broadcast sent again enrols its whole
  // list -- so the words say who that includes, and never that nobody was written to.
  assert.equal(C.broadcastFailureFix("run_interrupted", 0), "Nobody got it, so sending it again reaches nobody twice.");
  for (const code of ["paused", "wire_unavailable", "run_interrupted"]) {
    const fix = C.broadcastFailureFix(code, 12);
    assert.ok(fix.includes("Sending it again reaches the whole list") && fix.includes("12"), `${code}: ${fix}`);
    assert.ok(
      !/nobody was written to|send to the rest/.test(fix),
      `REGRESSION: ${code} promised what a resend does not do -- ${fix}`,
    );
  }
  assert.equal(
    C.broadcastFailureFix("template_not_approved", 12),
    C.broadcastFailureFix("template_not_approved"),
    "a template to fix is fixed the same way however far it got",
  );
});

test("a failure that names its wire says the channel's own provider, never WhatsApp on an email or a text; a code stored with no channel is WhatsApp's, as every run before 00298 was", () => {
  // The set is closed: each code has words, and the codes that name a wire have a set for each channel.
  for (const code of C.BROADCAST_FAILURES) {
    assert.ok(
      code in C.BROADCAST_FAILURE_WORDS && code in C.BROADCAST_FAILURE_FIX,
      `${code} has its words and its fix`,
    );
  }
  assert.deepEqual(Object.keys(C.BROADCAST_FAILURE_WORDS).sort(), [...C.BROADCAST_FAILURES].sort());
  // What the send job writes: WhatsApp's is the bare code, the others carry their channel.
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => C.wireFailure("wire_unavailable", c)),
    ["wire_unavailable", "wire_unavailable:sms", "wire_unavailable:email"],
  );
  const words = (code) => C.broadcastFailureWords(code);
  assert.equal(words("wire_unavailable"), "WhatsApp could not be reached", "stored with no channel: WhatsApp's");
  assert.equal(words("wire_unavailable:sms"), "the texting provider could not be reached");
  assert.equal(words("wire_unavailable:email"), "the mail provider could not be reached");
  assert.equal(words("throttled"), "WhatsApp kept limiting how fast this number may send");
  assert.equal(words("throttled:email"), "the mail provider kept limiting how fast this workspace may send");
  assert.equal(words("stalled:email"), "its mailbox could not be read for half an hour");
  assert.equal(words("stalled:sms"), "its line's credentials could not be read for half an hour");
  assert.equal(words("people_unreadable"), "its people could not be read for half an hour");
  for (const email of ["wire_unavailable:email", "throttled:email", "stalled:email"]) {
    assert.ok(!/whatsapp|number/i.test(words(email)), `${email} says ${words(email)}`);
    assert.ok(!/whatsapp|number/i.test(C.broadcastFailureFix(email)), `${email}: ${C.broadcastFailureFix(email)}`);
    assert.ok(
      !/whatsapp|number/i.test(C.broadcastFailureFix(email, 7)),
      `${email}: ${C.broadcastFailureFix(email, 7)}`,
    );
  }
  assert.equal(
    C.broadcastFailureFix("throttled:sms"),
    "Nobody got it. The texting provider lifts these limits on its own; send it again later.",
  );
  assert.match(
    C.broadcastFailureFix("wire_unavailable:email", 3),
    /^The first 3 got it, then the mail provider stopped answering\./,
  );
  assert.match(C.broadcastFailureFix("throttled", 1), /^The first one got it, then WhatsApp limited the number\./);
  // A code that does not name its wire has no channel to carry: one that is given one, and any other text, is unknown.
  assert.equal(words("paused:email"), "it could not finish");
  assert.equal(words("wire_unavailable:fax"), "it could not finish");
  assert.equal(words("wire_unavailable:email:sms"), "it could not finish");
  assert.equal(words("something_new"), "it could not finish");
  assert.equal(C.broadcastFailureFix("paused:email"), null);
  assert.equal(words(null), "no reason was recorded");
  // The run's own page says it too (the stop of a failed run).
  const stop = (failure) =>
    C.toRunReportVM(
      { broadcast: { state: "failed", failure, params: [] }, recipients: [] },
      { windowMs: C.REPLY_WINDOW_MS, nowMs: T0, clock: () => null },
    ).stop;
  assert.equal(stop("wire_unavailable:email").words, "the mail provider could not be reached");
  assert.equal(stop("wire_unavailable:email").tone, "danger");
  assert.equal(stop("paused").tone, "warn");
});

test("a person whose send the provider refused reads the channel's provider, and a row that names no channel is WhatsApp's", () => {
  const person = (over) => ({
    contact_id: "c",
    name: "Ada",
    first_name: "Ada",
    phone: null,
    state: "failed",
    reason: "send_failed",
    ...over,
  });
  const wordsOf = (r) =>
    C.toRunReportVM(
      { broadcast: { state: "sent", params: [] }, recipients: [person(r)] },
      { windowMs: C.REPLY_WINDOW_MS, nowMs: T0, clock: () => null },
    ).people[0].words;
  assert.equal(wordsOf({}), "WhatsApp refused", "no channel on the row: a run made before they were kept");
  assert.equal(wordsOf({ channel: "whatsapp" }), "WhatsApp refused");
  assert.equal(wordsOf({ channel: "sms" }), "the texting provider refused it");
  assert.equal(wordsOf({ channel: "email" }), "the mail provider refused it");
  // A failure with another reason keeps that reason's words, whichever channel; one with none is the channel's refusal.
  assert.equal(wordsOf({ channel: "email", reason: "outcome_unknown" }), "a run that did not finish");
  assert.equal(wordsOf({ channel: "email", reason: null }), "the mail provider refused it");
  // A person held back as send_failed (an email whose row had already had its say) reads the same.
  assert.equal(wordsOf({ channel: "email", state: "skipped" }), "the mail provider refused it");
  // Where the channel is not known (a person's own page), the words claim none.
  assert.equal(C.HELD_REASONS.send_failed, "the provider refused it");
});

test("the report's five figures are the ones Reports draws, scoped to the run: sent, delivered, replied, said yes, asked to stop", () => {
  const r = (over) => ({
    contact_id: "c",
    name: "x",
    first_name: "x",
    phone: null,
    state: "sent",
    reason: null,
    sent_at: at(0),
    message_status: "delivered",
    conversation_id: "cv",
    replied: false,
    delivered_at: at(60_000),
    read_at: null,
    replied_at: null,
    consent_after: null,
    consent_at: null,
    consent_purpose: null,
    reply_words: null,
    answered_by: null,
    answered_at: null,
    waiting_on_you: false,
    ...over,
  });
  const detail = {
    broadcast: { id: B, state: "sent", recipient_count: 6 },
    recipients: [
      r({
        contact_id: "a",
        replied: true,
        replied_at: at(2 * H),
        consent_after: "opted_in",
        consent_at: at(3 * H),
        consent_purpose: "conversational",
      }),
      r({ contact_id: "b", message_status: "read", read_at: at(H) }),
      r({ contact_id: "c", message_status: "sent", delivered_at: null }),
      r({ contact_id: "d", consent_after: "opted_out", consent_at: at(30 * 60_000), consent_purpose: "marketing" }),
      r({
        contact_id: "e",
        state: "skipped",
        reason: "no_consent",
        sent_at: null,
        message_status: null,
        delivered_at: null,
      }),
      r({
        contact_id: "f",
        state: "failed",
        reason: "send_failed",
        sent_at: null,
        message_status: null,
        delivered_at: null,
      }),
    ],
  };
  const vm = C.toRunReportVM(detail, { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 + 100 * H });
  const fig = Object.fromEntries(vm.figures.map((f) => [f.id, f]));
  assert.deepEqual(
    vm.figures.map((f) => f.id),
    ["sent", "delivered", "replied", "said_yes", "stopped"],
  );
  assert.equal(fig.sent.n, 4, "the four it reached");
  assert.equal(fig.sent.sub, "of 6 on the list");
  assert.equal(fig.delivered.n, 3, "delivered and read both reached the handset");
  assert.equal(fig.delivered.pct, 75);
  assert.equal(fig.delivered.sub, "1 never reached the handset");
  assert.equal(fig.replied.n, 1);
  assert.equal(fig.said_yes.n, 1);
  assert.equal(fig.said_yes.sub, "said yes to hearing from you");
  assert.equal(fig.stopped.n, 1);
  assert.equal(
    fig.stopped.sub,
    "stopped offers, not messages",
    "REGRESSION: the canvas's 'they hear nothing again' is not true of a stop to offers",
  );
  assert.equal(fig.stopped.tone, "warn", "a stop is the one figure that asks you to look");
  // The bars are when each came back, in the canvas's eight steps, across the shortest span that holds it all: the
  // last answer came at three and a half hours, so four hours in half-hour steps -- and the stop, at thirty minutes,
  // is in the second.
  assert.equal(vm.span, "the first 4 hours");
  assert.equal(fig.stopped.bars.length, 8);
  assert.deepEqual(fig.stopped.bars, [0, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(fig.replied.bars, [0, 0, 0, 0, 1, 0, 0, 0], "the reply, at two hours");
  const late = C.toRunReportVM(
    { ...detail, recipients: [r({ contact_id: "z", replied: true, replied_at: at(60 * H) })] },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 + 100 * H },
  );
  assert.equal(late.span, "the first 3 days", "a reply on the third day stretches the bars to the whole window");
  // A reply waiting on a person is what the replied figure says first.
  const waiting = C.toRunReportVM(
    {
      ...detail,
      recipients: detail.recipients.map((x) => (x.contact_id === "a" ? { ...x, waiting_on_you: true } : x)),
    },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 + 100 * H },
  );
  assert.equal(waiting.figures.find((f) => f.id === "replied").sub, "1 waiting on you in the Inbox");
  // Stops of both kinds are counted apart.
  const both = C.toRunReportVM(
    {
      broadcast: detail.broadcast,
      recipients: [
        r({ contact_id: "m", consent_after: "opted_out", consent_purpose: "marketing" }),
        r({ contact_id: "n", consent_after: "opted_out", consent_purpose: "conversational" }),
      ],
    },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 },
  );
  assert.equal(both.figures.find((f) => f.id === "stopped").sub, "1 stopped offers · 1 stopped everything");
  assert.deepEqual(vm.groups, { all: 6, replied: 1, held: 2, stopped: 1 });
  // A run that reached nobody says so in words, and draws no percentage of nothing.
  const none = C.toRunReportVM(
    {
      broadcast: { id: B, state: "sent", recipient_count: 1 },
      recipients: [r({ state: "skipped", sent_at: null, message_status: null, delivered_at: null })],
    },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 },
  );
  assert.equal(none.figures.find((f) => f.id === "delivered").pct, null);
});

test('everyone it touched, each in the words of what happened to them -- and a greeting that went out "Hi there" is said so, only when the message greeted anyone by name', () => {
  const clock = (iso) => (iso ? `t${(Date.parse(iso) - T0) / 60_000}` : null);
  const r = (over) => ({
    contact_id: "c",
    name: "Priya Nair",
    first_name: "Priya",
    phone: "+17865550100",
    state: "sent",
    reason: null,
    sent_at: at(0),
    message_status: "delivered",
    conversation_id: "cv-c",
    replied: false,
    delivered_at: at(60_000),
    read_at: null,
    replied_at: null,
    consent_after: null,
    consent_at: null,
    consent_purpose: null,
    reply_words: null,
    answered_by: null,
    answered_at: null,
    waiting_on_you: false,
    ...over,
  });
  const people = [
    r({
      contact_id: "replied",
      replied: true,
      replied_at: at(4 * 60_000),
      reply_words: "Saturday at 2 works",
      answered_by: "receptionist",
      answered_at: at(6 * 60_000),
    }),
    r({ contact_id: "read", name: "Tom Baker", first_name: "Tom", message_status: "read", read_at: at(12 * 60_000) }),
    r({ contact_id: "number", name: "+1 (917) 555-0142", first_name: null }),
    r({
      contact_id: "stop",
      name: "Olivia Brooks",
      first_name: "Olivia",
      replied: true,
      replied_at: at(8 * 60_000),
      reply_words: "STOP",
      consent_after: "opted_out",
      consent_at: at(8 * 60_000),
      consent_purpose: "marketing",
    }),
    r({ contact_id: "lost", message_status: "failed", delivered_at: null }),
    r({
      contact_id: "held",
      name: "Marcus Bell",
      first_name: "Marcus",
      state: "skipped",
      reason: "no_marketing_consent",
      sent_at: null,
      message_status: null,
      delivered_at: null,
      conversation_id: null,
    }),
    r({
      contact_id: "refused",
      state: "failed",
      reason: "send_failed",
      sent_at: null,
      message_status: null,
      delivered_at: null,
    }),
    r({ contact_id: "waits", replied: true, replied_at: at(30 * 60_000), reply_words: null, waiting_on_you: true }),
  ];
  const vm = C.toRunReportVM(
    {
      broadcast: { state: "sent", failure: null, params: [{ kind: "first_name" }, { kind: "text", value: "20% off" }] },
      recipients: people,
    },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0, clock },
  );
  const by = Object.fromEntries(vm.people.map((p) => [p.contact_id, p]));
  assert.deepEqual(
    [by.replied.pill, by.replied.words, by.replied.door],
    [{ label: "Replied", tone: "ok" }, "“Saturday at 2 works”", { label: "Open the thread", to: "inbox/th-cv-c" }],
    "a reply is quoted, with its thread",
  );
  assert.equal(by.replied.initials, "PN");
  assert.equal(by.replied.at, "t4", "the last thing that happened: the reply");
  assert.deepEqual(
    [by.read.pill.label, by.read.words, by.read.door],
    ["Read", "sent t0 · delivered t1 · read t12", null],
    "WhatsApp's own receipts, with their times",
  );
  assert.deepEqual(
    [by.number.words, by.number.door, by.number.initials, by.number.attn],
    ["greeted “Hi there” — no name on file", { label: "Add a name", to: "clients/number" }, "—", true],
    "the case nobody is shown before a send",
  );
  assert.deepEqual(
    [by.stop.pill, by.stop.words, by.stop.door, by.stop.attn],
    [
      { label: "Asked to stop", tone: "warn" },
      "“STOP” — stopped offers, not messages",
      { label: "See consent", to: "clients/stop" },
      true,
    ],
  );
  assert.deepEqual(
    [by.lost.pill, by.lost.words],
    [{ label: "Never delivered", tone: "danger" }, "WhatsApp could not deliver it"],
  );
  assert.deepEqual(
    [by.held.pill.label, by.held.words, by.held.at, by.held.held],
    ["Held back", "no yes to offers", null, true],
    "held back, in the owner's words, never the enum",
  );
  assert.deepEqual(
    [by.refused.pill, by.refused.words, by.refused.held],
    [{ label: "Not sent", tone: "danger" }, "WhatsApp refused", true],
  );
  assert.deepEqual(vm.groups, { all: 8, replied: 3, held: 2, stopped: 1 });
  assert.deepEqual(by.stop.in, ["all", "replied", "stopped"]);

  // A message that greets nobody by name greeted nobody "Hi there".
  const plain = C.toRunReportVM(
    { broadcast: { state: "sent", params: [{ kind: "text", value: "20% off" }] }, recipients: [people[2]] },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0, clock },
  );
  assert.equal(plain.people[0].door, null, "REGRESSION-IN-WAITING: 'Add a name' on a message with no name in it");
  assert.ok(!plain.people[0].words.includes("Hi there"), plain.people[0].words);
  assert.equal(plain.people[0].attn, false);

  // What came back: every reply, the first first, each with what has happened since.
  assert.deepEqual(
    vm.replies.map((x) => [x.contact_id, x.quote, x.outcome.words, x.outcome.tone]),
    [
      ["replied", "“Saturday at 2 works”", "The receptionist answered · t6", "ok"],
      ["stop", "“STOP”", "Not answered yet", "plain"],
      ["waits", null, "Waiting on you", "warn"],
    ],
  );
  assert.equal(vm.replies[0].to, "inbox/th-cv-c");
  assert.equal(vm.stop, null, "a run that did not fail has no stop to explain");
});

test("a failed run's report says why it stopped and how to get past it, in the canvas's tones: amber for a pause, red for the rest", () => {
  const run = (failure) =>
    C.toRunReportVM(
      { broadcast: { state: "failed", failure, params: [] }, recipients: [] },
      { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 },
    );
  assert.deepEqual(run("template_not_approved").stop, {
    words: "WhatsApp no longer approves its template",
    fix: "Open it in the Library — it can be resubmitted.",
    tone: "danger",
  });
  assert.equal(run("paused").stop.tone, "warn");
  // The people it never reached are cut off, not waiting.
  const cut = C.toRunReportVM(
    {
      broadcast: { state: "failed", failure: "run_interrupted", params: [] },
      recipients: [
        {
          contact_id: "got",
          name: "Ada Lee",
          first_name: "Ada",
          state: "sent",
          sent_at: at(0),
          message_status: "delivered",
          delivered_at: at(1000),
          replied: false,
        },
        {
          contact_id: "cut",
          name: "Bo Kim",
          first_name: "Bo",
          state: "queued",
          sent_at: null,
          message_status: null,
          replied: false,
        },
      ],
    },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 },
  );
  const bo = cut.people.find((p) => p.contact_id === "cut");
  assert.deepEqual(
    [bo.pill.label, bo.words],
    ["Not sent", "the run stopped before them"],
    "REGRESSION-IN-WAITING: 'Waiting · not sent yet' on a run that has stopped",
  );
  assert.ok(bo.in.includes("held"), "and they are among the ones it did not reach");
  assert.equal(
    cut.stop.fix,
    "One got it and the rest did not. Sending it again reaches the whole list, that one included.",
  );
  assert.equal(cut.figures.find((f) => f.id === "stopped").pct, null, "a zero draws no 0% beside it");
  assert.deepEqual(
    run(null).stop,
    { words: "no reason was recorded", fix: null, tone: "danger" },
    "no reason on file is said so, and no fix is guessed at",
  );
});

test("a playbook's run that a billing pause stopped is told its own next step on the page, never to send it again; a broadcast keeps the page's words", () => {
  const stopped = (broadcast, recipients = []) =>
    C.toRunReportVM(
      { broadcast: { state: "failed", failure: "paused", params: [], ...broadcast }, recipients },
      { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 },
    ).stop;
  // A broadcast: as before.
  assert.equal(stopped({ playbook_id: null, audience: null }).fix, "Unpause it under Settings, then send it again.");
  // A playbook's: Run now answers already-ran-today, and a re-send reaches the whole list. Tomorrow's run reaches who this one
  // did not; a visit's moment is for the day of the visit.
  const win = stopped({ playbook_id: "p1", audience: { kind: "playbook", id: "p1", trigger: "quiet_30" } });
  assert.equal(
    win.fix,
    "Resume from Settings › Billing. It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice.",
  );
  assert.equal(win.tone, "warn");
  const visit = stopped({ playbook_id: "p1", audience: { kind: "playbook", id: "p1", trigger: "visit_tomorrow" } });
  assert.match(
    visit.fix,
    /a visit's message belongs to the day of the visit, so the people it did not reach will not be sent it later\.$/,
  );
  // A playbook's run that reached some people first says the same: its next step is not a resend either.
  const sent = [
    { contact_id: "got", name: "Ada Lee", first_name: "Ada", state: "sent", sent_at: at(0), replied: false },
  ];
  assert.equal(
    stopped({ playbook_id: "p1", audience: { trigger: "quiet_30" } }, sent).fix,
    win.fix,
    "however far it got",
  );
  // Another stop is worded as ever, for a playbook's run too: only the pause is the owner's to resume.
  const wire = C.toRunReportVM(
    { broadcast: { state: "failed", failure: "run_interrupted", params: [], playbook_id: "p1" }, recipients: [] },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 },
  ).stop;
  assert.equal(wire.fix, C.broadcastFailureFix("run_interrupted"));
});

test("each part of a run's report says its own words: the span its bars cover, why the unreached were not reached, who answered, and each figure when nothing came back", () => {
  const person = (over) => ({
    contact_id: "p",
    name: "Ada Lee",
    first_name: "Ada",
    state: "sent",
    reason: null,
    sent_at: at(0),
    message_status: "sent",
    conversation_id: "cv-p",
    delivered_at: null,
    read_at: null,
    replied: false,
    replied_at: null,
    consent_after: null,
    consent_at: null,
    consent_purpose: null,
    reply_words: null,
    answered_by: null,
    answered_at: null,
    waiting_on_you: false,
    ...over,
  });
  const report = (recipients, state = "sent", windowMs = C.REPLY_WINDOW_MS) =>
    C.toRunReportVM({ broadcast: { state, params: [] }, recipients }, { windowMs, nowMs: T0 });
  // The span: the shortest that holds the last answer, up to the window, in words.
  const spanFor = (ms, windowMs) =>
    report([person({ delivered_at: at(ms), message_status: "delivered" })], "sent", windowMs).span;
  assert.equal(spanFor(20 * 60_000), "the first hour");
  assert.equal(spanFor(90 * 60_000), "the first 2 hours");
  assert.equal(spanFor(20 * H), "the first day");
  assert.equal(spanFor(30 * H), "the first 2 days");
  assert.equal(spanFor(20 * 60_000, 3 * H), "the first hour", "a window shorter than a span still starts from an hour");
  assert.equal(spanFor(150 * 60_000, 3 * H), "the first 3 hours", "past the spans the window holds, the window itself");
  // Someone the run never reached, by how the run ended.
  const queued = person({ state: "queued", sent_at: null, message_status: null });
  const cutWords = (state) => report([queued], state).people[0];
  assert.deepEqual(
    ["failed", "canceled", "sent", "sending"].map((s) => [cutWords(s).pill.label, cutWords(s).words, cutWords(s).in]),
    [
      ["Not sent", "the run stopped before them", ["all", "held"]],
      ["Not sent", "canceled before it reached them", ["all", "held"]],
      ["Not sent", "never sent", ["all", "held"]],
      ["Waiting", "not sent yet", ["all"]],
    ],
  );
  // Who answered a reply, and when.
  const replied = (over) => person({ replied: true, replied_at: at(H), ...over });
  const clock = (iso) => (iso ? `t${(Date.parse(iso) - T0) / 60_000}` : null);
  const outcomes = C.toRunReportVM(
    {
      broadcast: { state: "sent", params: [] },
      recipients: [
        replied({ contact_id: "a", answered_by: "team", answered_at: at(2 * H) }),
        replied({ contact_id: "b", replied_at: at(2 * H), answered_by: "team", answered_at: null }),
        replied({ contact_id: "c", replied_at: at(3 * H), answered_by: "receptionist", answered_at: null }),
      ],
    },
    { windowMs: C.REPLY_WINDOW_MS, nowMs: T0, clock },
  ).replies.map((x) => [x.contact_id, x.outcome.words, x.outcome.tone]);
  assert.deepEqual(outcomes, [
    ["a", "Your team answered · t120", "ok"],
    ["b", "Your team answered", "ok"],
    ["c", "The receptionist answered", "ok"],
  ]);
  // Each figure when nothing came back, and when everything reached the handset.
  const subs = (vm) => vm.figures.map((f) => [f.id, f.sub, f.tone]);
  assert.deepEqual(subs(report([])), [
    ["sent", "of 0 on the list", "plain"],
    ["delivered", "nothing has gone out", "plain"],
    ["replied", "nobody has written back yet", "plain"],
    ["said_yes", "nobody new said yes", "plain"],
    ["stopped", "nobody asked to stop", "plain"],
  ]);
  const all = report([person({ message_status: "read", read_at: at(H), replied: true, replied_at: at(H) })]);
  assert.deepEqual(subs(all).slice(1, 3), [
    ["delivered", "every one reached the handset", "ok"],
    ["replied", "each one is a thread in the Inbox", "ok"],
  ]);
  assert.deepEqual(
    all.figures[1].bars,
    [0, 0, 0, 0, 1, 0, 0, 0],
    "a read with no delivery stamp is drawn when it was read: an hour in, in two hours of quarter-hour steps",
  );
});

/* ------------------- each person's channel (One message, every channel, step 3) ------------------- */

test("the detail reads the channel each person was picked for, and a database 00298 has not reached reads as it always did: by WhatsApp, with no word of it", async () => {
  const world = {
    broadcasts: [bRow()],
    broadcast_recipients: [
      rec("c-mail", { channel: "email" }),
      rec("c-wa", { channel: "whatsapp" }),
      rec("c-old", { channel: null }),
    ],
    messages: [],
    events: [],
  };
  const d = await getBroadcast({ supabase: fakeDb(world) }, TID, B);
  const by = Object.fromEntries(d.recipients.map((r) => [r.contact_id, r.channel]));
  assert.deepEqual(by, { "c-mail": "email", "c-wa": "whatsapp", "c-old": null }, "a row that names none is null");
  // A database that has no such column refuses the read that asks for it: read again without, never a run that cannot open.
  const db = fakeDb(world);
  const noColumn = {
    from: (table) => {
      const q = db.from(table);
      if (table !== "broadcast_recipients") return q;
      return {
        select: (columns, ...rest) =>
          columns.startsWith("channel,")
            ? {
                eq() {
                  return this;
                },
                order() {
                  return this;
                },
                range() {
                  return this;
                },
                then: (res, rej) =>
                  Promise.resolve({
                    data: null,
                    error: { message: "column broadcast_recipients.channel does not exist" },
                  }).then(res, rej),
              }
            : q.select(columns, ...rest),
      };
    },
  };
  const old = await getBroadcast({ supabase: noColumn }, TID, B);
  assert.equal(old.recipients.length, 3, "the run opens, with everyone on it");
  assert.deepEqual(
    old.recipients.map((r) => r.channel),
    [null, null, null],
  );
});

test("a run's report says each person's channel where it reached anybody by something but WhatsApp, and the words for a message that never arrived are the channel's own", () => {
  const person = (over) => ({
    contact_id: "p",
    name: "Ada Lee",
    first_name: "Ada",
    state: "sent",
    reason: null,
    sent_at: at(0),
    message_status: "sent",
    conversation_id: "cv-p",
    delivered_at: null,
    read_at: null,
    replied: false,
    replied_at: null,
    consent_after: null,
    consent_at: null,
    consent_purpose: null,
    reply_words: null,
    answered_by: null,
    answered_at: null,
    waiting_on_you: false,
    ...over,
  });
  const report = (recipients) =>
    C.toRunReportVM(
      { broadcast: { state: "sent", params: [] }, recipients },
      { windowMs: C.REPLY_WINDOW_MS, nowMs: T0 },
    );
  const subs = (vm) => vm.figures.map((f) => [f.id, f.sub, f.tone]);
  const rows = [
    person({ contact_id: "k-wa", channel: "whatsapp" }),
    person({ contact_id: "k-mail", channel: "email", message_status: "failed" }),
    person({ contact_id: "k-text", channel: "sms", message_status: "failed" }),
    person({ contact_id: "k-wa2", channel: "whatsapp", message_status: "failed" }),
    person({ contact_id: "k-held", channel: "email", state: "skipped", reason: "no_address", sent_at: null }),
    person({ contact_id: "k-old", channel: null }),
  ];
  const vm = report(rows);
  const by = Object.fromEntries(vm.people.map((p) => [p.contact_id, [p.channel, p.words]]));
  assert.deepEqual(by["k-wa"][0], "on WhatsApp");
  assert.deepEqual(by["k-mail"], ["by email", "the email was not delivered"]);
  assert.deepEqual(by["k-text"], ["by text", "the text was not delivered"]);
  assert.deepEqual(by["k-wa2"], ["on WhatsApp", "WhatsApp could not deliver it"]);
  assert.deepEqual(
    by["k-held"],
    ["by email", "no email address"],
    "a person it never went to has its reason, and the channel it was meant for",
  );
  assert.equal(by["k-old"][0], null, "a row with no channel says none");
  assert.equal(
    subs(vm)[1][1].includes("handset"),
    false,
    "a run that reached by email does not say every one reached the handset",
  );
  // A run of WhatsApp alone, or made before channels were kept: the report is what it always was.
  const delivered = { message_status: "delivered" };
  const quiet = report([
    person({ contact_id: "a", channel: "whatsapp", ...delivered }),
    person({ contact_id: "b", ...delivered }),
  ]);
  assert.deepEqual(
    quiet.people.map((p) => p.channel),
    [null, null],
  );
  assert.equal(subs(quiet)[1][1], "every one reached the handset");
});
