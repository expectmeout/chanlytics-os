/**
 * What Cold email reads beyond the config (decision 0113, GET settings/reach-out): the newest running sequence
 * Try it writes from, the claims' counts from the steps whose words carry them, and the mailbox as Connections says it.
 * The pure parts of the reader, run on chains in the shape listChains answers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mailboxConnectionDtoOf, mailboxIsLive } from "@chanlytics/contracts";
import { countHeldForAddress, countSentByStep } from "@chanlytics/db/campaigns";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { newestLeadSequence, stepsCarrying, claimCounts, mailboxShown, standingChainOf, standingFactsOf } =
  await import("../../../apps/dashboard/src/server/readers/settings.ts");
const { readReachOutMonthOrNull } = await import("../../../apps/dashboard/src/server/campaigns/month-sent.ts");
const { setServiceClient } = await import("../../../apps/dashboard/src/server/shared/service-db.ts");

const step = (id, n, body, extra = {}) => ({
  id,
  n,
  after_days: n === 0 ? null : 4,
  subject: n === 0 ? "Evening cleaning" : null,
  body,
  template_id: `t-${id}`,
  state: "running",
  hand: null,
  ...extra,
});

const chain = (root, at, steps, extra = {}) => ({
  root_id: root,
  name: `Clinics ${root}`,
  search: { id: `s-${root}`, name: "Clinics" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  mailbox_ids: [],
  signed_by: "Maya",
  signs_with: "name",
  steps,
  mailboxes: [],
  next: {},
  created_at: at,
  ...extra,
});

test("with nothing: no sequence, no counts", () => {
  assert.equal(newestLeadSequence([]), null);
  assert.deepEqual(stepsCarrying(["We clean 40 clinics."], []), []);
  assert.deepEqual(claimCounts(["We clean 40 clinics."], [], new Map()), [{ text: "We clean 40 clinics.", sends: 0 }]);
});

test("a count that could not be read is not a zero: each claim's count is unknown", () => {
  assert.deepEqual(claimCounts(["We clean 40 clinics."], [], null), [{ text: "We clean 40 clinics.", sends: null }]);
  const chains = [chain("a", "2026-11-01T00:00:00Z", [step("a0", 0, "{{opening}}\nWe clean 40 clinics.")])];
  assert.deepEqual(claimCounts(["We clean 40 clinics."], chains, null), [
    { text: "We clean 40 clinics.", sends: null },
  ]);
});

test("Try it writes from the newest running sequence whose first step is an email", () => {
  const chains = [
    chain("a", "2026-11-01T00:00:00Z", [step("a0", 0, "{{opening}}\nOld words")]),
    chain("b", "2026-11-05T00:00:00Z", [step("b0", 0, "{{opening}}\nNew words"), step("b1", 1, "Following up")]),
    chain("c", "2026-11-06T00:00:00Z", [step("c0", 0, "{{opening}}\nPaused words")], { state: "paused" }),
  ];
  const seq = newestLeadSequence(chains);
  assert.equal(seq.root_id, "b");
  assert.deepEqual(seq.first, { subject: "Evening cleaning", body: "{{opening}}\nNew words" });
  assert.deepEqual(seq.next, { after_days: 4, body: "Following up" });
  assert.equal(seq.search_id, "s-b");
  assert.equal(seq.signed_by, "Maya");
});

test("a claim counts the sent emails of the steps that carry it, word for word, and no other", () => {
  const chains = [
    chain("a", "2026-11-01T00:00:00Z", [
      step("a0", 0, "{{opening}}\nWe clean 40 clinics across Austin today."),
      step("a1", 1, "We clean many clinics."),
    ]),
  ];
  const claims = ["We clean 40 clinics across Austin today.", "Clinics stay with us three years on average."];
  assert.deepEqual(stepsCarrying(claims, chains), ["a0"]);
  assert.deepEqual(
    claimCounts(
      claims,
      chains,
      new Map([
        ["a0", 9],
        ["a1", 5],
      ]),
    ),
    [
      { text: "We clean 40 clinics across Austin today.", sends: 9 },
      { text: "Clinics stay with us three years on average.", sends: 0 },
    ],
  );
});

test("the steps' counts are one read, each step once, and with no step to count nothing is asked", async () => {
  const asked = [];
  const db = fakeDb(
    {},
    {},
    {
      sequence_sent_by_step: (args) => {
        asked.push(args);
        return [{ step_id: "a", sent: 12 }];
      },
    },
  );
  const T = "11111111-1111-4111-8111-111111111111";
  const counts = await countSentByStep(db, T, ["a", "b", "a"]);
  assert.deepEqual([...counts], [["a", 12]]);
  assert.deepEqual(asked, [{ p_tenant_id: T, p_step_ids: ["a", "b"] }]);
  assert.equal((await countSentByStep(db, T, [])).size, 0);
  assert.equal(asked.length, 1, "no step, no read");
});

test("the mailbox shown is the first that sends now, said as Connections says it", () => {
  // A mailbox as Connections is told of it: its row, through contracts' own builder (mailboxConnectionDtoOf).
  const box = (id, state) =>
    mailboxConnectionDtoOf(
      {
        id,
        provider: "google",
        address: `${id}@example.com`,
        host: "example.com",
        from_name: "Maya Ortiz",
        signature: null,
        state,
        held_why: null,
        held_at: null,
        resting_until: null,
        daily_cap: 40,
        customer_domain: false,
        sent_days: 8,
        dns: {},
        dns_checked_at: null,
        last_error: null,
        connected_at: "2026-10-30T12:00:00Z",
        sent_at: null,
        synced_at: null,
      },
      { sent_today: 3 },
    );
  assert.equal(mailboxShown([], Date.now(), "UTC"), null);
  const shown = mailboxShown([box("paused", "paused"), box("maya", "connected")], Date.now(), "UTC");
  assert.equal(shown.address, "maya@example.com");
  assert.equal(typeof shown.pill, "string");
  assert.equal(mailboxShown([box("gone", "removed")], Date.now(), "UTC"), null);
  assert.equal(mailboxIsLive(box("gone", "removed")), false);
  assert.equal(mailboxIsLive(box("paused", "paused")), true);
});

test("the month's first emails are the service role's count, and a count that fails is none, never a zero", async () => {
  // The count is a function only the service role may call: read as the member, it was refused, and the page said 0.
  const T = "11111111-1111-4111-8111-111111111111";
  const at = new Date("2026-11-07T12:00:00Z");
  setServiceClient(fakeDb({}, {}, { reach_out_month_sent: () => 12 }));
  assert.equal(await readReachOutMonthOrNull(T, at), 12);
  const refused = () => {
    throw new Error("permission denied for function reach_out_month_sent");
  };
  setServiceClient(fakeDb({}, {}, { reach_out_month_sent: refused }));
  assert.equal(await readReachOutMonthOrNull(T, at), null);
  setServiceClient(null);
});

test("the page's one answer speaks of the sequence waiting for an OK, else the newest running", () => {
  const older = chain("a", "2026-11-01T00:00:00Z", [step("a0", 0, "Words")], { next: { waiting_run_id: "run-a" } });
  const newer = chain("b", "2026-11-05T00:00:00Z", [step("b0", 0, "Words")], { next: { waiting_run_id: null } });
  const off = chain("c", "2026-11-06T00:00:00Z", [step("c0", 0, "Words")], {
    state: "paused",
    next: { waiting_run_id: "run-c" },
  });
  assert.equal(standingChainOf([older, newer, off]).root_id, "a");
  assert.equal(standingChainOf([newer, off]).root_id, "b");
  assert.equal(standingChainOf([off]), null);
});

const STANDING_INPUT = {
  report: null,
  mailboxes: [],
  hasAddress: true,
  heldForAddress: 0,
  month: { sent: 34, of: 2000 },
  hasSearch: true,
  hasPitch: true,
  whoFor: null,
  nowMs: Date.UTC(2026, 10, 9),
  tz: "UTC",
};
const report = (runs = []) => ({
  steps: [
    { id: "b0", n: 0, written: 30, wrote_back: 4, interested: 2 },
    { id: "b1", n: 1, written: 4, wrote_back: 1, interested: 0 },
  ],
  runs,
  can_remove: false,
});

test("the numbers come from that sequence's report, added across its steps, newest sequence first", () => {
  const a = chain("a", "2026-11-01T00:00:00Z", [step("a0", 0, "Words")], {
    next: { waiting_run_id: null },
    people: { waiting: 7, writing: 0, done: 0 },
  });
  const b = chain("b", "2026-11-05T00:00:00Z", [step("b0", 0, "Words")], {
    next: { waiting_run_id: null },
    people: { waiting: 40, writing: 3, done: 0 },
  });
  const facts = standingFactsOf({ ...STANDING_INPUT, chains: [a, b], report: report() });
  assert.deepEqual(
    facts.running.map((r) => [r.root_id, r.sent, r.wroteBack, r.interested, r.waitingLeads]),
    [
      ["b", 34, 5, 2, 40],
      ["a", null, null, null, 7],
    ],
  );
});

test("a report that could not be read leaves the numbers out, and says neither first nor next of its run", () => {
  const b = chain("b", "2026-11-05T00:00:00Z", [step("b0", 0, "Words")], {
    next: { waiting_run_id: "run-b" },
    people: null,
  });
  const facts = standingFactsOf({ ...STANDING_INPUT, chains: [b], report: null });
  assert.equal(facts.hasPitch, true, "whether a pitch is said rides through as it was read");
  assert.equal(standingFactsOf({ ...STANDING_INPUT, hasPitch: false, chains: [], report: null }).hasPitch, false);
  assert.deepEqual(facts.running[0], {
    root_id: "b",
    name: "Clinics b",
    fed_by: null,
    search_id: "s-b",
    sent: null,
    wroteBack: null,
    interested: null,
    waitingLeads: null,
  });
  assert.deepEqual(facts.waitingRun, { id: "run-b", planned: null, name: "Clinics", first: null });
});

test("a waiting run's size is the report's, and it is the first only while nothing has gone", () => {
  const b = chain("b", "2026-11-05T00:00:00Z", [step("b0", 0, "Words")], { next: { waiting_run_id: "run-b" } });
  const runs = [{ id: "run-b", step_id: "b0", run_for: null, state: "pending_approval", planned: 10, written: 0 }];
  const later = standingFactsOf({ ...STANDING_INPUT, chains: [b], report: report(runs) });
  assert.deepEqual(later.waitingRun, { id: "run-b", planned: 10, name: "Clinics", first: false });
  const none = { steps: [{ id: "b0", n: 0, written: 0, wrote_back: 0, interested: 0 }], runs, can_remove: true };
  assert.equal(standingFactsOf({ ...STANDING_INPUT, chains: [b], report: none }).waitingRun.first, true);
});

test("emails held for an address are counted by that reason alone, in this workspace", async () => {
  const T = "11111111-1111-4111-8111-111111111111";
  const O = "22222222-2222-4222-8222-222222222222";
  const send = (tenant_id, state, reason) => ({ tenant_id, state, reason, lead_id: "l" });
  const db = fakeDb({
    sequence_sends: [
      send(T, "held", "no_business_address"),
      send(T, "held", "no_business_address"),
      send(T, "held", "no_signed_by"),
      send(T, "sent", "no_business_address"),
      send(O, "held", "no_business_address"),
    ],
  });
  assert.equal(await countHeldForAddress(db, T), 2);
});

test("a read that failed claims nothing: the one answer stands back, and never says to connect a mailbox", async () => {
  const { readFile } = await import("node:fs/promises");
  const reader = await readFile("apps/dashboard/src/server/readers/settings.ts", "utf8");
  assert.match(reader, /const decided = !!row && !!facts && !!mailboxes && !!chains;/);
  assert.match(reader, /standing: decided\n/);
  assert.match(reader, /sending: mailboxes \? coldEmailSendingOf/);
});
