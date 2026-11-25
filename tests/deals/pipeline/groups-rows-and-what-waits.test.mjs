/**
 * The Pipeline's groups and rows: four groups in order and each person in one, a row's one chip, the line's counts,
 * a tie by name, a consultation's next visit, Steps due, and the route waiting for People's rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEAL_STAGE_WORDS,
  PIPELINE_GROUPS,
  PIPELINE_WORDS,
  clockNear,
  clockNearWhen,
  dealOf,
  heardSinceProposal,
  isPipelineView,
  parsePipelineRoute,
  pipelinePersonOf,
  pipelineRowNow,
  pipelineOf,
  pipelineRail,
  pipelineRoute,
  pipelineViewLabel,
  toPersonRowVM,
  NOTE_WORDS,
} from "@chanlytics/contracts";
import {
  pipelineMove,
  pipelinePassMany,
  pipelineSorted,
} from "../../../apps/dashboard/src/surfaces/people/pipeline/board-view.ts";
import { pipelinePeekOf } from "../../../apps/dashboard/src/surfaces/people/pipeline/peek-view.ts";
import {
  DAY,
  H,
  NOW,
  TZ,
  byKey,
  chipOf,
  deal,
  fixture,
  ids,
  iso,
  ny,
  personRow,
  rowOf,
  stepCols,
  stepFixture,
  visit,
  visits,
} from "./_pipeline.mjs";

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

test("every open deal is a row of its own (0029): a client with a proposal out for another service is in both groups, two proposals out are two rows, each judged and moved on its own deal, and a person's first row keeps their id", () => {
  /** One of a person's open deals as people_list carries it (open_deals), dated in days before NOW. */
  const open = (id, stage, o = {}) => ({
    id,
    stage,
    service: o.service ?? "Color correction",
    proposed_at: iso(NOW - (o.proposed ?? 20) * DAY),
    decided_at: o.decided === undefined ? null : iso(NOW - o.decided * DAY),
    ended_at: null,
    amount_cents: o.cents ?? null,
    per: o.per ?? null,
    currency: o.currency ?? "USD",
    proposal_url: o.url === undefined ? "https://docs.example.com/proposal" : o.url,
    valid_until: null,
    lost_reason: null,
  });
  const rows = [
    // A client of SEO, billed in euros, with a proposal out for ads nine days: their row shows the proposal (open
    // first, then the newest), and open_deals holds both, the newest first.
    personRow(NOW, "mia", "Mia", {
      ...deal(NOW, "proposed", { proposed: 9, service: "Ads", cents: 80_000, per: "month" }),
      open_deals: [
        open("d-proposed-9", "proposed", { proposed: 9, service: "Ads", cents: 80_000, per: "month" }),
        open("d-won-40", "won", {
          proposed: 40,
          decided: 30,
          service: "SEO",
          cents: 150_000,
          per: "month",
          currency: "EUR",
        }),
      ],
    }),
    // Two proposals out: ads six days, a website twelve.
    personRow(NOW, "noa", "Noa", {
      ...deal(NOW, "proposed", { proposed: 6, service: "Ads" }),
      open_deals: [
        open("d-proposed-6", "proposed", { proposed: 6, service: "Ads" }),
        open("d-proposed-12", "proposed", { proposed: 12, service: "Website" }),
      ],
    }),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const vm = pipelineOf(rows, NOW, TZ, null);
  const g = byKey(vm);
  assert.deepEqual(
    g.proposals.rows.map((r) => [r.id, r.person.id, r.deal.id, r.service]),
    [
      ["noa_d-proposed-12", "noa", "d-proposed-12", "Website"],
      ["mia", "mia", "d-proposed-9", "Ads"],
      ["noa", "noa", "d-proposed-6", "Ads"],
    ],
    "the one waiting longest first; the row a person's People row shows keeps their id",
  );
  assert.deepEqual(
    g.clients.rows.map((r) => [r.id, r.person.id, r.deal.id, r.service]),
    [["mia_d-won-40", "mia", "d-won-40", "SEO"]],
    "the client a newer proposal hid",
  );
  assert.match(rowOf(vm, "mia_d-won-40").value, /€/, "in its own currency");
  assert.deepEqual(
    [...new Set(vm.groups.flatMap((x) => x.rows.map((r) => r.id)))].length,
    4,
    "every row its own id: a board, a selection and a peek tell them apart",
  );
  assert.deepEqual(
    ["noa_d-proposed-12", "mia_d-won-40", "noa"].map(pipelinePersonOf),
    ["noa", "mia", "noa"],
    "a row's id says whose it is",
  );
  // Each judged on its own deal: Noa's website (twelve days) and Mia's ads (nine) wait; Noa's ads (six) does not yet.
  assert.equal(vm.summary.join(" · "), "3 proposals out · 2 waiting over a week · 1 client");
  assert.equal(chipOf(vm, "noa_d-proposed-12").words, PIPELINE_WORDS.nothingBack);
  assert.notEqual(chipOf(vm, "noa")?.words, PIPELINE_WORDS.nothingBack);
  const waits = pipelineRail(vm, NOW).find((s) => s.key === "waiting");
  assert.equal(waits.rows.find((r) => r.view === "waiting").count, 2, "the rail counts the rows, as the line does");
  // A move is on the deal the row stands for, never the one their People row shows.
  assert.deepEqual(pipelineMove("proposals", "clients", rowOf(vm, "noa_d-proposed-12")), {
    mode: "won",
    dealId: "d-proposed-12",
  });
  assert.deepEqual(pipelineMove("clients", "closed", rowOf(vm, "mia_d-won-40")), { mode: "ended", dealId: "d-won-40" });
  // A selection's pass, as the page picks rows (their person with the row's deal): each the deal it picked.
  const picked = ["noa_d-proposed-12", "mia_d-won-40", "noa"].map((id) => {
    const r = rowOf(vm, id);
    return { ...r.person, deal: r.deal, rowId: r.id };
  });
  assert.deepEqual(pipelinePassMany(picked).deals, [
    { personId: "noa", dealId: "d-proposed-12", rowId: "noa_d-proposed-12" },
    { personId: "noa", dealId: "d-proposed-6", rowId: "noa" },
  ]);
  assert.equal(pipelinePassMany(picked).rest, "1 is not a proposal out and stays as it is");
});

test("a person's two open deals (0029's review): their next step is on the row of the deal it names, else on their first, so Steps due holds it once; the Value sort reads each row's own deal; a row renamed when another deal of theirs closes is found again by its deal", () => {
  const open = (id, service, days, o = {}) => ({
    id,
    stage: "proposed",
    service,
    proposed_at: iso(NOW - days * DAY),
    decided_at: null,
    ended_at: null,
    amount_cents: o.cents ?? null,
    per: o.per ?? null,
    currency: "USD",
    proposal_url: "https://docs.example.com/proposal",
    valid_until: null,
    lost_reason: null,
  });
  const noa = (over = {}) =>
    personRow(NOW, "noa", "Noa", {
      ...deal(NOW, "proposed", { proposed: 6, service: "Ads", cents: 50_000, per: "once" }),
      open_deals: [
        open("d-proposed-6", "Ads", 6, { cents: 50_000, per: "once" }),
        open("d-web", "Website", 12, { cents: 900_000, per: "once" }),
      ],
      ...over,
    });
  const vmOf = (raws, view = "all") =>
    pipelineOf(
      raws.map((r) => toPersonRowVM(r, TZ, new Date(NOW))),
      NOW,
      TZ,
      null,
      view,
    );
  // A step about the website, due today: on the website's row alone, and once under Steps due.
  const aboutWeb = [noa(stepCols(NOW, "noa", 0, { dealId: "d-web" }))];
  assert.deepEqual(
    [rowOf(vmOf(aboutWeb), "noa_d-web").next?.dealId, rowOf(vmOf(aboutWeb), "noa").next],
    ["d-web", null],
  );
  assert.deepEqual(
    vmOf(aboutWeb, "steps").groups.flatMap((g) => g.rows.map((r) => r.id)),
    ["noa_d-web"],
    "Steps due holds it once",
  );
  // A step about the person: on their first row alone.
  const aboutThem = vmOf([noa(stepCols(NOW, "noa", 0))]);
  assert.deepEqual([rowOf(aboutThem, "noa").next?.id, rowOf(aboutThem, "noa_d-web").next], ["s-noa", null]);
  // Value: each row's own deal, so someone between Noa's two deals ranks between them.
  const vm = vmOf([noa(), personRow(NOW, "wes", "Wes", deal(NOW, "proposed", { proposed: 11, cents: 200_000 }))]);
  assert.deepEqual(
    byKey(pipelineSorted(vm, "value", "desc")).proposals.rows.map((r) => r.id),
    ["noa_d-web", "wes", "noa"],
  );
  // The ads pass: the website is now the deal their row shows, and its row takes their id. What named it finds it.
  const after = vmOf([
    personRow(NOW, "noa", "Noa", {
      ...deal(NOW, "proposed", { proposed: 12, service: "Website", cents: 900_000, per: "once" }),
      deal_id: "d-web",
      open_deals: [open("d-web", "Website", 12, { cents: 900_000, per: "once" })],
    }),
  ]);
  assert.deepEqual(
    ["noa_d-web", "noa", "noa_d-gone", "nobody"].map((id) => pipelineRowNow(after, id)),
    ["noa", "noa", null, null],
  );
  assert.equal(pipelineRowNow(vm, "noa_d-web"), "noa_d-web", "a row still drawn is itself");
});

test("each row says one chip, and warn only where something waits on the owner", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const said = (id) => {
    const c = chipOf(vm, id);
    return c ? [c.words, c.tone] : null;
  };
  // Consultations: one that has ended with no proposal since waits on the owner, and says Past while nobody has marked it
  // (D1-consult-held: the record never infers that they came); one coming up is on its way.
  assert.deepEqual(said("hugo"), ["Past Fri · no proposal yet", "warn"]);
  assert.deepEqual(said("bea"), ["Past Sun · no proposal yet", "warn"]);
  assert.deepEqual(said("hana"), ["Past Mon · no proposal yet", "warn"]);
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

test("only the consultations' head says more than its count, no group what it comes to; only Passed or ended starts folded", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  assert.deepEqual(
    vm.groups.map((g) => [g.key, g.meta, g.collapsed]),
    [
      ["consultations", "3 ended in the last week, nothing since", false],
      ["proposals", null, false],
      ["clients", null, false],
      ["closed", null, true],
    ],
  );
  // A folded group's head counts its rows already: what opens it says "Show", not the count again.
  assert.deepEqual([PIPELINE_WORDS.show, PIPELINE_WORDS.hide], ["Show", "Hide"]);
  // Nothing held: the consultations say nothing more than their count.
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

test("the line says only the counts that have something: proposals out, the ones waiting, clients; never what they come to", () => {
  const rows = [
    personRow(NOW, "p1", "Pia", deal(NOW, "proposed", { proposed: 11, cents: 120_000, per: "once" })),
    personRow(NOW, "p2", "Paz", deal(NOW, "proposed", { proposed: 3, cents: 305_000, per: "once" })),
    personRow(NOW, "p3", "Pim", deal(NOW, "proposed", { proposed: 2 })),
    personRow(NOW, "c1", "Cal", deal(NOW, "won", { proposed: 30, decided: 20, cents: 100_000, per: "month" })),
    personRow(NOW, "c2", "Cid", deal(NOW, "won", { proposed: 30, decided: 25, cents: 34_000, per: "month" })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.equal(
    pipelineOf(rows, NOW, TZ, null).summary.join(" · "),
    "3 proposals out · 1 waiting over a week · 2 clients",
  );
  // One of each, with amounts on file, nobody waiting: still the counts alone.
  const one = [
    personRow(NOW, "p1", "Pia", deal(NOW, "proposed", { proposed: 2, cents: 50_000 })),
    personRow(NOW, "c1", "Cal", deal(NOW, "won", { proposed: 30, decided: 20, cents: 100_000 })),
    personRow(NOW, "c2", "Cid", deal(NOW, "won", { proposed: 30, decided: 25, cents: 34_000, per: "month" })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  assert.deepEqual(pipelineOf(one, NOW, TZ, null).summary, ["1 proposal out", "2 clients"]);
  // No amounts on file: the same. Only consultations and passes: nothing to say, and the line is not drawn.
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
    body: "Proposals you start show here.",
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
  // An all-day consultation on Monday ends at Tuesday's midnight: dated from its end it read "Past yesterday".
  const allDay = toPersonRowVM(
    personRow(NOW, "mona", "Mona", { visits: visits(null, visit(ny("09-21", 0), { allDay: true, hours: 24 })) }),
    TZ,
    new Date(NOW),
  );
  assert.equal(allDay.consultedMs, ny("09-22", 0), "the rule's moment is its end");
  const [row] = pipelineOf([allDay], NOW, TZ, null).groups[0].rows;
  assert.deepEqual(
    [row.chip.words, row.inStage],
    ["Past Mon · no proposal yet", "2 d"],
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

test("Steps due holds only the rows whose step's day has come, in every group; the rail counts them, in warn", () => {
  const vm = pipelineOf(stepFixture(), NOW, TZ, null, "steps");
  assert.deepEqual(
    vm.groups.map((g) => [g.key, ids(g), g.count, g.meta]),
    [
      ["proposals", ["wes"], 1, null],
      ["clients", ["cat"], 1, null],
    ],
    "Nia's step is ahead and Fay has none",
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
  const registry = await import("../../../apps/dashboard/src/bridge/surface-registry.ts");
  assert.equal(registry.routeSurfaceFor("clients", "pipeline"), "people");
  assert.equal(registry.surfaceStateFor("clients", "pipeline"), "real");
  assert.equal(registry.surfaceRetiredTo("pipeline"), "clients", "the retired demo board still lands on People");
  // Every view of it, and a person open over one, is the same People surface: the address family is one route.
  assert.equal(registry.routeSurfaceFor("clients", "pipeline:v-proposals:p-x"), "people");
  assert.equal(registry.routeSurfaceFor("clients", "pipeline:v-s.Ad%20management"), "people");
});
