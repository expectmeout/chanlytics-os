/**
 * Every sentence the pages will say about a reach-out (Reach out, Part 4 PR 5), run before any page draws it: the
 * sheet's reach and pace, what Start did (R14), the next run (R23), the approval sheet (R21, R22), the open row's
 * report (R16, R23), Templates' email row, and the doors' refusals. The story's own numbers: 44 of 160, 44 unconfirmed,
 * 72 by phone, 30 a day, 12 minutes.
 */
import { test } from "node:test";
import * as contracts from "@chanlytics/contracts";
import assert from "node:assert/strict";
import {
  REACH_OUT_REFUSALS,
  REACH_OUT_SHEET_WORDS,
  ReachOutChainSchema,
  approvalWordsOf,
  chainHintOf,
  chainReportWordsOf,
  emailTemplateWords,
  isReachOutRefusal,
  nextRunWords,
  paceWords,
  reachLineOf,
  sheetFootWords,
  startWords,
  stepLabel,
  stepWhenWords,
} from "@chanlytics/contracts";

const REACH = { ready: 44, with_unconfirmed: 88, phone_only: 72, of: 160, chain: null };
// ICU puts a narrow no-break space before AM; the words are compared as a reader reads them.
const flat = (s) => s.split(String.fromCharCode(0x202f)).join(" ");

test("who gets it: the count, the held with its door, the phone-only kept for calls", () => {
  assert.deepEqual(reachLineOf(REACH, false), {
    count: 44,
    of: "of 160 on the search",
    bar: { will: 28, held: 28, rest: 44 },
    why: [
      { tone: "warn", text: "44 unconfirmed addresses, held", door: "Include them" },
      { tone: "plain", text: "72 by phone only, kept for calls", door: null },
    ],
  });
  assert.deepEqual(reachLineOf(REACH, true).why[0], {
    tone: "plain",
    text: "44 unconfirmed addresses, included",
    door: "Leave them out",
  });
  // One is one address, never "1 unconfirmed addresses" (seen on a real search, 27 Sep 2026).
  assert.equal(reachLineOf({ ...REACH, with_unconfirmed: 45 }, false).why[0].text, "1 unconfirmed address, held");
  assert.equal(reachLineOf({ ...REACH, with_unconfirmed: 45 }, true).why[0].text, "1 unconfirmed address, included");
  assert.equal(REACH_OUT_SHEET_WORDS.who, "Ready, with a checked address, never written to. Keeps itself current.");
});

test("the pace: the mailboxes' day and the gap, why it is what it is, and the foot", () => {
  assert.deepEqual(paceWords({ share: 10, mailboxes: 1, rises: 7, gapMinutes: 12 }), {
    parts: [
      "",
      "10",
      " a day, one every ",
      "12 min",
      " or so, in each business's open hours. Never on their closed days.",
    ],
    why: "A new mailbox starts slow and grows with the days it sends: the pace rises in 7 more days of sending.",
  });
  assert.equal(
    paceWords({ share: 60, mailboxes: 2, rises: null, gapMinutes: 8 }).parts[2],
    " a day across 2 mailboxes, one every ",
  );
  assert.equal(
    paceWords({ share: 80, mailboxes: 2, rises: null, gapMinutes: 8 }).why,
    "As much as your mailboxes write in a day.",
  );
  assert.equal(
    sheetFootWords({ share: 30, gapMinutes: 12, ready: 44, editing: false }),
    "Goes to 30 a day, one every 12 minutes or so as each business opens. The first run waits on you.",
  );
  assert.equal(
    sheetFootWords({ share: 30, gapMinutes: 12, ready: 0, editing: false }),
    "Nobody on this search can be written to yet.",
  );
  assert.equal(
    sheetFootWords({ share: 30, gapMinutes: 12, ready: 44, editing: true }),
    "Your changes go with the next emails. What has gone stays as it went.",
  );
});

test("a chain's pace is one the sheet offers, as the database's CHECK holds it", () => {
  const chain = (gap) => ({
    name: "Reach out · Personal trainers",
    search_id: "44444444-4444-4444-8444-444444444444",
    include_unconfirmed: false,
    gap_minutes: gap,
    mailbox_ids: [],
    signed_by: "Sam",
    steps: [{ subject: "Hi {{business}}", body: "{{opening}}", after_days: null }],
  });
  for (const g of [5, 8, 12, 20, 30, 60]) assert.equal(ReachOutChainSchema.safeParse(chain(g)).success, true, `${g}`);
  for (const g of [4, 7, 15, 90, 120]) assert.equal(ReachOutChainSchema.safeParse(chain(g)).success, false, `${g}`);
});

test("each step is named and timed as the chain draws it", () => {
  assert.deepEqual([0, 1, 2].map(stepLabel), ["Your email", "A short nudge", "Email 3"]);
  assert.equal(stepWhenWords(0, null), "Day one, in their hours");
  assert.equal(stepWhenWords(1, 4), "After 4 days with nothing back · in the same thread");
});

test("Start says what really happened, each reason in its own words; within the hour only when the edge was not reached (R14)", () => {
  const said = (outcome, reason, planned = 0) => startWords({ outcome, reason, planned, run_id: null }).text;
  assert.equal(
    said("held", "waiting_for_you", 30),
    "Planned 30 emails. The first run waits on you: open it to approve.",
  );
  assert.equal(said("held", "waiting_for_you", 0), "A run of this sequence already waits on you. Answer it first.");
  assert.equal(said("held", "billing"), "Saved. Nothing is planned until billing is sorted: open Billing.");
  assert.equal(
    said("held", "no_mailbox"),
    "Saved. Nothing is planned yet. Connect the mailbox you'll write from first: Google or Microsoft, here or in Settings › Connections.",
  );
  assert.equal(
    said("held", "no_room"),
    "Saved. Your mailboxes have written all they may today, so the first run is tomorrow.",
  );
  assert.equal(said("empty", "nobody"), "Saved. Nobody on this search can be written to yet; it looks again each day.");
  assert.equal(
    said("sent", null, 1),
    "Planned 1 email. They go in each business's hours; you have 30 minutes to stop them.",
  );
  assert.equal(said("unreached", null), "Saved. The first run is planned within the hour.");
  assert.equal(said("off", "paused"), "Saved. It is paused, so nothing was planned.");
  assert.equal(
    said("off", "workspace_paused"),
    "Saved. This workspace is paused, so nothing runs until it is resumed.",
    "the workspace's pause is said as the workspace's",
  );
  const within = ["sent", "held", "empty", "off", "failed", "preview"].flatMap((o) =>
    ["billing", "no_mailbox", "no_room", "nobody", "waiting_for_you", "already_ran", "paused", null].map((r) =>
      said(o, r, 3),
    ),
  );
  assert.equal(
    within.filter((t) => t.includes("within the hour")).length,
    0,
    "only an edge that could not be reached says it",
  );
});

test("the next run says a paused chain, billing and a waiting run as they are, then the sweep's own clock (R23)", () => {
  const TZ = "America/Chicago";
  const at = new Date("2026-09-28T13:00:00Z"); // 8 AM in Austin
  const chain = (over = {}, next = {}) => ({
    state: "running",
    next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null, ...next },
    ...over,
  });
  assert.equal(
    nextRunWords(chain({ state: "paused" }), TZ, at).text,
    "Paused. Nothing is planned until you resume it.",
  );
  assert.equal(
    nextRunWords(chain({}, { may_spend: false }), TZ, at).text,
    "Held for billing: nothing is planned until billing is sorted.",
  );
  assert.deepEqual(nextRunWords(chain({}, { waiting_run_id: "b" }), TZ, at), {
    tone: "warn",
    text: "A run waits on you. Nothing more is planned until you answer it.",
    run_id: "b",
  });
  assert.equal(nextRunWords(chain(), TZ, at).text, "Next run today 9:00 AM.");
  assert.equal(nextRunWords(chain({}, { last_run_for: "2026-09-28" }), TZ, at).text, "Next run tomorrow 9:00 AM.");
});

/** A held business's lead: its address is the Leads peek over it (contracts addressOf, the one writer). */
const LEAD = "6f1c2a4e-3b7d-4c58-9a10-2d5e8b7c4f01";
const RUN = (over = {}) => ({
  root_id: "r",
  chain_name: "Reach out · Personal trainers",
  step_id: "r",
  step_n: 0,
  gap_minutes: 12,
  run_for: "2026-09-28",
  include_unconfirmed: false,
  today: 30,
  later: 11,
  first_at: "2026-09-28T14:40:00Z",
  checking: 0,
  held: [
    {
      send_id: "s",
      lead_id: LEAD,
      business_name: "Hyde Park Bootcamp",
      email: "x@hydepark.example",
      reason: "chain",
      detail: "site:3",
      opening: null,
      angle: null,
      planned_at: "2026-09-27T12:00:00Z",
    },
  ],
  planned: [],
  skipped: {},
  first: {
    business_name: "Coach Priya Nair",
    subject: "The calls you miss",
    body: "You're a one-person studio.\n\nI run Chanlytics.",
    opening: "You're a one-person studio.",
    angle: "mid-session",
  },
  mailboxes: [{ address: "sam@chanlytics-mail.example", sent_days: 12, daily_cap: 40, customer_domain: false }],
  ...over,
});

/** 8:00 AM in Chicago on the run's day, before its first send at 9:40. */
const MORNING = Date.parse("2026-09-28T13:00:00Z");

test("a run waiting on its owner says the decision first: how many go and of how many, its parts, when and from where, the held with their answers, the email and the foot (R21, R22)", () => {
  const at = (over, p) =>
    approvalWordsOf(RUN(over), { timezone: "America/Chicago", today: "2026-09-28", now: MORNING, ...p });
  const w = at();
  assert.deepEqual([w.title, w.step, w.who], ["Reach out · Personal trainers", "Step 1", null]);
  assert.deepEqual(w.count, { n: 30, words: "go today", of: "of 42" });
  assert.deepEqual(
    w.parts.map((x) => [x.key, x.n, x.words]),
    [
      ["go", 30, "30 ready"],
      ["later", 11, "11 in the coming days"],
      ["held", 1, "1 held"],
    ],
  );
  assert.deepEqual(
    [flat(w.when.lead), w.when.rest],
    ["From 9:40 AM", "in their hours · one every 12 minutes as each business opens"],
  );
  assert.equal(w.from, "From sam@chanlytics-mail.example · 12 days of sending");
  assert.deepEqual(w.rules, [
    "Each has a checked address",
    "None is on a person in People",
    "None heard from you before",
  ]);
  assert.deepEqual(w.words[0], { text: "You're a one-person studio.", opening: true });
  assert.deepEqual(w.mail, {
    name: "Coach Priya Nair",
    as: "As they read it · step 1, your email",
    subject: "The calls you miss",
    opening: "Opening: its own for each",
    same: "Offer and ask: the same for all 41",
  });
  // Approve says the count it releases (the run-to-leads canvas's "Approve 2"); when it goes is the foot's, beside it.
  assert.equal(w.approve, "Approve 30");
  assert.deepEqual([flat(w.dock.lead), w.dock.said], ["30 go from 9:40 AM", "1 held waits for you"]);
  assert.equal(w.note, "Skipping loses this run only. The sequence keeps its place and asks again tomorrow.");
  assert.deepEqual(
    [w.heldHead, w.heldNote.closed, w.heldNote.gated],
    [
      "1 held by the check",
      "It waits for your say. Approve sends only the 30 ready.",
      "It waits for an owner's or operator's say.",
    ],
  );
  assert.deepEqual(w.held[0], {
    id: "s",
    name: "Hyde Park Bootcamp",
    // Its lead, opened over the page: the sheet's name is a door to who it is (D1-lead-person-door).
    leadId: LEAD,
    why: "Reads like a chain: 3 listings share their website",
    // Step 1: the no is Take out, since skipping would end their place (00459); a chain suggests nothing.
    answers: [
      { door: "include", words: "Send as written", lead: false },
      { door: "not_a_fit", words: "Not a fit", lead: false },
      { door: "take_out", words: "Take out", lead: false },
    ],
  });
  assert.equal(w.recheck, null);

  // Still being checked: Approve counts only the checked, the foot says the rest; an earlier day's run goes from now.
  const later = at({ checking: 5, run_for: "2026-09-26" });
  assert.equal(later.approve, "Approve 30");
  assert.deepEqual([later.dock.lead, later.dock.said], ["30 go from now", "5 more go once checked"]);
  assert.deepEqual(later.when, {
    lead: "From now",
    rest: "re-timed in their hours · one every 12 minutes as each business opens",
  });
  assert.deepEqual(
    later.parts.map((x) => x.words),
    ["30 ready", "11 in the coming days", "1 held", "5 being checked"],
  );
  // Unconfirmed addresses included: "each has a checked address" is not said (R22).
  assert.equal(at({ include_unconfirmed: true }).rules.includes("Each has a checked address"), false);
  // A hold the check could not answer: the run's one "check the held again" (R18), and on its row only its no.
  const down = at({ held: [{ ...RUN().held[0], reason: "check_unavailable", detail: null }] });
  assert.deepEqual(down.recheck, { said: "The check couldn't run for 1", act: "Check the held again" });
  assert.deepEqual(
    down.held[0].answers.map((a) => a.door),
    ["take_out"],
  );
  assert.equal(down.held[0].why, "The check couldn't run; it tries again on its own within the hour");
  // From step 2 the no is Skip this email: their place goes on to the next step (00459).
  assert.deepEqual(
    at({ step_n: 1 }).held[0].answers.map((a) => a.words),
    ["Send as written", "Not a fit", "Skip this email"],
  );
  // A read from before the lead was carried has no lead to take out.
  assert.deepEqual(
    at({ held: [{ ...RUN().held[0], lead_id: "" }] }).held[0].answers.map((a) => a.door),
    ["include", "not_a_fit"],
  );
  // A run whose step was dropped from its chain since says so, never another step's name (R17).
  const dropped = at({ step_id: null, step_n: null });
  assert.deepEqual([dropped.step, dropped.mail.as], ["A step since removed", "As they read it · a step since removed"]);
  // Today's run whose first time has passed goes from now, never at 9:40 once it is 10 (R21).
  const past = at({}, { now: Date.parse("2026-09-28T15:00:00Z") });
  assert.deepEqual([past.when.lead, past.dock.lead], ["From now", "30 go from now"]);
  assert.doesNotMatch(flat(past.when.rest), /9:40/);
  // Planned on a closed day (a Sunday): nothing today, the first on Monday. The time says its day, and the decision
  // counts the coming days', never a "0", which would say none go (seen in the real app, 27 Sep 2026).
  const sunday = at(
    { run_for: "2026-09-27", today: 0, later: 41 },
    { today: "2026-09-27", now: Date.parse("2026-09-27T17:00:00Z") },
  );
  assert.deepEqual(sunday.count, { n: 41, words: "go in the coming days", of: "of 42" });
  assert.equal(sunday.approve, "Approve 41");
  assert.deepEqual(
    [flat(sunday.when.lead), flat(sunday.dock.lead)],
    ["From tomorrow 9:40 AM", "41 go from tomorrow 9:40 AM"],
  );
  // And its flash says when they go, never "0 emails today".
  assert.equal(
    contracts.reachOutRunWordsOf(RUN({ run_for: "2026-09-27", today: 0, later: 41 }), {
      state: "pending_approval",
      timezone: "America/Chicago",
      today: "2026-09-27",
      now: Date.parse("2026-09-27T17:00:00Z"),
    }).approved,
    "Reach out · Personal trainers approved — 41 emails in the coming days, in their hours",
  );
  // Two days on, it says the date.
  const friday = at(
    { run_for: "2026-09-26", today: 0, later: 41 },
    { today: "2026-09-26", now: Date.parse("2026-09-26T23:00:00Z") },
  );
  assert.equal(flat(friday.dock.lead), "41 go from Sep 28 · 9:40 AM");
  // Nothing today and nothing to come: the count stays, and the foot says nothing goes.
  const none = at({ today: 0, later: 0, first_at: null });
  assert.deepEqual([none.approve, none.dock.lead], ["Approve 0", "Nothing goes yet"]);
});

test("a run approved or going says the same facts in its state: going today, the run going on without the held, its own verb in the foot", () => {
  const live = (state, over) =>
    contracts.reachOutRunWordsOf(RUN(over), { state, timezone: "America/Chicago", today: "2026-09-28", now: MORNING });
  const sending = live("sending");
  assert.deepEqual([sending.k, sending.count.words, sending.approve], ["Sending", "going today", null]);
  assert.deepEqual(sending.when, { lead: "Going now", rest: "one every 12 minutes as each business opens" });
  assert.equal(sending.heldNote.closed, "It waits for your say; the run goes on without them.");
  assert.equal(sending.heldNote.open, "It waits for your say; the run goes on without them.");
  assert.deepEqual([sending.dock.lead, sending.dock.said], ["Going now", "Stop keeps the rest from going"]);
  assert.equal(sending.parts[0].words, "30 going");
  const scheduled = live("scheduled");
  assert.deepEqual(
    [scheduled.k, flat(scheduled.dock.lead), scheduled.dock.said],
    ["Scheduled", "Goes from 9:40 AM", "Cancel keeps it from going"],
  );
  // Its head says what it waits for (the run-to-leads canvas): your OK.
  assert.equal(live("pending_approval").k, "Waits for your OK");
  // A run its owner sends (00429): what is handed to them counts, from their own inbox, and its head says whose it is.
  const owner = live("sending", { owner_sends: true, mailboxes: [] });
  assert.deepEqual([owner.who, owner.count.words, owner.from], ["You send them", "for you to send", null]);
  assert.deepEqual(owner.when, { lead: "From your own inbox", rest: "each handed to you once it is checked" });
  assert.equal(owner.parts[0].words, "30 handed to you");
  // Who gets it: a clock time is a clock time; the words that stand for one are not.
  const listed = live("scheduled", {
    planned: [{ send_id: "p1", business_name: "Studio Two", send_at: "2026-09-28T14:40:00Z", checked: true }],
    checking: 3,
  });
  assert.deepEqual(
    listed.list.map((x) => [x.name, x.clock]),
    [["Studio Two", true]],
  );
  assert.equal(listed.listNote, "3 more are being checked; they go once they pass");
  assert.equal(listed.listHead, contracts.WHO_GETS_IT_WORDS.head);
});

test("D1-lead-person-door: each held and each ready business carries its lead's id, which its name opens over the page; none named, none carried", () => {
  const LEAD_READY = "9d3e5b21-7a64-4f0c-8e12-5c7a1d9b3e22";
  const run = RUN({
    planned: [
      {
        send_id: "p1",
        lead_id: LEAD_READY,
        business_name: "Studio Two",
        send_at: "2026-09-28T14:40:00Z",
        checked: true,
      },
      // A read from before the lead was carried.
      { send_id: "p2", business_name: "Studio Three", send_at: "2026-09-28T14:52:00Z", checked: true },
    ],
  });
  const at = { timezone: "America/Chicago", share: 30, today: "2026-09-28", now: MORNING };
  assert.equal(approvalWordsOf(run, at).held[0].leadId, LEAD);
  const said = contracts.reachOutRunWordsOf(run, { state: "pending_approval", ...at });
  assert.deepEqual(
    said.list.map((x) => [x.name, x.leadId]),
    [
      ["Studio Two", LEAD_READY],
      ["Studio Three", null],
    ],
  );
  const noLead = approvalWordsOf(RUN({ held: [{ ...RUN().held[0], lead_id: undefined }] }), at);
  assert.equal(noLead.held[0].leadId, null);
});

const CHAIN = {
  root_id: "r",
  name: "Reach out · Personal trainers",
  search: { id: "s", name: "Personal trainers · Austin" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  mailbox_ids: [],
  signed_by: "Sam",
  created_at: "2026-09-20T00:00:00Z",
  next: { run_hour: 9, last_run_for: "2026-09-24", mode: "ask", may_spend: true, waiting_run_id: null },
  steps: [
    { id: "r", n: 0, after_days: null, subject: "S", body: "B", template_id: "t", state: "running" },
    { id: "n", n: 1, after_days: 4, subject: null, body: "B2", template_id: "t2", state: "running" },
  ],
};
const REPORT = {
  steps: [
    {
      id: "r",
      n: 0,
      written: 44,
      delivered: 42,
      wrote_back: 5,
      interested: 2,
      booked: 1,
      said_no: 3,
      bounced: 2,
      waiting: 0,
      held: 0,
    },
    { id: "n", n: 1, written: 28, delivered: 28, wrote_back: 3, said_no: 1, bounced: 0, waiting: 5, held: 0 },
  ],
  runs: [{ id: "b", step_id: "r", run_for: "2026-09-24", state: "sent", planned: 30, written: 30, held: 0 }],
  can_remove: false,
};

test("the Playbooks row and its open row say what the database holds, no more (R16, R23)", () => {
  assert.equal(
    chainHintOf(CHAIN, "sam@chanlytics-mail.example"),
    "Your email, a short nudge · from sam@chanlytics-mail.example",
  );
  const w = chainReportWordsOf(
    CHAIN,
    REPORT,
    { ...REACH, ready: 0 },
    { from: "sam@chanlytics-mail.example", share: 30 },
  );
  assert.deepEqual(w.reaches, { n: 44, of: "of 160 on the search" });
  assert.deepEqual(w.head, [
    "Step",
    "When",
    "Written",
    "Delivered",
    "Wrote back",
    "Interested",
    "Booked",
    "Said no",
    "Bounced",
  ]);
  assert.deepEqual(w.table[0], [
    "Your email",
    "Day one, in their hours",
    "44",
    "42 (95%)",
    "5 (11%)",
    "2",
    "1",
    "3",
    "2",
  ]);
  // A step read before 00241 has no interested or booked: unknown, never a zero (Part 6, H7).
  assert.deepEqual(w.table[1], [
    "A short nudge",
    "After 4 days with nothing back",
    "28",
    "28 (100%)",
    "3 (11%)",
    "—",
    "—",
    "1",
    "0",
  ]);
  assert.equal(
    w.sentence,
    "30 a day from sam@chanlytics-mail.example, one every 12 minutes in each business's hours. 72 written; 8 wrote back; 4 said no; 2 bounced and their addresses were dropped.",
  );
  assert.deepEqual(w.history[0], { id: "b", text: "Sep 24 · 30 written" });
  assert.deepEqual([w.canRemove, w.remove], [false, null], "one that wrote is paused, never removed");
  assert.equal(w.stopOne, "To stop one business, press Stop writing to them on its lead.");
  const fresh = chainReportWordsOf(
    CHAIN,
    {
      steps: REPORT.steps.map((s) => ({ ...s, written: 0, delivered: 0, wrote_back: 0, said_no: 0, bounced: 0 })),
      runs: [],
      can_remove: true,
    },
    REACH,
    { from: null, share: 30 },
  );
  assert.equal(fresh.canRemove, true);
  assert.equal(fresh.sentence, "30 a day, one every 12 minutes in each business's hours. 0 written.");
});

test("Templates says an email is a reach-out's and what sends it (R19); its words are written in its pane, so no read-only notes (step 5)", () => {
  assert.deepEqual(emailTemplateWords({ chainName: "Reach out · Personal trainers", stepN: 1, afterDays: 4 }), {
    chip: "Email",
    sends: "Reach out · Personal trainers",
    sendsNote: "step 2 · after 4 days with nothing back",
    checkLabel: "What is checked before each send",
    checkNote:
      "Checked before each send: every slot filled or the email held; the opening's facts in the finder's record; under 120 words; the footer present; the language theirs.",
    edit: "Edit the sequence",
  });
});

test("the doors' refusals are one set of sentences, the ones the database raises", () => {
  assert.equal(isReachOutRefusal(REACH_OUT_REFUSALS.wrote), true);
  assert.equal(isReachOutRefusal("This reach-out has written already. Pause it instead."), true);
  assert.equal(isReachOutRefusal('duplicate key value violates unique constraint "playbooks_one_reach_out"'), false);
  assert.equal(isReachOutRefusal(null), false);
  for (const w of [
    "Workspace not found.",
    "A reach-out has at least one email.",
    "This lead is gone.",
    "Lead not found.",
  ])
    assert.equal(isReachOutRefusal(w), true, w);
});

test("the chain row's own words: its pace from its mailboxes, its path, the held with their run (PR 8)", () => {
  const { chainPaceOf, chainPathWords, chainReportWordsOf: report, REACH_OUT_ROW_WORDS } = contracts;
  const box = (address, sent_days, over = {}) => ({
    address,
    sent_days,
    daily_cap: 40,
    customer_domain: false,
    ...over,
  });
  assert.deepEqual(chainPaceOf({ mailboxes: [box("sam@a.example", 0)] }), { from: "sam@a.example", share: 10 });
  assert.deepEqual(
    chainPaceOf({ mailboxes: [box("sam@a.example", 20), box("dana@b.example", 40, { customer_domain: true })] }),
    { from: null, share: 50 },
    "two mailboxes: their days summed (30 at 20 days sent; 20 at most on the customer's own domain), no one address",
  );
  assert.deepEqual(
    chainPaceOf({ mailboxes: [box("sam@a.example", 40, { daily_cap: 15 })] }).share,
    15,
    "its owner's cap",
  );
  assert.deepEqual(chainPaceOf({ mailboxes: [] }), { from: null, share: 0 });
  assert.deepEqual(chainPathWords(CHAIN), {
    steps: [
      { id: "r", label: "Your email", after: null },
      { id: "n", label: "A short nudge", after: "after 4 days, nothing back" },
    ],
    stops: "Stops for anyone who writes back, books or says no.",
  });
  const held = {
    ...REPORT,
    steps: REPORT.steps.map((s, i) => ({ ...s, held: i === 1 ? 3 : 0 })),
    runs: [
      { id: "b3", step_id: "n", run_for: "2026-09-26", state: "sending", planned: 3, written: 0, held: 3 },
      ...REPORT.runs,
    ],
  };
  assert.deepEqual(report(CHAIN, held, REACH, { from: null, share: 30 }).waiting, {
    text: "3 wait for your say",
    run_id: "b3",
  });
  assert.equal(report(CHAIN, REPORT, REACH, { from: null, share: 30 }).waiting, null);
  assert.match(
    report(CHAIN, REPORT, REACH, { from: null, share: 0 }).sentence,
    /^Connect the mailbox you'll write from first: Google or Microsoft, here or in Settings › Connections. 72 written/,
    "no mailbox: never a pace of 0 a day",
  );
  assert.equal(REACH_OUT_ROW_WORDS.paused("Movers"), "Movers is paused — nothing more is planned until you resume it");
});
