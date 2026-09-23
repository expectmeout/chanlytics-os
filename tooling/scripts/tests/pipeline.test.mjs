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
import {
  CONSENT_SOURCES,
  DEAL_STAGE_WORDS,
  PIPELINE_GROUPS,
  PIPELINE_WORDS,
  clockNear,
  clockNearWhen,
  csvCell,
  dealOf,
  heardSinceProposal,
  mayReceive,
  offersYesRefusal,
  pipelineOf,
  stateOf,
  toPersonRowVM,
} from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

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
  const vm = pipelineOf(fixture(), NOW, TZ);
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
  const vm = pipelineOf(fixture(), NOW, TZ);
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
  assert.deepEqual(said("wes"), ["Nothing back in 11 d", "warn"]);
  assert.deepEqual(said("nia"), ["No link", "warn"], "no link to it outranks the wait: there is nothing to send again");
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
  const vm = pipelineOf(fixture(), NOW, TZ);
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
  const vm = pipelineOf(fixture(), NOW, TZ);
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
    pipelineOf(rows, NOW, TZ).summary.join(" · "),
    "3 proposals out · $4,250 · 1 waiting over a week · 2 clients · $1,340 a month",
  );
  // One of each, a once and a monthly amount summed apart, nobody waiting.
  const one = [
    personRow(NOW, "p1", "Pia", deal(NOW, "proposed", { proposed: 2, cents: 50_000 })),
    personRow(NOW, "c1", "Cal", deal(NOW, "won", { proposed: 30, decided: 20, cents: 100_000 })),
    personRow(NOW, "c2", "Cid", deal(NOW, "won", { proposed: 30, decided: 25, cents: 34_000, per: "month" })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.deepEqual(pipelineOf(one, NOW, TZ).summary, ["1 proposal out", "$500", "2 clients", "$1,000 + $340 a month"]);
  // No amounts on file: the counts alone. Only consultations and passes: nothing to say, and the line is not drawn.
  const counts = [personRow(NOW, "p1", "Pia", deal(NOW, "proposed", { proposed: 2 }))].map((r) =>
    toPersonRowVM(r, TZ, new Date(NOW)),
  );
  assert.deepEqual(pipelineOf(counts, NOW, TZ).summary, ["1 proposal out"]);
  const none = [
    personRow(NOW, "sara", "Sara", { visits: visits(visit(ny("09-25", 14)), null) }),
    personRow(NOW, "dan", "Dan", deal(NOW, "lost", { proposed: 8, decided: 3 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.deepEqual(pipelineOf(none, NOW, TZ).summary, []);
});

test("nobody to follow is an empty Pipeline, with its words for it", () => {
  const vm = pipelineOf([toPersonRowVM(personRow(NOW, "nobody", "Nobody"), TZ, new Date(NOW))], NOW, TZ);
  assert.deepEqual([vm.groups, vm.summary, vm.empty], [[], [], true]);
  assert.deepEqual(pipelineOf([], NOW, TZ).empty, true);
  assert.deepEqual(PIPELINE_WORDS.empty, { title: "No deals yet.", body: "Start a proposal from someone's page." });
  assert.deepEqual(PIPELINE_WORDS.columns, {
    person: "Person",
    service: "Service",
    value: "Value",
    stage: "In stage",
    chip: "Where it stands",
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
  const [row] = pipelineOf([allDay], NOW, TZ).groups[0].rows;
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
  assert.deepEqual(pipelineOf([called], NOW, TZ).groups[0].rows[0].chip, {
    words: "Heard back yesterday",
    tone: "info",
  });
});

test("a tie in a group goes by name, and a moment the row lacks goes last", () => {
  const same = [
    personRow(NOW, "b", "Bo", deal(NOW, "proposed", { proposed: 4 })),
    personRow(NOW, "a", "Al", deal(NOW, "proposed", { proposed: 4 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.deepEqual(ids(pipelineOf(same, NOW, TZ).groups[0]), ["a", "b"]);
  const undated = [
    personRow(NOW, "x", "Xi", { ...deal(NOW, "won", { proposed: 4 }), deal_proposed_at: null }),
    personRow(NOW, "y", "Yu", deal(NOW, "won", { proposed: 9, decided: 2 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const g = pipelineOf(undated, NOW, TZ).groups[0];
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
  // The amount as the deal holds it, beside its words, at every stage: what a total sums.
  assert.deepEqual(out.money, { amount_cents: 120_000, per: "once", currency: "USD" });
  assert.equal(out.amount, "$1,200");
  assert.deepEqual(dealOf(deal(NOW, "won", { decided: 1, cents: 34_000, per: "month" }), TZ, NOW).money, {
    amount_cents: 34_000,
    per: "month",
    currency: "USD",
  });
  assert.equal(dealOf(deal(NOW, "lost", { decided: 1 }), TZ, NOW).money, null, "no amount, nothing to sum");
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

test("the Pipeline's route waits for People's rows: it reads nothing else", async () => {
  const registry = await import("../../../apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.equal(registry.routeSurfaceFor("clients", "pipeline"), "people");
  assert.equal(registry.surfaceStateFor("clients", "pipeline"), "real");
  assert.equal(registry.surfaceRetiredTo("pipeline"), "clients", "the retired demo board still lands on People");
});

/* ------------------------------------------------------------------------------------------------- the page */

const TID = "t-studio";
const ZONE = TZ;
const listeners = {};
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
const { peopleOverride } = await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts"));
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();

/** People over the wire, as GET contacts answers: whether deals are on here, and any view saved (which lands in `viewSaves`). */
const wire = ({ people, dealsOn, total = people.length, hasMore = false }) => {
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
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"])
  globalThis[k] = globalThis.window[k];
// Menus, questions and glyphs as their props: nothing here presses them.
globalThis.MoreMenu = () => null;
globalThis.Confirm = () => null;
globalThis.ChannelGlyph = () => null;
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  AttnRow: () => null,
  CHANLY: { nav: (to) => went.push(to), R: { thread: (id) => `inbox/${id}` } },
  // The chrome bridge's state map (shell.ts): a chip's tone is the pill's, and nothing else.
  __chrome: { state: stateOf },
  __csvCell: csvCell,
  __ME: { role: "owner" },
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
  // What seed-globals.ts publishes for the page: contracts' own, never a stand-in that could say a word differently.
  __pipeline: { of: pipelineOf, words: PIPELINE_WORDS },
});
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
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
])
  globalThis[k] = globalThis.window[k];
// In the order both lists load them (manifest.ts, Chanlytics.html): the Pipeline before the page that draws it.
await import("../../../apps/dashboard/src/legacy/pages/pipeline-scope.jsx");
await import("../../../apps/dashboard/src/legacy/pages/clients-a.jsx");

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
const fresh = async ({ people = peopleNow(), dealsOn = true, total, hasMore } = {}) => {
  const seen = wire({ people, dealsOn, total, hasMore });
  await quietly(() => peopleOverride.apply());
  cells = [];
  went.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.localStorage.removeItem("chanlytics-people-view");
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
    onNavigate: (to) => went.push(to),
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

test("the Pipeline is People's rail with its third tab, the line, and the table in sections -- every word contracts'", async () => {
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
  const vm = pipelineOf(globalThis.window.__PEOPLE.rows, Date.now(), ZONE);
  const line = byTestId(tree, "pipeline-summary");
  assert.deepEqual(
    all(line, (n) => /^pl-standing-(total|reached)$/.test(n.props?.className || "")).map(textOf),
    vm.summary,
  );
  assert.deepEqual(vm.summary, ["2 proposals out", "$4,250", "2 waiting over a week", "1 client", "$1,000 a month"]);
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
  assert.deepEqual([th.props.scope, th.props.colSpan], ["rowgroup", 5]);
  // The headings are contracts', People's person cell first; nothing sorts.
  assert.deepEqual(
    all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).map((n) => textOf(n)),
    ["Person", "Service", "Value", "In stage", "Where it stands"],
  );
  // The chip's column says its name to a screen reader only: no one word is right above every chip.
  const chipHead = all(
    find(tree, (n) => n.type === "thead"),
    (n) => n.type === "th",
  ).at(-1);
  assert.deepEqual(
    chipHead.props.children.map((k) => [k.type, k.props.className, textOf(k)]),
    [["span", "rec-sr", "Where it stands"]],
    "the house's visually hidden words, and nothing seen",
  );
  assert.equal(
    find(tree, (n) => n.props?.className === "cl-th-sort"),
    null,
    "the order is the Pipeline's",
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
  assert.deepEqual([textOf(chip), chip.props["data-tone"]], ["Nothing back in 11 d", "warn"]);
  const nia = byTestId(
    find(tree, (n) => n.type === "tr" && n.props?.id === "person-nia"),
    "pipe-chip",
  );
  assert.deepEqual([textOf(nia), nia.props["data-tone"]], ["No link", "warn"]);
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

test("Passed or ended opens with its Show, folds again with Hide, and a row opens its person", async () => {
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
  assert.deepEqual(opened, ["dan"], "a row opens the person, clients/<id>");
  click(byTestId(tree, "table-section-toggle"));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("the keys are People's: J walks the rows shown, Enter opens the person, and a folded group is passed by", async () => {
  await fresh();
  draw();
  for (let i = 0; i < 6; i += 1) {
    assert.equal(press("j"), true);
    draw();
  }
  assert.equal(press("Enter"), true);
  assert.deepEqual(opened, ["cat"], "the last row shown: Passed or ended is folded, and J stops at Cat");
  assert.equal(press("x"), false, "nothing here selects");
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

test("the Pipeline keeps no view of its own: no sort or columns saved, on this device or the workspace's", async () => {
  const seen = await fresh();
  let tree = draw();
  byTestId(tree, "pipeline-search").props.onChange({ target: { value: "wes" } });
  tree = draw();
  draw();
  assert.deepEqual(seen.viewSaves, [], "People's saved view is People's alone");
  assert.equal(globalThis.localStorage.getItem("chanlytics-people-view"), null);
  assert.equal(globalThis.localStorage.getItem("chanlytics-leads-view"), null);
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
  const parts = all(byTestId(tree, "pipeline-summary"), (n) =>
    /^pl-standing-(total|reached)$/.test(n.props?.className || ""),
  ).map(textOf);
  assert.equal(parts.at(-1), globalThis.window.plLoadedWords(people.rows.length, 1400));
  assert.equal(parts.at(-1), `${people.rows.length} of 1,400 loaded`, "People's words: N of M loaded");
  assert.deepEqual(parts.slice(0, -1), pipelineOf(people.rows, people.fetchedAt, ZONE).summary);
});

test("with nobody to follow, the table says so in contracts' words", async () => {
  await fresh({ people: [personRow(Date.now(), "nobody", "Nobody")] });
  const tree = draw();
  assert.equal(byTestId(tree, "pipeline-summary"), null, "a line with nothing in it is not drawn");
  assert.match(textOf(tree), /No deals yet\./);
  assert.match(textOf(tree), /Start a proposal from someone's page\./);
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

test("the switch goes to each scope's own address", async () => {
  await fresh();
  const tree = draw();
  for (const id of ["scope-people", "scope-leads", "scope-pipeline"]) click(byTestId(tree, id));
  assert.deepEqual(went, ["clients", "clients/leads", "clients/pipeline"]);
  // A rail pick opens that list on People.
  const rail = find(tree, (n) => typeof n.props?.onPickSaved === "function");
  rail.props.onPick("proposal_out");
  rail.props.onPickSaved("s1");
  assert.deepEqual(went.slice(3), ["clients/seg:proposal_out", "clients/list:s1"]);
});

test("on a phone: one bar with the switch and search and no list to pick, then the line and People's cards", () =>
  onPhone(async () => {
    await fresh();
    const tree = draw();
    assert.equal(byClass(tree, "cl-rail"), null, "no rail: the switch is the bar's");
    assert.equal(byClass(tree, "cl-controls"), null, "no controls row");
    const bar = byTestId(tree, "pipeline-phone-bar");
    assert.deepEqual(
      all(bar, (n) => n.props?.role === "tab").map((n) => [textOf(n), n.props["aria-selected"]]),
      [
        ["People", false],
        ["Leads", false],
        ["Pipeline", true],
      ],
    );
    assert.equal(byTestId(bar, "pipeline-phone-lists"), null, "the Pipeline is one view: no list to pick");
    assert.equal(byTestId(bar, "pipeline-phone-search-open").props["aria-label"], "Search by name or phone");
    assert.ok(byTestId(tree, "pipeline-summary"));
    const card = find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes");
    assert.match(card.props.className, /\bpl-card-row\b/);
    assert.equal(textOf(find(card, (n) => n.props?.className === "pl-card-name")), "Wes");
    assert.equal(textOf(byTestId(card, "pipe-chip")), "Nothing back in 11 d");
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
  }));
