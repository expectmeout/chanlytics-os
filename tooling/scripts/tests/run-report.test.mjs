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
import { fakeDb } from "./_fake-db.mjs";
import * as C from "@chanlytics/contracts";

const TID = "t-salon";
const B = "b1";
const { getBroadcast } = await import("../../../apps/dashboard/src/server/campaigns/broadcasts.ts");
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
    fix: "Open it in Templates — it can be resubmitted.",
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
