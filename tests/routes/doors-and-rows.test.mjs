/**
 * Doors and rows.
 *
 * Five verbs updated a row without counting how many rows the UPDATE hit —
 * and RLS is silent on a forbidden UPDATE, so a refused change reported
 * success, mirrored a pause, scheduled jobs and wrote the ledger for a change
 * that never landed; resolve wrote its ledger entry BEFORE the update. Ids
 * reached PostgREST unvalidated and came back as 500s. The idempotency key
 * was a predictable string any member could plant. The middleware answered
 * 401 for an auth outage and signed everyone out. And two doors disagreed
 * with the code above them: the operator's autonomy switch and the
 * diagnostic's legacy key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw, importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const { isRetryableAuthError } = await importSrc("apps/dashboard/src/server/shared/auth/errors.ts");
const { threadPorts, escalationPorts } = await importSrc("apps/dashboard/src/server/conversations/ports.ts");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const routeAt = (p) => importSrc(`apps/dashboard/app/api/v1/${p}/route.ts`);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ctxOver = (tables, faults = {}) => ({
  supabase: fakeDb(tables, faults),
  userId: "u1",
  email: "ops@harbor.example",
  params: {},
});

test("every conversation verb counts the rows its UPDATE hit, in the one adapter; zero rows is the verb's 409, which is run, not read", async () => {
  // The verbs live in packages/core and core-thread-verbs.test.mjs runs each 409 over fakes; here the adapter the
  // route hands them (server/conversations/ports.ts), run over a database: a row RLS hides or that is gone changes
  // nothing and says false, so the verb never describes a change that did not land. The take-over, the hand-back
  // (00386) and the call-back (00387) are doors that count their own rows.
  const tables = () => ({
    conversations: [{ id: C, tenant_id: T, state: "open" }],
    escalations: [{ id: E, tenant_id: T, conversation_id: C, state: "open" }],
  });
  const t = tables();
  const ports = threadPorts(ctxOver(t));
  const until = "2026-11-27T15:00:00.000Z";
  const elsewhere = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  assert.equal(await ports.snooze(elsewhere, until), false, "snooze: a row the member cannot see changed nothing");
  assert.equal(await ports.archive(elsewhere), false, "archive: so did this");
  assert.equal(await ports.wake(C), false, "wake: guarded on the state it leaves, and the thread is open");
  assert.equal(t.conversations[0].state, "open", "and nothing was written");
  assert.equal(await ports.snooze(C, until), true, "snooze: the one row, changed");
  assert.equal(t.conversations[0].state, "snoozed");
  assert.equal(await ports.wake(C), true, "wake: now that it is snoozed");
  assert.equal(await ports.archive(C), true);
  // resolve: guarded on the hold being open, so a second press is the verb's 409.
  const esc = escalationPorts(ctxOver(t));
  assert.equal(await esc.resolve(elsewhere), false);
  assert.equal(await esc.resolve(E), true, "resolve: the open hold");
  assert.equal(t.escalations[0].state, "resolved");
  assert.equal(t.escalations[0].resolved_by_user_id, "u1", "by the member who pressed");
  assert.equal(await esc.resolve(E), false, "and only while it is open");
  // A database that refuses is a failure the route answers, never a zero read as a change.
  const down = threadPorts(ctxOver(tables(), { "conversations.update": { code: "XX000", message: "down" } }));
  await assert.rejects(down.snooze(C, until), (e) => e.name === "DbFailure" && e.code === "XX000");
});

test("ids are validated by the one guard, never by a private regex", async () => {
  // Every route that takes an id, run with one that is not an id: the guard's 404 in the record's own word, before
  // anything is asked of the database. A non-uuid PostgREST is handed is its 22P02 and a 500, which is what each
  // table here answers if it is reached. A route that declares a row scope never sees the id: its loader (shared/
  // verbs.ts, the one chokepoint for that row) asks the guard; every other route asks it itself.
  const refused = { code: "22P02", message: 'invalid input syntax for type uuid: "x"' };
  const faults = {};
  for (const t of ["conversations", "escalations", "messages", "calls", "contacts"]) faults[`${t}.select`] = refused;
  for (const t of ["conversations", "escalations", "messages", "memberships"]) faults[`${t}.update`] = refused;
  const tables = {
    memberships: [
      {
        id: "m1",
        user_id: "u1",
        tenant_id: T,
        role: "owner",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  };
  const asks = [
    ["escalations/[id]/resolve", "POST", "escalation"],
    ["messages/[id]/cancel-send", "POST", "message"],
    ["conversations/[id]/snooze", "POST", "conversation", { until: "2026-11-27T15:00:00Z" }],
    ["calls/[id]/recording", "GET", "call"],
    ["contacts/[id]", "GET", "contact"],
    ["contacts/[id]", "DELETE", "contact"],
    ["team/[id]", "PATCH", "member", { role: "viewer" }],
    ["team/[id]", "DELETE", "member"],
    ["calls", "GET", "conversation", null, "&conversation_id=x"],
    ["calls", "GET", "call", null, `&ids=${C},x`],
  ];
  for (const [p, method, what, body = null, query = ""] of asks) {
    setRateStore(memoryStore());
    const handler = (await routeAt(p))[method];
    const request = new Request(`http://localhost/api/v1/x?workspace=${T}${query}`, {
      method,
      ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
    });
    await assert.rejects(handler.run(request, { ...ctxOver(tables, faults), params: { id: "x" } }), (e) => {
      assert.equal(e.code, "not_found", `${method} ${p}: ${e.message}`);
      assert.equal(e.message, `That ${what} does not exist.`, `${method} ${p}`);
      return true;
    });
  }
});

// The reply's idempotency key belongs to the caller and to the intent: core-reply.test.mjs runs the replay ("a replay:
// the same key and intent..."): the key the port is handed is the caller's (`u1:k1`), a different body under the same
// key is a different intent and goes, and a replay is answered before the thread is claimed, with nothing after it.

test("an auth outage is a 503 at the gate too, and the predicate is shared", () => {
  assert.equal(isRetryableAuthError(null), false);
  assert.equal(isRetryableAuthError({ status: 401, name: "AuthApiError" }), false);
  assert.equal(isRetryableAuthError({ status: 503, name: "AuthApiError" }), true);
  assert.equal(isRetryableAuthError({ status: 429, name: "AuthApiError" }), true, "rate limited is not signed out");
  assert.equal(
    isRetryableAuthError({ name: "AuthRetryableFetchError" }),
    true,
    "no status = could not reach the auth server",
  );
  // The predicate, where it is asked: at the gate, auth/auth-gate.test.mjs ("an auth server that cannot be reached is
  // 'try again', never 'signed out'": a page and a route are 503, upstream_auth, never stored); in the wrapper,
  // auth/session/bearer.test.mjs ("a verifier that cannot be reached is 503, not a sign-out") and, for a route that
  // asks the Auth server itself, auth/fresh-session.test.mjs.
});

test("the doors agree with the code above them", async () => {
  const sql = readRaw("supabase/migrations/00033_doors_and_rows.sql");
  // Operators may tune the WORKSPACE rows — the route, the permissions and the
  // legend all said so; the RLS was the laggard.
  assert.ok(sql.includes("create policy policies_acting_member_update on public.policies"));
  assert.ok(sql.includes("subject_type is null"), "person-scoped rows stay owner-only");
  const policies = await importSrc("apps/dashboard/app/api/v1/policies/route.ts");
  assert.ok(
    Object.values(policies).some((handler) => handler?.policy?.role === "operator"),
    "the route lets an operator tune them too",
  );
  // Idempotency keys: acting members only.
  assert.ok(sql.includes("drop policy if exists idempotency_member_all"));
  assert.ok(sql.includes("create policy idempotency_acting_member_all"));
});

// Customer numbers stay out of edge logs: ops/notify-transport.test.mjs runs every line the platform's mail writes
// about a subject (no key, refused, a transport that throws) and finds the number redacted in each. The call-start
// door's lines carry the caller's tail, the agent and the call, never the number: run in retell-inbound-door.test.mjs.
