/**
 * Ask's drafts written ahead for Today's Need you (decision 0071, 00475), run through route(): the real route modules,
 * their `run` called with a database in memory. What is proved here is who may and what is turned away at the door, what
 * a read answers, and that a draft kept for their newest message is answered as kept, with no model asked. What the
 * person draft writes is proved over a fake model (new-conversation/person-draft.test.mjs), and the door that keeps a
 * draft on a real database (reply-drafts.db.test.mjs).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/model-json.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/conversations/[id]/draft/route.ts"));
const drafts = await import(at("apps/dashboard/app/api/v1/conversations/drafts/route.ts"));
const { REPLY_DRAFTS_IDS_MAX } = await import("@chanlytics/contracts");

let asked;
beforeEach(() => {
  setRateStore(memoryStore());
  asked = 0;
  // The model, counted: a draft kept for their newest message is answered without it.
  setModelStream(async function* () {
    asked += 1;
    yield { type: "stop", stopReason: "end_turn" };
  });
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const K1 = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const USER = "u1";
const membership = (role) => ({
  user_id: USER,
  tenant_id: A,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
const conversation = (id, tenant = A) => ({
  id,
  tenant_id: tenant,
  contact_id: K1,
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  last_wa_inbound_at: null,
  contacts: { id: K1, phone_e164: "+13055550101", email: null, erased_at: null },
});
const said = (id, conv, created_at) => ({
  id,
  tenant_id: A,
  conversation_id: conv,
  sender: "customer",
  direction: "inbound",
  channel: "sms",
  body: "Can I move Friday?",
  created_at,
});
const kept = (conv, forMessage, text, tenant = A) => ({
  tenant_id: tenant,
  conversation_id: conv,
  kind: "reply",
  for_message_id: forMessage,
  words: { text, subject: "", brief: null, asks: [] },
  made_by: USER,
  made_at: "2026-10-23T12:00:00.000Z",
});
const ctxFor = (tables, params = {}) => ({
  supabase: fakeDb(tables),
  userId: USER,
  email: "ada@example.com",
  params,
});
const post = (body) => new Request("http://localhost/api/v1/x", { method: "POST", body: JSON.stringify(body) });
const get = (qs) => new Request(`http://localhost/api/v1/conversations/drafts?${qs}`);
async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    return true;
  });
}
/** Every row the code under test wrote or changed, and every door it called. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => s.op === "insert" || s.op === "update" || s.rpc).length;
/** What a route's handler answered: `run` hands it back as it is, before the wire wraps it. */
const dataOf = async (answer) => answer;

test("who may ask for a draft and read the kept ones, and how often", () => {
  assert.deepEqual(draft.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "person_draft",
    spend: false,
  });
  assert.equal(draft.maxDuration, 60, "a model call that reads the person first");
  assert.deepEqual(drafts.GET.policy, { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
});

test("a viewer asks for no draft: refused before the model or the door is asked", async () => {
  const ctx = ctxFor(
    {
      memberships: [membership("viewer")],
      conversations: [conversation(C1)],
      messages: [said(M1, C1, "2026-10-23T11:00:00Z")],
    },
    { id: C1 },
  );
  await refused(draft.POST.run(post({ kind: "reply" }), ctx), "forbidden", 403);
  assert.equal(asked, 0);
  assert.equal(writes(ctx), 0);
});

test("a draft is a reply or a call's brief, and nothing else is asked for", async () => {
  const ctx = ctxFor({ memberships: [membership("owner")], conversations: [conversation(C1)] }, { id: C1 });
  await refused(draft.POST.run(post({ kind: "email" }), ctx), "validation", 400);
  await refused(draft.POST.run(post({ kind: "reply", text: "Hi" }), ctx), "validation", 400);
  assert.equal(asked, 0);
});

test("a draft kept for their newest message is answered as kept: no model, no write", async () => {
  const ctx = ctxFor(
    {
      memberships: [membership("owner")],
      conversations: [conversation(C1)],
      messages: [said(M1, C1, "2026-10-23T11:00:00Z")],
      escalations: [],
      conversation_drafts: [kept(C1, M1, "Friday works, see you then.")],
    },
    { id: C1 },
  );
  const d = await dataOf(await draft.POST.run(post({ kind: "reply" }), ctx));
  assert.equal(d.conversation_id, C1);
  assert.equal(d.kind, "reply");
  assert.equal(d.for_message_id, M1);
  assert.equal(d.words.text, "Friday works, see you then.");
  assert.equal(asked, 0, "the kept draft answers: the model is not asked again");
  assert.equal(writes(ctx), 0);
});

test("the kept drafts of the threads asked for, this workspace's only, current or not: the page judges", async () => {
  const ctx = ctxFor({
    memberships: [membership("operator")],
    conversation_drafts: [kept(C1, M1, "Friday works."), kept(C2, M2, "Another workspace's words.", B)],
  });
  const d = await dataOf(await drafts.GET.run(get(`ids=${C1},${C2}`), ctx));
  assert.deepEqual(
    d.drafts.map((x) => [x.conversation_id, x.words.text]),
    [[C1, "Friday works."]],
    "a thread of another workspace's is none of this read's",
  );
  assert.equal(writes(ctx), 0, "a read writes nothing");
});

test("the read takes thread ids only, and no more than a card draws", async () => {
  const ctx = ctxFor({ memberships: [membership("operator")], conversation_drafts: [] });
  // An id that is no thread's names nothing in this workspace (request-guards requireUuid): not found, as a link to one.
  await refused(drafts.GET.run(get("ids=not-an-id"), ctx), "not_found", 404);
  const many = Array.from(
    { length: REPLY_DRAFTS_IDS_MAX + 1 },
    (_, i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`,
  );
  await refused(drafts.GET.run(get(`ids=${many.join(",")}`), ctx), "validation", 400);
});
