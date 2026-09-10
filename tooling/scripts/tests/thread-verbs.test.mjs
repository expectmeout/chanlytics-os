/**
 * The thread verbs, run: who may, which thread, what body.
 *
 * Seven verbs moved onto route() in the first step of the route definition:
 * take-over, hand-back, archive, snooze, wake, resolving an escalation and
 * calling back a send. What they share, and used to hold as seven hand-written
 * copies, is the door: the thread's own workspace decides the role, a thread
 * the caller cannot see is a 404, and each counts against one bucket. Their
 * success paths write a decision row, which the database in memory does not
 * model, so these run the refusals, and prove nothing was written first.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const here = path.dirname(fileURLToPath(import.meta.url));
const V1 = path.join(here, "../../../apps/dashboard/app/api/v1");
const load = async (rel) => (await import(pathToFileURL(path.join(V1, rel, "route.ts")).href)).POST;
const { setRateStore, memoryStore } = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/rate-limit.ts")).href);

beforeEach(() => setRateStore(memoryStore()));

const THREAD_VERBS = ["take-over", "hand-back", "archive", "snooze", "wake"];
const verbs = Object.fromEntries(await Promise.all(THREAD_VERBS.map(async (v) => [v, await load(`conversations/[id]/${v}`)])));
const resolve = await load("escalations/[id]/resolve");
const cancelSend = await load("messages/[id]/cancel-send");

const T = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const ESC = "33333333-3333-4333-8333-333333333333";
const MSG = "44444444-4444-4444-8444-444444444444";
const USER = "u1";
const memberAs = (role) => [{ user_id: USER, tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }];
const thread = (over = {}) => ({
  id: CONV, tenant_id: T, state: "snoozed", paused_until: null, last_wa_inbound_at: null, contact_id: "c1",
  contacts: { phone_e164: "+15555550100", consent: "opted_in", dnc: false }, ...over,
});

function ctxFor(tables, id) {
  const supabase = fakeDb(tables);
  return { ctx: { supabase, userId: USER, email: "ada@example.com", params: { id } }, supabase };
}
const post = (body) => new Request("http://localhost/api/v1/x", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const wrote = (supabase) => supabase.seen.filter((q) => q.op === "update" || q.rpc);

async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}

test("every thread verb declares the same door", () => {
  for (const [name, handler] of Object.entries({ ...verbs, resolve, "cancel-send": cancelSend })) {
    assert.deepEqual({ ...handler.policy }, { kind: "write", scope: "row", role: "operator", rate: "thread_state", spend: false }, name);
  }
});

test("a viewer changes no thread, and is refused before anything is written", async () => {
  for (const [name, POST] of Object.entries(verbs)) {
    const { ctx, supabase } = ctxFor({ memberships: memberAs("viewer"), conversations: [thread()] }, CONV);
    await refused(POST.run(post({ until: new Date(Date.now() + 3_600_000).toISOString() }), ctx), "forbidden", 403);
    assert.deepEqual(wrote(supabase), [], `${name}: nothing written before the refusal`);
  }
});

test("a thread the caller cannot see is a 404, and so is an id that cannot be one", async () => {
  for (const POST of Object.values(verbs)) {
    await refused(POST.run(post({}), ctxFor({ memberships: memberAs("owner"), conversations: [] }, CONV).ctx), "not_found", 404);
    await refused(POST.run(post({}), ctxFor({ memberships: memberAs("owner"), conversations: [thread()] }, "not-an-id").ctx), "not_found", 404);
  }
});

test("a snooze needs a future time, within thirty days, and is refused before anything is written", async () => {
  const cases = [
    [undefined, /future `until`/],
    [{ until: "yesterday" }, /future `until`/],
    [{ until: new Date(Date.now() - 60_000).toISOString() }, /future `until`/],
    [{ until: new Date(Date.now() + 40 * 86_400_000).toISOString() }, /capped at 30 days/],
  ];
  for (const [body, said] of cases) {
    const { ctx, supabase } = ctxFor({ memberships: memberAs("operator"), conversations: [thread()] }, CONV);
    await assert.rejects(verbs.snooze.run(post(body), ctx), (e) => e.code === "validation" && said.test(e.message), JSON.stringify(body));
    assert.deepEqual(wrote(supabase), []);
  }
});

test("an escalation and a queued send are each judged in their own workspace", async () => {
  const esc = { id: ESC, tenant_id: T, state: "open" };
  const msg = { id: MSG, tenant_id: T, conversation_id: CONV, status: "queued" };
  await refused(resolve.run(post(), ctxFor({ memberships: memberAs("viewer"), escalations: [esc] }, ESC).ctx), "forbidden", 403);
  await refused(resolve.run(post(), ctxFor({ memberships: memberAs("owner"), escalations: [] }, ESC).ctx), "not_found", 404);
  await refused(cancelSend.run(post(), ctxFor({ memberships: memberAs("viewer"), messages: [msg] }, MSG).ctx), "forbidden", 403);
  await refused(cancelSend.run(post(), ctxFor({ memberships: memberAs("owner"), messages: [] }, MSG).ctx), "not_found", 404);
  // Already resolved is an answer, not an error, and writes nothing.
  const { ctx, supabase } = ctxFor({ memberships: memberAs("operator"), escalations: [{ ...esc, state: "resolved" }] }, ESC);
  assert.deepEqual(await resolve.run(post(), ctx), { state: "resolved", already: true });
  assert.deepEqual(wrote(supabase), []);
});

test("the verbs share one bucket: a script flipping threads is refused at once", async () => {
  const tables = { memberships: memberAs("viewer"), conversations: [thread()] };
  // A viewer spends nothing, however many times they try.
  for (let i = 0; i < 130; i++) await refused(verbs["take-over"].run(post(), ctxFor(tables, CONV).ctx), "forbidden");
  tables.memberships[0].role = "operator";
  // 120 a minute across every verb: waking a thread that is not snoozed is a
  // 409 that still counted, so the 121st of anything is a 429.
  const awake = { memberships: tables.memberships, conversations: [thread({ state: "open" })] };
  for (let i = 0; i < 120; i++) await refused(verbs.wake.run(post(), ctxFor(awake, CONV).ctx), "conflict");
  await refused(verbs.snooze.run(post({}), ctxFor(awake, CONV).ctx), "rate_limited", 429);
});
