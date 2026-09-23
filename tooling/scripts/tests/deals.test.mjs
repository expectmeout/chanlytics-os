/**
 * A deal is a record (0004), and a proposal is part of it (0007): the words,
 * the moves, the line each page says, the proposal's link, value, day and
 * reason, the switch the whole layer hangs on, the sentence the receptionist
 * hears, the leak's rule, the report's cohort. Executed, never read from source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const {
  DEAL_STAGES,
  DEAL_STAGE_WORDS,
  DEAL_MOVES,
  DEAL_LINE_NONE,
  dealMoves,
  dealOf,
  dealFactsOf,
  pickCurrentDeal,
  amountWords,
  dealSentence,
  proposalsWaiting,
  waitingOnProposal,
  consultationsWithoutProposal,
  CONSULT_FOLLOW_DAYS,
  dealsAreOn,
  isSellsBy,
  SELLS_BY,
  SELLS_BY_QUESTION,
  SELLS_BY_WORDS,
  SELLS_BY_REFUSAL,
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_CLEARABLE,
  parseAmount,
  amountTotalsWords,
  proposalLinkOf,
  isConsultationTitle,
  toDealReportVM,
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

test("the four stages, their words, and the moves each offers", () => {
  assert.deepEqual([...DEAL_STAGES], ["proposed", "won", "lost", "ended"]);
  assert.deepEqual(DEAL_STAGE_WORDS, { proposed: "Proposal out", won: "Client", lost: "Passed", ended: "Ended" });
  assert.deepEqual(
    DEAL_MOVES.none.map((m) => [m.to, m.label, m.sameRow]),
    [["proposed", "Proposal sent", false]],
  );
  // Each move names the deal sheet's mode it opens (0007), beside the stage it goes to, so today's page keeps working.
  assert.deepEqual(Object.fromEntries(Object.entries(DEAL_MOVES).map(([from, ms]) => [from, ms.map((m) => m.mode)])), {
    none: ["propose"],
    proposed: ["won", "lost"],
    won: ["ended"],
    lost: ["again"],
    ended: ["propose"],
  });
  assert.deepEqual(
    DEAL_MOVES.proposed.map((m) => [m.to, m.label]),
    [
      ["won", "Became a client"],
      ["lost", "Passed"],
    ],
  );
  assert.deepEqual(
    DEAL_MOVES.won.map((m) => m.to),
    ["ended"],
  );
  assert.deepEqual(
    DEAL_MOVES.lost.map((m) => [m.to, m.sameRow]),
    [["proposed", true]],
  );
  assert.deepEqual(
    DEAL_MOVES.ended.map((m) => [m.to, m.sameRow]),
    [["proposed", false]],
  );
  assert.equal(dealMoves(null), DEAL_MOVES.none);
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
  // Flipped on purpose (0007): a proposal carries a value, the door stored it since 00156, and the page now says it at
  // every stage. "An amount is a client's fact" was 0004's rule, and 0007 amends it.
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
  assert.deepEqual(out.validUntil, { day: "2026-09-30", words: "Valid until Sep 30", lapsed: false });
  assert.equal(out.reason, null);
  // The day it stands is still a day it stands: lapsed only once it has passed, by the business's calendar. At 11 PM
  // in New York on the 22nd it is already the 23rd in UTC, and the proposal still stands.
  const lateOn22 = Date.parse("2026-09-23T03:00:00Z");
  assert.equal(dealOf(cols({ deal_valid_until: "2026-09-22" }), TZ, lateOn22).validUntil.lapsed, false);
  const lapsed = dealOf(cols({ deal_valid_until: "2026-09-20" }), TZ, NOW).validUntil;
  assert.deepEqual(lapsed, { day: "2026-09-20", words: "Lapsed Sep 20", lapsed: true });
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

test("the link a person has now: the deal's while it is a proposal out, the person's with no open deal, a client's none", () => {
  const deal = "https://docs.example.com/p/deal";
  const own = "https://docs.example.com/p/own";
  assert.equal(proposalLinkOf({ stage: "proposed", proposal_url: deal }, own), deal, "the deal's wins");
  assert.equal(proposalLinkOf({ stage: "proposed", proposal_url: null }, own), null, "a proposal without one has none");
  assert.equal(proposalLinkOf({ stage: "won", proposal_url: deal }, own), null, "a client is not sent a proposal");
  assert.equal(proposalLinkOf({ stage: "lost", proposal_url: deal }, own), own, "no open deal: the person's");
  assert.equal(proposalLinkOf({ stage: "ended", proposal_url: null }, `  ${own} `), own);
  assert.equal(proposalLinkOf(null, own), own);
  assert.equal(proposalLinkOf(null, "   "), null);
  assert.equal(proposalLinkOf(undefined, null), null);
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
  ).map((r) => r.id);
  assert.deepEqual(waiting, ["old-quiet", "never-asked"]);
  // The one rule, one row at a time: what Today's leak filters with and the Pipeline will ask.
  assert.equal(waitingOnProposal(row("x", 11, 20), NOW), true);
  assert.equal(waitingOnProposal(row("x", 11, 2), NOW), false);
  assert.equal(waitingOnProposal({ deal: null, askedMs: null }, NOW), false);
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
  assert.deepEqual(picked, ["yesterday", "a-week", "passed-before", "ended-before"]);
  assert.equal(CONSULT_FOLLOW_DAYS, 7);
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

test("a visit is a consultation when its title says consult, or names a consult-first service", () => {
  const services = [{ name: "Ad management" }, { name: "Discovery call" }, { name: "Haircut" }];
  const rules = { consult_first: ["Ad management"] };
  assert.equal(isConsultationTitle("Discovery consult — Maria", services, rules), true);
  assert.equal(isConsultationTitle("Ad Management: Maria R.", services, rules), true);
  assert.equal(isConsultationTitle("Haircut — Maria", services, rules), false);
  assert.equal(isConsultationTitle(null, services, rules), false);
  assert.equal(isConsultationTitle("Ad management", undefined, undefined), false);
});

test("the report counts one cohort and the stock, and is absent where no deal was ever recorded", () => {
  assert.equal(toDealReportVM(null, "30 days").present, false);
  assert.equal(
    toDealReportVM({ any: false, sent: 0, won: 0, lost: 0, waiting: 0, clients: 0, monthly_cents: 0 }, "30 days")
      .present,
    false,
  );
  const vm = toDealReportVM(
    { any: true, sent: 5, won: 3, lost: 1, waiting: 1, clients: 4, monthly_cents: 750_000 },
    "30 days",
  );
  assert.equal(vm.present, true);
  assert.equal(vm.headline, "5 proposals went out in the last 30 days.");
  assert.equal(vm.parts, "3 became clients · 1 passed · 1 still waiting");
  assert.equal(vm.stock, "4 clients now · $7,500 a month.");
  const quiet = toDealReportVM(
    { any: true, sent: 0, won: 0, lost: 0, waiting: 0, clients: 1, monthly_cents: 0 },
    "7 days",
  );
  assert.equal(quiet.headline, "No proposals went out in the last 7 days.");
  assert.equal(quiet.parts, "");
  assert.equal(quiet.stock, "1 client now.");
  const one = toDealReportVM(
    { any: true, sent: 1, won: 1, lost: 0, waiting: 0, clients: 1, monthly_cents: 0 },
    "7 days",
  );
  assert.equal(one.headline, "1 proposal went out in the last 7 days.");
  assert.equal(one.parts, "1 became a client · 0 passed · 0 still waiting");
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
      "Proposal sent · Ad management",
      "Proposal sent · SEO",
      "Proposal sent · Audit",
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
  assert.deepEqual(texts(deal({})), ["Proposal sent · Color correction · $1,200"]);
  assert.deepEqual(texts(deal({ stage: "lost", decided_at: daysAgo(2), lost_reason: "price" })), [
    "Passed · Color correction · Price",
    "Proposal sent · Color correction · $1,200",
  ]);
  assert.deepEqual(texts(deal({ stage: "lost", decided_at: daysAgo(2), amount_cents: null })), [
    "Passed · Color correction",
    "Proposal sent · Color correction",
  ]);
  // Once they said yes the amount is the client's, said where they became one and not again on the proposal's line.
  assert.deepEqual(texts(deal({ stage: "won", decided_at: daysAgo(2), per: "month" })), [
    "Became a client · Color correction · $1,200 a month",
    "Proposal sent · Color correction",
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
  // When the last visit ended, when it was a consultation (0007): what "no proposal after it" is measured from.
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
