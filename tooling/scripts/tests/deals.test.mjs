/**
 * A deal is a record (0004): the words, the moves, the line each page says,
 * the sentence the receptionist hears, the leak's rule, the report's cohort.
 * Executed, never read from source.
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
  dealsAreAThing,
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
  assert.equal(d.brief, "Proposal out · 11 d");
  assert.equal(dealOf({ deal_stage: null }, TZ, NOW), null, "no columns, no deal");
  assert.equal(dealOf({ deal_stage: "banana" }, TZ, NOW), null, "an unknown stage is not a deal");
});

test("a client says its amount; a pass and an end say when; none says an amount for a proposal", () => {
  const won = dealOf(
    cols({ deal_stage: "won", deal_decided_at: daysAgo(3), deal_amount_cents: 250_000, deal_per: "month" }),
    TZ,
    NOW,
  );
  assert.equal(won.said, "Client · since Sep 20 · $2,500 a month");
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
  const proposedWithAmount = dealOf(cols({ deal_amount_cents: 1000 }), TZ, NOW);
  assert.equal(proposedWithAmount.amount, null, "an amount is a client's fact");
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
  });
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
});

test("deals are a thing here when the profile lists a consult-first service or a deal was ever recorded", () => {
  assert.equal(dealsAreAThing([], false), false);
  assert.equal(dealsAreAThing(["Ad management"], false), true);
  assert.equal(dealsAreAThing([], true), true);
  assert.equal(dealsAreAThing(undefined, false), false);
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
  ]) {
    assert.ok(DEAL_REFUSALS[k] && DEAL_REFUSALS[k].length > 8, k);
  }
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
    ],
    deals_on: true,
    services: ["Ad management", "SEO", "Discovery call"],
  });
  const vm = toPersonVM(d, TZ, new Date(NOW));
  assert.equal(vm.dealsOn, true);
  assert.deepEqual(vm.services, ["Ad management", "SEO", "Discovery call"]);
  assert.equal(vm.deals.length, 2);
  assert.equal(vm.deal.stage, "won");
  assert.ok(vm.facts.some((f) => f.label === "Deal" && f.value === "Client" && /Ad management/.test(f.meta)));
  const texts = vm.timeline.filter((i) => i.kind === "deal").map((i) => i.text);
  assert.deepEqual(
    texts.sort(),
    [
      "Became a client · Ad management · $2,500 a month",
      "Passed · SEO",
      "Proposal sent · Ad management",
      "Proposal sent · SEO",
    ].sort(),
  );
  assert.ok(TIMELINE_FILTERS.some((f) => f.id === "deals"));
  assert.deepEqual([...new Set(filterTimeline(vm.timeline, "deals").map((i) => i.kind))], ["deal"]);
  const none = toPersonVM(detail(), TZ, new Date(NOW));
  assert.equal(none.dealsOn, false);
  assert.deepEqual(none.deals, []);
  assert.ok(!none.facts.some((f) => f.label === "Deal"));
});
