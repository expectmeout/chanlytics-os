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
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { isRetryableAuthError } = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/auth-errors.ts")).href);

const route = (p) => readCode(p.startsWith("packages/") ? p : `apps/dashboard/app/api/v1/${p}/route.ts`);

test("every conversation verb counts the rows its UPDATE hit, in the one adapter; zero rows is the verb's 409, which is run, not read", () => {
  // The verbs live in packages/core and core-thread-verbs.test.mjs runs each
  // 409; what is pinned here is that every port the adapter hands them is
  // row-counted through the one helper.
  const ports = readCode("apps/dashboard/src/server/core-ports.ts");
  for (const port of ["claim", "release", "snooze", "wake", "archive", "resolve", "cancelQueued"]) {
    assert.ok(ports.includes(`${port}: (`) && ports.includes(`${port}: (`) && new RegExp(port + ": \\([^)]*\\) => changed\\(").test(ports), `${port}: the UPDATE must be row-counted`);
  }
  assert.ok(ports.includes("return !!data && data.length > 0;"), "changed() is the one place zero rows is judged");
  assert.ok(ports.includes('.eq("state", "snoozed").select("id")') && ports.includes('.eq("state", "open").select("id")') && ports.includes('.eq("status", "queued").select("id")'), "wake, resolve and cancel-send are guarded on the state they leave");
});

test("ids are validated by the one guard, never by a private regex", () => {
  const validated = [
    "escalations/[id]/resolve", "messages/[id]/cancel-send", "team/[id]",
    "conversations/[id]", "calls/[id]/recording", "contacts/[id]", "calls",
  ];
  // A route that declares a row scope never sees the id: its loader in verbs.ts
  // (the one chokepoint for that row) calls the guard, which
  // workspace-scoping.test.mjs holds. Every other route calls it itself.
  for (const p of validated) {
    const src = route(p);
    const guarded = /scope: \w+Scope,/.test(src) || /requireUuid\(/.test(src);
    assert.ok(guarded, `${p} must use requireUuid`);
    assert.ok(!/const UUID = \//.test(src), `${p} must not carry its own UUID regex`);
  }
});

test("the reply's idempotency key belongs to the caller and to the intent (core-reply.test.mjs runs the replay; here the shape)", () => {
  const src = route("packages/core/src/conversations/reply.ts");
  assert.ok(src.includes("const idemKey = cmd.idempotencyKey ? `${cmd.userId}:${cmd.idempotencyKey}` : null;"), "scoped to the caller");
  assert.ok(src.includes("const sameIntent = prior?.request_hash === intentHash;"), "a different body is a different intent, and a receipt with no hash never answers");
  assert.ok(src.includes("await ports.storeReceipt(conv.tenant_id, idemKey, intentHash, receipt);"), "the stored hash is the one compared");
  // The check happens BEFORE any side effect of the send. The first of those
  // is the claim, which is also the pause: it used to be a mirror into a
  // second store, and the ordering rule outlived it unchanged.
  const check = src.indexOf("sameIntent");
  const firstEffect = src.indexOf("ports.claimForReply(");
  assert.ok(check > 0 && firstEffect > check, "a replay must be answered before the thread is claimed");
});

test("an auth outage is a 503 at the gate too, and the predicate is shared", () => {
  assert.equal(isRetryableAuthError(null), false);
  assert.equal(isRetryableAuthError({ status: 401, name: "AuthApiError" }), false);
  assert.equal(isRetryableAuthError({ status: 503, name: "AuthApiError" }), true);
  assert.equal(isRetryableAuthError({ name: "AuthRetryableFetchError" }), true, "no status = could not reach the auth server");
  const middleware = readCode("apps/dashboard/proxy.ts");
  const wrapper = readCode("apps/dashboard/src/server/with-route.ts");
  for (const [name, src] of [["middleware", middleware], ["withRoute", wrapper]]) {
    assert.ok(src.includes("isRetryableAuthError(authErr)"), `${name} uses the shared predicate`);
  }
  assert.ok(middleware.includes('"upstream_auth"'));
  assert.ok(middleware.indexOf("isRetryableAuthError(authErr)") < middleware.indexOf('code: "unauthorized"'), "the outage branch runs before the 401");
});

test("the doors agree with the code above them", () => {
  const sql = readRaw("supabase/migrations/00033_doors_and_rows.sql");
  // Operators may tune the WORKSPACE rows — the route, the permissions and the
  // legend all said so; the RLS was the laggard.
  assert.ok(sql.includes("create policy policies_acting_member_update on public.policies"));
  assert.ok(sql.includes("subject_type is null"), "person-scoped rows stay owner-only");
  assert.match(readCode("apps/dashboard/app/api/v1/policies/route.ts"), /role: "operator",/);
  // Idempotency keys: acting members only.
  assert.ok(sql.includes("drop policy if exists idempotency_member_all"));
  assert.ok(sql.includes("create policy idempotency_acting_member_all"));
});

test("customer numbers stay out of edge logs", () => {
  // The pause mirror used to be checked here too; the endpoint is gone with
  // the mirror itself. The call-start door's lines carry the caller's tail,
  // the agent and the call, never the number: run in
  // retell-inbound-door.test.mjs.
  const notify = readCode("apps/edge/lib/notify.ts");
  // Every log line that mentions a subject passes it through the redactor.
  const unredacted = notify.split("\n").filter((l) => /console\.(error|log|warn)\(/.test(l) && /subject/.test(l) && !/redactNumbers\(/.test(l));
  assert.deepEqual(unredacted, [], "a subject line names the customer");
  assert.ok(notify.includes("function redactNumbers(subject: string): string"));
});
