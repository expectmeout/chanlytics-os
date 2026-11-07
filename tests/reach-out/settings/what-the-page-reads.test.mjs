/**
 * What How it reaches out reads beyond the config (decision 0113, GET settings/reach-out): the newest running sequence
 * Try it writes from, the claims' counts from the steps whose words carry them, and the mailbox as Connections says it.
 * The pure parts of the reader, run on chains in the shape listChains answers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { newestLeadSequence, stepsCarrying, claimCounts, mailboxShown } =
  await import("../../../apps/dashboard/src/server/readers/settings.ts");

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

test("the mailbox shown is the first that sends now, said as Connections says it", () => {
  const box = (id, state, extra = {}) => ({
    id,
    provider: "google",
    address: `${id}@example.com`,
    state,
    resting_until: null,
    sent_days: 8,
    daily_cap: 40,
    customer_domain: false,
    sent_today: 3,
    ...extra,
  });
  assert.equal(mailboxShown([], Date.now(), "UTC"), null);
  const shown = mailboxShown([box("paused", "paused"), box("maya", "connected")], Date.now(), "UTC");
  assert.equal(shown.address, "maya@example.com");
  assert.equal(typeof shown.pill, "string");
  assert.equal(mailboxShown([box("gone", "removed")], Date.now(), "UTC"), null);
});
