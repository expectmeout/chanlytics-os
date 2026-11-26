/**
 * What the receptionist knows besides what was typed, how sure each reply was, and the day's tokens — run, not read.
 *
 * The prompt is the one place the platform's own facts are SPOKEN (the line it provisioned, the listing it verified), so
 * every surface that speaks goes through the one resolver with what the runtime loaded: run here on a text's model turn
 * (the inbound world, inbound/_world.mjs) and on a call's start (planCallStartWithin), over a runtime loaded from a
 * database in memory. Every reply leaves on its usage event how sure it was and how long it took, held or sent; and a
 * workspace over its day's tokens is handed to a person in words that say so. Pinned as the resolver's, the runtime's,
 * the model turn's, the call start's and the gates' text in prompt/facts.test.mjs and eval-harness.test.mjs until
 * 26 Nov 2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { runtime, text, world } from "../../inbound/_world.mjs";
import { answers, overBudget, sure, unsure } from "../../inbound/phases/_fixtures.mjs";

const { loadTenantRuntime } = await importSrc("apps/edge/lib/shared/tenant-runtime.ts");
const { planCallStartWithin } = await importSrc("apps/edge/lib/voice/call-start.ts");

const ZONE = "America/New_York";
const VOICE = "+13055550123";
const SPOKEN = "+1 (305) 555-0123";
const LISTED = "12 Pier Rd, Brooklyn, NY 11231";
/** A workspace that typed its hours and nothing else: the number and the address are the platform's to say. */
const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
};
let seq = 0;
/** A workspace and its receptionist of this file's own (the loaders cache by them), with a line and a listing. */
function workspaceDb(faults = {}, brain = BRAIN) {
  seq += 1;
  const tenant = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  const agent = `agent_known_${seq}`;
  const db = fakeDb(
    {
      tenant_channels: [
        {
          id: `ch-v-${seq}`,
          tenant_id: tenant,
          kind: "voice",
          external_id: agent,
          number_e164: VOICE,
          credentials_ref: null,
          config: {},
          status: "active",
        },
        {
          id: `ch-w-${seq}`,
          tenant_id: tenant,
          kind: "whatsapp",
          external_id: `wa-${seq}`,
          number_e164: "+13055550188",
          credentials_ref: null,
          config: {},
          status: "active",
        },
      ],
      tenant_config: [{ tenant_id: tenant, config: { brain } }],
      policies: [],
      tenants: [{ id: tenant, name: "Harbor", timezone: ZONE, status: "active" }],
      google_listings: [{ tenant_id: tenant, place_id: `place-${seq}`, name: "Harbor Moving", address: LISTED }],
      contacts: [],
      conversations: [],
      messages: [],
    },
    faults,
    { runtime_stamp: () => `stamp-${seq}` },
  );
  return { db, tenant, agent };
}
const routedTo = (w) => ({ tenantId: w.tenant, channelId: `ch-w-${seq}`, kind: "whatsapp", credentialsRef: null });

test("the runtime carries what the platform knows, loaded with the config, and a failed load is empty, never a guess", async () => {
  const w = workspaceDb();
  const rt = await loadTenantRuntime(w.db, routedTo(w));
  assert.deepEqual(
    rt.known.channels.map((c) => [c.kind, c.number_e164, c.status]).sort(),
    [
      ["voice", VOICE, "active"],
      ["whatsapp", "+13055550188", "active"],
    ],
    "the workspace's routing rows",
  );
  assert.match(JSON.stringify(rt.known.listing), /12 Pier Rd/, "and the listing it verified");

  const down = workspaceDb({ "tenant_config.select": { message: "the database is restarting" } });
  const failed = await loadTenantRuntime(down.db, routedTo(down));
  assert.equal(failed.loadFailed, true);
  assert.deepEqual(failed.known, { workspace: null, channels: [], listing: null }, "nothing known is not a guess");
});

test("a text's model turn is told the line the platform provisioned, in the words a person says it", async () => {
  const w = workspaceDb();
  const rt = await loadTenantRuntime(w.db, routedTo(w));
  let told = null;
  const turn = {
    brain: async () => ({
      generateReply: async (asked) => {
        told = asked.systemPrompt;
        return { text: "We open at 9.", escalate: false, meta: sure, usage: { input_tokens: 40 } };
      },
    }),
  };
  await world({
    env: { modelKey: "sk-test" },
    rt: runtime({ brain: BRAIN, known: rt.known, timezone: ZONE }),
  }).run(text("where are you, and what's your number?"), turn);
  assert.ok(told, "the model was asked");
  assert.ok(told.includes(SPOKEN), "the provisioned line, formatted, never raw E.164");
});

test("a call is never told the number it is ringing on, which a text is told: the line is the platform's to know", async () => {
  // On a call, the number the caller is ringing is no number to give them ("call us" pointed the caller back at the call
  // they were on, 11 Oct 2026). Which number that is, is the routing row's: the one resolver, with what the runtime loaded.
  const typed = { ...BRAIN, phone_display: SPOKEN };
  const call = workspaceDb({}, typed);
  const r = await planCallStartWithin({
    agentId: call.agent,
    from: "+16465550123",
    db: call.db,
    now: new Date("2026-09-14T14:00:00Z"),
  });
  assert.equal(r.late, false);
  assert.ok(!r.variables.business_facts.includes(SPOKEN), "the call is not pointed back at itself");
  const chat = workspaceDb({}, typed);
  const rt = await loadTenantRuntime(chat.db, routedTo(chat));
  let told = null;
  await world({
    env: { modelKey: "sk-test" },
    rt: runtime({ brain: typed, known: rt.known, timezone: ZONE }),
  }).run(text("what's your number?"), {
    brain: async () => ({
      generateReply: async (asked) => {
        told = asked.systemPrompt;
        return { text: "It's this one.", escalate: false, meta: sure, usage: { input_tokens: 40 } };
      },
    }),
  });
  assert.ok(told.includes(SPOKEN), "a text is told the number to give");
});

test("every reply leaves how sure it was and how long it took on its usage event, held or sent", async () => {
  const sent = world({ env: { modelKey: "sk-test" } });
  await sent.run(text("when do you open?"), answers("We open at 9."));
  assert.equal(sent.seen.sent.length, 1);
  const [u] = sent.seen.usage;
  assert.deepEqual([u.intent, u.confidence], [sure.intent, sure.confidence]);
  assert.equal(typeof u.latency_ms, "number");
  assert.ok(u.latency_ms >= 0);

  // Held for a person: not sure enough for the workspace's floor. The model was asked, and its signal is kept the same way.
  const held = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7 } } } }),
  });
  await held.run(text("can you do Tuesday at 4?"), {
    brain: async () => ({
      generateReply: async () => ({ text: "Maybe.", escalate: false, meta: unsure, usage: { input_tokens: 40 } }),
    }),
  });
  assert.equal(held.seen.sent.length, 0, "nothing said");
  assert.equal(held.seen.usage.length, 1);
  assert.deepEqual([held.seen.usage[0].intent, held.seen.usage[0].confidence], [unsure.intent, unsure.confidence]);
  assert.equal(typeof held.seen.usage[0].latency_ms, "number");
});

test("a workspace over its day's tokens is handed to a person, in words that say what stopped and how much was used", async () => {
  const w = world({ env: { modelKey: "sk-test" }, rt: overBudget, tokensUsed: 5000 });
  await w.run(text("when do you open?"), {
    brain: async () => {
      throw new Error("the model must not be asked past the day's tokens");
    },
  });
  assert.equal(w.seen.sent.length, 0);
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["budget"],
  );
  assert.match(
    w.seen.escalations[0].details,
    /^The daily AI limit is reached \(5,000 of 1,000 used in the last 24 hours\)/,
  );
});

test("the edge keeps the signal: a reply's usage event carries its tokens and how sure and how fast it was, on its thread", async () => {
  const { pgSink } = await importSrc("apps/edge/lib/inbound/persist.ts");
  const tables = { events: [], usage: [], conversations: [] };
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sink = pgSink(fakeDb(tables), T, { conversation_id: "c1", contact_id: "p1", message_id: "m1" });
  await sink.usage({ input_tokens: 1200, output_tokens: 80, intent: "hours", confidence: 0.9, latency_ms: 812 });
  const kept = tables.events.filter((e) => e.kind === "usage.llm_tokens");
  assert.equal(kept.length, 1, "one usage event");
  assert.deepEqual(
    [
      kept[0].tenant_id,
      kept[0].subject_id,
      kept[0].data.input_tokens,
      kept[0].data.intent,
      kept[0].data.confidence,
      kept[0].data.latency_ms,
    ],
    [T, "c1", 1200, "hours", 0.9, 812],
  );
});

test("the day's tokens are a dial of the reply policy: saved as a whole number, refused below its floor in the dial's words", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
  const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
  const policies = await importSrc("apps/dashboard/app/api/v1/policies/route.ts");
  setRateStore(memoryStore());
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const USER = "99999999-9999-4999-8999-999999999999";
  const tables = {
    memberships: [
      {
        user_id: USER,
        tenant_id: T,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    policies: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        tenant_id: T,
        class: "reply",
        mode: "auto",
        subject_type: null,
        subject_id: null,
        limits: { max_replies_day: 5 },
        updated_at: "2026-10-01T00:00:00.000Z",
      },
    ],
  };
  setServiceClient(fakeDb(tables));
  const ctx = {
    supabase: fakeDb(tables, {}, {}, { userId: USER }),
    userId: USER,
    email: "a@example.com",
    aal: "aal2",
    params: {},
  };
  const put = (body) =>
    new Request(`http://localhost/api/v1/x?workspace=${T}`, { method: "PUT", body: JSON.stringify(body) });
  await policies.PUT.run(put({ class: "reply", max_llm_tokens_day: 200000.6 }), ctx);
  assert.deepEqual(tables.policies[0].limits, { max_replies_day: 5, max_llm_tokens_day: 200001 }, "a whole number");
  await assert.rejects(policies.PUT.run(put({ class: "reply", max_llm_tokens_day: 10 }), ctx), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /The token budget is a whole number from 1,000 to 5,000,000, or 0 to turn it off\./);
    return true;
  });
  setServiceClient(null);
});

test("a reply held below the dial is kept as a draft that remembers why it waited and what the model said of it", async () => {
  // The hold's plan (how long, and why: the window or the dial) is holdPlan's, run in whatsapp/whatsapp-steps.test.mjs;
  // here, the row the edge writes for it (lib/inbound/persist.ts queueReply over lib/ai/draft-queue.ts, one statement).
  const { queueReply } = await importSrc("apps/edge/lib/inbound/persist.ts");
  const asked = [];
  const db = fakeDb({}, {}, { queue_send: (a) => (asked.push(a), "m-draft") });
  const log = { info() {}, warn() {}, error() {} };
  const id = await queueReply(
    db,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    { conversation_id: "c1", contact_id: "p1", message_id: "m-in" },
    "13055550100",
    "Maybe Tuesday at 4?",
    90_000,
    log,
    "low_confidence",
    { ...unsure, reason: "a time it cannot see" },
  );
  assert.equal(id, "m-draft");
  const { meta, body, sender } = asked[0].p_message;
  assert.deepEqual([body, sender], ["Maybe Tuesday at 4?", "ai"], "the draft, the AI's");
  assert.deepEqual(
    [meta.source, meta.delay_ms, meta.intent, meta.confidence, meta.reason, meta.reply_to, meta.to],
    ["low_confidence", 90_000, unsure.intent, unsure.confidence, "a time it cannot see", "m-in", "+13055550100"],
  );
  assert.equal(Object.keys(meta).at(-1), "to", "the address last, so nothing the model says of the draft moves it");
});

test("a thread the model hands over carries its reason, beside the customer's words", async () => {
  const w = world({ env: { modelKey: "sk-test" } });
  await w.run(text("I want to talk about my bill"), {
    brain: async () => ({
      generateReply: async () => ({
        text: "A person will help with that.",
        escalate: true,
        meta: { ...sure, intent: "billing", reason: "a billing question" },
        usage: { input_tokens: 40 },
      }),
    }),
  });
  assert.equal(w.seen.escalations.length, 1);
  assert.equal(w.seen.escalations[0].details, 'a billing question — "I want to talk about my bill"');
});

test("a text's turn hears the workspace's Autonomy rows and is checked after it answers: a booking under ask is a person's", async () => {
  // The rows reach the prompt (the one resolver, with the runtime's policy) and layer two runs on what the model wrote:
  // a booking link the model sent anyway is taken back and the thread handed to a person (pinned as model-turn.ts's
  // text in policies/policy-classes.test.mjs until 26 Nov 2026).
  let told = null;
  const w = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: {} }, booking: { mode: "ask" } } }),
  });
  await w.run(text("can I book for Saturday?"), {
    brain: async () => ({
      generateReply: async (asked) => {
        told = asked.systemPrompt;
        return {
          text: "Book here: https://booking.example/riverside",
          escalate: false,
          meta: { ...sure, intent: "booking" },
          usage: { input_tokens: 40 },
        };
      },
    }),
  });
  assert.ok(told, "the model was asked");
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["policy_ask"],
    "the thread is a person's",
  );
  assert.ok(
    w.seen.sent.every((s) => !s.body.includes("https://booking.example/riverside")),
    "and the link the model sent anyway never went out",
  );
});
