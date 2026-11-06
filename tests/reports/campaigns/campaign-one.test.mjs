/**
 * Reports › Campaigns narrowed to one campaign (Ruben, 21 Oct 2026: each campaign separated as Reports › Ads separates each
 * ad): its address says the sequence after the days and keeps it across a period; its cards are counted from the batches its
 * History counts, so a day of History and its report say the same; and the picker lists the sequences that have sent, under
 * how each starts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_SCOPE_WORDS as W,
  campaignChoicesOf,
  campaignOneOf,
  campaignReportRoute,
  historyFigures,
  lensRoute,
  reportsParamParts,
} from "@chanlytics/contracts";

const SEQ = "5d0b7c1e-0000-4000-8000-000000000001";
const TZ = "America/New_York";

test("the address says one campaign after the days, reads back the same, and every campaign is no word at all", () => {
  const days = { from: "2026-10-01", to: "2026-10-21" };
  const one = { kind: "sequence", id: SEQ };
  assert.equal(campaignReportRoute(days, one), `reports/campaigns:2026-10-01~2026-10-21:seq:${SEQ}`);
  assert.equal(campaignReportRoute(null, one), `reports/campaigns:seq:${SEQ}`, "the scope alone, over the period kept");
  assert.equal(campaignReportRoute(days), "reports/campaigns:2026-10-01~2026-10-21", "every campaign: the days alone");
  assert.deepEqual(reportsParamParts(`campaigns:2026-10-01~2026-10-21:seq:${SEQ}`), {
    lens: "campaigns",
    days,
    scope: one,
    review: null,
  });
  assert.deepEqual(reportsParamParts(`campaigns:seq:${SEQ}`), {
    lens: "campaigns",
    days: null,
    scope: one,
    review: null,
  });
  assert.equal(reportsParamParts("campaigns:seq:"), null, "a scope with no sequence is no address");
  assert.equal(reportsParamParts("campaigns:ad:x"), null, "nor is an ad's scope on Campaigns");
  // A period picked keeps it (period.ts writes lensRoute with the scope the address says); Ads' scope is not Campaigns'.
  assert.equal(lensRoute("campaigns", days, one), campaignReportRoute(days, one));
  assert.equal(lensRoute("people", days, one), "reports/people:2026-10-01~2026-10-21", "no other lens says it");
  assert.equal(lensRoute("ads", days, one), "reports/ads:2026-10-01~2026-10-21");
});

const batch = (id, state, over = {}) => ({
  id,
  state,
  run_for: null,
  at: "2026-10-18T13:00:00Z",
  scheduled_for: "2026-10-18T13:00:00Z",
  finished_at: null,
  people: 4,
  failure: null,
  place: 1,
  counts: {},
  ...over,
});

const NOW = Date.parse("2026-10-21T16:00:00Z");
const input = (batches, over = {}) => ({
  id: SEQ,
  name: "Halloween hours",
  timezone: TZ,
  steps: 1,
  batches,
  from: "2026-10-15",
  to: "2026-10-21",
  nowMs: NOW,
  ...over,
});

test("one campaign's figures are History's own over the same batches, a column a day, and each send in History's words", () => {
  const went = batch("b-1", "sent", { counts: { sent: 4, delivered: 3, read: 1, replied: 1 } });
  const failed = batch("b-2", "failed", {
    at: "2026-10-16T13:00:00Z",
    failure: "template_not_approved",
    counts: { sent: 0 },
  });
  const before = batch("b-0", "sent", { at: "2026-10-01T13:00:00Z", counts: { sent: 9, replied: 9 } });
  const waits = batch("b-3", "pending_approval", { at: "2026-10-21T13:00:00Z" });
  const vm = campaignOneOf(input([waits, went, failed, before]));
  assert.deepEqual(
    vm.figures,
    historyFigures([went, failed]),
    "the batches that went in these days, as History counts them",
  );
  assert.equal(vm.points.length, 7, "a column for every day shown");
  assert.deepEqual(
    vm.points.filter((p) => p.sent > 0).map((p) => [p.day, p.sent, p.replied]),
    [["2026-10-18", 4, 1]],
    "on the business's day it went",
  );
  assert.equal(vm.head, "Halloween hours sent 4 messages: 1 drew a reply.");
  assert.deepEqual(
    vm.sends.map((s) => [s.id, s.went]),
    [
      ["b-3", false],
      ["b-1", true],
      ["b-2", true],
    ],
    "every send of these days, newest first: one still to decide among them, none from before",
  );
  assert.match(vm.sends[2].said, /stopped: its WhatsApp version is no longer approved/, "why it stopped, in words");
  assert.equal(vm.byStep, null, "one step: no card by step");
  assert.equal(vm.empty, null);
  assert.deepEqual(vm.door, { label: W.open, to: `campaigns/sequences/${SEQ}/history` });
});

test("one campaign by step where it has several, and days in which nothing went out are said once", () => {
  const vm = campaignOneOf(
    input(
      [
        batch("b-1", "sent", { place: 1, counts: { sent: 5, delivered: 5, read: 2, replied: 1 } }),
        batch("b-2", "sent", { place: 2, at: "2026-10-20T13:00:00Z", counts: { sent: 3, delivered: 2, replied: 2 } }),
      ],
      { steps: 2 },
    ),
  );
  assert.deepEqual(
    vm.byStep.map((s) => [s.label, s.sent, s.replied]),
    [
      ["Step 1", 5, 1],
      ["Step 2", 3, 2],
    ],
  );
  const quiet = campaignOneOf(input([batch("b-0", "sent", { at: "2026-10-01T13:00:00Z", counts: { sent: 9 } })]));
  assert.deepEqual(quiet.empty, { title: W.nothing("Halloween hours"), body: W.nothingBody });
  assert.equal(quiet.head, `${W.nothing("Halloween hours")}.`);
  assert.equal(quiet.sentAny, false);
});

test("the picker lists every campaign first, then each sequence that has sent under how it starts, newest send first", () => {
  const row = (id, name, starts, last, state = "on") => ({ id, name, starts, state, last });
  const sent = (at) => ({ id: "b", at, sent: 1, replied: 0 });
  const rows = [
    row("a", "Win-back", "moment", sent("2026-10-10T00:00:00Z")),
    row("b", "Reminder", "moment", sent("2026-10-20T00:00:00Z")),
    row("c", "Cold intro", "leads", sent("2026-10-19T00:00:00Z")),
    row("d", "Halloween hours", "date", sent("2026-10-11T00:00:00Z")),
    row("e", "Never went", "list", null),
    row("f", "A draft", "date", null, "draft"),
  ];
  assert.deepEqual(
    campaignChoicesOf(rows, { kind: "all" }).map((c) => [c.key, c.group]),
    [
      ["all", "all"],
      ["seq:b", "customers"],
      ["seq:a", "customers"],
      ["seq:c", "leads"],
      ["seq:d", "dates"],
    ],
  );
  assert.ok(
    campaignChoicesOf(rows, { kind: "sequence", id: "e" }).some((c) => c.key === "seq:e"),
    "the one the address names is listed whatever it is",
  );
});
