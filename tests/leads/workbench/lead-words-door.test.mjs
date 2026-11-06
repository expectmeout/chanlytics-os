/**
 * A lead's own words at one step (decision 0096), through the dashboard's routes: judged by the rules a step's words are
 * held to before the door is asked; what reaches the door (00545 sequence_lead_words_set), the mark above all, which is
 * the one the sender compares; the door's refusals said as it says them; and the event, which never carries the words.
 * Run through route() over a database in memory. The door itself is proved on a stack (lead-words.db.test.mjs).
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { REACH_OUT_REFUSALS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { checkedWordsOf } = await import("@chanlytics/channels");
const { leadStepKey, leadWordsOfLeads, ownWordsAtSteps } = await import("@chanlytics/db");
const door = await import(at("apps/dashboard/app/api/v1/sequences/[id]/steps/[step]/lead-words/route.ts"));
const wordsRoute = await import(at("apps/dashboard/app/api/v1/leads/[id]/words/route.ts"));
const sentRoute = await import(at("apps/dashboard/app/api/v1/leads/[id]/sent/[send]/route.ts"));
const emailsRoute = await import(at("apps/dashboard/app/api/v1/leads/[id]/emails/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const ROOT_ID = "22222222-2222-4222-8222-222222222222";
const STEP2 = "33333333-3333-4333-8333-333333333333";
const CALL = "34343434-3434-4343-8343-343434343434";
const STRANGER = "35353535-3535-4353-8353-353535353535";
const SEARCH = "44444444-4444-4444-8444-444444444444";
const LEAD = "55555555-5555-4555-8555-555555555555";
const NOBODY = "56565656-5656-4565-8565-565656565656";
const SEND = "66666666-6666-4666-8666-666666666666";
const T1 = "77777777-7777-4777-8777-777777777771";
const T2 = "77777777-7777-4777-8777-777777777772";

const STEP_ONE = { subject: "Quick one for {{business}}", body: "{{opening}}\n\nI run Harbor.\n\n{{your name}}" };
const STEP_TWO = { subject: null, body: "Just checking in." };
const TYPED = { subject: "Your weekend chair", body: "Saw the chair is booked out.\n\nWorth a word?\n\n{{your name}}" };

const step = (over) => ({
  tenant_id: A,
  kind: "reach_out",
  state: "running",
  lead_search_id: null,
  after_playbook_id: ROOT_ID,
  after_days: 4,
  gap_minutes: 12,
  mailbox_ids: [],
  signed_by: null,
  include_unconfirmed: false,
  run_hour: 9,
  last_run_for: null,
  created_at: "2026-09-20T00:00:00Z",
  ...over,
});
const email = (id, words) => ({
  id,
  tenant_id: A,
  channel: "email",
  components: [
    ...(words.subject ? [{ type: "HEADER", format: "TEXT", text: words.subject }] : []),
    { type: "BODY", text: words.body },
  ],
  body_preview: words.body,
});
const tables = (role = "operator") => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  tenants: [{ id: A, name: "Harbor Moving Co", timezone: "America/Chicago" }],
  // A whole Business, as the read takes one: a part missing and the whole is unread.
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Moving Co",
          system_prompt: "You answer for Harbor Moving Co, a moving company in Austin.",
          fallbacks: { greeting: "Hi!", error: "Sorry, try again.", non_text: "I can read text only." },
          booking_link: "https://example.com/book",
        },
      },
    },
  ],
  policies: [{ tenant_id: A, class: "outreach", mode: "ask", subject_type: null }],
  lead_searches: [{ id: SEARCH, tenant_id: A, name: "Personal trainers · Austin" }],
  playbooks: [
    step({
      id: ROOT_ID,
      name: "Reach out",
      trigger: "lead_first",
      lead_search_id: SEARCH,
      after_playbook_id: null,
      after_days: null,
      signed_by: "Sam",
      template_id: T1,
    }),
    step({ id: STEP2, name: "A nudge", trigger: "after_step", template_id: T2 }),
  ],
  templates: [email(T1, STEP_ONE), email(T2, STEP_TWO)],
  leads: [
    {
      id: LEAD,
      tenant_id: A,
      business_name: "Luxe Lane",
      city: null,
      email: "hi@luxelane.example",
      email_state: "confirmed",
      kind: "place",
      source: "places",
      facts: {},
    },
  ],
  broadcasts: [],
  reach_out_sends: [],
  mailbox_connections: [],
  decisions: [],
});

const asked = [];
/** What the door answers: what stood before; a refusal where a case sets one. */
let refusal = null;
const rpcs = {
  sequence_steps_of: () => [
    { id: ROOT_ID, template_id: T1 },
    { id: STEP2, template_id: T2 },
    { id: CALL, template_id: null, hand: "call" },
  ],
  sequence_lead_words_set: (a) => {
    asked.push(a);
    if (refusal) throw refusal;
    return {
      step_id: a.p_step_id,
      lead_id: a.p_lead_id,
      send_id: SEND,
      was: { subject: "Before", body: "What stood" },
    };
  },
};
const ledger = { events: [] };
const pgError = (code, message) => Object.assign(new Error(message), { code });
const press = (body, { stepId = ROOT_ID, role = "operator" } = {}) =>
  door.POST.run(
    new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) }),
    {
      supabase: fakeDb(tables(role), {}, rpcs),
      userId: USER,
      email: "ada@example.com",
      params: { id: ROOT_ID, step: stepId },
    },
  );
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}

beforeEach(() => {
  setRateStore(memoryStore());
  asked.length = 0;
  refusal = null;
  ledger.events = [];
  setServiceClient(fakeDb(ledger));
});
after(() => setServiceClient(null));

test("the door declares its policy, and the reads are any member's", () => {
  assert.deepEqual(
    { ...door.POST.policy },
    { kind: "write", scope: "row", role: "operator", rate: "playbook", spend: false },
  );
  for (const r of [wordsRoute, sentRoute, emailsRoute])
    assert.deepEqual({ ...r.GET.policy }, { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
});

test("what is typed reaches the door with the mark the sender compares, and answers what stood before, for Undo", async () => {
  const out = await press({ lead_id: LEAD, words: TYPED });
  assert.deepEqual(out, {
    step_id: ROOT_ID,
    lead_id: LEAD,
    send_id: SEND,
    was: { subject: "Before", body: "What stood" },
  });
  assert.deepEqual(asked, [
    {
      p_step_id: ROOT_ID,
      p_lead_id: LEAD,
      p_body: TYPED.body,
      p_subject: TYPED.subject,
      // The booking link is the workspace's, so the mark says so, as check.ts and sender.ts both do.
      p_checked_words: checkedWordsOf(TYPED, "Sam", true),
      p_needs_line: false,
    },
  ]);
});

test("words that keep their line say so to the door: an email checked with none goes back to be checked", async () => {
  const kept = { subject: "Mine", body: "{{opening}}\n\nMy own words.\n\n{{your name}}" };
  await press({ lead_id: LEAD, words: kept });
  assert.equal(asked[0].p_needs_line, true);
  assert.equal(asked[0].p_checked_words, checkedWordsOf(kept, "Sam", true));
});

test("null puts the step's words back: no words reach the door, and the mark is of the words that stand again", async () => {
  await press({ lead_id: LEAD, words: null });
  assert.equal("p_body" in asked[0], false);
  assert.equal("p_subject" in asked[0], false);
  assert.equal(asked[0].p_checked_words, checkedWordsOf(STEP_ONE, "Sam", true));
  assert.equal(asked[0].p_needs_line, true, "the step's words name a line");
});

test("a step after the first answers the one before: whatever came with it, it keeps no subject", async () => {
  const later = { subject: "Sneaked in", body: "Still around if it's useful." };
  await press({ lead_id: LEAD, words: later }, { stepId: STEP2 });
  assert.equal("p_subject" in asked[0], false);
  assert.equal(asked[0].p_body, later.body);
  assert.equal(asked[0].p_checked_words, checkedWordsOf({ subject: null, body: later.body }, "Sam", true));
});

test("the rules a step's words are held to, before the door is asked: a link in a first email, a gap left, no words", async () => {
  await refused(
    press({ lead_id: LEAD, words: { subject: "Hi", body: "See https://example.com/page please." } }),
    "validation",
    422,
  );
  await refused(
    press({ lead_id: LEAD, words: { subject: "Hi", body: "You are in {{city}}." } }),
    "validation",
    422,
    "Fill in their city, or take it out.",
  );
  await refused(press({ lead_id: LEAD, words: { subject: "Hi", body: "   " } }), "validation", 400);
  assert.equal(asked.length, 0);
});

test("only an email of this sequence, for a lead of this workspace, and a viewer cannot", async () => {
  await refused(
    press({ lead_id: LEAD, words: TYPED }, { stepId: CALL }),
    "validation",
    422,
    REACH_OUT_REFUSALS.onlyEmailWords,
  );
  await refused(press({ lead_id: LEAD, words: TYPED }, { stepId: STRANGER }), "not_found", 404);
  await refused(press({ lead_id: NOBODY, words: TYPED }), "not_found", 404);
  await refused(press({ lead_id: LEAD, words: TYPED }, { role: "viewer" }), "forbidden", 403);
  assert.equal(asked.length, 0);
});

test("the door's refusals are said in its own words, and move nothing", async () => {
  for (const [code, words] of [
    ["22023", REACH_OUT_REFUSALS.gone],
    ["22023", REACH_OUT_REFUSALS.yoursToSend],
    ["22023", REACH_OUT_REFUSALS.onlyEmailWords],
  ]) {
    refusal = pgError(code, words);
    await refused(press({ lead_id: LEAD, words: TYPED }), "validation", 422, words);
  }
  refusal = pgError("P0002", REACH_OUT_REFUSALS.stepGone);
  await refused(press({ lead_id: LEAD, words: TYPED }), "not_found", 404, REACH_OUT_REFUSALS.stepGone);
  assert.deepEqual(ledger.events, [], "a refused save is no change");
});

test("the event says who and for whom, never the words", async () => {
  await press({ lead_id: LEAD, words: TYPED });
  await press({ lead_id: LEAD, words: null });
  const said = ledger.events.map((e) => [e.kind, e.subject_type, e.subject_id, e.data]);
  assert.deepEqual(said, [
    ["reach_out.lead_words_changed", "lead", LEAD, { step_id: ROOT_ID, kept: true, by: USER }],
    ["reach_out.lead_words_changed", "lead", LEAD, { step_id: ROOT_ID, kept: false, by: USER }],
  ]);
  assert.equal(JSON.stringify(ledger.events).includes("booked out"), false);
});

const read = (route, params, world) =>
  route.GET.run(new Request(`http://localhost/api/v1/x?workspace=${A}`), {
    supabase: fakeDb(world, {}, {}),
    userId: USER,
    email: "ada@example.com",
    params,
  });

test("GET words answers a lead's own words at each step, and no other lead's; GET emails keeps its list (a tab open across a deploy reads it)", async () => {
  const world = {
    ...tables("viewer"),
    sequence_lead_words: [
      {
        tenant_id: A,
        step_id: STEP2,
        lead_id: LEAD,
        subject: null,
        body: "Mine",
        written_by: USER,
        written_at: "2026-11-04T00:00:00Z",
      },
      {
        tenant_id: A,
        step_id: STEP2,
        lead_id: NOBODY,
        subject: null,
        body: "Theirs",
        written_by: USER,
        written_at: "2026-11-04T00:00:00Z",
      },
    ],
  };
  assert.deepEqual(await read(wordsRoute, { id: LEAD }, world), [
    { step_id: STEP2, subject: null, body: "Mine", at: "2026-11-04T00:00:00Z" },
  ]);
  assert.deepEqual(await read(emailsRoute, { id: LEAD }, world), []);
});

test("GET sent answers what one send said as it went, and null for a send that wrote none", async () => {
  const world = {
    ...tables("viewer"),
    messages: [{ id: "m1", tenant_id: A, body: "What went.", subject: "Your chair" }],
    sequence_sends: [
      { id: SEND, tenant_id: A, lead_id: LEAD, message_id: "m1", state: "sent" },
      { id: NOBODY, tenant_id: A, lead_id: LEAD, message_id: null, state: "planned" },
    ],
  };
  const went = await read(sentRoute, { id: LEAD, send: SEND }, world);
  assert.equal(went.body, "What went.");
  assert.equal(await read(sentRoute, { id: LEAD, send: NOBODY }, world), null);
});

test("a big run's words are read however many its leads: one `in` list past the gateway's line is refused (414)", async () => {
  const many = Array.from({ length: 450 }, (_, i) => `5e000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const world = {
    sequence_lead_words: many.map((lead_id, i) => ({
      tenant_id: A,
      step_id: i % 2 ? STEP2 : ROOT_ID,
      lead_id,
      subject: null,
      body: `Words ${i}`,
    })),
  };
  const db = fakeDb(world);
  const words = await leadWordsOfLeads(db, [...many, many[0]]);
  assert.equal(words.size, 450);
  assert.equal(words.get(leadStepKey(STEP2, many[449])).body, "Words 449");
  const counts = await ownWordsAtSteps(db, A, [ROOT_ID, STEP2]);
  assert.deepEqual([counts.get(ROOT_ID), counts.get(STEP2)], [225, 225]);
  assert.equal((await leadWordsOfLeads(db, [])).size, 0);
});
