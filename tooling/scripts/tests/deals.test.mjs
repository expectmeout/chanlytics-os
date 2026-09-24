/**
 * A deal is a record (0004), and a proposal is part of it (0008): the words,
 * the line each page says, the proposal's link, value, day and
 * reason, the switch the whole layer hangs on, the sentence the receptionist
 * hears, the leak's rule, the report's cohort. Executed, never read from source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const {
  DEAL_STAGES,
  DEAL_STAGE_WORDS,
  DEAL_LINE_NONE,
  dealOf,
  dealFactsOf,
  pickCurrentDeal,
  amountWords,
  dealSentence,
  proposalsWaiting,
  waitingOnProposal,
  dealPaceOf,
  dealPaceWords,
  waitAfterDays,
  PACE_AFTER_YESES,
  dealPaceFrom,
  isYes,
  medianWait,
  yesWaits,
  yesWaitWords,
  WAITING_AFTER_DAYS,
  consultationsWithoutProposal,
  CONSULT_FOLLOW_DAYS,
  dealsAreOn,
  isSellsBy,
  SELLS_BY,
  SELLS_BY_QUESTION,
  SELLS_BY_WORDS,
  SELLS_BY_REFUSAL,
  SELLS_BY_FIRST,
  CONSULT_FIRST_DEAL_HINT,
  sellsByVM,
  sellsBySaved,
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_CLEARABLE,
  parseAmount,
  amountTotalsWords,
  proposalLinkOf,
  isConsultationTitle,
  consultServiceOf,
  consultsHeldWords,
  dealIsOpen,
  noProposalSince,
  toDealReportVM,
  PERSON_CAME_FROM_WORDS,
  DEAL_REFUSALS,
  stateOf,
} = contracts;

const TZ = "America/New_York";
const NOW = Date.parse("2026-09-23T16:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

const cols = (over = {}) => ({
  deal_id: "d1",
  deal_stage: "proposed",
  deal_service: "Ad management",
  deal_proposed_at: daysAgo(11),
  deal_decided_at: null,
  deal_ended_at: null,
  deal_amount_cents: null,
  deal_per: null,
  ...over,
});

/** A People row as the database gives it (people_list), the least a person can be. */
const personRow = (over = {}) => ({
  id: "p1",
  display_name: "Maria",
  wa_profile_name: null,
  phone_e164: "+15550001111",
  email: null,
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: daysAgo(20),
  dnc: false,
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
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
  latest_wa_inbound_at: daysAgo(1),
  last_message_at: daysAgo(1),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Sounds good",
  last_inbound_at: daysAgo(1),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: daysAgo(40),
  earliest_row_at: daysAgo(40),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

test("the four stages and their words", () => {
  assert.deepEqual([...DEAL_STAGES], ["proposed", "won", "lost", "ended"]);
  assert.deepEqual(DEAL_STAGE_WORDS, { proposed: "Proposal out", won: "Client", lost: "Passed", ended: "Ended" });
  assert.equal(DEAL_LINE_NONE, "No proposal yet");
  assert.equal(stateOf("deal", "won").label, "Client", "the pill wears the same word");
  assert.equal(stateOf("deal", "proposed").tone, "info");
});

test("the row's columns become one view model: the line, the brief, the waiting days", () => {
  const d = dealOf(cols(), TZ, NOW);
  assert.equal(d.stage, "proposed");
  assert.equal(d.word, "Proposal out");
  assert.equal(d.service, "Ad management");
  assert.equal(d.waitingDays, 11);
  assert.equal(d.said, "Proposal out · since Sep 12");
  assert.equal(d.line, "Ad management · Proposal out · since Sep 12");
  assert.equal(d.facts, "Ad management · since Sep 12", "the card's row says the word, and this under it");
  assert.equal(d.brief, "Proposal out · 11 d");
  assert.equal(dealOf({ deal_stage: null }, TZ, NOW), null, "no columns, no deal");
  assert.equal(dealOf({ deal_stage: "banana" }, TZ, NOW), null, "an unknown stage is not a deal");
});

test("every stage says its amount: a proposal's value and a client's agreed amount; a pass and an end say when", () => {
  const won = dealOf(
    cols({ deal_stage: "won", deal_decided_at: daysAgo(3), deal_amount_cents: 250_000, deal_per: "month" }),
    TZ,
    NOW,
  );
  assert.equal(won.said, "Client · since Sep 20 · $2,500 a month");
  assert.equal(won.facts, "Ad management · since Sep 20 · $2,500 a month");
  assert.equal(won.brief, "Client · Ad management");
  assert.equal(won.waitingDays, null);
  const once = dealOf(
    cols({ deal_stage: "won", deal_decided_at: daysAgo(3), deal_amount_cents: 99_950, deal_per: "once" }),
    TZ,
    NOW,
  );
  assert.equal(once.amount, "$999.50");
  const lost = dealOf(cols({ deal_stage: "lost", deal_decided_at: daysAgo(1) }), TZ, NOW);
  assert.equal(lost.said, "Passed · since Sep 22");
  assert.equal(lost.brief, null, "the chip falls back to the visit");
  const ended = dealOf(cols({ deal_stage: "ended", deal_ended_at: daysAgo(0) }), TZ, NOW);
  assert.equal(ended.said, "Ended · since Sep 23");
  // Flipped on purpose (0008): a proposal carries a value, the door stored it since 00156, and the page now says it at
  // every stage. "An amount is a client's fact" was 0004's rule, and 0008 amends it.
  const proposedWithAmount = dealOf(cols({ deal_amount_cents: 120_000, deal_per: "once" }), TZ, NOW);
  assert.equal(proposedWithAmount.amount, "$1,200", "a proposal's value is said");
  assert.equal(proposedWithAmount.said, "Proposal out · since Sep 12 · $1,200");
  assert.equal(proposedWithAmount.facts, "Ad management · since Sep 12 · $1,200");
  assert.equal(proposedWithAmount.brief, "Proposal out · 11 d", "the chip stays the stage and the wait");
  assert.equal(dealOf(cols(), TZ, NOW).amount, null, "and nothing without one");
  const passedWithValue = dealOf(
    cols({ deal_stage: "lost", deal_decided_at: daysAgo(1), deal_amount_cents: 99_900 }),
    TZ,
    NOW,
  );
  assert.equal(passedWithValue.said, "Passed · since Sep 22 · $999");
  assert.equal(amountWords(null, "month"), null);
  assert.equal(amountWords(120_000, "year"), "$1,200 a year");
});

test("which of a person's deals the page shows: open or current first, then the newest", () => {
  const rows = [
    { id: "a", stage: "lost", created_at: daysAgo(1) },
    { id: "b", stage: "won", created_at: daysAgo(30) },
    { id: "c", stage: "ended", created_at: daysAgo(0) },
  ];
  assert.equal(pickCurrentDeal(rows).id, "b");
  assert.equal(pickCurrentDeal(rows.filter((r) => r.id !== "b")).id, "c");
  assert.equal(pickCurrentDeal([]), null);
  assert.deepEqual(dealFactsOf(cols()), {
    stage: "proposed",
    service: "Ad management",
    proposed_at: cols().deal_proposed_at,
    decided_at: null,
    ended_at: null,
    amount_cents: null,
    per: null,
    proposal_url: null,
    valid_until: null,
    lost_reason: null,
  });
});

test("a proposal's link and the day it stands until, and why someone passed: each only where the stage has one", () => {
  const url = "https://docs.example.com/p/maria";
  const out = dealOf(cols({ deal_proposal_url: url, deal_valid_until: "2026-09-30" }), TZ, NOW);
  assert.deepEqual(out.proposal, { url, host: "docs.example.com" });
  assert.deepEqual(out.validUntil, { day: "2026-09-30", date: "Sep 30", words: "Valid until Sep 30", lapsed: false });
  assert.equal(out.reason, null);
  // The day it stands is still a day it stands: lapsed only once it has passed, by the business's calendar. At 11 PM
  // in New York on the 22nd it is already the 23rd in UTC, and the proposal still stands.
  const lateOn22 = Date.parse("2026-09-23T03:00:00Z");
  assert.equal(dealOf(cols({ deal_valid_until: "2026-09-22" }), TZ, lateOn22).validUntil.lapsed, false);
  const lapsed = dealOf(cols({ deal_valid_until: "2026-09-20" }), TZ, NOW).validUntil;
  assert.deepEqual(lapsed, { day: "2026-09-20", date: "Sep 20", words: "Lapsed Sep 20", lapsed: true });
  assert.equal(dealOf(cols({ deal_valid_until: "2026-09-23" }), TZ, NOW).validUntil.lapsed, false, "today stands");
  assert.equal(dealOf(cols({ deal_valid_until: "2027-01-15" }), TZ, NOW).validUntil.words, "Valid until Jan 15, 2027");
  assert.equal(dealOf(cols({ deal_valid_until: "2026-02-31" }), TZ, NOW).validUntil, null, "not a day, not said");
  // A client's day and link are history: the day is a proposal's only; the link stays the deal's own.
  const won = dealOf(
    cols({ deal_stage: "won", deal_decided_at: daysAgo(1), deal_valid_until: "2026-09-30", deal_proposal_url: url }),
    TZ,
    NOW,
  );
  assert.equal(won.validUntil, null);
  assert.equal(won.proposal.host, "docs.example.com");
  const passed = dealOf(cols({ deal_stage: "lost", deal_decided_at: daysAgo(1), deal_lost_reason: "price" }), TZ, NOW);
  assert.deepEqual(passed.reason, { code: "price", words: "Price" });
  assert.equal(dealOf(cols({ deal_lost_reason: "price" }), TZ, NOW).reason, null, "a reason is a pass's only");
  assert.equal(
    dealOf(cols({ deal_stage: "lost", deal_decided_at: daysAgo(1), deal_lost_reason: "banana" }), TZ, NOW).reason,
    null,
  );
  assert.deepEqual([...DEAL_LOST_REASONS], ["price", "timing", "elsewhere", "no_reply", "not_a_fit", "other"]);
  assert.deepEqual(DEAL_LOST_REASON_WORDS, {
    price: "Price",
    timing: "Timing",
    elsewhere: "Went elsewhere",
    no_reply: "No reply",
    not_a_fit: "Not a fit",
    other: "Other",
  });
  assert.deepEqual([...DEAL_CLEARABLE], ["proposal_url", "valid_until", "amount", "note"]);
});

test("the link a person has now: the deal's while it is a proposal out, none for any other deal, the person's only with no deal", () => {
  const deal = "https://docs.example.com/p/deal";
  const own = "https://docs.example.com/p/own";
  assert.equal(proposalLinkOf({ stage: "proposed", proposal_url: deal }, own), deal, "the deal's wins");
  assert.equal(proposalLinkOf({ stage: "proposed", proposal_url: null }, own), null, "a proposal without one has none");
  assert.equal(proposalLinkOf({ stage: "won", proposal_url: deal }, own), null, "a client is not sent a proposal");
  // Changed on purpose in review: a pass or an end is a deal too, so the person's own link no longer stands in for it.
  // Their link, if it was that deal's, is kept on it as history (00160's backfill); a new one opens a new proposal.
  assert.equal(proposalLinkOf({ stage: "lost", proposal_url: deal }, own), null, "they passed: none");
  assert.equal(proposalLinkOf({ stage: "ended", proposal_url: null }, `  ${own} `), null, "it ended: none");
  assert.equal(proposalLinkOf(null, own), own, "no deal at all: the person's own");
  assert.equal(proposalLinkOf(null, `  ${own} `), own);
  assert.equal(proposalLinkOf(null, "   "), null);
  assert.equal(proposalLinkOf(undefined, null), null);
  // The deal as a view model says it (DealVM.proposal) reads the same as the row's column.
  const vm = dealOf(cols({ deal_proposal_url: deal }), TZ, NOW);
  assert.equal(proposalLinkOf(vm, own), deal);
  assert.equal(proposalLinkOf({ ...vm, proposal: null }, own), null);
  assert.equal(proposalLinkOf(dealOf(cols({ deal_stage: "lost", deal_decided_at: daysAgo(1) }), TZ, NOW), own), null);
});

test("what a person typed as an amount: the page's own rules, moved here whole", () => {
  assert.equal(parseAmount("2,500"), 250_000);
  assert.equal(parseAmount("$999.50"), 99_950);
  assert.equal(parseAmount(" 1200 "), 120_000);
  assert.equal(parseAmount("0"), 0);
  assert.equal(parseAmount("-5"), null, "the minus survives the strip: -5 is not five dollars");
  assert.equal(parseAmount("abc"), null, "letters alone strip to nothing, which is not $0");
  assert.equal(parseAmount("1.2.3"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(undefined), null);
});

test("what a set of deals is worth: summed by how each recurs, joined, and nothing where nothing has an amount", () => {
  assert.equal(
    amountTotalsWords([
      { amount_cents: 400_000, per: "once" },
      { amount_cents: 60_000, per: "month" },
      { amount_cents: 25_000, per: null },
      { amount_cents: null, per: "month" },
    ]),
    "$4,250 + $600 a month",
  );
  assert.equal(
    amountTotalsWords([
      { amount_cents: 120_000, per: "year" },
      { amount_cents: 10_000, per: "month" },
      { amount_cents: 5_000, per: "month" },
    ]),
    "$150 a month + $1,200 a year",
    "once, then a month, then a year",
  );
  assert.equal(amountTotalsWords([{ amount_cents: 99_950, per: "once" }]), "$999.50");
  assert.equal(amountTotalsWords([{ amount_cents: null }, {}]), null);
  assert.equal(amountTotalsWords([]), null);
});

test("the receptionist hears one sentence per stage, never an amount, and nothing without a deal", () => {
  assert.equal(dealSentence(null, NOW), null);
  const won = dealSentence(
    {
      stage: "won",
      service: "Ad management",
      proposed_at: daysAgo(20),
      decided_at: daysAgo(3),
      ended_at: null,
      amount_cents: 250_000,
      per: "month",
    },
    NOW,
    TZ,
  );
  assert.match(won, /^They are a client \(Ad management\), since Sep 20\./);
  assert.match(won, /Offer them the service itself, not a consultation/);
  assert.match(won, /goes to a person/);
  assert.doesNotMatch(won, /2,500|2500|\$/, "never a digit of the amount");
  const proposed = dealSentence(
    { stage: "proposed", service: null, proposed_at: daysAgo(11), decided_at: null, ended_at: null },
    NOW,
    TZ,
  );
  assert.match(proposed, /^A proposal went out to them on Sep 12 and is waiting on their answer\./);
  assert.match(proposed, /Never discuss its price\./);
  const withLink = dealSentence(
    { stage: "proposed", service: null, proposed_at: daysAgo(11), decided_at: null, ended_at: null },
    NOW,
    TZ,
    { hasLink: true },
  );
  assert.match(withLink, /send them the proposal link/);
  assert.doesNotMatch(withLink, /will follow up/);
  const lost = dealSentence(
    { stage: "lost", service: "SEO", proposed_at: daysAgo(11), decided_at: daysAgo(2), ended_at: null },
    NOW,
    TZ,
  );
  assert.match(lost, /^They passed on a proposal \(SEO\) on Sep 21\. Do not bring it up/);
  const ended = dealSentence(
    { stage: "ended", service: null, proposed_at: daysAgo(90), decided_at: daysAgo(80), ended_at: daysAgo(1) },
    NOW,
    TZ,
  );
  assert.match(ended, /^A former client: the engagement ended on Sep 22\./);
});

test("proposals waiting: out past a week with nothing back since", () => {
  const row = (id, days, askedDaysAgo) => ({
    id,
    deal: dealOf(cols({ deal_id: id, deal_proposed_at: daysAgo(days) }), TZ, NOW),
    askedMs: askedDaysAgo === null ? null : NOW - askedDaysAgo * 86_400_000,
  });
  const waiting = proposalsWaiting(
    [
      row("old-quiet", 11, 20), // asked before the proposal: waiting
      row("old-answered", 11, 2), // wrote back after it: not waiting
      row("fresh", 3, 20), // under a week
      row("never-asked", 9, null), // nothing back at all: waiting
      { id: "client", deal: dealOf(cols({ deal_stage: "won", deal_decided_at: daysAgo(1) }), TZ, NOW), askedMs: null },
      { id: "none", deal: null, askedMs: null },
    ],
    NOW,
    null,
  ).map((r) => r.id);
  assert.deepEqual(waiting, ["old-quiet", "never-asked"]);
  // The one rule, one row at a time: what Today's leak filters with and the Pipeline will ask.
  assert.equal(waitingOnProposal(row("x", 11, 20), NOW, null), true);
  assert.equal(waitingOnProposal(row("x", 11, 2), NOW, null), false);
  assert.equal(waitingOnProposal({ deal: null, askedMs: null }, NOW, null), false);
});

test("consultations with no proposal after them: ended in the last week, and nothing open since", () => {
  const H = 3_600_000;
  const at = (daysBack) => NOW - daysBack * 86_400_000;
  const row = (id, consulted, deal = null) => ({ id, consultedMs: consulted, deal });
  const closed = (stage, sinceDaysBack) => ({ stage, sinceMs: at(sinceDaysBack) });
  const picked = consultationsWithoutProposal(
    [
      row("yesterday", at(1)), // held yesterday, nothing since: the next step
      row("a-week", at(CONSULT_FOLLOW_DAYS) + H), // just inside the week
      row("too-old", at(CONSULT_FOLLOW_DAYS) - H), // just outside it
      row("ahead", NOW + H), // not over yet
      row("never", null), // no consultation
      row("proposed", at(2), closed("proposed", 1)), // a proposal went out
      row("client", at(2), closed("won", 1)), // an engagement runs
      row("passed-before", at(2), closed("lost", 30)), // passed on an old one, then consulted again
      row("passed-after", at(2), closed("lost", 1)), // consulted, then passed: nothing left to send
      row("ended-before", at(3), closed("ended", 60)),
    ],
    NOW,
  ).map((r) => r.id);
  // The oldest first: the order the Pipeline lists them in, and Today names the first two of.
  assert.deepEqual(picked, ["a-week", "ended-before", "passed-before", "yesterday"]);
  assert.equal(CONSULT_FOLLOW_DAYS, 7);
  // A tie goes by name, then id; a row without a number for its consultation has none to follow, and never throws.
  const tied = consultationsWithoutProposal(
    [
      { id: "b2", name: "Bea", consultedMs: at(2), deal: null },
      { id: "c1", name: "Cora", consultedMs: at(2), deal: null },
      { id: "b1", name: "Bea", consultedMs: at(2), deal: null },
      { id: "u", name: "Una", consultedMs: undefined, deal: null },
      { id: "n", name: "Nan", consultedMs: Number.NaN, deal: null },
      { id: "s", name: "Sal", consultedMs: String(at(2)), deal: null },
    ],
    NOW,
  ).map((r) => r.id);
  assert.deepEqual(tied, ["b1", "b2", "c1"]);
});

test("the step not taken is one rule: nothing on file, or a pass or an end before the consultation ended", () => {
  const END = NOW - 2 * 86_400_000;
  const deal = (stage, sinceMs) => ({ stage, sinceMs });
  assert.equal(noProposalSince(null, END), true, "nothing on file");
  assert.equal(noProposalSince(undefined, END), true);
  assert.equal(noProposalSince(deal("proposed", END - 1), END), false, "an open proposal has had one");
  assert.equal(noProposalSince(deal("won", END - 1), END), false, "and so has a client");
  assert.equal(noProposalSince(deal("lost", END - 1), END), true, "passed before it: the consultation began again");
  assert.equal(noProposalSince(deal("ended", END - 1), END), true);
  assert.equal(noProposalSince(deal("lost", END), END), false, "a pass as it ended answered it");
  assert.equal(noProposalSince(deal("lost", END + 1), END), false, "and so did one after it");
  assert.equal(noProposalSince(deal("ended", END + 1), END), false);
  assert.equal(noProposalSince(deal("lost", null), END), false, "a close with no day says nothing it can count");
});

test("deals are on exactly where the workspace says some customers get a proposal first, and nothing else switches them", () => {
  assert.equal(dealsAreOn("proposal"), true);
  assert.equal(dealsAreOn("booking"), false);
  assert.equal(dealsAreOn(null), false, "not asked yet: off, as a workspace that books");
  assert.equal(dealsAreOn(undefined), false);
  assert.equal(dealsAreOn("Proposal"), false);
  assert.deepEqual([...SELLS_BY], ["booking", "proposal"]);
  assert.equal(isSellsBy("booking"), true);
  assert.equal(isSellsBy("banana"), false);
  assert.equal(SELLS_BY_QUESTION, "How customers buy");
  assert.deepEqual(SELLS_BY_WORDS, {
    booking: { label: "They book an appointment", sentence: "Bookings, reminders and the booking link." },
    proposal: {
      label: "Some get a proposal first",
      sentence: "Adds deals: a proposal on each person, a Pipeline in People, and a Deals section in Reports.",
    },
  });
  // The refusal is a literal, so the bundles that never say it drop it; this holds it to the question and the labels.
  assert.equal(
    SELLS_BY_REFUSAL,
    `${SELLS_BY_QUESTION}: ${SELLS_BY_WORDS.booking.label.toLowerCase()}, or ${SELLS_BY_WORDS.proposal.label.toLowerCase()}.`,
  );
  assert.equal(contracts.dealsAreAThing, undefined, "the old gate is gone, not kept beside the new one");
});

test("Settings › Business says the answer as a row, offers the two as a choice, and says what it switches", () => {
  // Never asked: the row is empty, its act chooses, and nothing of a deal is said on the page.
  const unsaid = sellsByVM(null);
  assert.deepEqual(
    [unsaid.question, unsaid.value, unsaid.empty, unsaid.act, unsaid.name],
    ["How customers buy", null, "Not said yet", "Choose one", "Choose how customers buy"],
  );
  assert.equal(unsaid.question, SELLS_BY_QUESTION, "the row's label is the question, once");
  assert.deepEqual([unsaid.dealsOn, unsaid.consultHint], [false, null]);
  // The choice: both answers, in the set's order, each with its label and what choosing it means, and nothing else.
  assert.deepEqual(unsaid.choices, [
    { value: "booking", label: "They book an appointment", hint: "Bookings, reminders and the booking link." },
    {
      value: "proposal",
      label: "Some get a proposal first",
      hint: "Adds deals: a proposal on each person, a Pipeline in People, and a Deals section in Reports.",
    },
  ]);
  assert.deepEqual(
    unsaid.choices.map((c) => [c.value, c.label, c.hint]),
    SELLS_BY.map((a) => [a, SELLS_BY_WORDS[a].label, SELLS_BY_WORDS[a].sentence]),
    "the words are SELLS_BY_WORDS', not a copy of them",
  );
  assert.equal(unsaid.refusal, SELLS_BY_REFUSAL, "a Save with neither chosen is refused in the route's own words");
  // What the create card has chosen before anyone presses: they book an appointment.
  assert.equal(SELLS_BY_FIRST, "booking");
  assert.equal(unsaid.first, SELLS_BY_FIRST);

  // They book: the answer's label, an act that changes it, and still no deal.
  const books = sellsByVM("booking");
  assert.deepEqual(
    [books.value, books.act, books.name, books.first, books.dealsOn, books.consultHint],
    ["They book an appointment", "Change", "Change how customers buy", "booking", false, null],
  );
  // Some get a proposal first: deals are on, and a consult-first service is where a deal starts.
  const proposes = sellsByVM("proposal");
  assert.deepEqual(
    [proposes.value, proposes.act, proposes.first, proposes.dealsOn, proposes.consultHint],
    ["Some get a proposal first", "Change", "proposal", true, "A consultation for these is the first step of a deal."],
  );
  assert.equal(proposes.consultHint, CONSULT_FIRST_DEAL_HINT);
  // Anything but the two answers is never said: the row is empty, and deals are off, as dealsAreOn reads it.
  for (const odd of [undefined, "", "Proposal", "banana", 7]) {
    const vm = sellsByVM(odd);
    assert.deepEqual([vm.value, vm.act, vm.first, vm.dealsOn], [null, "Choose one", "booking", false], String(odd));
  }
});

test("the toast once an answer is saved says what it switched, and that deals turned off are kept", () => {
  assert.equal(sellsBySaved(null, "proposal"), "Saved — deals are on.");
  assert.equal(sellsBySaved("booking", "proposal"), "Saved — deals are on.");
  assert.equal(
    sellsBySaved("proposal", "booking"),
    "Saved — deals are off. Any already recorded are kept.",
    "every surface hides them, and the other answer brings them back (0008)",
  );
  assert.equal(sellsBySaved(null, "booking"), "Saved — customers book an appointment.", "nothing was on to go off");
  assert.equal(sellsBySaved(undefined, "booking"), "Saved — customers book an appointment.");
});

test("a visit is a consultation when its title says consult, or names a consult-first service", () => {
  const services = [{ name: "Ad management" }, { name: "Discovery call" }, { name: "Haircut" }];
  const rules = { consult_first: ["Ad management"] };
  assert.equal(isConsultationTitle("Discovery consult — Maria", services, rules), true);
  assert.equal(isConsultationTitle("Ad Management: Maria R.", services, rules), true);
  assert.equal(isConsultationTitle("Haircut — Maria", services, rules), false);
  assert.equal(isConsultationTitle(null, services, rules), false);
  assert.equal(isConsultationTitle("Ad management", undefined, undefined), false);
});

test("the consult-first service a title names is the one Settings spells, the longest that fits, and a consultation is that or the word itself", () => {
  const services = [
    { name: "Remodel" },
    { name: "Kitchen remodel" },
    { name: "Diseño de cocina " },
    { name: "Logo design" },
    { name: "Ad management" },
  ];
  const rules = { consult_first: ["Remodel", "Kitchen remodel", "diseño de cocina", "Ad management"] };
  assert.equal(consultServiceOf("Kitchen Remodel consult · Maria", services, rules), "Kitchen remodel", "the longest");
  assert.equal(consultServiceOf("Remodel walkthrough", services, rules), "Remodel");
  assert.equal(
    consultServiceOf("Diseno de cocina — Maria", services, rules),
    "Diseño de cocina",
    "accents, case and spaces are not the name; Settings' spelling is what comes back",
  );
  assert.equal(consultServiceOf("Consultation · Maria", services, rules), null, "a consultation that names no service");
  assert.equal(consultServiceOf("Logo design — Maria", services, rules), null, "a service that is not consult-first");
  assert.equal(consultServiceOf("Kitchen remodel", services, { consult_first: [] }), null, "no rule, nothing first");
  assert.equal(consultServiceOf(null, services, rules), null);
  assert.equal(consultServiceOf("Kitchen remodel", undefined, rules), null);
  // One rule: a title is a consultation where it says so, or where it names a consult-first service.
  for (const title of [
    "Kitchen Remodel consult · Maria",
    "Remodel walkthrough",
    "Consultation · Maria",
    "Logo design — Maria",
    "Discovery call",
    "",
  ])
    assert.equal(
      isConsultationTitle(title, services, rules),
      /consult/i.test(title) || consultServiceOf(title, services, rules) !== null,
      title,
    );
});

test("a deal is open while it is a proposal out or a client; the current deal and the next step both read that", () => {
  assert.deepEqual(
    DEAL_STAGES.map((stage) => [stage, dealIsOpen({ stage })]),
    [
      ["proposed", true],
      ["won", true],
      ["lost", false],
      ["ended", false],
    ],
  );
  assert.equal(dealIsOpen(null), false);
  assert.equal(dealIsOpen(undefined), false);
  // The current deal is an open one before a newer closed one.
  const rows = [
    { id: "old-won", stage: "won", created_at: daysAgo(40) },
    { id: "new-lost", stage: "lost", created_at: daysAgo(2) },
  ];
  assert.equal(pickCurrentDeal(rows).id, "old-won");
  // The Pipeline's Consultations and Today's row say the count in this one sentence.
  assert.equal(consultsHeldWords(2), "2 held in the last week, no proposal yet");
  assert.equal(consultsHeldWords(1), "1 held in the last week, no proposal yet");
});

/** A report as the route answers it (dealReport, 0008), the least one can be: a deal on file, none sent, nothing open. */
const report = (over = {}) => ({
  any: true,
  sent: 0,
  won: 0,
  lost: 0,
  waiting: 0,
  clients: 0,
  monthly_cents: 0,
  median_days_to_yes: null,
  open: { count: 0, amounts: [] },
  sources: [],
  reasons: [],
  ...over,
});
const linesOf = (over) => toDealReportVM(report(over), "30 days").lines.map((l) => l.text);
const usd = (amount_cents, per) => ({ amount_cents, per, currency: "USD" });

test("the report counts one cohort and the stock, and is absent where no deal was ever recorded", () => {
  const absent = { present: false, headline: "", stock: "", outcomes: null, lines: [] };
  assert.deepEqual(toDealReportVM(null, "30 days"), absent);
  assert.deepEqual(toDealReportVM(report({ any: false }), "30 days"), absent);
  const vm = toDealReportVM(
    report({ sent: 5, won: 3, lost: 1, waiting: 1, clients: 4, monthly_cents: 750_000 }),
    "30 days",
  );
  assert.equal(vm.present, true);
  assert.equal(vm.headline, "5 proposals went out in the last 30 days.");
  assert.equal(vm.stock, "4 clients now · $7,500 a month.");
  const quiet = toDealReportVM(report({ clients: 1 }), "7 days");
  assert.equal(quiet.headline, "No proposals went out in the last 7 days.");
  assert.equal(quiet.stock, "1 client now.");
  const one = toDealReportVM(report({ sent: 1, won: 1, clients: 1 }), "7 days");
  assert.equal(one.headline, "1 proposal went out in the last 7 days.");
  assert.deepEqual(
    one.outcomes.rows.map((r) => [r.label, r.display]),
    [
      ["Became clients", "1  100%"],
      ["Still waiting", "0  0%"],
      ["Passed", "0  0%"],
    ],
  );
});

test("what became of the period's proposals, as bars out of the cohort's size: each outcome's count and share, a zero said, no bars where none went out", () => {
  assert.deepEqual(toDealReportVM(report({ sent: 5, won: 3, lost: 1, waiting: 1 }), "30 days").outcomes, {
    title: "What became of the proposals",
    max: 5,
    rows: [
      { id: "won", label: "Became clients", value: 3, display: "3  60%" },
      { id: "waiting", label: "Still waiting", value: 1, display: "1  20%" },
      { id: "lost", label: "Passed", value: 1, display: "1  20%" },
    ],
  });
  assert.deepEqual(
    toDealReportVM(report({ sent: 3, won: 1, waiting: 2 }), "7 days").outcomes.rows.map((r) => r.display),
    ["1  33%", "2  67%", "0  0%"],
  );
  assert.equal(toDealReportVM(report({ clients: 2 }), "30 days").outcomes, null, "none went out: no bars");
});

test("the lines, each only when it has something and in this order: how long a yes took, where the new clients came from, why people passed, what is still open", () => {
  const vm = toDealReportVM(
    report({
      sent: 7,
      won: 3,
      lost: 3,
      waiting: 1,
      clients: 3,
      median_days_to_yes: 9,
      open: { count: 3, amounts: [usd(120_000, "once"), usd(305_000, "once")] },
      sources: [
        { came_from: "lead", count: 2 },
        { came_from: "whatsapp", count: 1 },
      ],
      reasons: [
        { reason: "price", count: 2 },
        { reason: "timing", count: 1 },
      ],
    }),
    "30 days",
  );
  assert.deepEqual(vm.lines, [
    { id: "median", text: "Median 9 days to a yes." },
    { id: "sources", text: "2 of 3 new clients came from Leads." },
    { id: "reasons", text: "Price was the most common reason for passing, 2 of 3." },
    { id: "open", text: "$4,250 still open across 3 proposals." },
  ]);
  assert.deepEqual(
    toDealReportVM(report({ sent: 2, waiting: 2 }), "30 days").lines,
    [],
    "nothing more to say: no line",
  );
});

test("how long a yes took: the median in whole days, under a day said so, and one client's own wait, which is no median", () => {
  assert.deepEqual(linesOf({ won: 4, median_days_to_yes: 1 }), ["Median 1 day to a yes."]);
  assert.deepEqual(linesOf({ won: 4, median_days_to_yes: 0 }), ["Median under a day to a yes."]);
  assert.deepEqual(linesOf({ won: 1, median_days_to_yes: 12 }), ["12 days to a yes."]);
  assert.deepEqual(linesOf({ won: 1, median_days_to_yes: 0 }), ["Under a day to a yes."]);
  assert.deepEqual(linesOf({ won: 2, median_days_to_yes: null }), [], "no yes with a day: no line");
});

test("what is still open: every proposal out now, and what those carrying an amount add up to by how each recurs", () => {
  assert.deepEqual(linesOf({ open: { count: 3, amounts: [] } }), ["3 proposals still open."]);
  assert.deepEqual(linesOf({ open: { count: 1, amounts: [] } }), ["1 proposal still open."]);
  assert.deepEqual(linesOf({ open: { count: 1, amounts: [usd(120_000, "once")] } }), [
    "$1,200 still open in 1 proposal.",
  ]);
  // What was recorded is summed and the rest is not guessed at (0004): three open, two carrying an amount.
  assert.deepEqual(linesOf({ open: { count: 3, amounts: [usd(425_000, null), usd(60_000, "month")] } }), [
    "$4,250 + $600 a month still open across 3 proposals.",
  ]);
});

test("where the new clients came from: the source most of them share, said as a sentence for every source People knows", () => {
  const said = Object.keys(PERSON_CAME_FROM_WORDS).map(
    (came_from) => linesOf({ won: 3, sources: [{ came_from, count: 2 }] })[0],
  );
  assert.deepEqual(said, [
    "2 of 3 new clients came from WhatsApp.",
    "2 of 3 new clients came by text.",
    "2 of 3 new clients came by email.",
    "2 of 3 new clients came by phone.",
    "2 of 3 new clients came from your calendar.",
    "2 of 3 new clients were added by hand.",
    "2 of 3 new clients came from your imported history.",
    "2 of 3 new clients came from Leads.",
  ]);
  assert.deepEqual(linesOf({ won: 3, sources: [{ came_from: "manual", count: 1 }] }), [
    "1 of 3 new clients was added by hand.",
  ]);
  assert.deepEqual(linesOf({ won: 1, sources: [{ came_from: "call", count: 1 }] }), ["Your new client came by phone."]);
  const most = [
    { came_from: "sms", count: 1 },
    { came_from: "lead", count: 3 },
  ];
  assert.deepEqual(
    linesOf({ won: 5, sources: most }),
    ["3 of 5 new clients came from Leads."],
    "the most, whatever order",
  );
  assert.deepEqual(linesOf({ won: 2, sources: [{ came_from: "fax", count: 2 }] }), [], "a source it cannot say");
  assert.deepEqual(linesOf({ won: 2, sources: [] }), [], "nobody's source known");
});

test("why people passed: the reason most gave; no reason is not one, and those who gave none are said only where they could change the answer", () => {
  const passed = (lost, ...given) => linesOf({ lost, reasons: given.map(([reason, count]) => ({ reason, count })) });
  assert.deepEqual(passed(3, ["price", 2], ["timing", 1]), ["Price was the most common reason for passing, 2 of 3."]);
  // One who gave none cannot make timing's one reach price's three: not said.
  assert.deepEqual(passed(5, ["price", 3], ["timing", 1]), ["Price was the most common reason for passing, 3 of 5."]);
  // One who gave none could tie it, two could overturn it: said.
  assert.deepEqual(passed(4, ["price", 2], ["timing", 1]), [
    "Price was the most common reason for passing, 2 of 4; 1 gave no reason.",
  ]);
  assert.deepEqual(passed(5, ["price", 2], ["timing", 1]), [
    "Price was the most common reason for passing, 2 of 5; 2 gave no reason.",
  ]);
  // A tie at the top names every reason in it.
  assert.deepEqual(passed(2, ["price", 1], ["timing", 1]), [
    "Price and timing were the most common reasons for passing, 1 each of 2.",
  ]);
  assert.deepEqual(passed(3, ["price", 1], ["timing", 1]), [
    "Price and timing were the most common reasons for passing, 1 each of 3; 1 gave no reason.",
  ]);
  // One reason given: the only one, the one every pass gave, or one person's.
  assert.deepEqual(passed(3, ["elsewhere", 1]), ["Going elsewhere was the only reason given for passing, 1 of 3."]);
  assert.deepEqual(passed(2, ["not_a_fit", 2]), ["Not being a fit was the reason given for passing, 2 of 2."]);
  assert.deepEqual(passed(1, ["no_reply", 1]), ["No reply was the reason given for passing."]);
  assert.deepEqual(passed(3, ["other", 2], ["price", 1]), [
    "Something else was the most common reason for passing, 2 of 3.",
  ]);
  // Nobody gave one, or only a reason this build does not know: no line.
  assert.deepEqual(passed(3), []);
  assert.deepEqual(passed(2, ["moved", 2]), []);
});

test("every refusal the door can answer has a sentence", () => {
  for (const k of [
    "not_found",
    "bad_stage",
    "bad_per",
    "bad_amount",
    "note_too_long",
    "service_too_long",
    "bad_move",
    "already_open",
    "moved",
    "ended",
    "bad_link",
    "bad_reason",
    "bad_clear",
  ]) {
    assert.ok(DEAL_REFUSALS[k] && DEAL_REFUSALS[k].length > 8, k);
  }
  assert.equal(DEAL_REFUSALS.bad_link, "That is not a web address.", "00154's own words for the same refusal");
  assert.equal(
    DEAL_REFUSALS.bad_reason,
    "A reason for passing is price, timing, went elsewhere, no reply, not a fit or other.",
  );
  const said = Object.values(DEAL_LOST_REASON_WORDS).map((w) => w.toLowerCase());
  assert.equal(
    DEAL_REFUSALS.bad_reason,
    `A reason for passing is ${said.slice(0, -1).join(", ")} or ${said.at(-1)}.`,
    "the refusal names the reasons in their own words",
  );
  assert.equal(DEAL_REFUSALS.bad_clear, "Only the link, the valid-until day, the amount or the note can be emptied.");
});

test("a People row carries its deal, and none without the columns (an older database)", () => {
  const { toPersonRowVM } = contracts;
  assert.equal(toPersonRowVM(personRow(), TZ, new Date(NOW)).deal, null);
  const withDeal = toPersonRowVM(personRow(cols()), TZ, new Date(NOW)).deal;
  assert.equal(withDeal.stage, "proposed");
  assert.equal(withDeal.id, "d1");
});

/** The least a person's page reads (PersonDetailDto): the row and empty arrays; the person-honest test builds the full one. */
const detail = (over = {}) => ({
  row: personRow(),
  identities: [],
  conversations: [],
  calls: [],
  escalations: [],
  decisions: [],
  ...over,
});

test("a person's page lists their deals, says the current one among its facts, and puts each move on the timeline", () => {
  const { toPersonVM, filterTimeline, TIMELINE_FILTERS } = contracts;
  const d = detail({
    row: personRow(
      cols({ deal_stage: "won", deal_decided_at: daysAgo(3), deal_amount_cents: 250_000, deal_per: "month" }),
    ),
    deals: [
      {
        id: "d1",
        contact_id: "p1",
        service: "Ad management",
        stage: "won",
        proposed_at: daysAgo(20),
        decided_at: daysAgo(3),
        ended_at: null,
        amount_cents: 250_000,
        per: "month",
        currency: "USD",
        note: null,
        version: 2,
        created_at: daysAgo(20),
      },
      {
        id: "d0",
        contact_id: "p1",
        service: "SEO",
        stage: "lost",
        proposed_at: daysAgo(60),
        decided_at: daysAgo(50),
        ended_at: null,
        amount_cents: null,
        per: null,
        currency: "USD",
        note: null,
        version: 2,
        created_at: daysAgo(60),
      },
      {
        id: "d2",
        contact_id: "p1",
        service: "Audit",
        stage: "ended",
        proposed_at: daysAgo(200),
        decided_at: daysAgo(190),
        ended_at: daysAgo(10),
        amount_cents: 50_000,
        per: "once",
        currency: "USD",
        note: null,
        version: 3,
        created_at: daysAgo(200),
      },
    ],
    deals_on: true,
    services: ["Ad management", "SEO", "Discovery call"],
  });
  const vm = toPersonVM(d, TZ, new Date(NOW));
  assert.equal(vm.deal.version, 2, "the current deal carries its version for a move");
  assert.equal(vm.dealsOn, true);
  assert.deepEqual(vm.services, ["Ad management", "SEO", "Discovery call"]);
  assert.equal(vm.deals.length, 3);
  assert.equal(vm.deal.stage, "won");
  assert.equal(vm.deal.id, "d1", "open or current first: the ended engagement is not the one shown");
  assert.ok(vm.facts.some((f) => f.label === "Deal" && f.value === "Client" && /Ad management/.test(f.meta)));
  const texts = vm.timeline.filter((i) => i.kind === "deal").map((i) => i.text);
  assert.deepEqual(
    texts.sort(),
    [
      "Became a client · Ad management · $2,500 a month",
      "Passed · SEO",
      "Proposal out · Ad management",
      "Proposal out · SEO",
      "Proposal out · Audit",
      "Became a client · Audit · $500",
      "Ended · Audit",
    ].sort(),
  );
  assert.ok(TIMELINE_FILTERS.some((f) => f.id === "deals"));
  assert.deepEqual([...new Set(filterTimeline(vm.timeline, "deals").map((i) => i.kind))], ["deal"]);
  const none = toPersonVM(detail(), TZ, new Date(NOW));
  assert.equal(none.dealsOn, false);
  assert.deepEqual(none.deals, []);
  assert.ok(!none.facts.some((f) => f.label === "Deal"));
});

test("the timeline says a proposal's value on the line it belongs to, and why someone passed", () => {
  const { toPersonVM } = contracts;
  const deal = (over) => ({
    id: "d",
    contact_id: "p1",
    service: "Color correction",
    stage: "proposed",
    proposed_at: daysAgo(9),
    decided_at: null,
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version: 1,
    created_at: daysAgo(9),
    ...over,
  });
  const texts = (d) =>
    toPersonVM(detail({ deals: [d], deals_on: true }), TZ, new Date(NOW))
      .timeline.filter((i) => i.kind === "deal")
      .map((i) => i.text)
      .sort();
  assert.deepEqual(texts(deal({})), ["Proposal out · Color correction · $1,200"]);
  assert.deepEqual(texts(deal({ stage: "lost", decided_at: daysAgo(2), lost_reason: "price" })), [
    "Passed · Color correction · Price",
    "Proposal out · Color correction · $1,200",
  ]);
  assert.deepEqual(texts(deal({ stage: "lost", decided_at: daysAgo(2), amount_cents: null })), [
    "Passed · Color correction",
    "Proposal out · Color correction",
  ]);
  // Once they said yes the amount is the client's, said where they became one and not again on the proposal's line.
  assert.deepEqual(texts(deal({ stage: "won", decided_at: daysAgo(2), per: "month" })), [
    "Became a client · Color correction · $1,200 a month",
    "Proposal out · Color correction",
  ]);
});

test("a row knows when its next or last visit was a consultation", () => {
  const { toPersonRowVM } = contracts;
  const v = (title, consultation) => ({
    id: "v",
    start: daysAgo(-2),
    end: daysAgo(-2),
    title,
    all_day: false,
    via: "phone",
    consultation,
  });
  const visits = (next, last) => ({ timezone: TZ, source: "your calendar", state: "ok", next, last });
  assert.equal(
    toPersonRowVM(personRow({ visits: visits(v("Discovery call", true), null) }), TZ, new Date(NOW)).consultationVisit,
    true,
  );
  assert.equal(
    toPersonRowVM(personRow({ visits: visits(null, v("Haircut", false)) }), TZ, new Date(NOW)).consultationVisit,
    false,
  );
  assert.equal(toPersonRowVM(personRow({ visits: null }), TZ, new Date(NOW)).consultationVisit, false);
  // When the last visit ended, when it was a consultation (0008): what "no proposal after it" is measured from.
  const held = (consultation) => ({
    id: "v",
    start: daysAgo(2),
    end: new Date(NOW - 2 * 86_400_000 + 3_600_000).toISOString(),
    title: "Discovery call",
    all_day: false,
    via: "phone",
    consultation,
  });
  assert.equal(
    toPersonRowVM(personRow({ visits: visits(null, held(true)) }), TZ, new Date(NOW)).consultedMs,
    NOW - 2 * 86_400_000 + 3_600_000,
  );
  assert.equal(toPersonRowVM(personRow({ visits: visits(null, held(false)) }), TZ, new Date(NOW)).consultedMs, null);
  assert.equal(
    toPersonRowVM(personRow({ visits: visits(v("Discovery call", true), null) }), TZ, new Date(NOW)).consultedMs,
    null,
    "one ahead is not held yet",
  );
  assert.equal(toPersonRowVM(personRow({ visits: null }), TZ, new Date(NOW)).consultedMs, null);
  // The consultation's own title, as the calendar wrote it: the one that ended, else the one ahead (0008): the service
  // it names says which deal card draws it.
  const titleOf = (vs) => toPersonRowVM(personRow({ visits: vs }), TZ, new Date(NOW)).consultationTitle;
  assert.equal(titleOf(visits(null, held(true))), "Discovery call");
  assert.equal(titleOf(visits(v("SEO consultation", true), held(true))), "Discovery call", "the one that ended first");
  assert.equal(titleOf(visits(v("SEO consultation", true), held(false))), "SEO consultation");
  assert.equal(titleOf(visits(v("Haircut", false), held(false))), null);
  assert.equal(titleOf(null), null);
});

test("the Journey continues past the booking: four lists, each gated on deals being on", () => {
  const { PEOPLE_LISTS, peopleListAction, toPersonRowVM } = contracts;
  const byId = Object.fromEntries(PEOPLE_LISTS.map((l) => [l.id, l]));
  for (const id of ["consultation_booked", "proposal_out", "clients", "deal_ended"]) {
    assert.ok(byId[id], id);
    assert.equal(byId[id].group, "journey");
    assert.equal(byId[id].needsDeals, true);
    assert.equal(byId[id].onProfile, false, "the Deal section says the stage; the Lists section does not say it again");
  }
  assert.equal(byId.consultation_booked.needsCalendar, true);
  assert.equal(byId.consultation_booked.needsConsultFirst, true);
  const vmOf = (over) => toPersonRowVM(personRow(over), TZ, new Date(NOW));
  const proposed = vmOf(cols());
  const client = vmOf(cols({ deal_stage: "won", deal_decided_at: daysAgo(1) }));
  const ended = vmOf(cols({ deal_stage: "ended", deal_ended_at: daysAgo(1) }));
  assert.equal(byId.proposal_out.test(proposed), true);
  assert.equal(byId.proposal_out.test(client), false);
  assert.equal(byId.clients.test(client), true);
  assert.equal(byId.deal_ended.test(ended), true);
  const consult = { ...vmOf({}), consultationVisit: true };
  assert.equal(byId.consultation_booked.test(consult), true);
  assert.equal(
    byId.consultation_booked.test({ ...consult, deal: proposed.deal }),
    false,
    "past the consultation once a proposal is out",
  );
  assert.equal(peopleListAction("clients", [client]), null, "a client list has no step to push");
  assert.equal(peopleListAction("proposal_out", [proposed]).cta, "Open the Inbox");
});

test("a row's second line says a waiting proposal after their words and before the visit; a client keeps the visit", () => {
  const { attentionRow, toPersonRowVM } = contracts;
  const vmOf = (over) => toPersonRowVM(personRow(over), TZ, new Date(NOW));
  const visits = {
    timezone: TZ,
    source: "your calendar",
    state: "ok",
    next: { id: "v", start: daysAgo(-2), end: daysAgo(-2), title: "Call", all_day: false, via: "phone" },
    last: null,
  };
  assert.equal(
    attentionRow(vmOf({ ...cols(), last_inbound_text: null, visits }), TZ, NOW).sentence,
    "Proposal out · 11 d",
  );
  assert.match(
    attentionRow(vmOf({ ...cols(), last_inbound_text: "Sounds good", visits }), TZ, NOW).sentence,
    /^Sounds good/,
    "their words first",
  );
  assert.match(
    attentionRow(
      vmOf({ ...cols({ deal_stage: "won", deal_decided_at: daysAgo(1) }), last_inbound_text: null, visits }),
      TZ,
      NOW,
    ).sentence,
    /^Booked/,
    "a client's row keeps the visit",
  );
});

test("a workspace's pace: said once five proposals became clients in the last year, the median in whole days; waiting past it by a fifth, between three and thirty, a week without one", () => {
  assert.equal(PACE_AFTER_YESES, 5);
  assert.equal(dealPaceOf(null), null, "none read");
  assert.equal(dealPaceOf({ median_days: null, yeses: 0 }), null, "no yes yet");
  assert.equal(dealPaceOf({ median_days: 9, yeses: 4 }), null, "four is not yet a pace");
  assert.deepEqual(dealPaceOf({ median_days: 12, yeses: 5 }), {
    medianDays: 12,
    yeses: 5,
    waitDays: 14,
    longerThanUsual: true,
    words: "Usually 12 days to a yes",
  });
  assert.equal(dealPaceOf({ median_days: 8.6, yeses: 7 }).medianDays, 9, "whole days");
  // Past the cap the wait is not past the pace, and nothing may say it is longer than usual.
  const slow = dealPaceOf({ median_days: 40, yeses: 6 });
  assert.deepEqual([slow.waitDays, slow.longerThanUsual], [30, false]);
  assert.deepEqual([0, 1, 9].map(dealPaceWords), [
    "Usually under a day to a yes",
    "Usually 1 day to a yes",
    "Usually 9 days to a yes",
  ]);
  assert.deepEqual([0, 1, 9].map(yesWaitWords), ["under a day", "1 day", "9 days"], "as Reports' median says a wait");
  assert.deepEqual(
    [null, { medianDays: 10 }, { medianDays: 0 }, { medianDays: 1 }, { medianDays: 40 }].map(waitAfterDays),
    [WAITING_AFTER_DAYS, 12, 3, 3, 30],
  );
  // The one rule reads the pace's own wait, the one its words say: nine days out with nothing back waits past a week,
  // not past a twelve-day pace (fourteen days), and waits past a five-day one (six).
  const deal = (days) => dealOf(cols({ deal_id: "d9", deal_proposed_at: daysAgo(days) }), TZ, NOW);
  const row = { deal: deal(9), askedMs: null };
  const twelve = dealPaceOf({ median_days: 12, yeses: 6 });
  assert.equal(waitingOnProposal(row, NOW, null), true);
  assert.equal(waitingOnProposal(row, NOW, twelve), false);
  assert.equal(waitingOnProposal(row, NOW, dealPaceOf({ median_days: 5, yeses: 6 })), true);
  assert.equal(waitingOnProposal({ deal: deal(15), askedMs: null }, NOW, twelve), true);
  assert.deepEqual(
    proposalsWaiting([row, { deal: deal(15), askedMs: null }], NOW, twelve).map((r) => r.deal.sinceMs),
    [deal(15).sinceMs],
  );
  // REGRESSION: a pace that is not one -- a view in its place, a DTO -- made every quiet proposal wait from day one.
  // It is a week.
  assert.equal(waitingOnProposal({ deal: deal(1), askedMs: null }, NOW, "waiting"), false);
  assert.equal(waitingOnProposal({ deal: deal(1), askedMs: null }, NOW, { median_days: 12, yeses: 6 }), false);
  assert.equal(waitingOnProposal(row, NOW, { waitDays: Number.NaN }), true, "nine days is past a week");
});

test("the one rule for a yes's wait, which Reports' median and the pace both read: whole days from proposal to yes, and a client entered after the fact is no wait", () => {
  const H = 3_600_000;
  const DAY_ = 24 * H;
  const at = (ago) => new Date(NOW - ago).toISOString();
  const d = (stage, proposedAgo, decidedAgo) => ({
    stage,
    proposed_at: at(proposedAgo),
    decided_at: decidedAgo === null ? null : at(decidedAgo),
  });
  assert.deepEqual(
    yesWaits([
      d("won", 10 * DAY_, 3 * DAY_), // 7
      d("ended", 20 * DAY_, 8 * DAY_), // 12: an ended engagement was a client
      d("won", 5 * DAY_, 5 * DAY_ - 23 * H), // 23 hours: under a day
      d("won", 2 * DAY_, 2 * DAY_ - 10 * 60_000), // ten minutes after: put on file with its proposal
      d("won", 2 * DAY_, 3 * DAY_), // dated before its proposal: a yes back-dated
      d("won", 4 * DAY_, null), // no day
      d("lost", 9 * DAY_, 1 * DAY_), // a pass
      d("proposed", 9 * DAY_, null), // still out
    ]),
    [0, 7, 12],
  );
  assert.deepEqual([isYes({ stage: "won" }), isYes({ stage: "ended" }), isYes({ stage: "lost" })], [true, true, false]);
  assert.deepEqual([medianWait([0, 7, 12]), medianWait([7, 12]), medianWait([])], [7, 10, null], "half up between two");
  // The pace: the yeses decided in the last year, whenever their proposal went.
  assert.deepEqual(
    dealPaceFrom(
      [
        d("won", 400 * DAY_, 300 * DAY_), // proposed over a year ago, decided inside it: 100
        d("won", 420 * DAY_, 400 * DAY_), // decided over a year ago
        d("won", 10 * DAY_, 3 * DAY_), // 7
        d("won", 20 * DAY_, 8 * DAY_), // 12
      ],
      NOW,
    ),
    { median_days: 12, yeses: 3 },
  );
  assert.deepEqual(dealPaceFrom([], NOW), { median_days: null, yeses: 0 });
});
