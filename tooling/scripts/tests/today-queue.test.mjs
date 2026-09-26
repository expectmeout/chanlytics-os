/**
 * Today's queue: everything that asks for a person, in one row grammar —
 * WhatsApp handoffs, callers who need a call back, reply windows closing,
 * calls worth an ear — the longest wait first, capped, each with its one verb
 * and, where the state asks it, a second. The standing line stays above; the
 * rows live in the queue, drawn by the same component as People's strip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, QUOTE_MAX, leadQuestionRoute } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";
import { PLAN } from "./_lead-fixtures.mjs";

// 10:00 in New York on Sunday 6 September 2026.
const NOW = new Date("2026-09-06T14:00:00Z");

const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+1 305" },
    { kind: "voice", status: "active", number: "+1 786" },
  ],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: {
    escalations_open: 2,
    oldest_open_escalation_at: "2026-09-06T12:00:00Z",
    threads_needing_human: 2,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-06T13:00:00Z",
    last_outbound_at: "2026-09-06T13:01:00Z",
  },
  period: {
    messages_in: 5,
    messages_out_ai: 4,
    messages_out_you: 0,
    conversations_active: 3,
    answered_by_ai: 4,
    answered_by_you: 0,
    unanswered_in_window: 1,
    median_reply_seconds_ai: 40,
    send_failures: 0,
    escalations_new: 2,
    escalation_reasons: {},
    calls: 2,
    call_seconds: 300,
    call_sentiments: {},
    calls_voicemail: 1,
    new_contacts: 1,
  },
  ...over,
});
const contact = (id, name, phone) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: phone,
  consent: "opted_in",
  dnc: false,
});
const msg = (id, sender, body, at) => ({
  id,
  conversation_id: "x",
  direction: sender === "customer" ? "inbound" : "outbound",
  sender,
  type: "text",
  body,
  media: null,
  meta: null,
  status: sender === "customer" ? "received" : "sent",
  created_at: at,
});
const conversations = [
  {
    id: "cv1",
    state: "needs_human",
    paused_until: null,
    last_wa_inbound_at: "2026-09-06T13:00:00Z",
    last_message_at: "2026-09-06T13:00:00Z",
    contact: contact("c1", "Daniela R.", "+17865550181"),
    messages: [msg("m1", "customer", "Can I move Saturday to 11? My sister is coming too", "2026-09-06T13:00:00Z")],
  },
  {
    id: "cv2",
    state: "needs_human",
    paused_until: null,
    last_wa_inbound_at: null,
    last_message_at: "2026-09-06T13:20:00Z",
    contact: contact("c2", "Ana", "+13055550134"),
    messages: [],
  },
  {
    id: "cv3",
    state: "open",
    paused_until: null,
    last_wa_inbound_at: "2026-09-05T19:30:00Z",
    last_message_at: "2026-09-05T19:30:00Z",
    contact: contact("c3", null, "+13475550100"),
    messages: [msg("m3", "customer", "hola, cuánto cuesta el balayage?", "2026-09-05T19:30:00Z")],
  },
];
const escalations = [
  {
    id: "e1",
    reason: "human_token",
    details: null,
    state: "open",
    created_at: "2026-09-06T12:00:00Z",
    conversation_id: "cv1",
  },
  {
    id: "e2",
    reason: "callback",
    details: "Call back to confirm Saturday 10:00.",
    state: "open",
    created_at: "2026-09-06T13:30:00Z",
    conversation_id: "cv2",
  },
];
const call = (id, over = {}) => ({
  id,
  retell_call_id: `r-${id}`,
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+13055550134",
  from_raw: null,
  to_e164: null,
  started_at: "2026-09-06T13:20:00Z",
  ended_at: "2026-09-06T13:21:35Z",
  duration_ms: 95_000,
  disconnection_reason: "user_hangup",
  sentiment: "Neutral",
  call_successful: true,
  in_voicemail: false,
  summary: "The user called to book a gel manicure.",
  transcript_object: null,
  recording: null,
  conversation_id: "cv2",
  contact_id: "c2",
  message_id: null,
  contact: { display_name: "Ana", wa_profile_name: null, phone_e164: "+13055550134" },
  wanted: "Asked for a gel manicure Saturday.",
  outcome: "callback_needed",
  follow_up: "Call back to confirm Saturday 10:00.",
  caller_name: "Ana",
  ...over,
});
const calls = [
  call("k1"),
  call("k2", {
    conversation_id: "cv9",
    contact_id: "c9",
    from_e164: "+13475550188",
    contact: { display_name: null, wa_profile_name: null, phone_e164: "+13475550188" },
    started_at: "2026-09-06T12:40:00Z",
    ended_at: "2026-09-06T12:40:30Z",
    duration_ms: 30_000,
    in_voicemail: true,
    summary: null,
    wanted: null,
    outcome: "voicemail",
    follow_up: null,
    caller_name: null,
  }),
];

// A lead search as `GET lead-searches` answers it (LeadSearchDto): the plan from the finder's fixtures, its latest round.
const search = (id, name, round) => ({
  id,
  name,
  asked: PLAN.asked,
  asked_on: "2026-09-05T15:00:00Z",
  plan: PLAN,
  plan_version: 1,
  round,
});
const round = (over = {}) => ({
  id: "rd1",
  seq: 1,
  purpose: "find",
  state: "running",
  ending: null,
  question: null,
  target: 20,
  counted: 12,
  qualified: 12,
  review: 3,
  excluded: 0,
  emails_checked: 0,
  with_phone: 9,
  ending_pending: false,
  waiting_since: null,
  cost_usd: 1.2,
  ended_at: null,
  undo_op_id: null,
  undo_version: null,
  nearby: [],
  ...over,
});
const QUESTION = { sentence: "Most of the first 25 are chain gyms. Include them?", criterion_key: "chains" };
// Stopped to ask at 7:00 in New York, three hours before NOW: longer than the handoff's two.
const waitingSearch = search(
  "s-wait",
  "Personal trainers in Austin",
  round({ state: "waiting_on_owner", question: QUESTION, waiting_since: "2026-09-06T11:00:00Z", counted: 25 }),
);
const runningSearch = search("s-run", "Independent pharmacies near 78704", round());

test("one queue, longest wait first: the handoff, the call-back, the closing window, the call worth an ear — each in the strip's grammar with its own verb", () => {
  const vm = toTodayVM(metrics(), conversations, escalations, calls, NOW);
  const rows = vm.queue.rows;
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["handoff", "callback", "window", "call"],
  );
  assert.equal(vm.queue.more, 0);
  assert.equal(vm.queue.waiting, 3, "the call worth an ear is nobody waiting");

  const handoff = rows[0];
  assert.deepEqual(
    [handoff.who, handoff.channel, handoff.when, handoff.quoted, handoff.warn],
    ["Daniela R.", "WhatsApp", "waited 2h", true, true],
  );
  assert.equal(handoff.sentence, "Can I move Saturday to 11? My sister is coming too");
  assert.deepEqual(handoff.status.slice(0, 2), ["Escalated", "asked for a person"]);
  assert.match(handoff.status[2], /^since 8:00 AM$/, "the salon's clock, whatever clock the reader holds");
  assert.deepEqual(handoff.cta, { label: "Open and reply", to: "inbox/th-cv1" });
  assert.deepEqual(handoff.also, { label: "Snooze", verb: "snooze", conversationId: "cv1", escalationId: "e1" });

  const callback = rows[1];
  assert.deepEqual(
    [callback.who, callback.channel, callback.quoted, callback.tone],
    ["Ana", "Phone", false, "escalated"],
  );
  assert.equal(callback.sentence, "Call back to confirm Saturday 10:00.", "the to-do the phone receptionist left");
  assert.deepEqual(callback.status.slice(0, 1), ["Needs a call back"]);
  assert.deepEqual(
    callback.cta,
    { label: "Open the call", to: "conversations/cv-k1" },
    "straight to the call, its summary and recording",
  );
  assert.deepEqual(callback.also, { label: "Done", verb: "resolve", conversationId: "cv2", escalationId: "e2" });

  const window = rows[2];
  assert.deepEqual(
    [window.who, window.channel, window.tone, window.quoted],
    ["+1 (347) 555-0100", "WhatsApp", "warn", true],
  );
  assert.match(window.when, /^closes 3:30 PM · in \dh$/);
  assert.deepEqual(window.cta, { label: "Open thread", to: "inbox/th-cv3" });
  assert.equal(window.also, null);

  const ear = rows[3];
  assert.deepEqual(
    [ear.kind, ear.channel, ear.sentence, ear.cta.label, ear.cta.to],
    ["call", "Phone", "Reached voicemail", "Open the call", "conversations/cv-k2"],
  );
  assert.equal(ear.also, null);
});

test("a search waiting on its owner is a row in the queue, by its wait, with one button to answer it", () => {
  const vm = toTodayVM(metrics(), conversations, escalations, calls, NOW, [waitingSearch, runningSearch]);
  const rows = vm.queue.rows;
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["search", "handoff", "callback", "window", "call"],
    "three hours waited sorts before the handoff's two; the running search is nobody waiting",
  );
  const row = rows[0];
  assert.deepEqual(
    [row.who, row.channel, row.when, row.quoted, row.tone, row.warn, row.conversationId, row.callId],
    ["Personal trainers in Austin", "Leads", "waited 3h", false, "escalated", false, null, null],
  );
  assert.equal(row.sentence, QUESTION.sentence, "the question, as the search asked it");
  assert.deepEqual(row.status, ["Waiting for your answer", "nothing is spent while it waits"]);
  assert.deepEqual(row.cta, { label: "Answer", to: leadQuestionRoute("s-wait") });
  assert.equal(row.also, null);
  assert.ok(vm.queue.parts.includes("1 search waiting for your answer"), vm.queue.parts.join(" · "));
  assert.equal(vm.queue.waiting, 4, "the search counts with the people waiting");

  // Past twelve hours the row warns: the sweep stops a question after a day.
  const stale = toTodayVM(metrics(), conversations, escalations, calls, NOW, [
    search("s-old", "Dentists in Denver", round({ ...waitingSearch.round, waiting_since: "2026-09-06T01:00:00Z" })),
  ]);
  const old = stale.queue.rows.find((r) => r.kind === "search");
  assert.deepEqual([old.when, old.warn], ["waited 13h", true]);

  // Not read (null) and not passed at all say nothing about searches: the queue is what it was.
  for (const before of [
    toTodayVM(metrics(), conversations, escalations, calls, NOW, null),
    toTodayVM(metrics(), conversations, escalations, calls, NOW),
  ]) {
    assert.deepEqual(
      before.queue.rows.map((r) => r.kind),
      ["handoff", "callback", "window", "call"],
    );
    assert.equal(before.queue.waiting, 3);
    assert.ok(!before.queue.parts.some((p) => p.includes("search")));
  }
});

test("the cap and the rest: six rows on Today, the rest counted for the Inbox link; a quiet day has an empty queue", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `e${i}`,
    reason: "human_token",
    details: null,
    state: "open",
    created_at: `2026-09-06T1${i}:00:00Z`.replace("T18", "T13").replace("T19", "T13"),
    conversation_id: "cv1",
  }));
  const vm = toTodayVM(metrics({ now: { ...metrics().now, escalations_open: 8 } }), conversations, many, [], NOW);
  assert.equal(vm.queue.rows.length, 6);
  assert.equal(vm.queue.more, 3, "eight handoffs and the closing window: six shown, three more");
  assert.equal(vm.queue.waiting, 9, "and all nine are people waiting, which Ask's Right now counts past the six shown");
  const quiet = toTodayVM(
    metrics({
      period: { ...metrics().period, messages_in: 0, calls: 0, messages_out_you: 0 },
      now: { ...metrics().now, escalations_open: 0 },
    }),
    [],
    [],
    [],
    NOW,
  );
  assert.deepEqual(
    { rows: quiet.queue.rows, more: quiet.queue.more, parts: quiet.queue.parts },
    { rows: [], more: 0, parts: [] },
  );
  // What the empty queue means is contracts' sentence: both lines are up and the receptionist answers on them.
  assert.deepEqual([quiet.queue.empty.testid, quiet.queue.empty.sub], ["today-queue-empty-ok", "nothing needs you"]);
});

test("the wiring: one row component for People and Today, the queue in the command slot, the hero keeping only the narrative, the runs split between them", () => {
  const bits = readCode("apps/dashboard/src/legacy/pages/attention-bits.jsx");
  assert.ok(
    bits.includes("window.AttnRow = AttnRow;") && bits.includes('className="cl-attn-acts"'),
    "the grammar lives in one place",
  );
  const manifest = readCode("apps/dashboard/src/legacy-bridge/manifest.ts");
  assert.ok(
    manifest.indexOf('"@/legacy/pages/attention-bits.jsx"') <
      manifest.indexOf('"@/legacy/pages/dashboard-a-brief.jsx"'),
    "loaded before the pages that draw it",
  );
  const people = readCode("apps/dashboard/src/legacy/pages/people.jsx");
  // People drew three of these rows above its table -- the table's own first rows
  // again -- so the strip went and each row carries the words itself.
  assert.ok(
    !people.includes("<window.AttnRow") && !people.includes('className="cl-attn-status"'),
    "People says it on the row, once",
  );
  const queue = readCode("apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
  for (const s of [
    'data-testid="today-queue"',
    "<TodayQueue vm={window.TODAY_DATA} />",
    "vm.queue.rows",
    'testid="brief-run-row"',
    'testid="brief-run-soon"',
    'data-testid="brief-live-call"',
    "surface:live",
    "surface:broadcasts",
    "verb(r, r.also.verb)",
  ])
    assert.ok(queue.includes(s), s);
  const real = queue.slice(queue.indexOf("const LiveRail"));
  assert.ok(
    real.includes("Your queue") && !real.includes("Agent Command"),
    "the queue, not a command bar; the seed is gone",
  );
  assert.ok(!real.includes("tq-count"), "no count over rows that say it");
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  for (const gone of [
    "needsYou.rows.slice(0, 2)",
    "earCalls.map",
    "liveCalls.map",
    "windowClosing.rows",
    "<RunsWaiting",
  ])
    assert.ok(!brief.includes(gone), `${gone} left the hero`);
  assert.ok(
    brief.includes("<RunsDone nav={nav} />") && brief.includes('data-testid="brief-run-done"'),
    "what went out today is a line of the day's card",
  );
  const css = readRaw("apps/dashboard/src/legacy/styles/dashboard-a-v2.css");
  assert.ok(css.includes(".tq-live {") && css.includes(".tq-list .cl-attn-row:first-child { border-top: none; }"));
  const attn = readRaw("apps/dashboard/src/legacy/styles/clients.css");
  assert.ok(attn.includes(".cl-attn-acts { display: inline-flex; align-items: center; gap: 6px; }"));
  // The line a person decides from gets TWO lines, with a real ellipsis past
  // them; one line cut 23% off a call-back summary at 1440, including who the
  // caller had asked to speak to.
  assert.ok(
    attn.includes("-webkit-line-clamp: 2;") &&
      !attn.includes(
        ".cl-attn-sentence { font-size: 12px; color: var(--ink-muted); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ),
    "two lines, not one",
  );
});

test("REGRESSION: a long message is cut at a word with an ellipsis, not mid-word at a length the row could not draw", () => {
  // It was a bare .slice(0, 110): a hard stop mid-word, nothing to say a cut had
  // happened, and at a length two lines of the row can draw twice over. The row
  // is the only thing that knows how wide it is, so it truncates; this is a
  // ceiling on what the view model carries.
  const long =
    "I booked for Saturday but can you do it for one hundred and fifty dollars? my friend got that price last month and she said you would honour it for me as well, please let me know before tomorrow because I need to tell my sister whether we are both coming or not";
  assert.ok(long.length > QUOTE_MAX, "the fixture is longer than the ceiling");
  const vm = toTodayVM(
    metrics(),
    [{ ...conversations[0], messages: [msg("m1", "customer", long, "2026-09-06T13:00:00Z")] }],
    [
      {
        id: "e1",
        reason: "non_text",
        details: null,
        state: "open",
        created_at: "2026-09-06T12:00:00Z",
        conversation_id: "cv1",
      },
    ],
    [],
    NOW,
  );
  const row = vm.queue.rows.find((r) => r.kind === "handoff");
  assert.ok(row.quoted, "it is the customer's own words");
  assert.ok(row.sentence.endsWith("…"), `REGRESSION: a silent cut — ${row.sentence.slice(-30)}`);
  assert.ok(!/\s…$/.test(row.sentence), "and it does not end on a space before the ellipsis");
  assert.ok(row.sentence.length <= QUOTE_MAX + 1, "the ceiling holds");
  assert.ok(long.startsWith(row.sentence.slice(0, -1)), "everything before the ellipsis is what they wrote");
  assert.ok(row.sentence.length > 110, "and it is no longer cut at a length the row can draw twice over");

  const short = "Can I move Saturday to 11?";
  const whole = toTodayVM(
    metrics(),
    [{ ...conversations[0], messages: [msg("m1", "customer", short, "2026-09-06T13:00:00Z")] }],
    [
      {
        id: "e1",
        reason: "non_text",
        details: null,
        state: "open",
        created_at: "2026-09-06T12:00:00Z",
        conversation_id: "cv1",
      },
    ],
    [],
    NOW,
  );
  assert.equal(
    whole.queue.rows.find((r) => r.kind === "handoff").sentence,
    short,
    "what fits is printed whole, with no ellipsis",
  );
});

test("REGRESSION: the queue names the wire the thread is actually on", () => {
  // Every escalation row said "WhatsApp", hard-coded. The day email went live
  // an owner would have read "WhatsApp \u00b7 waited 2h" above a quote from an
  // email -- the same defect that had the Conversations list labelling SMS
  // threads WhatsApp until it was found there.
  const wired = (id, channel, at) => ({
    id: `m-${id}`,
    conversation_id: id,
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "Can you do Saturday at 9?",
    media: null,
    meta: null,
    status: "received",
    channel,
    created_at: at,
  });
  const threads = [
    {
      id: "cvE",
      state: "needs_human",
      paused_until: null,
      last_wa_inbound_at: null,
      last_message_at: "2026-09-06T13:00:00Z",
      contact: {
        id: "cE",
        display_name: "Ana Reyes",
        wa_profile_name: null,
        phone_e164: null,
        email: "ana@example.com",
        consent: "opted_in",
        dnc: false,
      },
      messages: [wired("cvE", "email", "2026-09-06T13:00:00Z")],
    },
    {
      id: "cvS",
      state: "needs_human",
      paused_until: null,
      last_wa_inbound_at: "2026-09-06T12:30:00Z",
      last_message_at: "2026-09-06T12:30:00Z",
      contact: {
        id: "cS",
        display_name: "Bea",
        wa_profile_name: null,
        phone_e164: "+13055550199",
        consent: "opted_in",
        dnc: false,
      },
      messages: [wired("cvS", "sms", "2026-09-06T12:30:00Z")],
    },
  ];
  const held = [
    {
      id: "eE",
      reason: "email_review",
      details: null,
      state: "open",
      created_at: "2026-09-06T13:05:00Z",
      conversation_id: "cvE",
    },
    {
      id: "eS",
      reason: "human_token",
      details: null,
      state: "open",
      created_at: "2026-09-06T12:35:00Z",
      conversation_id: "cvS",
    },
  ];
  const rows = toTodayVM(metrics(), threads, held, [], NOW).queue.rows;
  assert.deepEqual(
    rows.map((r) => [r.who, r.channel]),
    [
      ["Bea", "Text"],
      ["Ana Reyes", "Email"],
    ],
    "the wire each thread's words last travelled, longest wait first",
  );
  assert.deepEqual(rows[1].status.slice(0, 2), ["Escalated", "wrote by email"]);
  // A thread with no messages at all still reads as WhatsApp, which is what
  // every row was before the column existed to say otherwise.
  const bare = toTodayVM(metrics(), conversations, escalations, calls, NOW).queue.rows;
  assert.equal(bare.find((r) => r.who === "Ana").channel, "Phone", "a call-back row is the call's");
});
