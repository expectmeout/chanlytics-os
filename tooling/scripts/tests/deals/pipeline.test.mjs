/**
 * People › Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): People's rows by where their deal stands.
 *
 * The contracts first (pipeline.ts pipelineOf): who lands in which group, the order in each, the one chip a row says
 * and its tone, the time in stage and the value, and the line over the table, which says only the parts that have
 * something. The rows are People's own, made from the shape the database returns (toPersonRowVM over people_list's
 * row), so what is proved is what the page will be handed.
 *
 * Then the page (pipeline-scope.jsx) through the stub React, over the real People surface on a fake wire: the switch
 * with its third tab, the line, the sections and their fold, a row that opens its person, the keys, the search, the
 * phone's bar and cards, and People in its place where deals are off. Executed, never read from source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyAddress } from "../shell/address/_address.mjs";
import { installRoleStore, kitHooks, kitPages } from "../_legacy-react.mjs";
import {
  CONSENT_SOURCES,
  DEAL_ACT_WORDS,
  DEAL_CARD_WORDS,
  DEAL_STAGE_WORDS,
  DEAL_LOST_REASON_WORDS,
  DEAL_REFUSALS,
  PIPELINE_BOARD_CAP,
  PIPELINE_PASS_MAX,
  PIPELINE_GROUPS,
  PIPELINE_SORTS,
  PIPELINE_WORDS,
  clockNear,
  clockNearWhen,
  csvCell,
  dealCardsOf,
  dealMenuActs,
  dealNextAct,
  dealOf,
  heardSinceProposal,
  mayReceive,
  offersYesRefusal,
  isPipelineView,
  parsePipelineRoute,
  pipelineBoardMore,
  pipelineMove,
  pipelineOf,
  pipelinePassDone,
  pipelinePassMany,
  pipelinePeekDetail,
  pipelinePeekOf,
  pipelineRail,
  pipelineRoute,
  pipelineSorted,
  pipelineViewLabel,
  PIPELINE_RAIL_SERVICES,
  repliesWords,
  stateOf,
  toPersonRowVM,
  NOTE_WORDS,
  stepDayOf,
  zoneDayKey,
} from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";
import { pipelineHelpers } from "../../../../apps/dashboard/src/legacy-bridge/pipeline-helpers.ts";
import { EVERY_EVENT, changesOf, toldFor } from "../_live-feed.mjs";

const TZ = "America/New_York";
const H = 3_600_000;
const DAY = 24 * H;
/** Wednesday, Sep 23, 2026, noon in New York. */
const NOW = Date.parse("2026-09-23T16:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

/** A person as people_list returns them (the shape deals.test.mjs and people-vm.test.mjs pin), wrote 40 days ago. */
const personRow = (now, id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: `+1555000${String(1000 + id.length * 37 + name.length).slice(-4)}`,
  email: null,
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: iso(now - 60 * DAY),
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: `cv-${id}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(now - 40 * DAY),
  last_message_at: iso(now - 40 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Thanks",
  last_inbound_at: iso(now - 40 * DAY),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(now - 90 * DAY),
  earliest_row_at: iso(now - 90 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

/** A deal's columns on the row (people_list 00156 + 00160), dated in days before `now`. */
const deal = (now, stage, o = {}) => ({
  deal_id: `d-${stage}-${o.proposed ?? 0}`,
  deal_stage: stage,
  deal_service: o.service === undefined ? "Color correction" : o.service,
  deal_proposed_at: iso(now - (o.proposed ?? 20) * DAY),
  deal_decided_at: o.decided === undefined ? null : iso(now - o.decided * DAY),
  deal_ended_at: o.ended === undefined ? null : iso(now - o.ended * DAY),
  deal_amount_cents: o.cents ?? null,
  deal_per: o.per ?? null,
  deal_proposal_url: o.url === undefined ? "https://docs.example.com/proposal" : o.url,
  deal_valid_until: o.validUntil ?? null,
  deal_lost_reason: o.reason ?? null,
});

/** A visit on the calendar, a consultation unless it says otherwise. */
const visit = (startMs, { consultation = true, allDay = false, hours = 1 } = {}) => ({
  id: `v-${startMs}`,
  start: iso(startMs),
  end: iso(startMs + hours * H),
  title: "Consultation",
  all_day: allDay,
  via: "phone",
  consultation,
});
const visits = (next, last) => ({ timezone: TZ, source: "your calendar", state: "ok", next, last });

/** Wall-clock moments in New York around NOW (EDT, UTC-4). */
const ny = (day, hh, mm = 0) =>
  Date.parse(`2026-${day}T${String(hh + 4).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);

/** Everyone the Pipeline has something to say about, and three it has nothing to say about. */
const fixture = () =>
  [
    // Consultations held in the last week with no proposal since: the oldest first.
    personRow(NOW, "hana", "Hana", { visits: visits(null, visit(ny("09-21", 10))) }),
    personRow(NOW, "hugo", "Hugo", { visits: visits(null, visit(ny("09-18", 10))) }),
    // Passed on an old proposal, then came for a consultation: something new begins.
    personRow(NOW, "bea", "Bea", {
      ...deal(NOW, "lost", { proposed: 40, decided: 30, reason: "timing" }),
      visits: visits(null, visit(ny("09-20", 10))),
    }),
    // Consultations coming up: the soonest first.
    personRow(NOW, "sara", "Sara", { visits: visits(visit(ny("09-25", 14)), null) }),
    personRow(NOW, "theo", "Theo", { visits: visits(visit(ny("09-23", 15)), null) }),
    personRow(NOW, "ada", "Ada", { visits: visits(visit(ny("09-28", 0), { allDay: true, hours: 24 }), null) }),
    personRow(NOW, "finn", "Finn", { visits: visits(visit(ny("10-02", 10)), null) }),
    // Ended an engagement, and booked a consultation for a new one.
    personRow(NOW, "rae", "Rae", {
      ...deal(NOW, "ended", { proposed: 200, decided: 190, ended: 20 }),
      visits: visits(visit(ny("09-25", 16)), null),
    }),
    // Proposals out: the one waiting longest first.
    personRow(NOW, "wes", "Wes", deal(NOW, "proposed", { proposed: 11, cents: 120_000, per: "once" })),
    personRow(NOW, "nia", "Nia", deal(NOW, "proposed", { proposed: 9, cents: 305_000, per: "once", url: null })),
    personRow(NOW, "lars", "Lars", deal(NOW, "proposed", { proposed: 6, validUntil: "2026-09-20" })),
    personRow(NOW, "will", "Will", {
      ...deal(NOW, "proposed", { proposed: 5 }),
      last_inbound_at: iso(ny("09-21", 9)),
    }),
    // A proposal out with a consultation ahead is still a proposal out.
    personRow(NOW, "val", "Val", {
      ...deal(NOW, "proposed", { proposed: 2, validUntil: "2026-09-30" }),
      visits: visits(visit(ny("09-24", 11)), null),
    }),
    personRow(NOW, "fay", "Fay", deal(NOW, "proposed", { proposed: 1 })),
    // Clients: the newest first. A client with a consultation ahead is a client.
    personRow(NOW, "cat", "Cat", deal(NOW, "won", { proposed: 12, decided: 5, cents: 100_000, per: "month" })),
    personRow(NOW, "cy", "Cy", deal(NOW, "won", { proposed: 40, decided: 30, cents: 34_000, per: "month" })),
    personRow(NOW, "cleo", "Cleo", {
      ...deal(NOW, "won", { proposed: 70, decided: 60, service: null }),
      visits: visits(visit(ny("09-25", 9)), null),
    }),
    // Passed or ended: the newest first. Abe was consulted, then passed: nothing left to send.
    personRow(NOW, "ed", "Ed", deal(NOW, "ended", { proposed: 100, decided: 90, ended: 1 })),
    personRow(NOW, "abe", "Abe", {
      ...deal(NOW, "lost", { proposed: 4, decided: 2 }),
      visits: visits(null, visit(ny("09-20", 10))),
    }),
    personRow(NOW, "dan", "Dan", deal(NOW, "lost", { proposed: 8, decided: 3, reason: "price", cents: 90_000 })),
    personRow(NOW, "eve", "Eve", deal(NOW, "lost", { proposed: 12, decided: 10 })),
    // Nothing to follow: no deal and no consultation; a consultation past the week; a visit that is not one.
    personRow(NOW, "nobody", "Nobody"),
    personRow(NOW, "olga", "Olga", { visits: visits(null, visit(ny("09-12", 10))) }),
    personRow(NOW, "hal", "Hal", { visits: visits(visit(ny("09-25", 10), { consultation: false }), null) }),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));

const ids = (g) => g.rows.map((r) => r.id);
const byKey = (vm) => Object.fromEntries(vm.groups.map((g) => [g.key, g]));
const chipOf = (vm, id) => {
  for (const g of vm.groups) for (const r of g.rows) if (r.id === id) return r.chip;
  throw new Error(`${id} is in no group`);
};
const rowOf = (vm, id) => vm.groups.flatMap((g) => g.rows).find((r) => r.id === id);

/* -------------------------------------------------------------------------------------------- the view model */

test("four groups, in order, and each person in one: consultations, proposals out, clients, and passed or ended", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  assert.deepEqual([...PIPELINE_GROUPS], ["consultations", "proposals", "clients", "closed"]);
  assert.deepEqual(
    vm.groups.map((g) => [g.key, g.label, g.count]),
    [
      ["consultations", "Consultations", 8],
      ["proposals", "Proposal out", 6],
      ["clients", "Clients", 3],
      ["closed", "Passed or ended", 4],
    ],
  );
  const g = byKey(vm);
  assert.deepEqual(ids(g.consultations), ["hugo", "bea", "hana", "theo", "sara", "rae", "ada", "finn"]);
  assert.deepEqual(ids(g.proposals), ["wes", "nia", "lars", "will", "val", "fay"]);
  assert.deepEqual(ids(g.clients), ["cat", "cy", "cleo"]);
  assert.deepEqual(ids(g.closed), ["ed", "abe", "dan", "eve"]);
  const everyone = vm.groups.flatMap(ids);
  assert.equal(new Set(everyone).size, everyone.length, "nobody is in two groups");
  for (const out of ["nobody", "olga", "hal"]) assert.ok(!everyone.includes(out), `${out} has nothing to follow`);
  assert.equal(vm.empty, false);
  // The group words are the deal's own where it has them: a renamed stage renames its group.
  assert.equal(PIPELINE_WORDS.groups.proposals, DEAL_STAGE_WORDS.proposed);
  assert.equal(PIPELINE_WORDS.groups.closed, `${DEAL_STAGE_WORDS.lost} or ${DEAL_STAGE_WORDS.ended.toLowerCase()}`);
});

test("each row says one chip, and warn only where something waits on the owner", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const said = (id) => {
    const c = chipOf(vm, id);
    return c ? [c.words, c.tone] : null;
  };
  // Consultations: one held with no proposal since waits on the owner; one coming up is on its way.
  assert.deepEqual(said("hugo"), ["Held Fri · no proposal yet", "warn"]);
  assert.deepEqual(said("bea"), ["Held Sun · no proposal yet", "warn"]);
  assert.deepEqual(said("hana"), ["Held Mon · no proposal yet", "warn"]);
  assert.deepEqual(said("theo"), ["Today 3:00 PM", "info"]);
  assert.deepEqual(said("sara"), ["Fri 2:00 PM", "info"]);
  assert.deepEqual(said("rae"), ["Fri 4:00 PM", "info"]);
  assert.deepEqual(said("ada"), ["Mon", "info"], "one that takes the day says the day alone");
  assert.deepEqual(said("finn"), ["Oct 2 · 10:00 AM", "info"], "past a week, the date: its weekday would be today's");
  // Proposals out, the first that holds: no link, nothing back in a week, they wrote since, the day it stands until.
  // The wait is said once: its number is the row's In stage, so the chip says "Nothing back" and no figure.
  assert.deepEqual(said("wes"), ["Nothing back", "warn"]);
  // A proposal with no link waits like any other, and its follow-up is a person's to send: that is what needs you.
  assert.deepEqual(said("nia"), ["Nothing back", "warn"]);
  assert.deepEqual(said("lars"), ["Lapsed Sep 20", "warn"]);
  assert.deepEqual(said("will"), ["Heard back Mon", "info"], "what came back, not how: a message or a call");
  assert.deepEqual(said("val"), ["Valid until Sep 30", "plain"]);
  assert.equal(said("fay"), null, "a proposal a day old, with its link and nothing to say: no chip");
  // Clients: since when. Passed or ended: why, else the stage, and the day.
  assert.deepEqual(said("cat"), ["Since Sep 18", "plain"]);
  assert.deepEqual(said("cy"), ["Since Aug 24", "plain"]);
  assert.deepEqual(said("dan"), ["Price · Sep 20", "plain"]);
  assert.deepEqual(said("abe"), ["Passed · Sep 21", "plain"]);
  assert.deepEqual(said("eve"), ["Passed · Sep 13", "plain"]);
  assert.deepEqual(said("ed"), ["Ended · Sep 22", "plain"]);
});

test("a row's service, value and time in stage: a proposal's time in stage is the wait its chip counts", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const facts = (id) => {
    const r = rowOf(vm, id);
    return [r.name, r.service, r.value, r.inStage];
  };
  assert.deepEqual(facts("wes"), ["Wes", "Color correction", "$1,200", "11 d"]);
  assert.deepEqual(facts("nia"), ["Nia", "Color correction", "$3,050", "9 d"]);
  assert.deepEqual(facts("fay"), ["Fay", "Color correction", null, "1 d"]);
  assert.deepEqual(facts("cat"), ["Cat", "Color correction", "$1,000 a month", "5 d"]);
  assert.deepEqual(facts("cleo"), ["Cleo", null, null, "60 d"]);
  assert.deepEqual(facts("dan"), ["Dan", "Color correction", "$900", "3 d"]);
  assert.deepEqual(facts("ed"), ["Ed", "Color correction", null, "1 d"], "an ended one counts from its end");
  // A consultation has no deal yet: no service, no value; held, how long ago; ahead, nothing to count.
  assert.deepEqual(facts("hana"), ["Hana", null, null, "2 d"]);
  assert.deepEqual(facts("sara"), ["Sara", null, null, ""]);
  assert.deepEqual(facts("bea"), ["Bea", null, null, "3 d"], "the proposal Bea passed on is not the consultation's");
  // The row carries the People row whole, for the person cell and the card.
  assert.equal(rowOf(vm, "wes").person.name, "Wes");
  assert.equal(rowOf(vm, "wes").person.initials, "WE");
});

test("each group says what it comes to; only Passed or ended starts folded", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  assert.deepEqual(
    vm.groups.map((g) => [g.key, g.meta, g.collapsed]),
    [
      ["consultations", "3 held in the last week, no proposal yet", false],
      ["proposals", "$4,250", false],
      ["clients", "$1,340 a month", false],
      ["closed", null, true],
    ],
  );
  // A folded group's head counts its rows already: what opens it says "Show", not the count again.
  assert.deepEqual([PIPELINE_WORDS.show, PIPELINE_WORDS.hide], ["Show", "Hide"]);
  // Nothing held: the consultations say nothing more than their count. No amount on file: no total.
  const quiet = pipelineOf(
    [
      personRow(NOW, "sara", "Sara", { visits: visits(visit(ny("09-25", 14)), null) }),
      personRow(NOW, "fay", "Fay", deal(NOW, "proposed", { proposed: 1 })),
    ].map((r) => toPersonRowVM(r, TZ, new Date(NOW))),
    NOW,
    TZ,
    null,
  );
  assert.deepEqual(
    quiet.groups.map((g) => [g.key, g.meta]),
    [
      ["consultations", null],
      ["proposals", null],
    ],
  );
});

test("the line says only the parts that have something: proposals out, their value, the ones waiting, clients, theirs", () => {
  const rows = [
    personRow(NOW, "p1", "Pia", deal(NOW, "proposed", { proposed: 11, cents: 120_000, per: "once" })),
    personRow(NOW, "p2", "Paz", deal(NOW, "proposed", { proposed: 3, cents: 305_000, per: "once" })),
    personRow(NOW, "p3", "Pim", deal(NOW, "proposed", { proposed: 2 })),
    personRow(NOW, "c1", "Cal", deal(NOW, "won", { proposed: 30, decided: 20, cents: 100_000, per: "month" })),
    personRow(NOW, "c2", "Cid", deal(NOW, "won", { proposed: 30, decided: 25, cents: 34_000, per: "month" })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.equal(
    pipelineOf(rows, NOW, TZ, null).summary.join(" · "),
    "3 proposals out · $4,250 · 1 waiting over a week · 2 clients · $1,340 a month",
  );
  // One of each, a once and a monthly amount summed apart, nobody waiting.
  const one = [
    personRow(NOW, "p1", "Pia", deal(NOW, "proposed", { proposed: 2, cents: 50_000 })),
    personRow(NOW, "c1", "Cal", deal(NOW, "won", { proposed: 30, decided: 20, cents: 100_000 })),
    personRow(NOW, "c2", "Cid", deal(NOW, "won", { proposed: 30, decided: 25, cents: 34_000, per: "month" })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.deepEqual(pipelineOf(one, NOW, TZ, null).summary, [
    "1 proposal out",
    "$500",
    "2 clients",
    "$1,000 + $340 a month",
  ]);
  // No amounts on file: the counts alone. Only consultations and passes: nothing to say, and the line is not drawn.
  const counts = [personRow(NOW, "p1", "Pia", deal(NOW, "proposed", { proposed: 2 }))].map((r) =>
    toPersonRowVM(r, TZ, new Date(NOW)),
  );
  assert.deepEqual(pipelineOf(counts, NOW, TZ, null).summary, ["1 proposal out"]);
  const none = [
    personRow(NOW, "sara", "Sara", { visits: visits(visit(ny("09-25", 14)), null) }),
    personRow(NOW, "dan", "Dan", deal(NOW, "lost", { proposed: 8, decided: 3 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.deepEqual(pipelineOf(none, NOW, TZ, null).summary, []);
});

test("nobody to follow is an empty Pipeline, with its words for it", () => {
  const vm = pipelineOf([toPersonRowVM(personRow(NOW, "nobody", "Nobody"), TZ, new Date(NOW))], NOW, TZ, null);
  assert.deepEqual([vm.groups, vm.summary, vm.empty], [[], [], true]);
  assert.deepEqual(pipelineOf([], NOW, TZ, null).empty, true);
  // The page's own New proposal stands over the empty table, so the words say what will show, not where to start.
  assert.deepEqual(PIPELINE_WORDS.empty, {
    title: "No deals yet.",
    body: "Proposals you start show here, with what they come to.",
  });
  assert.deepEqual(PIPELINE_WORDS.columns, {
    person: "Person",
    service: "Service",
    value: "Value",
    stage: "Stage",
    came: "Came from",
    valid: "Valid until",
    next: "Next step",
    chip: "Where it stands",
    acts: "More",
  });
});

test("a consultation held is dated from its start, though the rule counts its week from its end; heard back is a message or a call", () => {
  // An all-day consultation on Monday ends at Tuesday's midnight: dated from its end it read "Held yesterday".
  const allDay = toPersonRowVM(
    personRow(NOW, "mona", "Mona", { visits: visits(null, visit(ny("09-21", 0), { allDay: true, hours: 24 })) }),
    TZ,
    new Date(NOW),
  );
  assert.equal(allDay.consultedMs, ny("09-22", 0), "the rule's moment is its end");
  const [row] = pipelineOf([allDay], NOW, TZ, null).groups[0].rows;
  assert.deepEqual(
    [row.chip.words, row.inStage],
    ["Held Mon · no proposal yet", "2 d"],
    "the words' day is the day it was held, and so is its count",
  );
  // A call they placed after the proposal went is something back, as a message is: the chip says what, not how.
  const called = toPersonRowVM(
    personRow(NOW, "cal", "Cal", {
      ...deal(NOW, "proposed", { proposed: 5 }),
      last_inbound_call_at: iso(ny("09-22", 15)),
    }),
    TZ,
    new Date(NOW),
  );
  assert.deepEqual(pipelineOf([called], NOW, TZ, null).groups[0].rows[0].chip, {
    words: "Heard back yesterday",
    tone: "info",
  });
});

test("a tie in a group goes by name, and a moment the row lacks goes last", () => {
  const same = [
    personRow(NOW, "b", "Bo", deal(NOW, "proposed", { proposed: 4 })),
    personRow(NOW, "a", "Al", deal(NOW, "proposed", { proposed: 4 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.deepEqual(ids(pipelineOf(same, NOW, TZ, null).groups[0]), ["a", "b"]);
  const undated = [
    personRow(NOW, "x", "Xi", { ...deal(NOW, "won", { proposed: 4 }), deal_proposed_at: null }),
    personRow(NOW, "y", "Yu", deal(NOW, "won", { proposed: 9, decided: 2 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const g = pipelineOf(undated, NOW, TZ, null).groups[0];
  assert.deepEqual(ids(g), ["y", "x"]);
  assert.deepEqual(
    g.rows.map((r) => [r.inStage, r.chip]),
    [
      ["2 d", { words: "Since Sep 21", tone: "plain" }],
      ["", null],
    ],
    "a client with no date on file says no day and no chip, rather than a wrong one",
  );
});

test("the rules the Pipeline asks are deals.ts's: heard since a proposal, and the amount a deal holds for a sum", () => {
  const out = dealOf(deal(NOW, "proposed", { proposed: 11, cents: 120_000, per: "once" }), TZ, NOW);
  assert.equal(heardSinceProposal({ deal: out, askedMs: NOW - 2 * DAY }), true, "they wrote after it went");
  assert.equal(heardSinceProposal({ deal: out, askedMs: NOW - 20 * DAY }), false, "before it went is not an answer");
  assert.equal(heardSinceProposal({ deal: out, askedMs: null }), false);
  assert.equal(heardSinceProposal({ deal: null, askedMs: NOW }), false);
  const won = dealOf(deal(NOW, "won", { decided: 1 }), TZ, NOW);
  assert.equal(heardSinceProposal({ deal: won, askedMs: NOW }), false, "only a proposal out is waiting to hear");
  // The amount as the deal holds it (the deal sheet's own fields), beside its words, at every stage: what a total sums.
  const held = (d) => [d.amountCents, d.per, d.currency];
  assert.deepEqual(held(out), [120_000, "once", "USD"]);
  assert.equal(out.amount, "$1,200");
  assert.deepEqual(held(dealOf(deal(NOW, "won", { decided: 1, cents: 34_000, per: "month" }), TZ, NOW)), [
    34_000,
    "month",
    "USD",
  ]);
  assert.equal(dealOf(deal(NOW, "lost", { decided: 1 }), TZ, NOW).amountCents, null, "no amount, nothing to sum");
});

test("with a pace, a proposal waits past it by a fifth: the line says who is waiting longer than usual, the rail and the view say how long; past the cap, the days", () => {
  const pace = { medianDays: 8, yeses: 6, waitDays: 10, longerThanUsual: true, words: "Usually 8 days to a yes" };
  const vm = pipelineOf(fixture(), NOW, TZ, pace);
  assert.equal(vm.pace, pace, "the Pipeline carries the pace it was judged by");
  assert.ok(vm.summary.includes("1 waiting longer than usual"), vm.summary.join(" · "));
  assert.ok(pipelineOf(fixture(), NOW, TZ, null).summary.includes("2 waiting over a week"), "without one: a week");
  // Wes (11 days) waits; Nia (9 days) does not yet.
  assert.deepEqual(ids(pipelineOf(fixture(), NOW, TZ, pace, "waiting").groups[0]), ["wes"]);
  const waits = pipelineRail(vm, NOW).find((s) => s.key === "waiting");
  assert.deepEqual(
    waits.rows.find((r) => r.view === "waiting"),
    { view: "waiting", label: "Nothing back in 10 days", count: 1, tone: "warn" },
  );
  assert.equal(pipelineViewLabel("waiting", pace), "Nothing back in 10 days");
  assert.equal(pipelineViewLabel("waiting", null), PIPELINE_WORDS.rail.waiting);
  assert.notEqual(chipOf(vm, "nia").words, PIPELINE_WORDS.nothingBack, "Nia's is not Nothing back yet");
  assert.equal(chipOf(vm, "wes").words, PIPELINE_WORDS.nothingBack);
  // REGRESSION: a forty-day pace waits thirty days (the cap), which is not longer than usual: the line says the days.
  const capped = { medianDays: 40, yeses: 6, waitDays: 30, longerThanUsual: false, words: "Usually 40 days to a yes" };
  const old = [personRow(NOW, "oli", "Oli", deal(NOW, "proposed", { proposed: 31 }))].map((r) =>
    toPersonRowVM(r, TZ, new Date(NOW)),
  );
  assert.ok(pipelineOf(old, NOW, TZ, capped).summary.includes("1 waiting over 30 days"));
});

test("a row knows when its next visit is a consultation, and whether it takes the day", () => {
  const vm = (v) => toPersonRowVM(personRow(NOW, "p", "Pat", { visits: v }), TZ, new Date(NOW));
  assert.deepEqual(vm(visits(visit(ny("09-25", 14)), null)).consultAhead, { startMs: ny("09-25", 14), allDay: false });
  assert.deepEqual(vm(visits(visit(ny("09-28", 0), { allDay: true }), null)).consultAhead, {
    startMs: ny("09-28", 0),
    allDay: true,
  });
  assert.equal(vm(visits(visit(ny("09-25", 14), { consultation: false }), null)).consultAhead, null);
  assert.equal(vm(visits(null, visit(ny("09-21", 10)))).consultAhead, null, "one held is not one ahead");
  assert.equal(vm(null).consultAhead, null);
});

test("a day near today, as a chip says it: its name within the week either side, a date beyond", () => {
  const at = (days, hh = 12) => NOW + days * DAY + (hh - 12) * H;
  assert.deepEqual(
    [-8, -7, -6, -2, -1, 0, 1, 2, 6, 7].map((d) => clockNear(at(d), TZ, NOW)),
    ["Sep 15", "Sep 16", "Thu", "Mon", "yesterday", "today", "tomorrow", "Fri", "Tue", "Sep 30"],
  );
  assert.equal(clockNearWhen(at(2, 14), TZ, NOW), "Fri 2:00 PM");
  assert.equal(clockNearWhen(at(0, 15), TZ, NOW), "today 3:00 PM");
  assert.equal(clockNearWhen(at(9, 10), TZ, NOW), "Oct 2 · 10:00 AM", "past a week, as clockWhen joins a date");
  // The business's day, not the browser's or UTC's: 11:30 PM in New York is already tomorrow in UTC.
  assert.equal(clockNear(Date.parse("2026-09-24T03:30:00Z"), TZ, NOW), "today");
  assert.equal(clockNear(Date.parse("2026-12-31T17:00:00Z"), TZ, NOW), "Dec 31");
  assert.equal(clockNear(Date.parse("2027-01-04T17:00:00Z"), TZ, NOW), "Jan 4, 2027", "another year says its year");
});

/* ------------------------------------------------------------------------ the next step (0007, amended) */

/** A next step's columns on the row (people_list v5, 00166): its day `d` days from `now` in the workspace's zone. */
const stepCols = (now, id, d, o = {}) => ({
  step_id: `s-${id}`,
  step_body: o.body ?? `Call ${id} back`,
  step_due_on: zoneDayKey(now + d * DAY, TZ),
  step_for_user_id: null,
  step_deal_id: o.dealId ?? null,
});

const stepFixture = (readAt = NOW) =>
  [
    personRow(NOW, "wes", "Wes", {
      ...deal(NOW, "proposed", { proposed: 11, cents: 120_000, per: "once" }),
      ...stepCols(NOW, "wes", -2),
    }),
    personRow(NOW, "nia", "Nia", { ...deal(NOW, "proposed", { proposed: 9 }), ...stepCols(NOW, "nia", 3) }),
    personRow(NOW, "fay", "Fay", deal(NOW, "proposed", { proposed: 1 })),
    personRow(NOW, "cat", "Cat", {
      ...deal(NOW, "won", { proposed: 12, decided: 5, cents: 100_000, per: "month" }),
      ...stepCols(NOW, "cat", 0),
    }),
    personRow(NOW, "cy", "Cy", deal(NOW, "won", { proposed: 40, decided: 30 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(readAt)));

test("each row carries its next step, its day said as the pages say it and judged again as the Pipeline is drawn", () => {
  const vm = pipelineOf(stepFixture(), NOW, TZ, null);
  assert.deepEqual(rowOf(vm, "wes").next, {
    id: "s-wes",
    words: "Call wes back",
    day: "2026-09-21",
    when: "Overdue since Mon",
    due: "past",
    forWho: null,
    dealId: null,
  });
  assert.deepEqual(
    ["nia", "cat", "fay"].map((id) => rowOf(vm, id).next && [rowOf(vm, id).next.when, rowOf(vm, id).next.due]),
    [["Due Sat", "ahead"], ["Due today", "today"], null],
  );
  // Read three days before: Wes's step was ahead then. The Pipeline says it as it stands now.
  const early = stepFixture(NOW - 3 * DAY);
  assert.equal(early.find((r) => r.id === "wes").nextStep.due, "ahead", "as the row was read");
  assert.equal(rowOf(pipelineOf(early, NOW, TZ, null), "wes").next.due, "past", "as the Pipeline is drawn");
});

test("Steps due holds only the rows whose step's day has come, in every group, without a group's worth; the rail counts them, in warn", () => {
  const vm = pipelineOf(stepFixture(), NOW, TZ, null, "steps");
  assert.deepEqual(
    vm.groups.map((g) => [g.key, ids(g), g.count, g.meta]),
    [
      ["proposals", ["wes"], 1, null],
      ["clients", ["cat"], 1, null],
    ],
    "Nia's step is ahead and Fay has none; what a group comes to is the whole group's, so a part does not say it",
  );
  const rail = pipelineRail(pipelineOf(stepFixture(), NOW, TZ, null), NOW);
  const waits = rail.find((s) => s.key === "waiting");
  assert.deepEqual(
    waits.rows.find((r) => r.view === "steps"),
    { view: "steps", label: "Steps due", count: 2, tone: "warn" },
  );
  assert.equal(
    pipelineRail(pipelineOf(fixture(), NOW, TZ, null), NOW)
      .flatMap((s) => s.rows)
      .some((r) => r.view === "steps"),
    false,
    "with none due the rail does not offer it",
  );
  // A view of its own, in the address and in words; the Pipeline's own words are the notes card's.
  assert.equal(isPipelineView("steps"), true);
  assert.equal(pipelineViewLabel("steps", null), NOTE_WORDS.stepsDue);
  assert.deepEqual(parsePipelineRoute(pipelineRoute({ view: "steps" })), { view: "steps", peek: null });
  assert.equal(PIPELINE_WORDS.rail.steps, NOTE_WORDS.stepsDue);
  assert.equal(PIPELINE_WORDS.columns.next, NOTE_WORDS.next);
});

test("Next step sorts within each group by its day, the soonest first; a row with none goes last whichever way it runs", () => {
  const vm = pipelineOf(stepFixture(), NOW, TZ, null);
  const order = (dir) =>
    pipelineSorted(vm, "next", dir)
      .groups.map((g) => [g.key, ids(g)])
      .filter(([k]) => k === "proposals" || k === "clients");
  assert.deepEqual(order("asc"), [
    ["proposals", ["wes", "nia", "fay"]],
    ["clients", ["cat", "cy"]],
  ]);
  assert.deepEqual(order("desc"), [
    ["proposals", ["nia", "wes", "fay"]],
    ["clients", ["cat", "cy"]],
  ]);
});

test("the peek says a step no deal card of theirs carries -- about the person, or a deal that closed; one on an open deal is that card's, said there once", () => {
  const rows = [
    personRow(NOW, "wes", "Wes", { ...deal(NOW, "proposed", { proposed: 11 }), ...stepCols(NOW, "wes", -2) }),
    personRow(NOW, "nia", "Nia", {
      ...deal(NOW, "proposed", { proposed: 9 }),
      ...stepCols(NOW, "nia", 3, { dealId: "d-proposed-9" }),
    }),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const vm = pipelineOf(rows, NOW, TZ, null);
  const facts = (id) => pipelinePeekOf(rowOf(vm, id), "proposals").facts.filter((f) => f.id === "step");
  assert.deepEqual(facts("wes"), [{ id: "step", words: "Next step · Call wes back · Overdue since Mon" }]);
  assert.deepEqual(facts("nia"), [], "Nia's step names her deal: the card the peek draws says it");
  // REGRESSION: a step on a deal that passed was hidden as the card's, and no card is drawn for a closed deal.
  const dan = toPersonRowVM(
    personRow(NOW, "dan", "Dan", {
      ...deal(NOW, "lost", { proposed: 8, decided: 3 }),
      ...stepCols(NOW, "dan", 20, { dealId: "d-lost-8" }),
    }),
    TZ,
    new Date(NOW),
  );
  const danRow = rowOf(pipelineOf([dan], NOW, TZ, null), "dan");
  assert.deepEqual(
    pipelinePeekOf(danRow, "closed").facts.filter((f) => f.id === "step"),
    [{ id: "step", words: `Next step · Call dan back · ${danRow.next.when}` }],
  );
  // Two open deals, the step on the one the row does not carry: a fact until they are read, then that card's.
  const val = toPersonRowVM(
    personRow(NOW, "val", "Val", {
      ...deal(NOW, "proposed", { proposed: 2 }),
      ...stepCols(NOW, "val", 1, { dealId: "d-other" }),
    }),
    TZ,
    new Date(NOW),
  );
  const valRow = rowOf(pipelineOf([val], NOW, TZ, null), "val");
  const valFacts = (deals) => pipelinePeekOf(valRow, "proposals", deals).facts.filter((f) => f.id === "step");
  assert.equal(valFacts(null).length, 1, "before they are read, the row's own deal is the one known");
  const current = { id: "d-proposed-2", stage: "proposed" };
  assert.deepEqual(valFacts([current, { id: "d-other", stage: "won" }]), [], "read: a card of theirs says it");
  assert.equal(valFacts([current, { id: "d-other", stage: "ended" }]).length, 1, "an ended deal draws no card");
});

test("the Pipeline's route waits for People's rows: it reads nothing else", async () => {
  const registry = await import("../../../../apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.equal(registry.routeSurfaceFor("clients", "pipeline"), "people");
  assert.equal(registry.surfaceStateFor("clients", "pipeline"), "real");
  assert.equal(registry.surfaceRetiredTo("pipeline"), "clients", "the retired demo board still lands on People");
  // Every view of it, and a person open over one, is the same People surface: the address family is one route.
  assert.equal(registry.routeSurfaceFor("clients", "pipeline:v-proposals:p-x"), "people");
  assert.equal(registry.routeSurfaceFor("clients", "pipeline:v-s.Ad%20management"), "people");
});

/* ------------------------------------------------------------------------------------------------- the page */

const TID = "t-studio";
const ZONE = TZ;
const listeners = {};
/** Back, as the page asked for it (the peek's close, after an open it pushed). */
const backs = [];
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/clients/pipeline",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  // The browser's own rule: replaceState moves the address and fires nothing.
  history: {
    replaceState: (_s, _t, hash) => {
      globalThis.window.location.hash = hash;
    },
    back: () => {
      backs.push(globalThis.window.location.hash);
    },
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  // The workspace, as its own surface publishes it: every day on People is said by its clock (legacy-bridge/zone.ts).
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { peopleOverride } = await quietly(
  () => import("../../../../apps/dashboard/src/legacy-bridge/surfaces/people.ts"),
);
const { installClock } = await import("../../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();

/** People over the wire, as GET contacts answers: whether deals are on here, and any view saved (which lands in `viewSaves`). */
const wire = ({ people, dealsOn, total = people.length, hasMore = false, dealPace = null, followUp = null }) => {
  const seen = { viewSaves: [] };
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const saving = u.pathname.match(/^\/api\/v1\/views\/([^/]+)$/);
    if (saving && init.method === "PUT") {
      seen.viewSaves.push({ page: saving[1], view: JSON.parse(init.body).view });
      return json(200, { ok: true, data: { views: {} } });
    }
    // More people than the surface reads (past its fifty pages): the first page is everyone it gets, and the next is
    // empty, which ends its reading with the server still saying more follow.
    if (u.pathname === "/api/v1/contacts")
      return json(200, {
        ok: true,
        data: {
          people: Number(u.searchParams.get("offset") || 0) === 0 ? people : [],
          page: { q: null, offset: 0, limit: 1000, total, has_more: hasMore },
          calendar: { state: "ok", source: "Google Calendar" },
          booking_link: null,
          deals_on: dealsOn,
          deal_pace: dealPace,
          follow_up: followUp,
        },
      });
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists: [] } });
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  return seen;
};

let cells = [];
const frames = hookFrames();
const went = [];
/** The navigations the page asked to replace rather than push: the cursor walking an open peek. */
const replaced = [];
const opened = [];
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  // An effect runs when its inputs change, after its last cleanup, the way React runs it; with no inputs, on every draw.
  useEffect: (fn, deps) => {
    const k = frames.key();
    const prev = cells[k];
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: undefined };
    cells[k].cleanup = fn();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.useSurface = () => 0; // the bridge's hook: these tests draw once, and the redraw is proved in shell/surfaces
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
// The record kit's sheet, which New proposal is drawn in on a desk.
await import("../../../../apps/dashboard/src/legacy/components/record-sheet.jsx");
// The record kit's toggle group, which a selection's pass asks why with, as the deal sheet does.
await import("../../../../apps/dashboard/src/legacy/components/record-field.jsx");
Object.assign(globalThis.window, kitPages);
kitHooks();
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "mayAtLeast"])
  globalThis[k] = globalThis.window[k];
installRoleStore();
// Menus, questions and glyphs as their props: nothing here presses them.
globalThis.MoreMenu = () => null;
globalThis.Confirm = () => null;
globalThis.ChannelGlyph = () => null;
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  AttnRow: () => null,
  CHANLY: { nav: (to) => went.push(to), address: await legacyAddress(), R: { thread: (id) => `inbox/${id}` } },
  // The chrome bridge's state map (shell.ts): a chip's tone is the pill's, and nothing else.
  __chrome: { state: stateOf },
  __csvCell: csvCell,
  __ME: { role: "owner" },
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
  // What seed-globals.ts publishes for the page (pipeline-helpers.ts): contracts' own, never a stand-in that could
  // say a word differently.
  __pipeline: pipelineHelpers(),
  // What people-detail.ts publishes of the deal for the card the peek draws (installPeopleCourier): contracts' own,
  // with the thread's Deal group (the row's menu) and the card's next act (a phone peek's pinned act).
  __deal: { cards: dealCardsOf, cardWords: DEAL_CARD_WORDS, menu: dealMenuActs, next: dealNextAct },
});
await import("../../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of [
  "PeopleTable",
  "PeopleColumnsMenu",
  "plLocked",
  "plShows",
  "plSortKeys",
  "plDrawnColumns",
  "plShownColumns",
  "plColumnChoices",
  "plColumnOptions",
  "PL_NO_SEL",
  "PL_FIRST_ROWS",
  "PL_WINDOW_ROWS",
  "usePlRowWindow",
])
  globalThis[k] = globalThis.window[k];
// In the order both lists load them (manifest.ts, Chanlytics.html): the peek and the board before the Pipeline, the
// Pipeline before the page that draws it, and the person's deal card, which the peek draws, after.
await import("../../../../apps/dashboard/src/legacy/pages/pipeline-row.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/pipeline-peek.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/pipeline-board.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/pipeline-new.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/pipeline-scope.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/leads-real.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/people.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/person-deal.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const byClass = (tree, cls) =>
  find(tree, (n) =>
    String(n.props?.className || "")
      .split(/\s+/)
      .includes(cls),
  );
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const click = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
/** A key as the window hears it, pressed in `target`. */
const press = (key, target = { tagName: "TR", isContentEditable: false, closest: () => null }) => {
  const ev = {
    key,
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    preventDefault() {
      ev.defaultPrevented = true;
    },
  };
  for (const fn of [...(listeners.keydown || [])]) fn(ev);
  return ev.defaultPrevented;
};

/** The same people as the view model's tests, dated from the real clock the surface reads with. */
const peopleNow = () => {
  const now = Date.now();
  return [
    personRow(now, "hana", "Hana", { visits: visits(null, visit(now - 2 * DAY)) }),
    personRow(now, "sara", "Sara", { visits: visits(visit(now + 2 * DAY), null) }),
    personRow(now, "wes", "Wes", deal(now, "proposed", { proposed: 11, cents: 120_000, per: "once" })),
    personRow(now, "nia", "Nia", deal(now, "proposed", { proposed: 9, cents: 305_000, per: "once", url: null })),
    personRow(now, "cat", "Cat", deal(now, "won", { proposed: 12, decided: 5, cents: 100_000, per: "month" })),
    personRow(now, "dan", "Dan", deal(now, "lost", { proposed: 8, decided: 3, reason: "price" })),
    personRow(now, "ed", "Ed", deal(now, "ended", { proposed: 100, decided: 90, ended: 1 })),
    personRow(now, "nobody", "Nobody"),
  ];
};

/** People published by the real surface over the wire, and a page with nothing drawn yet. */
const fresh = async ({
  people = peopleNow(),
  dealsOn = true,
  total,
  hasMore,
  dealPace = null,
  followUp = null,
} = {}) => {
  const seen = wire({ people, dealsOn, total, hasMore, dealPace, followUp });
  await quietly(() => peopleOverride.apply());
  cells = [];
  went.length = 0;
  replaced.length = 0;
  backs.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.localStorage.removeItem("chanlytics-people-view");
  globalThis.localStorage.removeItem("chanlytics-pipeline-view");
  globalThis.localStorage.removeItem("pipeline.view");
  globalThis.window.__saveView = (page, view) => {
    seen.viewSaves.push({ page, view });
    return Promise.resolve({ ok: true, data: { views: {} } });
  };
  return seen;
};
const draw = (props = {}) => {
  frames.begin();
  return globalThis.window.ClientsA({
    scope: "pipeline",
    onNavigate: (to, opts) => {
      went.push(to);
      if (opts && opts.replace) replaced.push(to);
    },
    onOpenProfile: (id) => opened.push(id),
    ...props,
  });
};
const onPhone = async (fn) => {
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  try {
    return await fn();
  } finally {
    delete globalThis.window.matchMedia;
  }
};
const rowIds = (tree) =>
  all(tree, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id.replace(/^person-/, ""));
const heads = (tree) =>
  all(tree, (n) => n.props?.["data-testid"] === "table-section").map((tr) => ({
    label: textOf(byClass(tr, "pl-sec-label")),
    count: textOf(byClass(tr, "tally")),
    meta: textOf(byTestId(tr, "table-section-meta")) || null,
    toggle: textOf(byTestId(tr, "table-section-toggle")) || null,
  }));

/** The line's parts in their order, words or presses alike. */
const lineParts = (tree) =>
  all(byTestId(tree, "pipeline-summary"), (n) =>
    /^pl-standing-(total|reached|needs)( on)?$/.test(n.props?.className || ""),
  ).map(textOf);

test("the Pipeline has its own rail with People's switch at its head, the line, and the table in sections -- every word contracts'", async () => {
  await fresh();
  const tree = draw();
  assert.ok(byTestId(tree, "pipeline"), "the Pipeline, not People");
  const tabs = byTestId(tree, "people-scope");
  assert.deepEqual(
    all(tabs, (n) => n.props?.role === "tab").map((n) => [textOf(n), n.props["aria-selected"]]),
    [
      ["People", false],
      ["Leads", false],
      ["Pipeline", true],
    ],
  );
  const vm = pipelineOf(globalThis.window.__PEOPLE.rows, Date.now(), ZONE, null);
  assert.deepEqual(lineParts(tree), vm.summary);
  assert.deepEqual(vm.summary, ["2 proposals out", "$4,250", "2 waiting over a week", "1 client", "$1,000 a month"]);
  // The part that counts what waits on the owner is a press; the totals are words.
  const waiting = byTestId(tree, "pipeline-line-waiting");
  assert.deepEqual([waiting.type, waiting.props["aria-pressed"]], ["button", false]);
  // The rail is the Pipeline's own: its groups, what waits, its services. People's lists stay on People.
  const rail = byTestId(tree, "pipeline-rail");
  assert.deepEqual(
    // Each row once: the kit's section draws its children, and the walk meets them there and in the section's props.
    [
      ...new Set(
        all(rail, (n) => /^pipeline-rail-row-/.test(n.props?.["data-testid"] || "")).map((n) =>
          n.props["data-testid"].slice(18),
        ),
      ),
    ],
    ["all", "consultations", "proposals", "clients", "closed", "waiting", "svc:Color correction"],
  );
  assert.equal(
    byTestId(rail, "pipeline-rail-row-all").props["aria-current"],
    "true",
    "All deals, until another is picked",
  );
  assert.equal(
    find(tree, (n) => typeof n.props?.onPickSaved === "function"),
    null,
    "no People's rail here",
  );
  assert.deepEqual(heads(tree), [
    { label: "Consultations", count: "2", meta: "1 held in the last week, no proposal yet", toggle: null },
    { label: "Proposal out", count: "2", meta: "$4,250", toggle: null },
    { label: "Clients", count: "1", meta: "$1,000 a month", toggle: null },
    { label: "Passed or ended", count: "2", meta: null, toggle: "Show" },
  ]);
  // The rows under the heads, in the Pipeline's order; Passed or ended folded; Nobody, with nothing to follow, absent.
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
  // A head is a row of its own across every column, with no id: the cursor and select-all go by rows' ids.
  const head = find(tree, (n) => n.type === "tr" && String(n.props?.className || "").includes("pl-sec-head"));
  assert.equal(head.props.id, undefined);
  const th = find(head, (n) => n.type === "th");
  assert.deepEqual([th.props.scope, th.props.colSpan], ["rowgroup", 8]);
  // The headings are contracts', after the selection's box, People's person cell first; Stage is the order it
  // opens in. Came from and Valid until are the member's to show (Columns).
  assert.deepEqual(
    all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).map((n) => textOf(n)),
    ["", "Person", "Service", "Value", "Stage▲", "Next step", "Where it stands", "More"],
  );
  // The chip's column says its name to a screen reader only: no one word is right above every chip.
  const chipHead = all(
    find(tree, (n) => n.type === "thead"),
    (n) => n.type === "th",
  ).find((n) => textOf(n) === "Where it stands");
  assert.deepEqual(
    chipHead.props.children.map((k) => [k.type, k.props.className, textOf(k)]),
    [["span", "rec-sr", "Where it stands"]],
    "the house's visually hidden words, and nothing seen",
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.className === "cl-th-sort").map(textOf),
    ["Person", "Value", "Stage▲", "Next step"],
    "the headings that sort are buttons, and Stage is the order it opens in",
  );
  // Each row: People's own person cell, the service, the value, the time in stage, and the chip in its tone.
  const wes = find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes");
  assert.ok(
    find(wes, (n) => String(n.props?.className || "").includes("cl-name-cell")),
    "People's person cell",
  );
  assert.deepEqual(
    ["pipe-service", "pipe-value", "pipe-in-stage"].map((id) => textOf(byTestId(wes, id))),
    ["Color correction", "$1,200", "11 d"],
  );
  const chip = byTestId(wes, "pipe-chip");
  assert.deepEqual([textOf(chip), chip.props["data-tone"]], ["Nothing back", "warn"]);
  const nia = byTestId(
    find(tree, (n) => n.type === "tr" && n.props?.id === "person-nia"),
    "pipe-chip",
  );
  assert.deepEqual([textOf(nia), nia.props["data-tone"]], ["Nothing back", "warn"]);
  assert.equal(
    textOf(
      byTestId(
        find(tree, (n) => n.type === "tr" && n.props?.id === "person-sara"),
        "pipe-chip",
      ),
    ),
    rowOf(vm, "sara").chip.words,
  );
  // The foot counts everyone in the Pipeline, the folded included.
  assert.match(textOf(find(tree, (n) => n.props?.className === "cl-table-foot")), /^7 people/);
});

test("Passed or ended opens with its Show, folds again with Hide, and a row opens its peek, not the person's page", async () => {
  await fresh();
  let tree = draw();
  const toggle = byTestId(tree, "table-section-toggle");
  assert.equal(toggle.props["aria-expanded"], false);
  click(toggle);
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat", "ed", "dan"], "the newest first");
  assert.equal(textOf(byTestId(tree, "table-section-toggle")), "Hide");
  assert.equal(byTestId(tree, "table-section-toggle").props["aria-expanded"], true);
  const dan = find(tree, (n) => n.type === "tr" && n.props?.id === "person-dan");
  assert.match(textOf(byTestId(dan, "pipe-chip")), /^Price · /);
  dan.props.onClick();
  tree = draw();
  assert.deepEqual(opened, [], "the page stays: the row opens its peek");
  assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Dan");
  click(byTestId(tree, "table-section-toggle"));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("the Pipeline reads the people it shows ahead, in their order, so a row's peek opens on what the tab holds", async () => {
  await fresh();
  const lists = [];
  const was = globalThis.window.__warmPeople;
  globalThis.window.__warmPeople = (ids) => lists.push(ids);
  try {
    const tree = draw();
    assert.ok(lists.length, "the rows on screen went to the courier");
    assert.deepEqual(lists.at(-1), rowIds(tree).slice(0, 12), "the ones drawn, first to last");
  } finally {
    globalThis.window.__warmPeople = was;
  }
});

test("the keys are People's: J walks the rows shown, Enter opens the peek, Esc closes it, and a folded group is passed by", async () => {
  await fresh();
  let tree = draw();
  for (let i = 0; i < 6; i += 1) {
    assert.equal(press("j"), true);
    tree = draw();
  }
  assert.equal(byTestId(tree, "pipeline-peek"), null, "walking opens nothing");
  assert.equal(press("Enter"), true);
  tree = draw();
  assert.equal(
    textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")),
    "Cat",
    "the last row shown: Passed or ended is folded, and J stops at Cat",
  );
  assert.deepEqual(opened, [], "Enter opens the peek, never the page");
  // K walks on behind the peek, and the peek follows the cursor (an effect, so the draw after the cursor's).
  assert.equal(press("k"), true);
  draw();
  tree = draw();
  assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Nia");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(byTestId(tree, "pipeline-peek"), null, "Esc closes the peek");
  // x selects the row under the cursor, as on People: a selection is what Mark as passed and the lists act on.
  assert.equal(press("x"), true);
  tree = draw();
  assert.ok(byTestId(tree, "bulk-bar"), "and the bar says what is selected");
});

test("the words in the box find people in every group, the folded one opened, and the line stays the whole Pipeline's", async () => {
  await fresh();
  let tree = draw();
  byTestId(tree, "pipeline-search").props.onChange({ target: { value: "dan" } });
  tree = draw();
  assert.deepEqual(rowIds(tree), ["dan"]);
  assert.deepEqual(heads(tree), [{ label: "Passed or ended", count: "1", meta: null, toggle: null }]);
  assert.match(textOf(find(tree, (n) => n.props?.className === "cl-table-foot")), /^Showing 1 of 7/);
  assert.match(textOf(byTestId(tree, "pipeline-summary")), /^2 proposals out/);
  byTestId(tree, "pipeline-search").props.onChange({ target: { value: "zed" } });
  tree = draw();
  assert.match(textOf(tree), /No one matches this view\./);
  click(find(tree, (n) => n.type === "button" && textOf(n).includes("Clear filters")));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("the Pipeline keeps a view of its own, apart from People's and Leads': the layout is the member's", async () => {
  const seen = await fresh();
  let tree = draw();
  byTestId(tree, "pipeline-search").props.onChange({ target: { value: "wes" } });
  tree = draw();
  draw();
  assert.deepEqual(seen.viewSaves, [], "words in the box are not a view");
  // #941 kept List | Board in this browser; it is the member's saved view now, beside People's and Leads'.
  click(byTestId(tree, "pipeline-view-board"));
  draw();
  assert.deepEqual(
    seen.viewSaves.map((v) => [v.page, v.view.layout]),
    [["pipeline", "board"]],
    "saved through the one saver, as the Pipeline's",
  );
  assert.equal(
    JSON.parse(globalThis.localStorage.getItem("chanlytics-pipeline-view")).layout,
    "board",
    "with this device's copy",
  );
  assert.equal(
    globalThis.localStorage.getItem("chanlytics-people-view"),
    null,
    "People's saved view is People's alone",
  );
  assert.equal(globalThis.localStorage.getItem("chanlytics-leads-view"), null);
  assert.equal(globalThis.localStorage.getItem("pipeline.view"), null, "#941's key is never written again");
});

test("one clock with the rows: the Pipeline counts at the moment the surface published them, not at the draw", async () => {
  await fresh();
  const published = globalThis.window.__PEOPLE.fetchedAt;
  // The rows were said at `published`; a page that grouped them at the draw's own moment could say a consultation
  // held two days ago beside a proposal's wait said the day before. Moved back a day, the Pipeline's own counts move
  // with the surface's clock, and never with the wall's.
  globalThis.window.__PEOPLE = { ...globalThis.window.__PEOPLE, fetchedAt: published - DAY };
  const tree = draw();
  const hana = find(tree, (n) => n.type === "tr" && n.props?.id === "person-hana");
  assert.equal(
    textOf(byTestId(hana, "pipe-in-stage")),
    "1 d",
    "held two days before the wall's now: one before the surface's",
  );
});

test("past the people People has loaded, the line says it counts only them, in People's own words", async () => {
  await fresh({ total: 1400, hasMore: true });
  const people = globalThis.window.__PEOPLE;
  assert.equal(people.page.has_more, true, "the surface stopped with more to follow");
  const tree = draw();
  const parts = lineParts(tree);
  assert.equal(parts.at(-1), globalThis.window.plLoadedWords(people.rows.length, 1400));
  assert.equal(parts.at(-1), `${people.rows.length} of 1,400 loaded`, "People's words: N of M loaded");
  assert.deepEqual(parts.slice(0, -1), pipelineOf(people.rows, people.fetchedAt, ZONE, null).summary);
});

test("with nobody to follow, the table says so in contracts' words", async () => {
  await fresh({ people: [personRow(Date.now(), "nobody", "Nobody")] });
  const tree = draw();
  assert.equal(byTestId(tree, "pipeline-summary"), null, "a line with nothing in it is not drawn");
  assert.match(textOf(tree), /No deals yet\./);
  assert.match(textOf(tree), /Proposals you start show here, with what they come to\./);
  assert.match(textOf(find(tree, (n) => n.props?.className === "cl-table-foot")), /^0 people/);
});

test("where deals are off the address draws People, and its switch has no Pipeline", async () => {
  await fresh({ dealsOn: false });
  globalThis.window.location.hash = "#/clients/pipeline";
  const tree = draw();
  assert.equal(globalThis.window.location.hash, "#/clients", "People's own address takes the Pipeline's place");
  assert.equal(byTestId(tree, "pipeline"), null);
  assert.ok(byTestId(tree, "people-standing"), "People");
  assert.deepEqual(
    all(byTestId(tree, "people-scope"), (n) => n.props?.role === "tab").map((n) => [
      textOf(n),
      n.props["aria-selected"],
    ]),
    [
      ["People", true],
      ["Leads", false],
    ],
  );
});

test("the switch goes to each scope's own address, and the rail's rows to the Pipeline's own views", async () => {
  await fresh();
  const tree = draw();
  for (const id of ["scope-people", "scope-leads", "scope-pipeline"]) click(byTestId(tree, id));
  assert.deepEqual(went, ["clients", "clients/leads", "clients/pipeline"]);
  // Its rail picks a view of the Pipeline, a new entry each; People's lists open on People, from People.
  for (const id of ["proposals", "waiting", "svc:Color correction", "all"])
    click(byTestId(tree, `pipeline-rail-row-${id}`));
  assert.deepEqual(went.slice(3), [
    "clients/pipeline:v-proposals",
    "clients/pipeline:v-waiting",
    "clients/pipeline:v-s.Color%20correction",
    "clients/pipeline",
  ]);
  assert.deepEqual(replaced, [], "a view is a place of its own: pushed");
});

test("a view in the address holds its rows alone; the line's press opens it, and pressed again goes back to all deals", async () => {
  await fresh();
  let tree = draw();
  click(byTestId(tree, "pipeline-line-waiting"));
  assert.equal(went.at(-1), "clients/pipeline:v-waiting");
  // The shell follows the address (app-shell.jsx), handing the page its param.
  tree = draw({ pipelineRoute: "pipeline:v-waiting" });
  assert.equal(byTestId(tree, "pipeline-line-waiting").props["aria-pressed"], true);
  assert.equal(
    byTestId(tree, "pipeline-rail-row-waiting").props["aria-current"],
    "true",
    "the rail says the same view",
  );
  assert.deepEqual(rowIds(tree), ["wes", "nia"], "the view's rows alone");
  assert.match(
    textOf(find(tree, (n) => n.props?.className === "cl-table-foot")),
    /^2 people/,
    "the foot counts the view",
  );
  assert.deepEqual(
    lineParts(tree),
    pipelineOf(globalThis.window.__PEOPLE.rows, globalThis.window.__PEOPLE.fetchedAt, ZONE, null).summary,
    "the line stays the whole Pipeline's",
  );
  click(byTestId(tree, "pipeline-line-waiting"));
  assert.equal(went.at(-1), "clients/pipeline", "pressed again: all deals");
  // A view with nobody in it says so, with the way back.
  tree = draw({ pipelineRoute: "pipeline:v-s.Nothing%20here" });
  assert.match(textOf(tree), /Nobody here/);
  click(find(tree, (n) => n.type === "button" && textOf(n).includes("All deals") && !n.props?.["data-testid"]));
  assert.equal(went.at(-1), "clients/pipeline");
});

test("the peek is in the address: opening pushes it, the cursor walking it replaces it, Esc goes back, and a link opens it", async () => {
  await fresh();
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  draw();
  assert.deepEqual(went, ["clients/pipeline:p-wes"], "opened: a new entry, so Back closes it");
  draw({ pipelineRoute: "pipeline:p-wes" });
  tree = draw({ pipelineRoute: "pipeline:p-wes" });
  assert.equal(went.length, 1, "the address and the page agree: nothing more is asked");
  assert.ok(byTestId(tree, "pipeline-peek"));
  assert.equal(press("j"), true);
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-wes" });
  assert.deepEqual(replaced, ["clients/pipeline:p-nia"], "the cursor walked it on: the same entry, replaced");
  for (let i = 0; i < 2; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
  assert.equal(press("Escape"), true);
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
  assert.equal(backs.length, 1, "closed: back to the entry the opening made");
  assert.equal(byTestId(tree, "pipeline-peek"), null);
  // A link that names a person opens their peek as it lands, and closes by replacing: Back would leave the Pipeline.
  await fresh();
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:v-proposals:p-nia" });
  assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Nia");
  assert.deepEqual(went, [], "the address already says so");
  click(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-close"));
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:v-proposals:p-nia" });
  assert.deepEqual(
    replaced,
    ["clients/pipeline:v-proposals"],
    "closed where the link opened it: replaced, the view kept",
  );
  assert.deepEqual(backs, []);
  // Someone the address names who is not in the Pipeline: nothing opens.
  await fresh();
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nobody" });
  assert.equal(byTestId(tree, "pipeline-peek"), null);
});

test("New proposal: pick someone, or add them by number, and the one deal sheet opens to propose", async () => {
  await fresh();
  const asked = [];
  globalThis.window.openDealSheet = (a) => {
    asked.push(a);
    return true;
  };
  let tree = draw();
  const open = byTestId(tree, "pipeline-new-open");
  assert.deepEqual(
    [open.props.className.includes("btn-primary"), textOf(open).trim()],
    [true, "New proposal"],
    "the page's one filled button",
  );
  click(open);
  tree = draw();
  assert.ok(byTestId(tree, "pipeline-new"), "the picker");
  // Focus goes by the record sheet's own rule (focusOn): the sheet keeps New proposal as what opened it, and gives
  // focus back to it as it closes. An autoFocus ran before the sheet did and took the search box for the opener.
  const sheetOf = (t) => find(t, (n) => n.type === globalThis.window.RecordSheet);
  assert.deepEqual(sheetOf(tree).props.focusOn, { row: "search" });
  assert.equal(byTestId(tree, "pipeline-new-search").props.autoFocus, false);
  assert.ok(
    find(tree, (n) => n.props?.["data-rec-row"] === "search"),
    "the field it names",
  );
  byTestId(tree, "pipeline-new-search").props.onChange({ target: { value: "wes" } });
  tree = draw();
  const picks = all(byTestId(tree, "pipeline-new-list"), (n) => n.props?.["data-testid"] === "pipeline-new-pick");
  assert.deepEqual(
    picks.map((n) => textOf(byClass(n, "pipe-new-name"))),
    ["Wes"],
    "People's own rule finds them",
  );
  byTestId(tree, "pipeline-new-search").props.onChange({ target: { value: "zed" } });
  tree = draw();
  assert.match(textOf(byTestId(tree, "pipeline-new")), /No one matches\./);
  byTestId(tree, "pipeline-new-search").props.onChange({ target: { value: "wes" } });
  tree = draw();
  click(all(byTestId(tree, "pipeline-new-list"), (n) => n.props?.["data-testid"] === "pipeline-new-pick")[0]);
  tree = draw();
  assert.deepEqual(asked, [{ personId: "wes", mode: "propose" }]);
  assert.equal(byTestId(tree, "pipeline-new"), null, "the picker closes as the sheet opens");
  // Someone new, by number, through People's own door.
  const added = [];
  globalThis.window.__addPerson = async (b) => {
    added.push(b);
    return { ok: true, data: { contact_id: "new-1", existed: false } };
  };
  click(byTestId(tree, "pipeline-new-open"));
  tree = draw();
  click(byTestId(tree, "pipeline-new-add-open"));
  tree = draw();
  assert.deepEqual(sheetOf(tree).props.focusOn, { row: "add" }, "Add someone new: the name takes focus");
  assert.ok(find(byTestId(tree, "pipeline-new-add"), (n) => n.props?.["data-testid"] === "pipeline-new-name"));
  byTestId(tree, "pipeline-new-name").props.onChange({ target: { value: "Ana Ruiz" } });
  tree = draw();
  byTestId(tree, "pipeline-new-phone").props.onChange({ target: { value: "+1 786 555 0199" } });
  tree = draw();
  await byTestId(tree, "pipeline-new-go").props.onClick();
  tree = draw();
  assert.deepEqual(added, [{ phone: "+1 786 555 0199", name: "Ana Ruiz" }]);
  assert.deepEqual(asked.at(-1), { personId: "new-1", mode: "propose" });
  // A number the door refuses says why under the field, and nothing opens.
  globalThis.window.__addPerson = async () => ({ ok: false, fields: { phone: "That is not a mobile number." } });
  click(byTestId(tree, "pipeline-new-open"));
  tree = draw();
  click(byTestId(tree, "pipeline-new-add-open"));
  tree = draw();
  byTestId(tree, "pipeline-new-phone").props.onChange({ target: { value: "12" } });
  tree = draw();
  await byTestId(tree, "pipeline-new-go").props.onClick();
  tree = draw();
  assert.match(textOf(byTestId(tree, "pipeline-new-add")), /That is not a mobile number\./);
  assert.equal(asked.length, 2);
});

// The phone's sheet is compact (People's RailEmpty): a view with no deal in it is said in its section's one quiet line,
// not drawn; all deals and the one picked always are. A desktop's rail draws every row.
test("the Pipeline's rows, compact in a phone's sheet: an empty view is said in a line, all deals and the picked one stay", () => {
  const sections = [
    {
      key: "deals",
      label: "Deals",
      rows: [
        { view: "all", label: "All deals", count: 0, tone: null },
        { view: "consultations", label: "Consultations", count: 3, tone: null },
        { view: "proposals", label: "Proposal out", count: 0, tone: null },
        { view: "clients", label: "Clients", count: 0, tone: null },
        { view: "ended", label: "Passed or ended", count: 0, tone: null },
      ],
    },
  ];
  const ids = (tree) =>
    all(tree, (n) => String(n.props?.["data-testid"] || "").startsWith("pipeline-rail-row-")).map((n) =>
      n.props["data-testid"].slice("pipeline-rail-row-".length),
    );
  // The stub tree reaches a node through its parent's children and its own drawing both: each is counted once.
  const said = (tree) => [...new Set(all(tree, (n) => n.props?.className === "cl-rail-empty"))].map(textOf);
  const Rows = globalThis.window.PipelineRailRows;
  const compact = Rows({ sections, view: "clients", onPick: () => {}, compact: true });
  assert.deepEqual([...new Set(ids(compact))], ["all", "consultations", "clients"]);
  assert.deepEqual(said(compact), ["Empty now: Proposal out · Passed or ended"]);
  const rail = Rows({ sections, view: "clients", onPick: () => {} });
  assert.deepEqual([...new Set(ids(rail))], ["all", "consultations", "proposals", "clients", "ended"]);
  assert.deepEqual(said(rail), []);
});

test("on a phone: one bar with the switch, the view's list button, search and New proposal's +, then the line and People's cards", () =>
  onPhone(async () => {
    await fresh();
    const tree = draw();
    assert.equal(byClass(tree, "cl-rail"), null, "no rail: the switch is the bar's");
    assert.equal(byClass(tree, "cl-controls"), null, "no controls row");
    const bar = byTestId(tree, "pipeline-phone-bar");
    const scroller = byClass(tree, "cl-main-scroll");
    assert.ok(scroller, "the page's scroller");
    assert.equal(
      byTestId(scroller, "pipeline-phone-bar"),
      null,
      "the bar stands over what scrolls, as the Inbox's strip does",
    );
    assert.deepEqual(
      all(bar, (n) => n.props?.role === "tab").map((n) => [textOf(n), n.props["aria-selected"]]),
      [
        ["People", false],
        ["Leads", false],
        ["Pipeline", true],
      ],
    );
    // The view is the bar's list button, its rows the rail's, in a sheet: no row of chips above the work.
    const lists = byTestId(bar, "pipeline-phone-lists");
    assert.deepEqual(
      [textOf(byClass(lists, "pp-bar-pick-words")), textOf(byClass(lists, "pp-bar-pick-count"))],
      ["All deals", "7"],
    );
    assert.ok(byTestId(bar, "pipeline-new-open"), "New proposal is the bar's +");
    assert.equal(byTestId(bar, "pipeline-phone-search-open").props["aria-label"], "Search by name or phone");
    assert.ok(byTestId(tree, "pipeline-summary"));
    const card = find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes");
    assert.match(card.props.className, /\bpl-card-row\b/);
    assert.equal(textOf(find(card, (n) => n.props?.className === "pl-card-name")), "Wes");
    assert.equal(textOf(byTestId(card, "pipe-chip")), "Nothing back");
    assert.equal(textOf(byTestId(card, "pipe-service")), "Color correction");
    assert.deepEqual(
      ["pipe-value", "pipe-in-stage"].map((id) => textOf(byTestId(card, id))),
      ["$1,200", "11 d"],
    );
    // The section heads stand on a phone too, above their cards.
    assert.deepEqual(
      heads(tree).map((h) => h.label),
      ["Consultations", "Proposal out", "Clients", "Passed or ended"],
    );
    click(lists);
    const sheetTree = draw();
    const sheet = byTestId(sheetTree, "people-lists-sheet");
    assert.ok(sheet, "the rail's rows, as a sheet");
    assert.deepEqual(
      [sheet.props["aria-label"], textOf(byClass(sheet, "sb-sheet-title"))],
      ["Show", "Show"],
      "named for what it holds: the Pipeline's views, not People's lists",
    );
    click(byTestId(sheet, "pipeline-rail-row-clients"));
    assert.equal(went.at(-1), "clients/pipeline:v-clients");
    assert.equal(byTestId(draw(), "people-lists-sheet"), null, "a pick closes it");
    // New proposal's picker is a phone's sheet, whose search takes focus as it opens: that sheet has no focus rule.
    click(byTestId(draw(), "pipeline-new-open"));
    const picker = draw();
    assert.ok(byTestId(picker, "pipeline-new-sheet"));
    assert.equal(byTestId(picker, "pipeline-new-search").props.autoFocus, true);
  }));

/* ------------------------------------------------------------------------------ the row carries the deal */

test("each row wears its deal's steps: a consultation where one was held or is coming, the proposal, the client; a pass has none", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const track = (id) => rowOf(vm, id).track.map((s) => `${s.key}:${s.at}${s.tone === "plain" ? "" : `:${s.tone}`}`);
  // Held, no proposal since: the proposal is the step now, waiting on the owner, as the chip says.
  assert.deepEqual(track("hana"), ["consultation:done", "proposal:current:warn", "client:ahead"]);
  // Coming up: the consultation is where it stands.
  assert.deepEqual(track("sara"), ["consultation:current:info", "proposal:ahead", "client:ahead"]);
  // A proposal out: waiting on the owner in warn, heard back in info; no consultation held, no step for one.
  assert.deepEqual(track("wes"), ["proposal:current:warn", "client:ahead"]);
  assert.deepEqual(track("will"), ["proposal:current:info", "client:ahead"]);
  assert.deepEqual(
    track("val"),
    ["proposal:current:info", "client:ahead"],
    "a consultation ahead of a proposal is not a step behind it",
  );
  // A client has come through both.
  assert.deepEqual(track("cat"), ["proposal:done", "client:current:ok"]);
  // A pass or an end: the chip says it, and there is no track.
  for (const id of ["ed", "dan", "eve"]) assert.deepEqual(rowOf(vm, id).track, [], id);
  // A proposal after a consultation held: three steps, the first done.
  const consulted = pipelineOf(
    [
      toPersonRowVM(
        personRow(NOW, "ivy", "Ivy", {
          ...deal(NOW, "proposed", { proposed: 2 }),
          visits: visits(null, visit(ny("09-18", 10))),
        }),
        TZ,
        new Date(NOW),
      ),
    ],
    NOW,
    TZ,
    null,
  );
  assert.deepEqual(
    consulted.groups[0].rows[0].track.map((s) => `${s.key}:${s.at}`),
    ["consultation:done", "proposal:current", "client:ahead"],
  );
});

test("the rows order by the member's pick within each group: value over a year with none last, name, or the Pipeline's own reversed", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const order = (v, key) => byKey(v)[key].rows.map((r) => r.id);
  assert.deepEqual(PIPELINE_SORTS, ["stage", "value", "name", "next"]);
  // The Pipeline's own order is the table as it opens, and an order it does not know is that one.
  assert.equal(pipelineSorted(vm, "stage", "asc"), vm);
  assert.deepEqual(order(pipelineSorted(vm, "nonsense", "asc"), "proposals"), order(vm, "proposals"));
  assert.deepEqual(order(pipelineSorted(vm, "stage", "desc"), "proposals"), [...order(vm, "proposals")].reverse());
  // Value: Nia's $3,050 over Wes's $1,200; the ones with no amount last, in the Pipeline's order, either way.
  const none = order(vm, "proposals").filter((id) => !["wes", "nia"].includes(id));
  assert.deepEqual(order(pipelineSorted(vm, "value", "desc"), "proposals"), ["nia", "wes", ...none]);
  assert.deepEqual(order(pipelineSorted(vm, "value", "asc"), "proposals"), ["wes", "nia", ...none]);
  // A month counts twelve times over a year: Cat's $1,000 a month over Cy's $340 a month.
  assert.deepEqual(order(pipelineSorted(vm, "value", "desc"), "clients").slice(0, 2), ["cat", "cy"]);
  // Name, either way; the groups themselves never move.
  assert.deepEqual(order(pipelineSorted(vm, "name", "asc"), "proposals"), ["fay", "lars", "nia", "val", "wes", "will"]);
  assert.deepEqual(order(pipelineSorted(vm, "name", "desc"), "proposals"), [
    "will",
    "wes",
    "val",
    "nia",
    "lars",
    "fay",
  ]);
  assert.deepEqual(
    pipelineSorted(vm, "name", "asc").groups.map((g) => g.key),
    vm.groups.map((g) => g.key),
  );
  // Bea passed on $9,000 and came back for a consultation: her row shows no value, and sorts with those that have none.
  const bea = pipelineOf(
    [
      ...fixture(),
      toPersonRowVM(
        personRow(NOW, "bea2", "Bea", {
          ...deal(NOW, "lost", { proposed: 40, decided: 30, cents: 900_000, per: "once" }),
          visits: visits(null, visit(ny("09-22", 10))),
        }),
        TZ,
        new Date(NOW),
      ),
    ],
    NOW,
    TZ,
    null,
  );
  const held = (v) => byKey(v).consultations.rows.map((r) => r.id);
  assert.equal(rowOf(bea, "bea2").value, null);
  assert.deepEqual(held(pipelineSorted(bea, "value", "desc")), held(bea), "no value, the Pipeline's own order");
  assert.deepEqual(held(pipelineSorted(bea, "value", "asc")), held(bea));
});

test("Mark as passed for a selection: only the proposals out pass, the rest are said and left, and why is asked once", () => {
  const rows = fixture();
  const pick = (...want) => rows.filter((r) => want.includes(r.id));
  const vm = pipelinePassMany(pick("wes", "nia", "cat"));
  assert.deepEqual(
    vm.deals.map((d) => d.personId),
    ["wes", "nia"],
  );
  assert.ok(vm.deals.every((d) => typeof d.dealId === "string" && d.dealId));
  assert.deepEqual(
    [vm.button, vm.words, vm.rest, vm.more],
    ["Mark as passed · 2", "Mark 2 as passed", "1 is not a proposal out and stays as it is", null],
  );
  assert.deepEqual(
    vm.reasons.map((r) => r.words),
    Object.values(DEAL_LOST_REASON_WORDS),
    "the deal sheet's own reasons, in its order",
  );
  assert.deepEqual(
    [pipelinePassMany(pick("wes")).words, pipelinePassMany(pick("wes")).rest],
    ["Mark 1 as passed", null],
  );
  const none = pipelinePassMany(pick("cat", "hana"));
  assert.deepEqual([none.deals, none.words, none.rest], [[], null, "2 are not proposals out and stay as they are"]);
  // What it came to.
  assert.deepEqual(pipelinePassDone(2, 0), { words: "2 marked as passed", tone: "ok" });
  assert.deepEqual(pipelinePassDone(1, 1), {
    words: "1 marked as passed · 1 had changed, and was left as it is",
    tone: "warn",
  });
  assert.deepEqual(pipelinePassDone(0, 2), { words: "2 had changed, and were left as they are", tone: "warn" });
  // One that could not be recorded at all (offline, a refusal of another kind) is not one that had changed.
  assert.deepEqual(pipelinePassDone(1, 0, 1), { words: "1 marked as passed · 1 could not be marked", tone: "warn" });
  assert.deepEqual(pipelinePassDone(0, 0, 2), { words: "2 could not be marked", tone: "danger" });
  // Fifty at a press, as People's bar writes: the rest stay selected, and say so.
  const many = Array.from({ length: PIPELINE_PASS_MAX + 3 }, (_, i) =>
    toPersonRowVM(
      personRow(NOW, `m${i}`, `M${i}`, deal(NOW, "proposed", { proposed: 2 + (i % 5) })),
      TZ,
      new Date(NOW),
    ),
  );
  const capped = pipelinePassMany(many);
  assert.deepEqual(
    [capped.deals.length, capped.button, capped.more],
    [50, "Mark as passed · 50", "3 more stay selected, fifty at a time"],
  );
});

test("the peek's reach and history, once the person is read: the person page's own words, three moves at most", () => {
  const t = (id, kind, tsMs, text, ahead = false) => ({
    id,
    ts: tsMs,
    time: "",
    day: `d${id}`,
    kind,
    who: "You",
    text,
    ...(ahead ? { ahead } : {}),
  });
  const person = {
    phone: "+1 786-555-0181",
    email: "wes@example.com",
    hasChat: true,
    replyVia: "WhatsApp",
    replyWindow: { open: true, hoursLeft: 20 },
    timeline: [
      t("1", "deal", 1, "Proposal out · SEO · $800"),
      t("2", "customer", 5, "Thanks"),
      t("3", "deal", 3, "Passed · Ads · Price"),
      t("4", "deal", 4, "Proposal out · Ads"),
      t("5", "deal", 2, "Became a client · Web"),
      t("6", "visit", 6, "Consultation"),
    ],
  };
  const d = pipelinePeekDetail(person);
  assert.deepEqual(d.reach, [
    { id: "phone", label: "Phone", words: "+1 786-555-0181", call: "tel:+17865550181", copy: "+1 786-555-0181" },
    { id: "email", label: "Email", words: "wes@example.com", call: null, copy: "wes@example.com" },
    { id: "replies", label: "Replies", words: "Any message, for 20 more hours", call: null, copy: null },
  ]);
  assert.deepEqual(
    d.history.map((h) => h.words),
    ["Proposal out · Ads", "Passed · Ads · Price", "Became a client · Web"],
  );
  // Do-not-contact: the person page's own menu offers no call and no copy of the number, and neither does the peek.
  assert.deepEqual(
    pipelinePeekDetail({ ...person, consent: { state: "opted_in", dnc: true } }).reach.map((r) => r.id),
    ["email", "replies"],
  );
  // Nothing to reach them by, and no conversation: nothing said.
  assert.deepEqual(pipelinePeekDetail({ ...person, phone: null, email: null, hasChat: false, timeline: [] }), {
    reach: [],
    history: [],
  });
  // What a reply may be, one sentence for the person page and the peek.
  assert.equal(repliesWords("Email", null), "Any time, by email");
  assert.equal(repliesWords("Text", null), "Any time, by text");
  assert.equal(
    repliesWords("WhatsApp", { open: false, hoursLeft: 0 }),
    "Approved messages only, until they write again",
  );
  assert.equal(repliesWords("WhatsApp", { open: true, hoursLeft: 1 }), "Any message, for 1 more hour");
  assert.equal(repliesWords("WhatsApp", { open: true, hoursLeft: 0 }), "Any message, for less than an hour");
  assert.equal(repliesWords(null, null), null);
  // A board column holds twenty, then says how many more.
  assert.deepEqual([PIPELINE_BOARD_CAP, pipelineBoardMore(4)], [20, "Show 4 more"]);
});

/* ------------------------------------------------------------------------------ the Pipeline as a workspace */

test("a card dropped in another column asks for the sheet in the mode the move needs, and nothing else moves", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const row = (id) => rowOf(vm, id);
  assert.deepEqual(pipelineMove("consultations", "proposals", row("hana")), { mode: "propose", dealId: null });
  assert.deepEqual(pipelineMove("proposals", "clients", row("wes")), { mode: "won", dealId: "d-proposed-11" });
  assert.deepEqual(pipelineMove("proposals", "closed", row("wes")), { mode: "lost", dealId: "d-proposed-11" });
  assert.deepEqual(pipelineMove("clients", "closed", row("cat")), { mode: "ended", dealId: "d-won-12" });
  assert.deepEqual(pipelineMove("closed", "proposals", row("dan")), { mode: "again", dealId: "d-lost-8" });
  assert.deepEqual(
    pipelineMove("closed", "proposals", row("ed")),
    { mode: "propose", dealId: null },
    "an ended engagement begins a new proposal, never the old one again",
  );
  // A consultation after a pass or an end begins something new: Bea's and Rae's rows sit among the consultations.
  assert.deepEqual(pipelineMove("consultations", "proposals", row("bea")), { mode: "propose", dealId: null });
  assert.deepEqual(pipelineMove("consultations", "proposals", row("rae")), { mode: "propose", dealId: null });
  for (const [from, to, id] of [
    ["proposals", "consultations", "wes"],
    ["clients", "proposals", "cat"],
    ["clients", "consultations", "cat"],
    ["closed", "clients", "dan"],
    ["closed", "consultations", "dan"],
    ["consultations", "clients", "hana"],
    ["consultations", "closed", "hana"],
    ["proposals", "proposals", "wes"],
  ])
    assert.equal(pipelineMove(from, to, row(id)), null, `${from} into ${to} means nothing`);
  // A row whose deal is not the stage the column assumes asks for nothing rather than a wrong move.
  assert.equal(pipelineMove("proposals", "clients", row("cat")), null);
  assert.equal(pipelineMove("clients", "closed", row("wes")), null);
});

test("the peek's head and facts are the row's: who, the group and the service, when they were heard, their words, what is coming up", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const wes = pipelinePeekOf(rowOf(vm, "wes"), "proposals");
  assert.deepEqual(
    [wes.id, wes.name, wes.initials, wes.numeric, wes.sub, wes.thread],
    ["wes", "Wes", "WE", false, "Proposal out · Color correction", rowOf(vm, "wes").person.threadId],
  );
  assert.ok(wes.thread, "the row's thread, for the door to it");
  assert.deepEqual(
    wes.facts,
    [
      { id: "heard", words: rowOf(vm, "wes").person.lastContact.label },
      { id: "quote", words: "“Thanks”" },
    ],
    "People's own words for when they were heard, and theirs",
  );
  const sara = pipelinePeekOf(rowOf(vm, "sara"), "consultations");
  assert.equal(sara.sub, "Consultations", "no deal yet: the group alone");
  const next = sara.facts.find((f) => f.id === "next");
  assert.ok(next && next.words.startsWith("Coming up · "), "her consultation, as People's row says it");
  assert.deepEqual(pipelinePeekOf(rowOf(vm, "cleo"), "clients").sub, "Clients", "a client with no service named");
  // A number for a name is drawn in figures.
  const num = toPersonRowVM(
    personRow(NOW, "n1", "+1 555 000 1234", deal(NOW, "proposed", { proposed: 2 })),
    TZ,
    new Date(NOW),
  );
  assert.equal(pipelinePeekOf(pipelineOf([num], NOW, TZ, null).groups[0].rows[0], "proposals").numeric, true);
  assert.deepEqual(PIPELINE_WORDS.peek, {
    close: "Close",
    page: "Open their page",
    thread: "Open the thread",
    reading: "Reading…",
    what: "this person",
    reach: {
      phone: "Phone",
      email: "Email",
      replies: "Replies",
      call: "Call",
      copy: "Copy",
      copied: "Copied",
      copyPhone: "Copy the number",
      copyEmail: "Copy the address",
    },
    history: "History",
  });
});

test("People repaints on a teammate's deal: the surface asks for the deals table, and the database tells the workspace of it", async () => {
  const { wantsRefresh } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  assert.equal(wantsRefresh(peopleOverride, "deals"), true);
  assert.equal(wantsRefresh(peopleOverride, "messages"), true, "the default trio still");
  assert.equal(wantsRefresh(peopleOverride, "calls"), false, "a live call's turns are not People's");
  // The live feed (packages/db realtime.ts) must be told of the table, or a surface asking for it hears nothing: the
  // database tells every event on deals (00265), and a notice of one reaches the runner as the deals table's change.
  assert.deepEqual(toldFor("deals"), EVERY_EVENT, "every deal event");
  const heard = await changesOf({ event: "UPDATE", payload: { table: "deals", op: "UPDATE" } }, TID);
  assert.deepEqual(
    heard.map((c) => [c.table, c.event, c.row.tenant_id, wantsRefresh(peopleOverride, c.table, c)]),
    [["deals", "UPDATE", TID, true]],
    "this workspace's deal, as the deals table's change: People repaints",
  );
});

/** A person as the peek reads them (contracts DealPerson over the People row), for the card the peek draws. */
const personFor = (id, over = {}) => {
  const r = globalThis.window.__PEOPLE.rows.find((x) => x.id === id);
  return {
    id: r.id,
    name: r.name,
    dealsOn: true,
    services: ["Color correction", "Extensions"],
    deal: r.deal,
    deals: r.deal ? [r.deal] : [],
    replyVia: "WhatsApp",
    replyWindow: { open: true, hoursLeft: 20 },
    consent: { state: "opted_in", dnc: false },
    openThread: `inbox/${r.threadId}`,
    threadId: r.threadId,
    proposal: r.deal && r.deal.proposal ? { url: r.deal.proposal.url, sent: null } : null,
    ownMessages: [],
    askedMs: r.askedMs,
    consultedMs: r.consultedMs,
    consultationVisit: r.consultationVisit,
    consultationTitle: null,
    ...over,
  };
};
const peekOf = (tree) => byTestId(tree, "pipeline-peek");
const tick = () => new Promise((r) => setTimeout(r, 0));

test("a row opens its deal in a peek beside the rows: the head at once, the person page's own card as they land, its acts, and the two doors", async () => {
  await fresh();
  const asked = [];
  const reads = [];
  globalThis.window.__peekPerson = () => null;
  globalThis.window.__personDetail = (id) => {
    reads.push(id);
    return Promise.resolve(personFor(id));
  };
  globalThis.window.openDealSheet = (ask) => {
    asked.push(ask);
    return true;
  };
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  tree = draw();
  const peek = peekOf(tree);
  assert.ok(peek, "the peek, beside the rows");
  assert.deepEqual([peek.props.role, peek.props["aria-label"]], ["dialog", "Wes"]);
  assert.deepEqual(opened, [], "the page stays");
  assert.equal(textOf(byTestId(peek, "pipeline-peek-name")), "Wes");
  assert.equal(textOf(byTestId(peek, "pipeline-peek-sub")), "Proposal out · Color correction");
  assert.ok(byTestId(peek, "pipeline-peek-reading"), "the person is still on their way: said, never a blank");
  assert.deepEqual(reads, ["wes"], "read through the profile's own courier");
  await tick();
  tree = draw();
  const card = byTestId(peekOf(tree), "person-deal-card");
  assert.ok(card, "the person page's own card");
  assert.equal(textOf(byTestId(card, "person-deal-title")), "Color correction");
  assert.equal(textOf(byTestId(card, "person-deal-value")), "$1,200");
  assert.equal(textOf(byTestId(card, "person-deal-next")), "Send proposal", "the card's one next act");
  // The facts under it are People's row's; the doors are two quiet words.
  assert.deepEqual(
    all(peekOf(tree), (n) => /^pipeline-peek-(heard|quote|next)$/.test(n.props?.["data-testid"] || "")).map(textOf),
    [globalThis.window.__PEOPLE.rows.find((r) => r.id === "wes").lastContact.label, "“Thanks”"],
  );
  // A send opens their thread with the words in the box, the person page's own way.
  click(byTestId(card, "person-deal-next"));
  const threadId = globalThis.window.__PEOPLE.rows.find((r) => r.id === "wes").threadId;
  assert.equal(went.at(-1), `inbox/${threadId}`);
  const carried = JSON.parse(globalThis.sessionStorage.getItem("chanlytics-compose"));
  assert.equal(carried.threadId, threadId);
  assert.ok(carried.text.includes("docs.example.com/proposal"), "the proposal's link, in the words");
  // Every other act asks the one sheet.
  const won = all(card, (n) => n.props?.["data-testid"] === "person-deal-move").find(
    (n) => textOf(n) === "Mark as client",
  );
  click(won);
  assert.deepEqual(asked, [{ personId: "wes", mode: "won", dealId: "d-proposed-11" }]);
  // The doors.
  click(byTestId(peekOf(tree), "pipeline-peek-page"));
  assert.deepEqual(opened, ["wes"]);
  click(byTestId(peekOf(tree), "pipeline-peek-thread"));
  assert.equal(went.at(-1), `inbox/${threadId}`);
  // Close puts the peek away and leaves the rows as they were.
  click(byTestId(peekOf(tree), "pipeline-peek-close"));
  tree = draw();
  assert.equal(peekOf(tree), null);
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("the peek reads the person again when a deal is recorded on them, opens on the tab's copy where there is one, and says a read that failed", async () => {
  await fresh();
  const reads = [];
  globalThis.window.__peekPerson = (id) => (id === "cat" ? personFor("cat") : null);
  globalThis.window.__personDetail = (id) => {
    reads.push(id);
    return id === "nia" ? Promise.reject(new Error("no route")) : Promise.resolve(personFor(id));
  };
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-cat").props.onClick();
  tree = draw();
  assert.ok(byTestId(peekOf(tree), "person-deal-card"), "the tab's copy: the card is there as the peek opens");
  assert.deepEqual(reads, ["cat"], "and the read goes out behind it");
  globalThis.window.dispatchEvent({ type: "deal:recorded", detail: { personId: "wes" } });
  assert.deepEqual(reads, ["cat"], "someone else's deal is not this peek's");
  globalThis.window.dispatchEvent({ type: "deal:recorded", detail: { personId: "cat" } });
  assert.deepEqual(reads, ["cat", "cat"], "a deal recorded on them reads them again");
  // And a step set, changed or done on them (the card in the peek draws their next step).
  globalThis.window.dispatchEvent({ type: "note:saved", detail: { personId: "cat" } });
  assert.deepEqual(reads, ["cat", "cat", "cat"], "a step saved on them reads them again");
  // A read that failed, with nothing held: said, with Retry.
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-nia").props.onClick();
  draw();
  await tick();
  tree = draw();
  const failed = byTestId(peekOf(tree), "pipeline-peek-failed");
  assert.ok(failed, "the house's FailedRead");
  assert.equal(byTestId(peekOf(tree), "person-deal-card"), null);
  const retry = find(failed, (n) => n.type === "button" && /again|retry/i.test(textOf(n)));
  assert.ok(retry, "with its Retry");
  click(retry);
  draw();
  assert.deepEqual(reads, ["cat", "cat", "cat", "nia", "nia"]);
});

test("on a desk the rows can be a board: every group a column, the cards, a drop that asks the sheet, a refused one that asks nothing, and the choice kept", async () => {
  const seen = await fresh();
  const asked = [];
  globalThis.window.openDealSheet = (ask) => {
    asked.push(ask);
    return true;
  };
  globalThis.localStorage.removeItem("pipeline.view");
  let tree = draw();
  const views = byTestId(tree, "pipeline-views");
  assert.deepEqual(
    all(views, (n) => n.type === "button").map((n) => [textOf(n), n.props["aria-pressed"]]),
    [
      ["List", true],
      ["Board", false],
    ],
  );
  assert.ok(
    find(tree, (n) => n.type === "table"),
    "the list first",
  );
  click(byTestId(tree, "pipeline-view-board"));
  tree = draw();
  assert.equal(seen.viewSaves.at(-1).view.layout, "board", "kept in the member's view");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
    "the board in the table's place",
  );
  const board = byTestId(tree, "pipeline-board");
  const cols = all(board, (n) => n.type === "section" && n.props?.["data-group"]);
  assert.deepEqual(
    cols.map((c) => [
      c.props["data-group"],
      textOf(byClass(c, "pl-sec-label")),
      textOf(byClass(c, "tally")),
      all(c, (n) => n.props?.["data-testid"] === "pipeline-card").length,
    ]),
    [
      ["consultations", "Consultations", "2", 2],
      ["proposals", "Proposal out", "2", 2],
      ["clients", "Clients", "1", 1],
      ["closed", "Passed or ended", "2", 0],
    ],
    "every group a column, in order; Passed or ended folded, its head counting for it",
  );
  assert.equal(textOf(byTestId(cols[3], "pipeline-col-toggle")), "Show");
  // A card is the row: its facts, its id for the cursor, a button for a keyboard, and draggable for an owner.
  const wes = find(board, (n) => n.props?.id === "person-wes");
  assert.deepEqual(
    [
      wes.props.role,
      wes.props.draggable,
      textOf(byTestId(wes, "pipe-service")),
      textOf(byTestId(wes, "pipe-value")),
      textOf(byTestId(wes, "pipe-in-stage")),
      textOf(byTestId(wes, "pipe-chip")),
    ],
    ["button", true, "Color correction", "$1,200", "11 d", "Nothing back"],
  );
  wes.props.onKeyDown({ key: "Enter", preventDefault() {} });
  tree = draw();
  assert.equal(textOf(byTestId(peekOf(tree), "pipeline-peek-name")), "Wes", "Enter on a card opens its peek");
  click(byTestId(peekOf(tree), "pipeline-peek-close"));
  tree = draw();
  // Wes into Clients: the column takes the drag, says so, and the drop asks the sheet for a yes.
  const cardOf = (t, id) => find(byTestId(t, "pipeline-board"), (n) => n.props?.id === `person-${id}`);
  const colOf = (t, key) => byTestId(t, `pipeline-col-${key}`);
  cardOf(tree, "wes").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  assert.match(cardOf(tree, "wes").props.className, /is-dragging/);
  const over = {
    taken: false,
    dataTransfer: {},
    preventDefault() {
      over.taken = true;
    },
  };
  colOf(tree, "clients").props.onDragOver(over);
  assert.equal(over.taken, true, "a column the card may drop into takes the drag");
  tree = draw();
  assert.match(colOf(tree, "clients").props.className, /is-over/);
  assert.match(colOf(tree, "consultations").props.className, /is-refused/, "one it may not dims");
  assert.doesNotMatch(colOf(tree, "proposals").props.className, /is-refused/, "its own column is neither");
  colOf(tree, "clients").props.onDrop({ preventDefault() {} });
  assert.deepEqual(asked, [{ personId: "wes", mode: "won", dealId: "d-proposed-11" }], "the sheet, for a yes");
  tree = draw();
  assert.equal(
    find(tree, (n) => /is-over|is-dragging/.test(n.props?.className || "")),
    null,
    "the drag is over",
  );
  // Wes into Consultations: the column refuses the drag, and the drop asks nothing.
  cardOf(tree, "wes").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  const refused = {
    taken: false,
    dataTransfer: {},
    preventDefault() {
      refused.taken = true;
    },
  };
  colOf(tree, "consultations").props.onDragOver(refused);
  assert.equal(refused.taken, false);
  colOf(tree, "consultations").props.onDrop({ preventDefault() {} });
  assert.equal(asked.length, 1, "nothing asked");
  // A pass proposed again, a client ended: each its own mode.
  tree = draw();
  click(byTestId(colOf(tree, "closed"), "pipeline-col-toggle"));
  tree = draw();
  cardOf(tree, "dan").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  colOf(tree, "proposals").props.onDrop({ preventDefault() {} });
  assert.deepEqual(asked.at(-1), { personId: "dan", mode: "again", dealId: "d-lost-8" });
  tree = draw();
  cardOf(tree, "cat").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  colOf(tree, "closed").props.onDrop({ preventDefault() {} });
  assert.deepEqual(asked.at(-1), { personId: "cat", mode: "ended", dealId: "d-won-12" });
  // Back to the list.
  tree = draw();
  click(byTestId(tree, "pipeline-view-list"));
  tree = draw();
  assert.ok(find(tree, (n) => n.type === "table"));
  // Saves go one at a time (clients-a.jsx plViewSaver): the list waits for the board's to land.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.viewSaves.at(-1).view.layout, "list");
});

test("a viewer's cards do not drag, and a phone keeps the list whatever was chosen", async () => {
  await fresh();
  globalThis.localStorage.setItem("pipeline.view", "board");
  globalThis.window.__ME = { role: "viewer" };
  try {
    let tree = draw();
    const wes = find(byTestId(tree, "pipeline-board"), (n) => n.props?.id === "person-wes");
    assert.equal(wes.props.draggable, undefined, "only an owner or an operator records, so only they drag");
    await onPhone(async () => {
      await fresh();
      globalThis.localStorage.setItem("pipeline.view", "board");
      tree = draw();
      assert.equal(byTestId(tree, "pipeline-board"), null);
      assert.equal(byTestId(tree, "pipeline-views"), null, "no switch on a phone");
      assert.ok(
        find(tree, (n) => n.type === "table"),
        "the list",
      );
    });
  } finally {
    globalThis.window.__ME = { role: "owner" };
    globalThis.localStorage.removeItem("pipeline.view");
  }
});

test("the words in the box find a deal's service too", async () => {
  await fresh();
  let tree = draw();
  byTestId(tree, "pipeline-search").props.onChange({ target: { value: "color corr" } });
  tree = draw();
  assert.deepEqual(
    rowIds(tree),
    ["wes", "nia", "cat", "ed", "dan"],
    "everyone with a deal for it, the folded group opened",
  );
  byTestId(tree, "pipeline-search").props.onChange({ target: { value: "" } });
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

/* ------------------------------------------------------------------------------ the Pipeline's own views */

test('"No link" is a fact at rest, said when nothing else is: a plain dot, never the warning', () => {
  const fresh = toPersonRowVM(
    personRow(NOW, "pip", "Pip", deal(NOW, "proposed", { proposed: 2, url: null })),
    TZ,
    new Date(NOW),
  );
  assert.deepEqual(pipelineOf([fresh], NOW, TZ, null).groups[0].rows[0].chip, { words: "No link", tone: "plain" });
  const dated = toPersonRowVM(
    personRow(NOW, "pia", "Pia", deal(NOW, "proposed", { proposed: 2, url: null, validUntil: "2026-09-30" })),
    TZ,
    new Date(NOW),
  );
  assert.deepEqual(
    pipelineOf([dated], NOW, TZ, null).groups[0].rows[0].chip,
    { words: "Valid until Sep 30", tone: "plain" },
    "its day says more than its missing link",
  );
});

test("the address carries the view and the person open over it, and a service keeps its separators out", () => {
  assert.equal(pipelineRoute({}), "clients/pipeline");
  assert.equal(pipelineRoute({ view: "all", peek: null }), "clients/pipeline");
  assert.equal(pipelineRoute({ view: "proposals" }), "clients/pipeline:v-proposals");
  assert.equal(pipelineRoute({ view: "waiting", peek: "wes" }), "clients/pipeline:v-waiting:p-wes");
  const svc = pipelineRoute({ view: "svc:Hair: color / cut", peek: "5b3c1a2e-0000-4000-8000-000000000001" });
  assert.equal(svc, "clients/pipeline:v-s.Hair%3A%20color%20%2F%20cut:p-5b3c1a2e-0000-4000-8000-000000000001");
  assert.deepEqual(parsePipelineRoute(svc), {
    view: "svc:Hair: color / cut",
    peek: "5b3c1a2e-0000-4000-8000-000000000001",
  });
  for (const view of [
    "all",
    "consultations",
    "proposals",
    "clients",
    "closed",
    "waiting",
    "lapsed",
    "svc:Ad management",
  ])
    assert.deepEqual(parsePipelineRoute(pipelineRoute({ view, peek: "cat" })), { view, peek: "cat" }, view);
  // The shell hands the page its param, which starts with the scope's own word.
  assert.deepEqual(parsePipelineRoute("pipeline:v-clients"), { view: "clients", peek: null });
  // Anything else in the address is left, as Leads leaves it; an address that is not the Pipeline's is none.
  assert.deepEqual(parsePipelineRoute("clients/pipeline:v-bogus:x-1:p-a:b"), { view: "all", peek: "a" });
  assert.deepEqual(
    parsePipelineRoute("clients/pipeline:v-s.%E0%A4"),
    { view: "all", peek: null },
    "a name that does not decode",
  );
  assert.equal(parsePipelineRoute("clients/leads:l-all"), null);
  assert.equal(parsePipelineRoute(""), null);
  assert.equal(
    pipelineRoute({ view: "bogus", peek: "a:b" }),
    "clients/pipeline",
    "no view it cannot read, no id with a separator",
  );
  assert.deepEqual(
    ["all", "proposals", "closed", "waiting", "lapsed", "svc:Ad management"].map((v) => pipelineViewLabel(v, null)),
    ["All deals", "Proposal out", "Passed or ended", "Nothing back in a week", "Lapsed", "Ad management"],
  );
  assert.equal(isPipelineView("svc:"), false);
  assert.equal(isPipelineView("svc: "), false);
});

test("a view holds only its rows, and the line stays the whole Pipeline's", () => {
  const whole = pipelineOf(fixture(), NOW, TZ, null);
  const of = (view) => pipelineOf(fixture(), NOW, TZ, null, view);
  const shape = (vm) => vm.groups.map((g) => [g.key, ids(g), g.collapsed]);
  assert.deepEqual(shape(of("proposals")), [["proposals", ["wes", "nia", "lars", "will", "val", "fay"], false]]);
  assert.deepEqual(
    shape(of("closed")),
    [["closed", ["ed", "abe", "dan", "eve"], false]],
    "the group someone picked is shown, not folded",
  );
  assert.deepEqual(shape(of("waiting")), [["proposals", ["wes", "nia"], false]]);
  assert.deepEqual(shape(of("lapsed")), [["proposals", ["lars"], false]]);
  assert.equal(of("consultations").groups[0].meta, "3 held in the last week, no proposal yet");
  for (const view of ["proposals", "waiting", "lapsed", "closed"])
    assert.deepEqual(of(view).summary, whole.summary, `${view}: the line is the whole Pipeline's`);
  // A service's deals, in every group they stand in; a consultation has no deal yet, so no service.
  const mixed = [
    personRow(
      NOW,
      "a1",
      "Al",
      deal(NOW, "proposed", { proposed: 3, service: "Ad management", cents: 250_000, per: "month" }),
    ),
    personRow(
      NOW,
      "b1",
      "Bo",
      deal(NOW, "won", { proposed: 30, decided: 9, service: "Ad management", cents: 150_000, per: "month" }),
    ),
    personRow(NOW, "c1", "Cy", deal(NOW, "proposed", { proposed: 2, service: "Branding" })),
    personRow(NOW, "d1", "Di", { visits: visits(null, visit(ny("09-21", 10))) }),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const ads = pipelineOf(mixed, NOW, TZ, null, "svc:Ad management");
  assert.deepEqual(shape(ads), [
    ["proposals", ["a1"], false],
    ["clients", ["b1"], false],
  ]);
  assert.deepEqual(
    ads.groups.map((g) => g.meta),
    ["$2,500 a month", "$1,500 a month"],
    "what the view's own rows come to",
  );
  assert.equal(pipelineOf(mixed, NOW, TZ, null, "svc:Nothing").empty, true);
});

test("the line's warn parts open their view; the totals are words", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  assert.deepEqual(
    vm.line.map((p) => [p.words, p.view, p.tone]),
    [
      ["6 proposals out", null, null],
      ["$4,250", null, null],
      ["2 waiting over a week", "waiting", "warn"],
      ["1 lapsed", "lapsed", "warn"],
      ["3 clients", null, null],
      ["$1,340 a month", null, null],
    ],
  );
  assert.deepEqual(
    vm.summary,
    vm.line.map((p) => p.words),
  );
});

test("the Pipeline's rail: every group always, what waits only when some does, the busiest services", () => {
  const rail = pipelineRail(pipelineOf(fixture(), NOW, TZ, null), NOW);
  assert.deepEqual(
    rail.map((s) => [s.key, s.label, s.rows.map((r) => [r.view, r.label, r.count, r.tone])]),
    [
      [
        "deals",
        "Deals",
        [
          ["all", "All deals", 21, null],
          ["consultations", "Consultations", 8, null],
          ["proposals", "Proposal out", 6, null],
          ["clients", "Clients", 3, null],
          ["closed", "Passed or ended", 4, null],
        ],
      ],
      [
        "waiting",
        "Waiting on you",
        [
          ["waiting", "Nothing back in a week", 2, "warn"],
          ["lapsed", "Lapsed", 1, "warn"],
        ],
      ],
      ["services", "Services", [["svc:Color correction", "Color correction", 12, null]]],
    ],
  );
  // Nothing waiting, no service named: those sections are not drawn; the groups keep the rail's shape.
  const quiet = pipelineRail(
    pipelineOf(
      [toPersonRowVM(personRow(NOW, "s", "Sara", { visits: visits(visit(ny("09-25", 14)), null) }), TZ, new Date(NOW))],
      NOW,
      TZ,
      null,
    ),
    NOW,
  );
  assert.deepEqual(
    quiet.map((s) => [s.key, s.rows.map((r) => [r.view, r.count])]),
    [
      [
        "deals",
        [
          ["all", 1],
          ["consultations", 1],
          ["proposals", 0],
          ["clients", 0],
          ["closed", 0],
        ],
      ],
    ],
  );
  // Eight services at most, the busiest first, then by name.
  const many = Array.from({ length: 11 }, (_, i) =>
    personRow(
      NOW,
      `p${i}`,
      `P${i}`,
      deal(NOW, "proposed", { proposed: 2, service: i < 3 ? "Zeta" : `S${String(i).padStart(2, "0")}` }),
    ),
  ).map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const svcRows = pipelineRail(pipelineOf(many, NOW, TZ, null), NOW).find((s) => s.key === "services").rows;
  assert.equal(svcRows.length, PIPELINE_RAIL_SERVICES);
  assert.deepEqual(
    svcRows.slice(0, 3).map((r) => [r.label, r.count]),
    [
      ["Zeta", 3],
      ["S03", 1],
      ["S04", 1],
    ],
  );
});

test("a recorded move lands on the row as the door answers: the Pipeline regroups while People is still being read again", async () => {
  await fresh();
  const { recordDeal } = await import("../../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
  const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const before = globalThis.window.__PEOPLE.rows.find((r) => r.id === "wes").deal;
  const now = Date.now();
  const dto = (over) => ({
    id: before.id,
    contact_id: "wes",
    service: "Color correction",
    stage: "proposed",
    proposed_at: iso(now - 11 * DAY),
    decided_at: null,
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version: 1,
    created_at: iso(now - 11 * DAY),
    proposal_url: "https://docs.example.com/proposal",
    valid_until: null,
    lost_reason: null,
    ...over,
  });
  const won = dto({ stage: "won", decided_at: iso(now), version: 2 });
  const old = globalThis.window.fetch;
  const asked = [];
  let answer = { deal: won, from: "proposed", decision_id: "dec-1", current: won };
  // The re-read behind the write (People and Reports, the refresh map's) is held until the test lets it land.
  let land;
  const held = new Promise((r) => {
    land = r;
  });
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push(`${init.method || "GET"} ${u.pathname}`);
    if (u.pathname === "/api/v1/contacts/wes/deal" && init.method === "POST")
      return json(200, { ok: true, data: answer });
    await held;
    return json(503, { ok: false, error: { code: "unavailable", message: "held" } });
  };
  // A runner, so the refresh map's re-read really runs: with none, a write has nothing to read again.
  const stop = startSurfaces([], () => () => {});
  const waited = () => new Promise((r) => setTimeout(() => r("still waiting"), 400));
  try {
    const r = await Promise.race([recordDeal("wes", { stage: "won", deal_id: before.id, version: 1 }), waited()]);
    assert.notEqual(
      r,
      "still waiting",
      "the sheet is answered as the door takes the move, not once People is read again",
    );
    assert.equal(r.ok, true);
    assert.equal(globalThis.window.__PEOPLE.rows.find((x) => x.id === "wes").deal.stage, "won", "the row took it");
    // The refresh map is loaded as it is first asked for, so the re-read starts a few ticks after the answer.
    for (let i = 0; i < 30 && !asked.includes("GET /api/v1/contacts"); i += 1)
      await new Promise((res) => setTimeout(res, 10));
    assert.ok(asked.includes("GET /api/v1/contacts"), "and People is being read again behind it, not yet landed");
    const tree = draw();
    const clients = all(tree, (n) => n.type === "tbody" && n.props?.["data-section"] === "clients")[0];
    assert.deepEqual(
      all(clients, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
      ["person-wes", "person-cat"],
      "Wes is a client, the newest first",
    );
    // A move on someone's older deal is not the deal their row shows: the row takes the door's `current`, never the
    // deal it recorded. It took the recorded one, and jumped to Clients until the re-read.
    answer = {
      deal: dto({ id: "d-wes-older", service: "Ad management", stage: "won", amount_cents: 90_000, per: "month" }),
      from: "won",
      decision_id: "dec-2",
      current: won,
    };
    const again = await Promise.race([
      recordDeal("wes", { stage: "won", deal_id: "d-wes-older", version: 1, amount_cents: 90_000 }),
      waited(),
    ]);
    assert.equal(again.ok, true);
    const row = globalThis.window.__PEOPLE.rows.find((x) => x.id === "wes");
    assert.deepEqual([row.deal.id, row.deal.service], [before.id, "Color correction"], "the row's own deal stays");
    // No `current` in the answer (a server from before it): the row waits for the re-read.
    answer = { deal: dto({ stage: "lost", decided_at: iso(now), version: 3 }), from: "won", decision_id: "dec-3" };
    await Promise.race([recordDeal("wes", { stage: "lost", deal_id: before.id, version: 2 }), waited()]);
    assert.equal(globalThis.window.__PEOPLE.rows.find((x) => x.id === "wes").deal.stage, "won");
    const { placeDeal } = await import("../../../../apps/dashboard/src/legacy-bridge/surfaces/people.ts");
    assert.equal(placeDeal("nobody-here", won), false, "someone People does not hold: nothing to move");
  } finally {
    land();
    stop();
    await new Promise((res) => setTimeout(res, 20));
    globalThis.window.fetch = old;
  }
});

test("a person a link names stays open where this tab kept a cursor in that view: the address's person takes the cursor", async () => {
  await fresh();
  // The tab's place for the whole Pipeline (usePlPlace): the cursor was left on Wes.
  globalThis.window.__tabMemory = {
    place: (page, view) => (page === "pipeline" && view === "all" ? { q: "", cursor: "wes", top: 0 } : null),
    keepPlace() {},
    draft: () => null,
    keepDraft() {},
    dropDraft() {},
  };
  try {
    let tree;
    for (let i = 0; i < 4; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
    assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Nia", "the link's person");
    assert.deepEqual([went, replaced], [[], []], "and the address is left as the link said it");
    assert.equal(press("j"), true);
    for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
    assert.deepEqual(replaced, ["clients/pipeline:p-cat"], "the keys walk on from the person the link opened");
  } finally {
    delete globalThis.window.__tabMemory;
  }
});

test("a view nobody touched is not written to the workspace: a first open saves nothing on the member's row", async () => {
  const seen = await fresh();
  for (let i = 0; i < 3; i += 1) draw();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen.viewSaves, [], "the defaults were written for a member who had saved nothing");
  // A choice is theirs, and saved.
  click(byTestId(draw(), "pipeline-view-board"));
  draw();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.viewSaves.at(-1).view.layout, "board");
});

test("a viewer sees New proposal and why they may not press it, and a press opens nothing", async () => {
  await fresh();
  const keep = globalThis.window.ST_STORE;
  globalThis.window.ST_STORE = { can: () => false, myRole: () => "viewer" };
  try {
    let tree = draw();
    const open = byTestId(tree, "pipeline-new-open");
    assert.deepEqual([open.props["aria-disabled"], typeof open.props["aria-description"]], [true, "string"]);
    let stopped = false;
    open.props.onClick({
      preventDefault() {},
      stopPropagation() {
        stopped = true;
      },
      currentTarget: {},
    });
    tree = draw();
    assert.equal(stopped, true, "the gate's own press, which says why");
    assert.equal(byTestId(tree, "pipeline-new"), null, "nothing opened");
  } finally {
    globalThis.window.ST_STORE = keep;
  }
});

/* ------------------------------------------------------------------------------ the page: the row carries the deal */

const rowNode = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `person-${id}`);

test("the headings sort within each group, kept in the member's view: Value, then Person; the groups never move", async () => {
  const seen = await fresh();
  let tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
  click(find(tree, (n) => n.props?.className === "cl-th-sort" && textOf(n).startsWith("Value")));
  tree = draw();
  assert.deepEqual(
    rowIds(tree),
    ["hana", "sara", "nia", "wes", "cat"],
    "Nia's $3,050 over Wes's $1,200, in their own group",
  );
  await tick();
  assert.deepEqual([seen.viewSaves.at(-1).view.sortBy, seen.viewSaves.at(-1).view.sortDir], ["value", "desc"]);
  // Person: by name, A first, then the other way on a second press.
  click(find(tree, (n) => n.props?.className === "cl-th-sort" && textOf(n).startsWith("Person")));
  tree = draw();
  click(find(tree, (n) => n.props?.className === "cl-th-sort" && textOf(n).startsWith("Person")));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["sara", "hana", "wes", "nia", "cat"]);
  // Stage again: the Pipeline's own order, the way it opened, on the first press.
  click(find(tree, (n) => n.props?.className === "cl-th-sort" && textOf(n).startsWith("Stage")));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("Columns shows where they came from and the day a proposal stands until, as the member asks; the row's menu is not theirs to hide", async () => {
  const now = Date.now();
  const day = (d) => new Date(now + d * DAY).toISOString().slice(0, 10);
  await fresh({
    people: [
      ...peopleNow(),
      personRow(now, "val", "Val", deal(now, "proposed", { proposed: 3, validUntil: day(8) })),
      personRow(now, "lars", "Lars", deal(now, "proposed", { proposed: 7, validUntil: day(-9) })),
    ],
  });
  let tree = draw();
  const menu = find(tree, (n) => n.type === globalThis.window.PeopleColumnsMenu);
  assert.deepEqual(
    menu.props.options.map((o) => [o.key, o.on]),
    [
      ["name", true],
      ["service", true],
      ["value", true],
      ["stage", true],
      ["next", true],
      ["came", false],
      ["valid", false],
    ],
  );
  menu.props.onPick("valid");
  tree = draw();
  const valid = (id) => byTestId(rowNode(tree, id), "pipe-valid");
  assert.ok(textOf(valid("val")).trim(), "the day alone, under its heading");
  assert.equal(valid("val").props.className.includes("is-lapsed"), false);
  assert.equal(valid("lars").props.className.includes("is-lapsed"), true, "a day that has passed, in the warn ink");
  assert.match(textOf(valid("lars")), /^Lapsed /, "and in words, not by its colour alone");
  assert.equal(textOf(valid("cat")), "", "a client's deal stands until no day");
});

test("each row and card wears its deal's steps beside the time in stage, hidden from a screen reader that hears the head and the chip", async () => {
  await fresh();
  const tree = draw();
  const steps = (id) =>
    all(rowNode(tree, id), (n) => n.props?.className === "pipe-step").map(
      (n) => `${n.props["data-key"]}:${n.props["data-at"]}:${n.props["data-tone"]}`,
    );
  assert.deepEqual(
    steps("wes"),
    ["proposal:current:warn", "client:ahead:plain"],
    "waiting on the owner, as its chip says",
  );
  assert.deepEqual(steps("cat"), ["proposal:done:plain", "client:current:ok"]);
  assert.deepEqual(steps("hana"), ["consultation:done:plain", "proposal:current:warn", "client:ahead:plain"]);
  assert.deepEqual(steps("sara"), ["consultation:current:info", "proposal:ahead:plain", "client:ahead:plain"]);
  assert.equal(byTestId(rowNode(tree, "wes"), "pipe-track").props["aria-hidden"], "true");
  assert.equal(
    textOf(byTestId(rowNode(tree, "wes"), "pipe-in-stage")),
    "11 d",
    "the time in stage beside it, as before",
  );
  await onPhone(async () => {
    await fresh();
    const card = rowNode(draw(), "wes");
    assert.ok(byTestId(card, "pipe-track"), "a phone's card says the steps in its facts line");
  });
});

test("a row's menu: the deal's own acts where the member may record one, then their thread and their page; an act asks the one sheet", async () => {
  await fresh();
  const asked = [];
  globalThis.window.openDealSheet = (a) => asked.push(a);
  const menuOf = (tree, id) => find(rowNode(tree, id), (n) => n.type === globalThis.window.MoreMenu);
  let items = menuOf(draw(), "wes").props.items;
  assert.deepEqual(
    items.map((it) => (it.divider ? "—" : it.label)),
    [DEAL_ACT_WORDS.won, DEAL_ACT_WORDS.lost, DEAL_ACT_WORDS.edit, "—", "Open the thread", "Open their page"],
    "the thread's Deal group but its send, which is the peek's",
  );
  items[0].onClick();
  const wes = globalThis.window.__PEOPLE.rows.find((r) => r.id === "wes");
  assert.deepEqual(asked, [{ personId: "wes", mode: "won", dealId: wes.deal.id }]);
  items.at(-1).onClick();
  assert.deepEqual(opened, ["wes"], "their page");
  items.at(-2).onClick();
  assert.equal(went.at(-1), `inbox/${wes.threadId}`, "their thread");
  // A consultation held: start one, with nothing to name a deal by.
  items = menuOf(draw(), "hana").props.items;
  items[0].onClick();
  assert.deepEqual(asked.at(-1), { personId: "hana", mode: "propose", dealId: null });
  // Someone who passed before and came back for a consultation: a new proposal, as dragging their card asks, never
  // the old passed deal's Propose again.
  const now = Date.now();
  await fresh({
    people: [
      ...peopleNow(),
      personRow(now, "bea", "Bea", {
        ...deal(now, "lost", { proposed: 40, decided: 30, reason: "timing" }),
        visits: visits(null, visit(now - 2 * DAY)),
      }),
    ],
  });
  items = menuOf(draw(), "bea").props.items;
  assert.equal(items[0].label, DEAL_ACT_WORDS.propose);
  items[0].onClick();
  assert.deepEqual(asked.at(-1), { personId: "bea", mode: "propose", dealId: null });
  // A viewer keeps the door and sees no act it may not press.
  globalThis.window.__ME = { role: "viewer" };
  try {
    assert.deepEqual(
      menuOf(draw(), "wes").props.items.map((it) => it.label),
      ["Open the thread", "Open their page"],
    );
  } finally {
    globalThis.window.__ME = { role: "owner" };
  }
});

test("a selection: People's bar leads with Mark as passed · N; why is asked once, the bridge records them, what it came to is said once, and only those who passed leave the selection", async () => {
  await fresh();
  const flashes = [];
  const keepToast = globalThis.window.usePPToast;
  const keepPass = globalThis.window.__passDeals;
  globalThis.window.usePPToast = () => [null, (f) => flashes.push(f)];
  const dealOfRow = (id) => globalThis.window.__PEOPLE.rows.find((r) => r.id === id).deal;
  const asked = [];
  globalThis.window.__passDeals = async (items, reason) => {
    asked.push({ items, reason });
    return { passed: ["wes"], changed: ["nia"], failed: [] };
  };
  try {
    let tree = draw();
    const table = find(tree, (n) => n.type === globalThis.window.PeopleTable);
    assert.equal(table.props.selectable, true);
    for (const id of ["wes", "nia", "cat"]) table.props.onToggle(id);
    tree = draw();
    const bar = byTestId(tree, "bulk-bar");
    assert.ok(bar, "People's own bar");
    assert.equal(textOf(byTestId(bar, "pipe-pass-open")).trim(), "Mark as passed · 2", "a client does not pass");
    click(byTestId(bar, "pipe-pass-open"));
    tree = draw();
    const ask = byTestId(tree, "pipe-pass");
    assert.equal(ask.props["aria-labelledby"], "pipe-pass-ask", "the question names itself once");
    assert.equal(textOf(byTestId(ask, "pipe-pass-rest")), "1 is not a proposal out and stays as it is");
    assert.equal(byTestId(ask, "pipe-pass-go").props.disabled, true, "why comes first");
    // Esc in the question cancels the question, not the selection.
    let prevented = false;
    ask.props.onKeyDown({
      key: "Escape",
      preventDefault() {
        prevented = true;
      },
    });
    tree = draw();
    assert.deepEqual([prevented, byTestId(tree, "pipe-pass"), !!byTestId(tree, "bulk-bar")], [true, null, true]);
    click(byTestId(tree, "pipe-pass-open"));
    tree = draw();
    find(byTestId(tree, "pipe-pass"), (n) => n.type === globalThis.window.RecordToggleGroup).props.onChange("price");
    tree = draw();
    await byTestId(tree, "pipe-pass-go").props.onClick();
    assert.deepEqual(asked, [
      {
        items: [
          { personId: "wes", dealId: dealOfRow("wes").id },
          { personId: "nia", dealId: dealOfRow("nia").id },
        ],
        reason: "price",
      },
    ]);
    assert.deepEqual(flashes.at(-1), {
      tone: "warn",
      msg: "1 marked as passed · 1 had changed, and was left as it is",
    });
    tree = draw();
    assert.deepEqual(
      [...find(tree, (n) => n.type === globalThis.window.PeopleTable).props.sel].sort(),
      ["cat", "nia"],
      "only Wes, who passed, leaves the selection: the one that had changed, and the client, stay picked",
    );
  } finally {
    globalThis.window.usePPToast = keepToast;
    globalThis.window.__passDeals = keepPass;
  }
});

test("beside an open peek on a desk the table keeps who and where they stand; the peek says the rest", async () => {
  await fresh();
  let tree = draw();
  rowNode(tree, "wes").props.onClick();
  tree = draw();
  assert.ok(peekOf(tree));
  assert.deepEqual(
    all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).map(textOf),
    ["", "Person", "Where it stands"],
  );
  // Closed again, the table has all its columns back.
  press("Escape");
  tree = draw();
  assert.equal(
    all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).length,
    8,
  );
});

test("the peek says how to reach them and what happened, once they are read; on a phone the next act and Call are pinned under it", async () => {
  await fresh();
  const keepPeek = globalThis.window.__peekPerson;
  const keepDetail = globalThis.window.__personDetail;
  const wesPerson = () =>
    personFor("wes", {
      phone: "+1 555-000-1114",
      email: "wes@example.com",
      hasChat: true,
      timeline: [
        {
          id: "t1",
          ts: 1,
          time: "",
          day: "Sep 12",
          kind: "deal",
          who: "You",
          text: "Proposal out · Color correction · $1,200",
        },
        { id: "t2", ts: 2, time: "", day: "Mon", kind: "customer", who: "Wes", text: "Thanks" },
      ],
    });
  globalThis.window.__peekPerson = () => wesPerson();
  globalThis.window.__personDetail = () => Promise.resolve(wesPerson());
  try {
    let tree = draw();
    rowNode(tree, "wes").props.onClick();
    tree = draw();
    const reach = byTestId(peekOf(tree), "pipeline-peek-reach");
    assert.deepEqual(
      all(reach, (n) => /^pipeline-peek-reach-(phone|email|replies)$/.test(n.props?.["data-testid"] || "")).map((n) =>
        textOf(n),
      ),
      ["Phone+1 555-000-1114CallCopy", "Emailwes@example.comCopy", "RepliesAny message, for 20 more hours"],
    );
    assert.equal(byTestId(reach, "pipeline-peek-call").props.href, "tel:+15550001114");
    assert.deepEqual(
      all(byTestId(peekOf(tree), "pipeline-peek-history"), (n) => n.props?.className === "pipe-peek-history-row").map(
        textOf,
      ),
      ["Proposal out · Color correction · $1,200Sep 12"],
    );
    assert.equal(
      byTestId(peekOf(tree), "pipeline-peek-bar"),
      null,
      "a desk has no pinned bar: the card's act is beside the rows",
    );
  } finally {
    globalThis.window.__peekPerson = keepPeek;
    globalThis.window.__personDetail = keepDetail;
  }
  await onPhone(async () => {
    await fresh();
    globalThis.window.__peekPerson = () => wesPerson();
    globalThis.window.__personDetail = () => Promise.resolve(wesPerson());
    try {
      let tree = draw();
      rowNode(tree, "wes").props.onClick();
      tree = draw();
      const bar = byTestId(peekOf(tree), "pipeline-peek-bar");
      assert.equal(
        textOf(byTestId(bar, "pipeline-peek-bar-act")),
        dealNextAct(wesPerson(), Date.now()).label,
        "the card's own next act",
      );
      assert.equal(byTestId(bar, "pipeline-peek-bar-call").props.href, "tel:+15550001114");
    } finally {
      globalThis.window.__peekPerson = keepPeek;
      globalThis.window.__personDetail = keepDetail;
    }
  });
});

test("on the board a card wears its steps and a Move to menu of the columns it may go to, and a column shows twenty, then Show N more", async () => {
  const now = Date.now();
  const many = Array.from({ length: 25 }, (_, i) =>
    personRow(
      now,
      `p${String(i).padStart(2, "0")}`,
      `P${String(i).padStart(2, "0")}`,
      deal(now, "proposed", { proposed: 30 - i }),
    ),
  );
  await fresh({ people: [...peopleNow(), ...many] });
  const asked = [];
  globalThis.window.openDealSheet = (a) => asked.push(a);
  let tree = draw();
  click(byTestId(tree, "pipeline-view-board"));
  tree = draw();
  const col = byTestId(tree, "pipeline-col-proposals");
  const cards = () =>
    all(byTestId(draw(), "pipeline-col-proposals"), (n) => n.props?.["data-testid"] === "pipeline-card");
  assert.equal(cards().length, 20, "the first twenty");
  assert.equal(textOf(byTestId(col, "pipeline-col-more")), "Show 7 more", "of twenty-seven proposals out");
  // A card's steps, and its Move to: the columns a proposal out may go to, each asking the one sheet.
  const first = find(col, (n) => n.props?.["data-testid"] === "pipeline-card");
  assert.ok(byTestId(first, "pipe-track"));
  const menu = find(col, (n) => n.type === globalThis.window.MoreMenu);
  assert.deepEqual(
    menu.props.items.map((it) => it.header || it.label),
    ["Move to", "Clients", "Passed or ended"],
  );
  menu.props.items[1].onClick();
  assert.equal(asked.at(-1).mode, "won");
  click(byTestId(col, "pipeline-col-more"));
  assert.equal(cards().length, 27, "and all of them, asked");
  // A viewer's cards neither drag nor move by menu.
  globalThis.window.__ME = { role: "viewer" };
  try {
    assert.equal(
      find(byTestId(draw(), "pipeline-col-proposals"), (n) => n.type === globalThis.window.MoreMenu),
      null,
    );
  } finally {
    globalThis.window.__ME = { role: "owner" };
  }
});

test("the bridge's pass reads each person afresh, records only a deal still a proposal out, tells a change from a failure, and reads People again once after the last whatever it answered", async () => {
  await fresh();
  const { passDeals } = await import("../../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
  const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const now = Date.now();
  const dealDto = (id, contact, stage, version) => ({
    id,
    contact_id: contact,
    service: "Color correction",
    stage,
    proposed_at: iso(now - 9 * DAY),
    decided_at: stage === "proposed" ? null : iso(now - DAY),
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version,
    created_at: iso(now - 9 * DAY),
    proposal_url: null,
    valid_until: null,
    lost_reason: null,
  });
  // As the person read answers: Ann still a proposal out, Bo a client since the rows were drawn, Cy's deal moved by a
  // teammate (the door refuses it), Di's read fails, Ed's write fails another way.
  const people = {
    ann: dealDto("d-ann", "ann", "proposed", 4),
    bo: dealDto("d-bo", "bo", "won", 7),
    cy: dealDto("d-cy", "cy", "proposed", 2),
    di: null,
    ed: dealDto("d-ed", "ed", "proposed", 5),
  };
  const detail = (id) => ({
    row: personRow(now, id, id.toUpperCase(), {}),
    identities: [],
    conversations: [],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    deals: people[id] ? [people[id]] : [],
    deals_on: true,
    services: ["Color correction"],
  });
  const old = globalThis.window.fetch;
  const asked = [];
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const method = init.method || "GET";
    asked.push(`${method} ${u.pathname}`);
    const one = u.pathname.match(/^\/api\/v1\/contacts\/([^/]+)$/);
    if (one && method === "GET") {
      if (one[1] === "di") return json(503, { ok: false, error: { code: "unavailable", message: "down" } });
      return json(200, { ok: true, data: { person: detail(one[1]) } });
    }
    const write = u.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/deal$/);
    if (write && method === "POST") {
      const body = JSON.parse(init.body);
      if (write[1] === "cy")
        return json(400, { ok: false, error: { code: "validation", message: DEAL_REFUSALS.moved } });
      if (write[1] === "ed") return json(403, { ok: false, error: { code: "forbidden", message: "No." } });
      const d = { ...people[write[1]], stage: "lost", version: body.version + 1, lost_reason: body.lost_reason };
      return json(200, { ok: true, data: { deal: d, from: "proposed", decision_id: "dec", current: d } });
    }
    // The one re-read after the pass (People's list, then Reports): answered, since the pass waits for it.
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  const stop = startSurfaces([], () => () => {});
  try {
    const out = await passDeals(
      ["ann", "bo", "cy", "di", "ed"].map((id) => ({ personId: id, dealId: `d-${id}` })),
      "price",
    );
    assert.deepEqual(out, { passed: ["ann"], changed: ["bo", "cy"], failed: ["di", "ed"] });
    const posts = asked.filter((a) => a.startsWith("POST"));
    assert.deepEqual(
      posts,
      ["POST /api/v1/contacts/ann/deal", "POST /api/v1/contacts/cy/deal", "POST /api/v1/contacts/ed/deal"],
      "Bo became a client since: nothing is written over him; Di could not be read: nothing is sent for her",
    );
    assert.equal(
      asked.filter((a) => a === "GET /api/v1/contacts").length,
      1,
      "People is read again once, after the last, though the last was refused",
    );
  } finally {
    stop();
    await new Promise((r) => setTimeout(r, 20));
    globalThis.window.fetch = old;
  }
});

test("the bridge publishes the deal kit the pages read, the card's next act with it", async () => {
  const { installPeopleCourier } = await import("../../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
  const keep = {};
  const names = ["__deal", "__recordDeal", "__passDeals", "__personDetail", "__peekPerson", "__warmPerson"];
  for (const k of names) keep[k] = globalThis.window[k];
  try {
    installPeopleCourier();
    // The bridge's own contracts, by name: this file and the bridge load the package as two module instances.
    assert.equal(globalThis.window.__deal.next.name, dealNextAct.name, "a phone's peek pins the card's own next act");
    assert.equal(globalThis.window.__deal.menu.name, dealMenuActs.name);
    assert.equal(typeof globalThis.window.__passDeals, "function");
  } finally {
    for (const k of names) globalThis.window[k] = keep[k];
  }
});

test("their next step on the page: a column after Stage that sorts by its day, in the warn ink once it has come; the phone's card and the board's say it, and Steps due holds only theirs", async () => {
  const now = Date.now();
  const day = (d) => zoneDayKey(now + d * DAY, ZONE);
  const withStep = (id, d, over = {}) => ({
    step_id: `s-${id}`,
    step_body: over.body,
    step_due_on: day(d),
    step_for_user_id: null,
    step_deal_id: over.dealId ?? null,
  });
  const people = () =>
    peopleNow().map((r) =>
      r.id === "wes"
        ? { ...r, ...withStep("wes", -2, { body: "Send the revised quote" }) }
        : r.id === "nia"
          ? { ...r, ...withStep("nia", 5, { body: "Ask about the date", dealId: r.deal_id }) }
          : r,
    );
  const seen = await fresh({ people: people() });
  let tree = draw();
  const heads = all(tree, (n) => n.props?.className === "cl-th-sort").map((n) => textOf(n).trim());
  const at = (w) => heads.findIndex((h) => h.startsWith(w));
  assert.ok(at("Next step") === at("Stage") + 1, `after Stage: ${heads.join(", ")}`);
  const cell = (id) => byTestId(rowNode(tree, id), "pipe-next");
  const wesWhen = stepDayOf(day(-2), ZONE, now).words;
  assert.equal(textOf(byClass(cell("wes"), "pipe-next-words")), "Send the revised quote");
  assert.equal(textOf(byClass(cell("wes"), "pipe-next-when")), wesWhen);
  assert.equal(cell("wes").props["data-due"], "past", "the warn ink is the stylesheet's, keyed on this");
  assert.equal(cell("nia").props["data-due"], "ahead");
  assert.equal(textOf(cell("cat")), "", "no step: an empty cell, never a word for nothing");
  assert.equal(cell("wes").props.title, "Send the revised quote", "the words whole, where the cell cuts them");
  // The heading sorts by the day, within each group, and the member's view keeps it.
  const nextHead = (t) => find(t, (n) => n.props?.className === "cl-th-sort" && textOf(n).startsWith("Next step"));
  click(nextHead(tree));
  tree = draw();
  await tick();
  assert.deepEqual(
    [seen.viewSaves.at(-1).view.sortBy, seen.viewSaves.at(-1).view.sortDir],
    ["next", "asc"],
    "the soonest day first, as a visit is",
  );
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
  click(nextHead(tree));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "nia", "wes", "cat"], "then the other way");
  await tick();
  assert.deepEqual([seen.viewSaves.at(-1).view.sortBy, seen.viewSaves.at(-1).view.sortDir], ["next", "desc"]);
  // Steps due in the rail: Wes alone, whose day has come; the view holds only him.
  const railRow = byTestId(tree, "pipeline-rail-row-steps");
  assert.ok(railRow, "the rail offers it while a step is due");
  click(railRow);
  assert.equal(went.at(-1), "clients/pipeline:v-steps");
  assert.deepEqual(rowIds(draw({ pipelineRoute: "pipeline:v-steps" })), ["wes"]);
  // The board's card: one quiet line under the chip.
  await fresh({ people: people() });
  click(byTestId(draw(), "pipeline-view-board"));
  const cards = all(byTestId(draw(), "pipeline-col-proposals"), (n) => n.props?.["data-testid"] === "pipeline-card");
  const wesCard = cards.find((c) => textOf(c).includes("Wes"));
  const line = byTestId(wesCard, "pipe-next");
  assert.deepEqual(
    [textOf(byClass(line, "pipe-next-words")), textOf(byClass(line, "pipe-next-when")), line.props["data-due"]],
    ["Send the revised quote", wesWhen, "past"],
  );
  const niaCard = cards.find((c) => textOf(c).includes("Nia"));
  assert.equal(byTestId(niaCard, "pipe-next").props["data-due"], "ahead", "a day ahead, in the quiet ink");
  const clients = all(byTestId(draw(), "pipeline-col-clients"), (n) => n.props?.["data-testid"] === "pipeline-card");
  assert.equal(
    byTestId(
      clients.find((c) => textOf(c).includes("Cat")),
      "pipe-next",
    ),
    null,
    "no step, no line",
  );
  // The phone's card: a fact after the time in stage.
  await onPhone(async () => {
    await fresh({ people: people() });
    const card = find(draw(), (n) => n.type === "tr" && n.props?.id === "person-wes");
    const step = byTestId(card, "pipe-next");
    assert.deepEqual(
      [textOf(byClass(step, "pipe-next-words")), textOf(byClass(step, "pipe-next-when")), step.props["data-due"]],
      ["Send the revised quote", wesWhen, "past"],
    );
    assert.equal(
      byTestId(
        find(card, (n) => n.props?.className === "pl-card-facts"),
        "pipe-next",
      ),
      null,
      "a line of its own, under the facts: it took the time in stage's room",
    );
  });
});

test("the peek hands the person's deals over once they are read: the step's fact until then, and its deal's card after", async () => {
  const now = Date.now();
  await fresh({
    people: peopleNow().map((r) =>
      r.id === "wes"
        ? {
            ...r,
            step_id: "s-wes",
            step_body: "Send the revised quote",
            step_due_on: zoneDayKey(now + 2 * DAY, ZONE),
            step_for_user_id: null,
            step_deal_id: "d-other",
          }
        : r,
    ),
  });
  const W = globalThis.window;
  W.__peekPerson = () => null;
  W.__personDetail = (id) => {
    const p = personFor(id);
    return Promise.resolve({ ...p, deals: [...p.deals, { ...p.deal, id: "d-other", service: "Extensions" }] });
  };
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  tree = draw();
  assert.ok(byTestId(peekOf(tree), "pipeline-peek-step"), "not read yet: the row's deal is not the step's");
  await tick();
  tree = draw();
  assert.equal(
    byTestId(peekOf(tree), "pipeline-peek-step"),
    null,
    "read: the open deal it names has a card of its own",
  );
});

test("the page waits by the workspace's pace as People reads it: the line, the rail, a search in the view and a phone's own button; none where deals are off", async () => {
  // Wes's proposal went eleven days ago, Nia's nine, and neither has heard back: past a week both wait; past an
  // eight-day pace and a fifth (ten days) only Wes does.
  await fresh({ dealPace: { median_days: 8, yeses: 6 } });
  let tree = draw();
  assert.deepEqual(globalThis.window.__PEOPLE.dealPace, {
    medianDays: 8,
    yeses: 6,
    waitDays: 10,
    longerThanUsual: true,
    words: "Usually 8 days to a yes",
  });
  assert.ok(lineParts(tree).includes("1 waiting longer than usual"), lineParts(tree).join(" · "));
  assert.match(textOf(byTestId(tree, "pipeline-rail-row-waiting")), /^Nothing back in 10 days/);
  tree = draw({ pipelineRoute: "pipeline:v-waiting" });
  assert.deepEqual(rowIds(tree), ["wes"], "the view holds those past the pace");
  // A search inside the view judges by the same pace: Nia is not waiting yet, Wes is.
  byTestId(tree, "pipeline-search").props.onChange({ target: { value: "nia" } });
  assert.deepEqual(rowIds(draw({ pipelineRoute: "pipeline:v-waiting" })), []);
  byTestId(draw({ pipelineRoute: "pipeline:v-waiting" }), "pipeline-search").props.onChange({
    target: { value: "wes" },
  });
  assert.deepEqual(rowIds(draw({ pipelineRoute: "pipeline:v-waiting" })), ["wes"]);
  // On a phone the view's own button says it as the rail does.
  await onPhone(async () => {
    await fresh({ dealPace: { median_days: 8, yeses: 6 } });
    const lists = byTestId(
      byTestId(draw({ pipelineRoute: "pipeline:v-waiting" }), "pipeline-phone-bar"),
      "pipeline-phone-lists",
    );
    assert.equal(textOf(byClass(lists, "pp-bar-pick-words")), "Nothing back in 10 days");
  });
  // Deals off: no pace, whatever the read said. Under five yeses: a week, as before.
  await fresh({ dealsOn: false, dealPace: { median_days: 8, yeses: 6 } });
  assert.equal(globalThis.window.__PEOPLE.dealPace, null);
  await fresh({ dealPace: { median_days: 8, yeses: 4 } });
  assert.ok(lineParts(draw()).includes("2 waiting over a week"));
});

test("the peek's card judges its wait by People's pace, as the rows beside it do, not by the person read's own", async () => {
  // People's pace is eight days (ten to wait); Nia's own read carries none, as one taken before a fifth yes would.
  await fresh({ dealPace: { median_days: 8, yeses: 6 } });
  const W = globalThis.window;
  W.__peekPerson = () => null;
  W.__personDetail = (id) => Promise.resolve({ ...personFor(id), dealPace: null });
  W.openDealSheet = () => true;
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-nia").props.onClick();
  draw();
  await tick();
  tree = draw();
  const card = byTestId(peekOf(tree), "person-deal-card");
  assert.ok(card, "the person page's own card, in the peek");
  assert.equal(byTestId(card, "person-deal-flag"), null, "nine days is within People's pace: nothing back is not said");
});

test("the peek's card says the follow-up has them where their row does (0006): the day its run goes, and no nudge of its own", async () => {
  // People's facts: a follow-up running under ask that has reached nobody yet. Wes's proposal went eleven days ago
  // with its link, and nothing back: in its next run.
  await fresh({
    followUp: {
      run_hour: 10,
      last_run_for: null,
      asks: true,
      purpose: "conversational",
      had: {},
      queued: {},
      held: {},
      heard: {},
    },
  });
  const W = globalThis.window;
  assert.equal(W.__PEOPLE.rows.find((r) => r.id === "wes").followUp?.kind, "will", "their row: in a run to come");
  W.__peekPerson = () => null;
  W.__personDetail = (id) => {
    const p = personFor(id);
    const went = { at: new Date(Date.now() - 11 * 86_400_000).toISOString(), via: "WhatsApp" };
    return Promise.resolve({ ...p, proposal: p.proposal ? { ...p.proposal, sent: went } : null });
  };
  W.openDealSheet = () => true;
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  draw();
  await tick();
  tree = draw();
  const card = byTestId(peekOf(tree), "person-deal-card");
  assert.match(textOf(byTestId(card, "person-deal-flag")), /^Follow-up to approve /);
  assert.equal(textOf(byTestId(card, "person-deal-next")), "Mark as client", "the run follows up: no second nudge");
});

test("a proposal waiting that the follow-up has in hand says the day its run goes, and whether it waits on the owner (0006); the rest keep Nothing back", () => {
  const with_ = (id, followUp) => fixture().map((r) => (r.id === id ? { ...r, followUp } : r));
  const said = (rows, id) => {
    const c = chipOf(pipelineOf(rows, NOW, TZ, null), id);
    return [c.words, c.tone];
  };
  const tomorrow = NOW + 86_400_000;
  assert.deepEqual(said(with_("wes", { kind: "will", atMs: tomorrow, asks: false }), "wes"), [
    "Follow-up tomorrow",
    "info",
  ]);
  assert.deepEqual(said(with_("wes", { kind: "will", atMs: tomorrow, asks: true }), "wes"), [
    "Follow-up to approve tomorrow",
    "info",
  ]);
  assert.deepEqual(
    said(with_("wes", { kind: "had", atMs: NOW - 86_400_000 }), "wes"),
    ["Nothing back", "warn"],
    "its one nudge went: the owner's now",
  );
  assert.deepEqual(said(fixture(), "wes"), ["Nothing back", "warn"], "no follow-up running: as it was");
});

test("the Pipeline tells Ask what it draws (the Phase 2 plan, D3): the people of its open groups, in their order, and its view", async () => {
  await fresh();
  delete globalThis.window.__askOnScreen;
  draw();
  const s = globalThis.window.__askOnScreen;
  assert.equal(s.key, "pipeline");
  assert.deepEqual(s.ids, ["hana", "sara", "wes", "nia", "cat"], "the rows on screen; a folded group's are not");
  assert.equal(s.view, "all");
  assert.equal(s.labels.length, s.ids.length);
});

test("People tells Ask what it draws (the Phase 2 plan, D3): the rows of its table, in the table's order, and its view", async () => {
  await fresh();
  delete globalThis.window.__askOnScreen;
  const tree = draw({ scope: "people" });
  const s = globalThis.window.__askOnScreen;
  assert.equal(s.key, "people");
  assert.ok(s.ids.length > 0);
  assert.deepEqual(s.ids, rowIds(tree).slice(0, 40), "the rows the table draws, in its order");
  assert.equal(s.view, "all");
});

test("the Pipeline tells Ask its rows in the member's order: sorted by name, the second one is the second drawn", async () => {
  await fresh();
  let tree = draw();
  const head = find(
    tree,
    (n) => n.props?.["data-testid"] === "pipe-sort-person" || n.props?.["data-sort"] === "person",
  );
  if (head && head.props.onClick) {
    head.props.onClick();
    tree = draw();
  }
  assert.deepEqual(
    globalThis.window.__askOnScreen.ids,
    rowIds(tree).slice(0, 40),
    "what the table draws, in its order",
  );
});
