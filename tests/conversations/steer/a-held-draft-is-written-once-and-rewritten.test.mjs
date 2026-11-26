/**
 * A held draft, written once and rewritten on the owner's one line — run, not read.
 *
 * The receptionist's words held for the owner (a veto window, a reply below the dial, a draft steered) are written by one
 * writer, the draft and its job in one statement (queue_send, 00527), for the handler and the steer alike. The owner's
 * instruction reaches the model as one more system block, and the model is never shown the customer's last message twice.
 * The dashboard's route asks the edge's steer door for a draft still waiting, says each way it can fail in the owner's
 * words, and records the decision only after the rewrite happened. Pinned as receptionist-brain.ts's, draft-queue.ts's,
 * persist.ts's, the route's and thread-control.ts's text in steer.test.mjs and veto-window.test.mjs until 26 Nov 2026.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { scripted, json } from "../../ai/_model-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { setModelFetch } = await importSrc("apps/edge/lib/ai/model.ts");
const { generateReply } = await importSrc("apps/edge/lib/ai/receptionist-brain.ts");
const { queueDraft } = await importSrc("apps/edge/lib/ai/draft-queue.ts");
const { queueReply } = await importSrc("apps/edge/lib/inbound/persist.ts");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
const steer = await importSrc("apps/dashboard/app/api/v1/messages/[id]/steer/route.ts");
const realFetch = globalThis.fetch;
beforeEach(() => setRateStore(memoryStore()));
after(() => {
  setModelFetch(null);
  setServiceClient(null);
  globalThis.fetch = realFetch;
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const log = { info() {}, warn() {}, error() {} };
const M1 = "11111111-1111-4111-8111-111111111111";

test("the owner's instruction is one more system block, and the model is not shown the customer's last message twice", async () => {
  const api = scripted(
    json({
      reply: "Saturday is full; Friday at 4?",
      intent: "booking",
      escalate: false,
      reason: "",
      confidence: 0.9,
      facts_used: [],
      language: "en",
    }),
  );
  setModelFetch(api.fetch);
  await generateReply({
    history: [
      { role: "assistant", content: "Hi! How can I help?" },
      { role: "user", content: "can I come Saturday?" },
    ],
    userText: "can I come Saturday?",
    systemPrompt: "You answer for Harbor Nails.",
    fallbackText: "Hold on.",
    nowNote: "It is Thursday.",
    steer: "The owner asks: mention Saturday is full.",
    call: { tenantId: null },
  });
  const [sent] = api.calls;
  assert.deepEqual(
    sent.body.system.map((b) => b.text),
    ["You answer for Harbor Nails.", "It is Thursday.", "The owner asks: mention Saturday is full."],
    "the steer last, after the prompt and the clock",
  );
  assert.deepEqual(
    sent.body.messages,
    [
      { role: "assistant", content: "Hi! How can I help?" },
      { role: "user", content: "can I come Saturday?" },
    ],
    "the memory's copy of the message is skipped, the memory kept",
  );
});

test("a held draft and its job are one statement, for the handler and the steer alike, and say why they wait", async () => {
  const asked = [];
  const db = fakeDb({ messages: [], jobs: [] }, {}, { queue_send: (a) => (asked.push(a), `m-${asked.length}`) });
  // The steer's draft, through the one writer.
  const steered = await queueDraft(
    db,
    {
      tenantId: T,
      conversationId: "c1",
      contactId: "p1",
      to: "13055550100",
      body: "Saturday is full.",
      delayMs: 60_000,
      source: "steered",
    },
    log,
  );
  // The handler's, through the same writer.
  const held = await queueReply(
    db,
    T,
    { conversation_id: "c1", contact_id: "p1", message_id: "m-in" },
    "13055550100",
    "We open at 9.",
    60_000,
    log,
    "veto_window",
  );
  assert.deepEqual([steered, held], ["m-1", "m-2"]);
  assert.deepEqual(
    asked.map((a) => [a.p_message.meta.source, a.p_message.sender, a.p_message.body]),
    [
      ["steered", "ai", "Saturday is full."],
      ["veto_window", "ai", "We open at 9."],
    ],
  );
  assert.ok(
    asked.every((a) => a.p_due_at && a.p_payload?.to_phone === "+13055550100"),
    "the job beside it, due and addressed",
  );
  assert.deepEqual(
    db.seen.filter((q) => ["insert", "upsert", "update"].includes(q.op)),
    [],
    "never the row, then the job: nothing written but the one statement",
  );
  // A statement that fails leaves nothing to undo, and the caller sends the words itself.
  const refusing = fakeDb(
    {},
    {},
    {
      queue_send: () => {
        throw new Error("connection reset");
      },
    },
  );
  assert.equal(
    await queueReply(
      refusing,
      T,
      { conversation_id: "c1", contact_id: "p1", message_id: "m-in" },
      "13055550100",
      "Hi",
      60_000,
      log,
    ),
    null,
  );
});

/** An operator of the workspace and the message they would steer, over these tables; the ledger over the same. */
function world(message) {
  const tables = {
    memberships: [
      {
        user_id: "u1",
        tenant_id: T,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    messages: [
      {
        id: M1,
        tenant_id: T,
        conversation_id: "c1",
        sender: "ai",
        status: "queued",
        body: "We open at 9.",
        ...message,
      },
    ],
    decisions: [],
    events: [],
  };
  setServiceClient(fakeDb(tables));
  return {
    tables,
    ctx: { supabase: fakeDb(tables), userId: "u1", email: "a@example.com", aal: "aal2", params: { id: M1 } },
  };
}
const press = (text) =>
  new Request(`http://localhost/api/v1/messages/${M1}/steer?workspace=${T}`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
function edge(answer) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ path: new URL(String(url)).pathname, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return sent;
}
async function refusalOf(p) {
  try {
    await p;
  } catch (e) {
    return { code: e.code, status: e.status, message: e.message };
  }
  assert.fail("the route answered where it should have refused");
}

test("the route asks the edge's steer door for a draft still waiting, and records the decision only after the rewrite", async () => {
  assert.deepEqual([steer.POST.policy.role, steer.POST.policy.rate], ["operator", "whisper"]);
  const w = world();
  const sent = edge({ body: { ok: true, message_id: "m2", text: "Saturday is full; Friday at 4?" } });
  const r = await steer.POST.run(press("mention Saturday is full"), w.ctx);
  assert.deepEqual(sent, [{ path: "/api/admin/steer", body: { message_id: M1, text: "mention Saturday is full" } }]);
  assert.deepEqual([r.ok, r.message_id, r.text], [true, "m2", "Saturday is full; Friday at 4?"]);
  assert.ok(r.decision_id, "the decision, recorded after");

  // Refused, the edge said why; no decision is recorded for a rewrite that did not happen.
  for (const [error, words] of [
    [
      "policy_block_price",
      "The rewrite would have quoted a price or named money (a refund, a discount, a deposit), so the original draft stays.",
    ],
    ["already_sent", "That reply went out while it was being rewritten, so nothing was changed."],
  ]) {
    const quiet = world();
    edge({ status: 409, body: { ok: false, error } });
    assert.deepEqual(await refusalOf(steer.POST.run(press("mention Saturday"), quiet.ctx)), {
      code: "upstream_anthropic",
      status: 502,
      message: words,
    });
    assert.deepEqual([quiet.tables.decisions.length, quiet.tables.events.length], [0, 0], `${error}: nothing recorded`);
  }

  // A draft that is not waiting has nothing to rewrite, and the edge is not asked.
  const gone = world({ status: "sent" });
  const none = edge({ body: {} });
  assert.deepEqual(await refusalOf(steer.POST.run(press("mention Saturday"), gone.ctx)), {
    code: "conflict",
    status: 409,
    message: "This reply is not waiting — there is nothing to rewrite.",
  });
  assert.deepEqual(none, []);
});

test("'veto' reaches the model and holds its words in the window; a draft that cannot be held is sent, and the window that did not happen is recorded", async () => {
  // Before this, veto fell into the "hold everything for a human" branch: selecting veto silently disabled the
  // receptionist. And an un-vetoed reply beats no reply, so a dead queue never means silence. (Pinned as reply-gates',
  // dispatch's and persist.ts's text in veto-window.test.mjs until 26 Nov 2026.)
  const { world, text } = await import("../../inbound/_world.mjs");
  const { veto, answers } = await import("../../inbound/phases/_fixtures.mjs");
  const held = world({ env: { modelKey: "sk-test" }, rt: veto, queue: true });
  await held.run(text("when do you open?"), answers("We open at 9."));
  assert.deepEqual(held.seen.queued, [{ body: "We open at 9.", delayMs: 60_000, source: "veto_window" }]);
  assert.equal(held.seen.sent.length, 0, "held for the owner's eyes first");
  assert.deepEqual(held.seen.escalations, [], "not a policy block: the receptionist answered");

  const unheld = world({ env: { modelKey: "sk-test" }, rt: veto, queue: false });
  await unheld.run(text("when do you open?"), answers("We open at 9."));
  assert.deepEqual(
    unheld.seen.sent.map((s) => s.body),
    ["We open at 9."],
    "sent at once",
  );
  // And the edge says so on the ledger, with the usual cause named, not only in a log.
  const { pgSink } = await importSrc("apps/edge/lib/inbound/persist.ts");
  const tables = { events: [] };
  await pgSink(fakeDb(tables), T, { conversation_id: "c1", contact_id: "p1", message_id: "m-in" }).vetoFallback(60_000);
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.subject_id, e.data.delay_ms, e.data.source, e.data.reason]),
    [["policy.veto_window_skipped", "c1", 60_000, "veto_window", "scheduling_failed"]],
  );
});

test("a person taking the thread withdraws the receptionist's held draft, through the one door", async () => {
  // The core reply verb asks its port (core-reply.test.mjs); the dashboard's port is the member's withdraw door (00387,
  // run on the stack in conversations/state/a-queued-message-is-withdrawn-by-one-door.db.test.mjs).
  const { threadPorts } = await importSrc("apps/dashboard/src/server/conversations/ports.ts");
  const asked = [];
  const ctx = {
    supabase: fakeDb({}, {}, { member_withdraw_drafts: (a) => (asked.push(a), 1) }),
    userId: "u1",
    email: "a@example.com",
    params: {},
  };
  assert.equal(await threadPorts(ctx).withdrawDrafts(T, "c1"), 1);
  assert.deepEqual(asked, [{ p_tenant_id: T, p_conversation_id: "c1" }]);
});
