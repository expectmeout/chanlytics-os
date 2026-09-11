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

const route = (p) => readCode(`apps/dashboard/app/api/v1/${p}/route.ts`);

test("every conversation verb counts the rows its UPDATE hit, and says so on zero", () => {
  for (const verb of ["take-over", "hand-back", "archive", "snooze", "wake"]) {
    const src = route(`conversations/[id]/${verb}`);
    assert.match(src, /\.update\([\s\S]*?\)\s*[\s\S]*?\.select\("id"\)/, `${verb}: the UPDATE must return ids`);
    assert.match(src, /length === 0\)/, `${verb}: zero rows must be handled`);
    assert.match(src, /"conflict"/, `${verb}: zero rows is a 409, not success`);
  }
});

test("take-over releases the Blob pause it mirrored when the row did not change", () => {
  const src = route("conversations/[id]/take-over");
  const mirror = src.indexOf("mirrorBlobPause(conv.tenant_id, conv.phone_e164, until)");
  const release = src.indexOf("mirrorBlobPause(conv.tenant_id, conv.phone_e164, 0)");
  assert.ok(mirror > 0 && release > mirror, "the two stores must not disagree about a thread nobody took");
});

test("resolve updates first, row-counted, and records the decision only once it landed", () => {
  const src = route("escalations/[id]/resolve");
  const update = src.indexOf('.update({ state: "resolved", resolved_by_user_id: ctx.userId })');
  const record = src.indexOf('recordDecision(ctx, esc.tenant_id, "escalation", esc.id, "resolve")');
  assert.ok(update > 0 && record > update, "REGRESSION: the ledger entry preceded the update");
  assert.match(src, /\.eq\("state", "open"\)\s*\.select\("id"\)/);
  assert.match(src, /already resolved/);
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

test("the reply's idempotency key belongs to the caller and to the intent", () => {
  const src = route("conversations/[id]/reply");
  assert.ok(src.includes("const idemKey = idemHeader ? `${ctx.userId}:${idemHeader}` : null;"), "scoped to the caller");
  assert.ok(src.includes("const sameIntent = !prior?.request_hash || prior.request_hash === intentHash;"), "a different body is a different intent");
  assert.ok(src.includes("request_hash: intentHash,"), "the stored hash is the one compared");
  // The check happens BEFORE any side effect of the send.
  const check = src.indexOf("sameIntent");
  const mirror = src.indexOf("mirrorBlobPause(");
  assert.ok(check > 0 && mirror > check, "a replay must be answered before the pause is mirrored");
});

test("an auth outage is a 503 at the gate too, and the predicate is shared", () => {
  assert.equal(isRetryableAuthError(null), false);
  assert.equal(isRetryableAuthError({ status: 401, name: "AuthApiError" }), false);
  assert.equal(isRetryableAuthError({ status: 503, name: "AuthApiError" }), true);
  assert.equal(isRetryableAuthError({ name: "AuthRetryableFetchError" }), true, "no status = could not reach the auth server");
  const middleware = readCode("apps/dashboard/middleware.ts");
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
  assert.match(readCode("apps/dashboard/app/api/v1/policies/route.ts"), /requireRole\(member, "operator"\)/);
  // Idempotency keys: acting members only.
  assert.ok(sql.includes("drop policy if exists idempotency_member_all"));
  assert.ok(sql.includes("create policy idempotency_acting_member_all"));
});

test("the diagnostic accepts only its header, and the webhook says which credential passed", () => {
  const diag = readCode("apps/edge/api/diag.ts");
  assert.ok(!diag.includes("WHATSAPP_VERIFY_TOKEN"), "the legacy query-string key is gone");
  const hook = readCode("apps/edge/api/retell-webhook.ts");
  assert.ok(hook.includes('console.log("retell_webhook_auth", JSON.stringify({ sig: sigOk, key: keyOk }))'));
});

test("customer numbers stay out of edge logs", () => {
  const pause = readCode("apps/edge/api/admin/pause.ts");
  assert.ok(!/JSON\.stringify\(\{ phone,/.test(pause), "the pause mirror logged the whole number");
  assert.ok(pause.includes("phone_tail"));
  const inbound = readCode("apps/edge/api/retell-inbound.ts");
  assert.ok(inbound.includes("logger({ from_tail: from.slice(-4), agent_id: agentId })"));
  const notify = readCode("apps/edge/lib/notify.ts");
  // Every log line that mentions a subject passes it through the redactor.
  const unredacted = notify.split("\n").filter((l) => /console\.(error|log|warn)\(/.test(l) && /subject/.test(l) && !/redactNumbers\(/.test(l));
  assert.deepEqual(unredacted, [], "a subject line names the customer");
  assert.ok(notify.includes("function redactNumbers(subject: string): string"));
});
