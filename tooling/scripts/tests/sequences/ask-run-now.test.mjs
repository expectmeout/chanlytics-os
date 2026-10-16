/**
 * Ask's Run now (decision 0060; the parity review's lane 1): propose_sequence's action run_now, the page's Run now as a
 * card. Each call the model makes runs through the registry over the database in memory, the sequence read as its record
 * reads it (00442 sequence_overview, sequence_steps_of): the card, whose commit is the call the page's press makes, or the
 * refusal in the model's words where the page offers no Run now (a batch that waits, a sequence not on).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROPOSAL_SPECS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ON = "11111111-1111-4111-8111-111111111111";
const WAITS = "11111111-1111-4111-8111-111111111112";
const PAUSED = "11111111-1111-4111-8111-111111111113";
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
const row = (id, name, over = {}) => ({
  id,
  name,
  starts: "moment",
  state: "on",
  created_at: "2026-09-01T12:00:00Z",
  first: {
    id,
    kind: "moment",
    trigger: "quiet_30",
    state: "running",
    policy_class: "reengage",
    run_hour: 10,
    list_id: null,
    list_key: null,
    list_name: null,
    search_id: null,
    search_name: null,
    owner_sends: false,
    until: null,
    trial_until: null,
    template_name: "come_back",
    template_language: "en_US",
  },
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
  row(PAUSED, "Old offer", { state: "paused", first: { ...row(PAUSED, "x").first, state: "paused" } }),
];
const RPCS = {
  sequence_overview: (a) => ROWS.filter((r) => r.id === a.p_sequence_id),
  sequence_steps_of: () => [],
};

async function call(input) {
  const supabase = fakeDb(
    {
      memberships: [
        { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
      ],
      tenants: [{ id: A, name: "Harbor", timezone: TZ, config: {} }],
      policies: [],
    },
    {},
    RPCS,
    { missing: true },
  );
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  const out = await buildProposal(t, "propose_sequence", { action: "run_now", ...input });
  const p = out.proposal;
  return p ? { kind: p.kind, title: p.title, payload: p.payload } : JSON.parse(out.result);
}

test("Run now is a card of the page's own verb, for a sequence that runs today with no batch waiting", async () => {
  const card = await call({ sequence_id: ON });
  assert.deepEqual(card, {
    kind: "playbook_run",
    title: "Run Win-back now",
    payload: { playbook_id: ON, name: "Win-back", timezone: TZ },
  });
  const commit = PROPOSAL_SPECS.playbook_run.commit({ id: "", kind: "playbook_run", payload: card.payload }, {});
  assert.deepEqual(commit, { route: "POST playbooks/[id]/run", params: { id: ON } });
});

test("where the page offers no Run now, the model hears why, and what to do instead", async () => {
  assert.match((await call({ sequence_id: WAITS })).error, /batch waiting for an OK: .*action batch/);
  assert.match((await call({ sequence_id: PAUSED })).error, /runs nothing today/);
});
