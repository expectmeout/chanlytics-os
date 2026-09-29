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
  assert.equal(
    REACH_OUT_SHEET_WORDS.who,
    "Ready, with a checked address, never written to. Keeps itself current as the search grows.",
  );
});

test("the pace: the domain's day and the gap, why it is recommended, and the foot", () => {
  assert.deepEqual(paceWords({ share: 30, sentDays: 0, gapMinutes: 12 }), {
    parts: [
      "",
      "30",
      " a day per domain, one every ",
      "12 min",
      " or so, in each business's open hours. Never on their closed days.",
    ],
    why: "The pace for a new domain. Rises to 100 a day after 14 clean days.",
  });
  assert.equal(paceWords({ share: 100, sentDays: 20, gapMinutes: 8 }).why, "Rises to 200 a day after 30 clean days.");
  assert.equal(paceWords({ share: 200, sentDays: 40, gapMinutes: 8 }).why, "The most a domain sends in a day.");
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
    domain_ids: [],
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
  assert.equal(said("held", "waiting_for_you", 0), "A run of this reach-out already waits on you. Answer it first.");
  assert.equal(said("held", "billing"), "Saved. Nothing is planned until billing is sorted: open Billing.");
  assert.equal(said("off", "never"), "Saved. Outreach is set to Never in Settings › Autonomy, so nothing runs.");
  assert.equal(
    said("held", "no_domain"),
    "Saved. Nothing is planned yet. Add a domain you send from in Settings › Connections › Email first.",
  );
  assert.equal(
    said("held", "no_room"),
    "Saved. Your domains have sent all they may today, so the first run is tomorrow.",
  );
  assert.equal(said("empty", "nobody"), "Saved. Nobody on this search can be written to yet; it looks again each day.");
  assert.equal(
    said("sent", null, 1),
    "Planned 1 email. They go in each business's hours; you have thirty minutes to stop them.",
  );
  assert.equal(said("unreached", null), "Saved. The first run is planned within the hour.");
  assert.equal(said("off", "paused"), "Saved. It is paused, so nothing was planned.");
  assert.equal(
    said("off", "workspace_paused"),
    "Saved. This workspace is paused, so nothing runs until it is resumed.",
    "the workspace's pause is said as the workspace's",
  );
  const within = ["sent", "held", "empty", "off", "failed", "preview"].flatMap((o) =>
    ["billing", "never", "no_domain", "no_room", "nobody", "waiting_for_you", "already_ran", "paused", null].map((r) =>
      said(o, r, 3),
    ),
  );
  assert.equal(
    within.filter((t) => t.includes("within the hour")).length,
    0,
    "only an edge that could not be reached says it",
  );
});

test("the next run says a paused chain, never, billing and a waiting run as they are, then the sweep's own clock (R23)", () => {
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
    nextRunWords(chain({}, { mode: "never" }), TZ, at).text,
    "Outreach is set to Never in Settings › Autonomy, so nothing runs.",
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
  assert.equal(nextRunWords(chain(), TZ, at).text, "Next run today 09:00.");
  assert.equal(nextRunWords(chain({}, { last_run_for: "2026-09-28" }), TZ, at).text, "Next run tomorrow 09:00.");
});

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
      lead_id: "l",
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
  domains: [{ host: "chanlytics-mail.example", sent_days: 12 }],
  ...over,
});

/** 8:00 AM in Chicago on the run's day, before its first send at 9:40. */
const MORNING = Date.parse("2026-09-28T13:00:00Z");

test("the approval sheet says who today, who later, what the check held, and names the first send's time (R21, R22)", () => {
  const w = approvalWordsOf(RUN(), { timezone: "America/Chicago", share: 30, today: "2026-09-28", now: MORNING });
  assert.equal(
    flat(w.sub),
    "Reach-out · step 1, your email · goes from 9:40 AM once you approve it, one every 12 minutes as each business opens",
  );
  assert.deepEqual([w.will, w.of], ["30 will get it today", "of 42"]);
  assert.deepEqual(w.why, [
    { tone: "plain", text: "11 wait for the coming days — 30 a day on this domain", door: null },
    { tone: "warn", text: "1 held by the check", door: "See them" },
  ]);
  assert.deepEqual(w.rules, [
    "each has a checked address",
    "none is on a person in People",
    "none heard from you before",
    "all from chanlytics-mail.example, 12 clean days",
  ]);
  assert.deepEqual(w.words[0], { text: "You're a one-person studio.", opening: true });
  assert.equal(
    w.reader,
    "as Coach Priya Nair reads it · every opening is its own; your offer and ask are the same for all 41",
  );
  assert.equal(flat(w.approve), "Approve — 30 from 9:40 AM");
  assert.equal(w.approveNote, null);
  assert.equal(w.note, "Skipping loses this run only — the reach-out keeps its place and asks again tomorrow.");
  assert.deepEqual(w.held[0], {
    id: "s",
    name: "Hyde Park Bootcamp",
    why: "reads like a chain: 3 listings share their website",
    doors: [
      ["include", "Include"],
      ["not_a_fit", "Not a fit"],
    ],
  });
  assert.equal(w.recheck, null);

  // Still being checked: Approve counts only the checked, and says so; an earlier day's run goes from now.
  const later = approvalWordsOf(RUN({ checking: 5, run_for: "2026-09-26" }), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-28",
    now: MORNING,
  });
  assert.equal(later.approve, "Approve — 30 from now");
  assert.equal(later.approveNote, "5 more are being checked; they go once they pass.");
  assert.match(later.sub, /goes from now, re-timed in their hours, once you approve it/);
  // Unconfirmed addresses included: "each has a checked address" is not said (R22).
  const unconfirmed = approvalWordsOf(RUN({ include_unconfirmed: true }), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-28",
    now: MORNING,
  });
  assert.equal(unconfirmed.rules.includes("each has a checked address"), false);
  // A hold the check could not answer offers the run's one "check the held again" (R18).
  const down = approvalWordsOf(RUN({ held: [{ ...RUN().held[0], reason: "check_unavailable", detail: null }] }), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-28",
    now: MORNING,
  });
  assert.equal(down.recheck, "Check the held again");
  // A run whose step was dropped from its chain since says so, never another step's name (R17).
  const dropped = approvalWordsOf(RUN({ step_id: null, step_n: null }), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-28",
    now: MORNING,
  });
  assert.match(dropped.sub, /^Reach-out · a step since removed · goes from/);
  // Today's run whose first time has passed goes from now, never at 9:40 once it is 10 (R21).
  const past = approvalWordsOf(RUN(), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-28",
    now: Date.parse("2026-09-28T15:00:00Z"),
  });
  assert.equal(past.approve, "Approve — 30 from now");
  assert.match(past.sub, /goes from now, in their hours, once you approve it/);
  assert.doesNotMatch(past.sub, /9:40/);
  // Planned on a closed day (a Sunday): nothing today, the first on Monday. The time says its day, and Approve counts
  // no "0", which would say none go then (seen in the real app, 27 Sep 2026).
  const sunday = approvalWordsOf(RUN({ run_for: "2026-09-27", today: 0, later: 41 }), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-27",
    now: Date.parse("2026-09-27T17:00:00Z"),
  });
  assert.equal(flat(sunday.approve), "Approve — from tomorrow 9:40 AM");
  assert.match(flat(sunday.sub), /goes from tomorrow 9:40 AM once you approve it/);
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
  const friday = approvalWordsOf(RUN({ run_for: "2026-09-26", today: 0, later: 41 }), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-26",
    now: Date.parse("2026-09-26T23:00:00Z"),
  });
  assert.equal(flat(friday.approve), "Approve — from Sep 28 · 9:40 AM");
  // Nothing today and no first time: the count stays, so Approve never ends on a dash.
  const none = approvalWordsOf(RUN({ today: 0, later: 0, first_at: null }), {
    timezone: "America/Chicago",
    share: 30,
    today: "2026-09-28",
    now: MORNING,
  });
  assert.equal(none.approve, "Approve — 0");
});

const CHAIN = {
  root_id: "r",
  name: "Reach out · Personal trainers",
  search: { id: "s", name: "Personal trainers · Austin" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
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
    { id: "r", n: 0, written: 44, delivered: 42, wrote_back: 5, said_no: 3, bounced: 2, waiting: 0, held: 0 },
    { id: "n", n: 1, written: 28, delivered: 28, wrote_back: 3, said_no: 1, bounced: 0, waiting: 5, held: 0 },
  ],
  runs: [{ id: "b", step_id: "r", run_for: "2026-09-24", state: "sent", planned: 30, written: 30, held: 0 }],
  can_remove: false,
};

test("the Playbooks row and its open row say what the database holds, no more (R16, R23)", () => {
  assert.equal(
    chainHintOf(CHAIN, "chanlytics-mail.example"),
    "Your email, a short nudge · from chanlytics-mail.example",
  );
  const w = chainReportWordsOf(CHAIN, REPORT, { ...REACH, ready: 0 }, { host: "chanlytics-mail.example", share: 30 });
  assert.deepEqual(w.reaches, { n: 44, of: "of 160 on the search" });
  assert.deepEqual(w.head, ["Step", "When", "Written", "Delivered", "Wrote back", "Said no", "Bounced"]);
  assert.deepEqual(w.table[0], ["Your email", "Day one, in their hours", "44", "42 (95%)", "5 (11%)", "3", "2"]);
  assert.deepEqual(w.table[1], [
    "A short nudge",
    "After 4 days with nothing back",
    "28",
    "28 (100%)",
    "3 (11%)",
    "1",
    "0",
  ]);
  assert.equal(
    w.sentence,
    "30 a day from chanlytics-mail.example, one every 12 minutes in each business's hours. 72 written; 8 wrote back; 4 said no; 2 bounced and their addresses were dropped.",
  );
  assert.deepEqual(w.history[0], { id: "b", text: "Sep 24 · 30 written" });
  assert.deepEqual([w.canRemove, w.remove], [false, null], "one that wrote is paused, never removed");
  assert.equal(w.stopOne, "To stop writing to one business, open its lead and press Stop writing to them.");
  const fresh = chainReportWordsOf(
    CHAIN,
    {
      steps: REPORT.steps.map((s) => ({ ...s, written: 0, delivered: 0, wrote_back: 0, said_no: 0, bounced: 0 })),
      runs: [],
      can_remove: true,
    },
    REACH,
    { host: null, share: 30 },
  );
  assert.equal(fresh.canRemove, true);
  assert.equal(fresh.sentence, "30 a day, one every 12 minutes in each business's hours. 0 written.");
});

test("Templates says an email row is a reach-out's, and that a reach-out sends email only (R19)", () => {
  assert.deepEqual(emailTemplateWords({ chainName: "Reach out · Personal trainers", stepN: 1, afterDays: 4 }), {
    chip: "Email",
    sends: "Reach out · Personal trainers",
    sendsNote: "step 2 · after 4 days with nothing back",
    versionsNote: "a reach-out sends email only",
    checkNote:
      "Checked before each send: every slot filled or the email held; the opening's facts in the finder's record; under 120 words; the footer present; the language theirs.",
    foot: "Email · made here · your own words, no review",
    edit: "Edit in its reach-out",
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

test("the chain row's own words: its pace from its domains, its path, the held with their run, its slots as parts (PR 8)", () => {
  const { chainPaceOf, chainPathWords, chainReportWordsOf: report, slotParts, REACH_OUT_ROW_WORDS } = contracts;
  assert.deepEqual(chainPaceOf({ domains: [{ host: "a.example", sent_days: 0 }] }), { host: "a.example", share: 30 });
  assert.deepEqual(
    chainPaceOf({
      domains: [
        { host: "a.example", sent_days: 20 },
        { host: "b.example", sent_days: 40 },
      ],
    }),
    { host: null, share: 300 },
    "two domains: their days summed, no one host",
  );
  assert.deepEqual(chainPaceOf({ domains: [] }), { host: null, share: 0 });
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
  assert.deepEqual(report(CHAIN, held, REACH, { host: null, share: 30 }).waiting, {
    text: "3 wait for your say",
    run_id: "b3",
  });
  assert.equal(report(CHAIN, REPORT, REACH, { host: null, share: 30 }).waiting, null);
  assert.match(
    report(CHAIN, REPORT, REACH, { host: null, share: 0 }).sentence,
    /^Add a domain you send from in Settings › Connections › Email first\. 72 written/,
    "no domain: never a pace of 0 a day",
  );
  assert.deepEqual(slotParts("Hi {{ Business }}, {{opening}}!"), [
    { text: "Hi ", slot: false },
    { text: "business", slot: true },
    { text: ", ", slot: false },
    { text: "opening", slot: true },
    { text: "!", slot: false },
  ]);
  assert.equal(REACH_OUT_ROW_WORDS.paused("Movers"), "Movers is paused — nothing more is planned until you resume it");
});
