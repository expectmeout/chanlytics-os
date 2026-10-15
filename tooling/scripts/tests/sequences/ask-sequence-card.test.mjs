/**
 * Ask's sequence card (decision 0060, the parity review's W1): propose_campaign's action sequence, a customer's sequence
 * given a step at the end, a step's wait or words changed, or a step taken away -- each one of its page's own verbs, by
 * the card's op. Each call the model makes runs through the registry over the database in memory, the sequence read as
 * its record reads it (00442 sequence_overview, sequence_steps_of): the refusal in the model's words, or the card, whose
 * commit is the call the page's press makes.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROPOSAL_SPECS, SEQUENCE_EDIT_WORDS, SEQUENCE_FLOW_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "11111111-1111-4111-8111-111111111111";
const LEADS = "11111111-1111-4111-8111-111111111112";
const S1 = "22222222-2222-4222-8222-222222222221";
const S2 = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-15T16:00:00Z");

const needs = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
/** A sequence as the overview answers it: a moment's, or one to leads. */
const row = (id, starts, name) => ({
  id,
  name,
  starts,
  state: "on",
  created_at: "2026-09-01T12:00:00Z",
  first: {
    id,
    kind: starts === "leads" ? "reach_out" : "moment",
    trigger: starts === "leads" ? "lead_first" : "visited",
    state: "running",
    policy_class: "visit_followup",
    run_hour: 10,
    list_id: null,
    list_key: null,
    list_name: null,
    search_id: null,
    search_name: null,
    owner_sends: false,
    until: null,
    trial_until: null,
    template_name: "after_visit_check",
    template_language: "en_US",
  },
  date: null,
  steps: 2,
  channels: ["whatsapp"],
  needs,
  next: null,
  last: null,
  in_it: 4,
});
const step = (id, place, over = {}) => ({
  id,
  place,
  name: place === 1 ? "Thank you" : "Come back",
  kind: "moment",
  trigger: "visited",
  state: "running",
  after_days: place === 1 ? null : 14,
  only_if: place === 1 ? [] : ["no_booking"],
  channels: ["whatsapp"],
  template_id: MSG,
  template_name: "after_visit_check",
  template_language: "en_US",
  params: [],
  hand: null,
  next_words: null,
  sent: 0,
  replied: 0,
  ...over,
});

function world() {
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: A,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: TZ, config: {} }],
    policies: [],
  };
}

const RPCS = {
  sequence_overview: (a) =>
    [row(SEQ, "moment", "Thank you"), row(LEADS, "leads", "Dentists")].filter((r) => r.id === a.p_sequence_id),
  sequence_steps_of: (a) => (a.p_sequence_id === SEQ ? [step(S1, 1), step(S2, 2)] : [step(S1, 1)]),
};

/** One call the model makes, through the registry: the card, or the refusal it came to. */
async function call(input) {
  const supabase = fakeDb(world(), {}, RPCS, { missing: true });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  const out = await buildProposal(t, "propose_campaign", { action: "sequence", ...input });
  const p = out.proposal;
  return p ? { kind: p.kind, title: p.title, summary: p.summary, payload: p.payload } : JSON.parse(out.result);
}

test("a step at the end, a step's wait, its words and a step taken away: each its card, its op the page's verb", async () => {
  const added = await call({ sequence_id: SEQ, after_days: 7, only_if: ["no_booking"], template_id: MSG });
  assert.deepEqual(added, {
    kind: "sequence",
    title: "Add step 3 to Thank you",
    summary: `7 days after the step before · ${SEQUENCE_EDIT_WORDS.holds.no_booking}`,
    payload: {
      sequence_id: SEQ,
      op: "step",
      after_days: 7,
      only_if: ["no_booking"],
      template_id: MSG,
      params: [],
    },
  });
  // Approved, it makes the call the page's Add the step makes.
  const commit = (payload) => PROPOSAL_SPECS.sequence.commit({ id: "", kind: "sequence", payload }, { settings: null });
  assert.equal(commit(added.payload).route, "POST sequences/[id]/steps");

  const wait = await call({ sequence_id: SEQ, step_id: S2, after_days: 5 });
  assert.equal(wait.title, "Change step 2 of Thank you");
  assert.deepEqual(wait.payload, { sequence_id: SEQ, op: "step", step_id: S2, after_days: 5 });
  assert.equal(commit(wait.payload).route, "PUT sequences/[id]/steps/[step]");

  const words = await call({ sequence_id: SEQ, step_id: S2, template_id: MSG, params: ["@first_name"] });
  assert.equal(words.title, "New words for step 2 of Thank you");
  assert.deepEqual(words.payload, {
    sequence_id: SEQ,
    op: "words",
    step_id: S2,
    template_id: MSG,
    params: [{ kind: "first_name" }],
  });
  assert.equal(commit(words.payload).route, "POST sequences/[id]/steps/[step]/words");

  const gone = await call({ sequence_id: SEQ, step_id: S2, remove: true });
  assert.deepEqual(gone, {
    kind: "sequence",
    title: "Take step 2 of Thank you away",
    summary: SEQUENCE_FLOW_WORDS.takeAwayDetail,
    payload: { sequence_id: SEQ, op: "remove", step_id: S2 },
  });
  assert.equal(commit(gone.payload).route, "DELETE sequences/[id]/steps/[step]");
});

test("what the door would refuse is refused in the model's words, before any card", async () => {
  const no = async (input) => (await call(input)).error;
  assert.match(await no({ sequence_id: "thank-you" }), /sequence_id must be a sequence's id/);
  assert.match(await no({ sequence_id: "11111111-1111-4111-8111-111111111119" }), /no such sequence/);
  assert.match(await no({ sequence_id: LEADS, after_days: 3, template_id: MSG }), /only a customer's sequence/);
  assert.match(await no({ sequence_id: SEQ, step_id: MSG, after_days: 3 }), /step_id must be one of its steps/);
  assert.match(await no({ sequence_id: SEQ, after_days: 0, template_id: MSG }), /after_days is 1 to 90/);
  assert.match(await no({ sequence_id: SEQ, after_days: 3, only_if: ["no_visit"], template_id: MSG }), /only_if/);
  assert.match(await no({ sequence_id: SEQ, step_id: S1, remove: true }), /which step after the first/);
  assert.match(await no({ sequence_id: SEQ, step_id: S1, after_days: 3 }), /no wait/);
  assert.match(await no({ sequence_id: SEQ, step_id: S2, after_days: 3, template_id: MSG }), /two cards/);
  assert.match(await no({ sequence_id: SEQ, after_days: 3 }), /template_id must be a message's id/);
});
