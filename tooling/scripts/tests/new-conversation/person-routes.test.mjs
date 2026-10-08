/**
 * The three routes of a new conversation, run through route(): the real route modules, their `run` called with a
 * database in memory. What is proved here is who may and what is turned away at the door, before the verb is asked:
 * the policy each declares, a role that may not, a body that names neither its wire nor who answers, and a person who
 * is not this workspace's. What the verb then does is proved over fakes (begin-conversation.test.mjs), its door on a
 * real database (conversation-open.db.test.mjs), and what Ask is told over a fake model (person-draft.test.mjs).
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
const reach = await import(at("apps/dashboard/app/api/v1/people/[id]/reach/route.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/people/[id]/draft/route.ts"));
const message = await import(at("apps/dashboard/app/api/v1/people/[id]/message/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const K1 = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const USER = "u1";
const membership = (role) => ({
  user_id: USER,
  tenant_id: A,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
/** The person, as the contacts table keys one: this workspace's, not erased. */
const PERSON = { id: K1, tenant_id: A, erased_at: null, marketing_consent: null };
const ctxFor = (tables, params = {}) => ({
  supabase: fakeDb(tables),
  userId: USER,
  email: "ada@example.com",
  params,
});
const post = (body) => new Request("http://localhost/api/v1/x", { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    return true;
  });
}
/** Every row the code under test wrote or changed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => s.op === "insert" || s.op === "update").length;

test("who may read a person's reach, ask for a draft and begin a conversation, and how often", () => {
  assert.deepEqual(reach.GET.policy, { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
  assert.deepEqual(draft.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "person_draft",
    spend: false,
  });
  assert.deepEqual(message.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "reply",
    spend: false,
  });
  assert.equal(message.maxDuration, 60);
  assert.equal(draft.maxDuration, 60);
});

test("a viewer begins no conversation and asks for no draft: refused before anything is written", async () => {
  const tables = { memberships: [membership("viewer")], contacts: [PERSON] };
  const sent = ctxFor(tables, { id: K1 });
  await refused(message.POST.run(post({ wire: "sms", text: "Hello", then: "me" }), sent), "forbidden", 403);
  assert.equal(writes(sent), 0);
  const asked = ctxFor(tables, { id: K1 });
  await refused(draft.POST.run(post({ how: "message", wire: "sms", about: "follow up" }), asked), "forbidden", 403);
  assert.equal(writes(asked), 0);
});

test("the send names its wire and who answers, and takes nothing it does not know", async () => {
  const tables = { memberships: [membership("operator")], contacts: [PERSON] };
  for (const body of [
    { text: "Hello", then: "me" }, // no wire
    { wire: "sms", text: "Hello" }, // nobody named to answer
    { wire: "post", text: "Hello", then: "me" }, // not a wire
    { wire: "sms", text: "Hello", then: "me", params: ["x"] }, // a field it does not take
    { wire: "sms", text: "Hello", then: "me", note: "x".repeat(281) }, // a note longer than the receptionist reads
  ]) {
    const ctx = ctxFor(tables, { id: K1 });
    await refused(message.POST.run(post(body), ctx), "validation");
    assert.equal(writes(ctx), 0, JSON.stringify(body));
  }
});

test("a draft says what it is about, and takes nothing it does not know", async () => {
  const tables = { memberships: [membership("operator")], contacts: [PERSON] };
  for (const body of [
    { how: "message", wire: "sms" }, // nothing said of what it is about
    { how: "message", wire: "sms", about: "   " }, // nor in spaces
    { how: "letter", about: "follow up" }, // neither a message nor a call
    { how: "call", about: "follow up", voice: "warm" }, // a field it does not take
  ]) {
    const ctx = ctxFor(tables, { id: K1 });
    await refused(draft.POST.run(post(body), ctx), "validation");
  }
});

test("someone who is not this workspace's person is not found, by any of the three", async () => {
  const tables = { memberships: [membership("operator")], contacts: [] };
  await refused(
    message.POST.run(post({ wire: "sms", text: "Hello", then: "me" }), ctxFor(tables, { id: K1 })),
    "not_found",
    404,
  );
  await refused(
    draft.POST.run(post({ how: "call", about: "follow up" }), ctxFor(tables, { id: K1 })),
    "not_found",
    404,
  );
  // An address that is no id of a person finds no one, and is never asked of the database.
  await refused(
    reach.GET.run(new Request("http://localhost/api/v1/x"), ctxFor(tables, { id: "new" })),
    "not_found",
    404,
  );
});
