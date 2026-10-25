/**
 * Ask's cards of a sequence's head (decision 0060; the parity review's lane 1; decision 0072): propose_sequence's actions
 * start, run_now, discard and end, each the page's own act as a card, offered where the page's judge offers it
 * (contracts sequenceActsOf). Each call the model makes runs through the registry over the database in memory, the
 * sequence read as its record reads it (00442 sequence_overview, sequence_steps_of; its batches for whether it ran): the
 * card, whose commit is the call the page's press makes, or the refusal in the judge's words, then what the model may do
 * instead, where the page offers no such act.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROPOSAL_SPECS, SEQUENCE_ACT_WHY, SEQUENCE_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ON = "11111111-1111-4111-8111-111111111111";
const WAITS = "11111111-1111-4111-8111-111111111112";
const PAUSED = "11111111-1111-4111-8111-111111111113";
const DRAFT = "11111111-1111-4111-8111-111111111114";
const FRESH = "11111111-1111-4111-8111-111111111115";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-15T13:00:00Z");

const needs = (waiting) => ({
  waiting,
  waiting_people: 0,
  held: 0,
  to_send: 0,
  replies: 0,
  oldest_at: null,
  batches: [],
});
const first = (id, state = "running") => ({
  id,
  kind: "moment",
  trigger: "quiet_30",
  state,
  policy_class: "reengage",
  run_hour: 10,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  owner_sends: false,
  until: null,
  words_ok_at: null,
  template_name: "come_back",
  template_language: "en_US",
});
const row = (id, name, over = {}) => ({
  id,
  name,
  starts: "moment",
  state: "on",
  created_at: "2026-09-01T12:00:00Z",
  first: first(id),
  date: null,
  steps: 1,
  channels: ["whatsapp"],
  needs: needs(0),
  next: null,
  last: null,
  in_it: 0,
  ...over,
});
const ROWS = [
  row(ON, "Win-back"),
  // Today's batch waits for an OK: the reader counts it as one an OK can still send (sequenceWaitsNow).
  row(WAITS, "Reminder", {
    needs: {
      ...needs(1),
      batches: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          step_id: WAITS,
          run_for: "2026-10-15",
          at: "2026-10-15T14:00:00Z",
          people: 3,
          audience: { kind: null, trigger: "quiet_30" },
        },
      ],
    },
  }),
  row(PAUSED, "Old offer", { state: "paused", first: first(PAUSED, "paused") }),
  row(DRAFT, "Welcome", { state: "draft", first: first(DRAFT, "paused") }),
  // Turned on a moment ago: it has made no batch yet.
  row(FRESH, "New clients"),
];
/** The batches the sequences made: each but the draft and the one just turned on has run. */
const BATCHES = [ON, WAITS, PAUSED].map((sequence_id, n) => ({
  id: `33333333-3333-4333-8333-33333333333${n}`,
  tenant_id: A,
  sequence_id,
}));
const RPCS = {
  sequence_overview: (a) => ROWS.filter((r) => r.id === a.p_sequence_id),
  sequence_steps_of: () => [],
};

async function call(action, input) {
  const supabase = fakeDb(
    {
      memberships: [
        { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
      ],
      tenants: [{ id: A, name: "Harbor", timezone: TZ, config: {} }],
      policies: [],
      sequence_batches: BATCHES,
      sequence_sends: [],
    },
    {},
    RPCS,
    { missing: true },
  );
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  const out = await buildProposal(t, "propose_sequence", { action, ...input });
  const p = out.proposal;
  return p ? { kind: p.kind, title: p.title, payload: p.payload } : JSON.parse(out.result);
}

test("Run now is a card of the page's own verb, for a sequence that runs today with no batch waiting", async () => {
  const card = await call("run_now", { sequence_id: ON });
  assert.deepEqual(card, {
    kind: "playbook_run",
    title: "Run Win-back now",
    payload: { playbook_id: ON, name: "Win-back", timezone: TZ },
  });
  const commit = PROPOSAL_SPECS.playbook_run.commit({ id: "", kind: "playbook_run", payload: card.payload }, {});
  assert.deepEqual(commit, { route: "POST playbooks/[id]/run", params: { id: ON } });
});

test("where the page offers no such act, the model hears why in the judge's words, and what to do instead", async () => {
  assert.equal(
    (await call("run_now", { sequence_id: WAITS })).error,
    `Reminder: ${SEQUENCE_ACT_WHY.batch_waiting} (approve or skip that batch with action batch)`,
  );
  assert.equal((await call("run_now", { sequence_id: PAUSED })).error, `Old offer: ${SEQUENCE_ACT_WHY.not_today}`);
  assert.equal(
    (await call("start", { sequence_id: PAUSED })).error,
    `Old offer: ${SEQUENCE_ACT_WHY.not_a_draft} (turn it on with action change (state running))`,
  );
  assert.equal(
    (await call("discard", { sequence_id: ON })).error,
    `Win-back: ${SEQUENCE_ACT_WHY.ran} (end it with action end)`,
  );
  assert.equal(
    (await call("end", { sequence_id: DRAFT })).error,
    `Welcome: ${SEQUENCE_ACT_WHY.never_ran} (let it go with action discard)`,
  );
  assert.equal(
    (await call("end", { sequence_id: FRESH })).error,
    `New clients: ${SEQUENCE_ACT_WHY.never_ran} (let it go with action discard)`,
  );
});

test("Start and Discard are the page's draft acts as cards, and Discard lets go of one just turned on that never ran", async () => {
  assert.deepEqual(await call("start", { sequence_id: DRAFT }), {
    kind: "sequence_start",
    title: "Start Welcome",
    payload: { sequence_id: DRAFT, name: "Welcome" },
  });
  for (const [id, name] of [
    [DRAFT, "Welcome"],
    [FRESH, "New clients"],
  ]) {
    const card = await call("discard", { sequence_id: id });
    assert.deepEqual(card, { kind: "sequence_discard", title: `Let go of ${name}`, payload: { sequence_id: id } });
    const commit = PROPOSAL_SPECS.sequence_discard.commit({ id: "", kind: "sequence_discard", payload: card.payload });
    assert.deepEqual(commit, { route: "DELETE sequences/[id]", params: { id } });
  }
});

test("End it is a card for a sequence that ran: the page's End, nothing undoes it", async () => {
  const card = await call("end", { sequence_id: PAUSED });
  assert.deepEqual(card, {
    kind: "sequence_end",
    title: "End Old offer",
    payload: { sequence_id: PAUSED, name: "Old offer" },
  });
  const commit = PROPOSAL_SPECS.sequence_end.commit({ id: "", kind: "sequence_end", payload: card.payload });
  assert.deepEqual(commit, { route: "DELETE playbooks/[id]", params: { id: PAUSED } });
  assert.equal(PROPOSAL_SPECS.sequence_end.undo, undefined);
  assert.ok(SEQUENCE_WORDS.endDetail);
});
