/**
 * A chain's hand step, in the sheet's words (Reach out Part 5, PR 11; G20): contracts' draft, checks and report over
 * made-up chains. A call or a note is offered after any email and ends the chain; its body carries its hand and an
 * email's carries none, since the door reads the key (00228); its problems are said at its words; its label is its kind;
 * and the open row reads what it handed as "handed to you", never as written.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REACH_OUT_REFUSALS,
  isReachOutRefusal,
  reachOutDraftOf,
  reachOutAddStep,
  reachOutAddHandStep,
  reachOutSetHandWords,
  reachOutMayAddStep,
  reachOutChainBodyOf,
  reachOutDraftIssues,
  validateReachOutChain,
  chainIssueWords,
  chainHintOf,
  chainPathWords,
  chainReportWordsOf,
  stepLabelOf,
  ReachOutChainSchema,
  HAND_WORDS_MAX,
} from "@chanlytics/contracts";

const SEARCH_ID = "44444444-4444-4444-8444-444444444444";
const draft = () => reachOutDraftOf({ chain: null, searchName: "Movers · Austin", signedBy: "Sam" });

test("a call or a note is offered after any email, ends the chain, and saves with its hand alone", () => {
  let d = reachOutAddStep(draft());
  d = reachOutAddHandStep(d, "call");
  assert.equal(d.steps.length, 3);
  assert.deepEqual(d.steps[2].hand, { kind: "call", words: "" });
  assert.equal(d.steps[2].after_days, 4);
  assert.equal(reachOutMayAddStep(d), false, "nothing after a call or a note");
  assert.equal(reachOutAddStep(d), d);
  assert.equal(reachOutAddHandStep(d, "note"), d);
  d = reachOutSetHandWords(d, 2, "Ask whether our quote suited them");
  assert.equal(reachOutSetHandWords(d, 0, "x"), d, "an email has no hand to write");
  const body = reachOutChainBodyOf(d, SEARCH_ID);
  assert.equal(ReachOutChainSchema.safeParse(body).success, true);
  assert.deepEqual(
    body.steps.map((s) => "hand" in s),
    [false, false, true],
    "the door reads a step with the key as a call or a note",
  );
  assert.deepEqual(body.steps[2], {
    subject: null,
    body: "",
    after_days: 4,
    hand: { kind: "call", words: "Ask whether our quote suited them" },
  });
  assert.equal(reachOutDraftIssues(d, { bookingLink: false }).ready, true);
});

test("its problems are said at its words: nothing to do, too long, and anywhere but last", () => {
  const d = reachOutAddHandStep(draft(), "note");
  const empty = reachOutDraftIssues(d, { bookingLink: false });
  assert.equal(empty.ready, false);
  assert.deepEqual(empty.steps[1].body, ["Say what to do when they come up."]);
  const long = reachOutDraftIssues(reachOutSetHandWords(d, 1, "x".repeat(HAND_WORDS_MAX + 1)), { bookingLink: false });
  assert.deepEqual(long.steps[1].body, [`Keep it under ${HAND_WORDS_MAX} characters.`]);
  // A body the sheet cannot make, as a route would meet it: a call first, or before an email.
  const hand = { kind: "call", words: "ring them" };
  const early = {
    ...reachOutChainBodyOf(draft(), SEARCH_ID),
    steps: [
      { subject: "Hi", body: "Hello there", after_days: null },
      { subject: null, body: "", after_days: 4, hand },
      { subject: null, body: "Just checking in.", after_days: 4 },
    ],
  };
  const issues = validateReachOutChain(early, { bookingLink: false });
  assert.deepEqual(
    issues.map((i) => [i.step, i.problem]),
    [[1, "hand_not_last"]],
  );
  assert.equal(chainIssueWords(issues[0]), "A call or a note ends the chain.");
  // A call's words name no slot a chain must have: {{your name}} there asks for no signature.
  const signed = {
    ...early,
    signed_by: null,
    steps: [early.steps[0], { ...early.steps[1], hand: { kind: "note", words: "tell {{your name}}" } }],
  };
  assert.deepEqual(validateReachOutChain(signed, { bookingLink: false }), []);
});

test("the door's two sentences are the sheet's refusals", () => {
  assert.equal(REACH_OUT_REFUSALS.handLast, "A call or a note ends the chain.");
  assert.equal(REACH_OUT_REFUSALS.stepRan, "That step has run already. Add a new step instead.");
  assert.equal(isReachOutRefusal(REACH_OUT_REFUSALS.handLast), true);
  assert.equal(isReachOutRefusal(REACH_OUT_REFUSALS.stepRan), true);
});

const CHAIN = {
  root_id: "r",
  name: "Reach out · Movers",
  search: { id: "s", name: "Movers · Austin" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  created_at: "2026-09-20T00:00:00Z",
  next: { run_hour: 9, last_run_for: "2026-10-05", mode: "ask", may_spend: true, waiting_run_id: null },
  steps: [
    { id: "r", n: 0, after_days: null, subject: "S", body: "B", template_id: "t", hand: null, state: "running" },
    {
      id: "h",
      n: 1,
      after_days: 5,
      subject: null,
      body: "",
      template_id: null,
      hand: { kind: "call", words: "ask about the move" },
      state: "running",
    },
  ],
};
const REPORT = {
  steps: [
    {
      id: "r",
      n: 0,
      written: 40,
      delivered: 40,
      wrote_back: 4,
      said_no: 2,
      bounced: 0,
      waiting: 0,
      held: 0,
      handed: 0,
    },
    { id: "h", n: 1, written: 0, delivered: 0, wrote_back: 0, said_no: 0, bounced: 0, waiting: 0, held: 0, handed: 9 },
  ],
  runs: [
    { id: "b1", step_id: "r", run_for: "2026-09-30", state: "sent", planned: 40, written: 40, held: 0, handed: 0 },
    { id: "b2", step_id: "h", run_for: "2026-10-05", state: "sent", planned: 9, written: 0, held: 0, handed: 9 },
  ],
  can_remove: false,
};
const REACH = { ready: 0, with_unconfirmed: 0, phone_only: 0, of: 60, chain: "r" };

test("the open row reads a call by its kind and what it handed as handed to you", () => {
  assert.equal(stepLabelOf({ n: 1, hand: { kind: "call" } }), "A call for you");
  assert.equal(stepLabelOf({ n: 3, hand: { kind: "note" } }), "A note for you");
  assert.equal(stepLabelOf({ n: 1, hand: null }), "A short nudge");
  assert.equal(chainHintOf(CHAIN, null), "Your email, a call for you");
  assert.deepEqual(
    chainPathWords(CHAIN).steps.map((s) => s.label),
    ["Your email", "A call for you"],
  );
  const w = chainReportWordsOf(CHAIN, REPORT, REACH, { host: "mail.example", share: 30 });
  assert.deepEqual(w.table[1], [
    "A call for you",
    "After 5 days with nothing back",
    "9 handed to you",
    "—",
    "—",
    "—",
    "—",
  ]);
  assert.deepEqual(w.table[0].slice(0, 3), ["Your email", "Day one, in their hours", "40"]);
  assert.match(w.sentence, /40 written; 9 handed to you; 4 wrote back/);
  assert.deepEqual(
    w.history.map((h) => h.text),
    ["Sep 30 · 40 written", "Oct 5 · 9 handed to you"],
  );
  // A report from before 00228 has no handed at all: nothing is said of it.
  const before = {
    ...REPORT,
    steps: REPORT.steps.map(({ handed: _handed, ...s }) => s),
    runs: REPORT.runs.slice(0, 1),
  };
  assert.doesNotMatch(chainReportWordsOf(CHAIN, before, REACH, { host: null, share: 30 }).sentence, /handed/);
});
