/**
 * Two businesses can have the same customer. Their stored conversation must not
 * be the same object.
 *
 * The thread store was keyed `threads/<phone digits>.json` — a customer's phone
 * number with no tenant in it — and that one object carries conversation
 * history, pause state, the dedupe list and the daily reply cap. Sharing it
 * means one business's receptionist can quote another's conversation, inherit
 * its pause, and spend its reply budget. The inbound-call endpoint read the
 * same key with no tenant resolution at all, so it could have spoken one
 * business's WhatsApp thread into another's phone call.
 *
 * These tests drive the real store against its in-memory backend (no
 * BLOB_READ_WRITE_TOKEN in the test env), which exercises the same key
 * derivation the Blob path uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const EDGE = path.join(here, "../../../apps/edge");
const STORE = path.join(EDGE, "lib/store.ts");
const {
  getThread, saveThread, deleteThread, deleteTenantThreads, threadNamespace,
} = await import(pathToFileURL(STORE).href);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const SHARED_CUSTOMER = "13475550199";

test("the same customer at two businesses is two separate threads", async () => {
  const nsA = threadNamespace(TENANT_A);
  const nsB = threadNamespace(TENANT_B);
  assert.notEqual(nsA, nsB, "two tenants produced the same namespace");

  const a = await getThread(nsA, SHARED_CUSTOMER);
  a.history.push({ role: "user", content: "salon A: my appointment is at 3" });
  a.pausedUntil = Date.now() + 3600_000;
  a.replies = [Date.now(), Date.now()];
  a.seen.push("wamid.A1");
  await saveThread(nsA, SHARED_CUSTOMER, a);

  const b = await getThread(nsB, SHARED_CUSTOMER);

  // All four of the things that object carries must be unshared.
  assert.deepEqual(b.history, [], "business B could read business A's conversation");
  assert.equal(b.pausedUntil, 0, "business B inherited business A's pause");
  assert.deepEqual(b.replies, [], "business B inherited business A's reply budget");
  assert.deepEqual(b.seen, [], "business B inherited business A's dedupe list");
});

test("a write by one business never reaches the other", async () => {
  const nsA = threadNamespace(TENANT_A);
  const nsB = threadNamespace(TENANT_B);

  const b = await getThread(nsB, SHARED_CUSTOMER);
  b.history.push({ role: "user", content: "salon B: do you do gel?" });
  await saveThread(nsB, SHARED_CUSTOMER, b);

  const a = await getThread(nsA, SHARED_CUSTOMER);
  assert.equal(a.history.length, 1, "business A's thread changed when B wrote");
  assert.match(a.history[0].content, /salon A/);
});

test("a tenant-less namespace is still specific, not global", async () => {
  // The pre-Postgres path has no tenant to resolve. It must still land in a
  // namespace of its own rather than a shared bucket every tenant would write.
  const envNs = threadNamespace(null);
  assert.notEqual(envNs, threadNamespace(TENANT_A));
  assert.match(envNs, /^env-/, "the fallback namespace should name what it is");
  assert.equal(threadNamespace(undefined), envNs, "null and undefined must agree");
});

test("a thread can be forgotten", async () => {
  // The store had no delete path of any kind, which made a deletion request
  // unanswerable for the most sensitive data in the product.
  const ns = threadNamespace(TENANT_A);
  const id = "13475550111";
  const t = await getThread(ns, id);
  t.history.push({ role: "user", content: "delete me" });
  await saveThread(ns, id, t);

  assert.equal(await deleteThread(ns, id), true);
  const after = await getThread(ns, id);
  assert.deepEqual(after.history, [], "the thread survived deletion");
});

test("an entire tenant can be forgotten — offboarding", async () => {
  const ns = threadNamespace(TENANT_B);
  for (const id of ["13475550201", "13475550202", "13475550203"]) {
    const t = await getThread(ns, id);
    t.history.push({ role: "user", content: "x" });
    await saveThread(ns, id, t);
  }
  const removed = await deleteTenantThreads(ns);
  assert.ok(removed >= 3, `expected at least 3 removed, got ${removed}`);

  // ...and the OTHER tenant is untouched.
  const survivor = await getThread(threadNamespace(TENANT_A), SHARED_CUSTOMER);
  assert.equal(survivor.history.length, 1, "purging one tenant deleted another's data");
});

/* --------------------- no caller may reach the store untenanted ------------- */

test("every store call site passes a namespace", () => {
  // The failure mode is silent: a call site that reverts to the one-argument
  // form would compile against a string threadId and quietly write to a
  // namespace named after a phone number.
  const files = [
    "api/whatsapp.ts", "lib/whatsapp/inbound.ts", "api/retell-webhook.ts", "api/retell-inbound.ts", "lib/call-start.ts",
    "api/admin/pause.ts", "api/diag.ts",
  ];
  /** Top-level arguments of a call, respecting nested parentheses —
   *  `getThread(threadNamespace(x), from)` is TWO arguments, not one. */
  function callArgs(src, start) {
    let depth = 0;
    let out = "";
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (c === "(") { depth++; if (depth === 1) continue; }
      if (c === ")") { depth--; if (depth === 0) break; }
      out += c;
    }
    const args = [];
    let cur = "";
    let d = 0;
    for (const c of out) {
      if (c === "(") d++;
      if (c === ")") d--;
      if (c === "," && d === 0) { args.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
  }

  for (const f of files) {
    const src = fs.readFileSync(path.join(EDGE, f), "utf8");
    for (const m of src.matchAll(/\b(getThread|saveThread)\(/g)) {
      const args = callArgs(src, m.index + m[0].length - 1);
      assert.ok(
        args.length >= 2,
        `${f}: ${m[1]}(${args.join(", ")}) is missing a namespace — it would key on the phone number alone`,
      );
      assert.match(
        args[0],
        /ns|Ns|namespace|threadNamespace/,
        `${f}: ${m[1]}(...) — first argument should be a namespace, got "${args[0]}"`,
      );
    }
  }
});

test("the inbound-call endpoint refuses to read without a resolved tenant", () => {
  // This endpoint SPEAKS stored conversation back to a caller. Reading the
  // wrong tenant is not a data-quality problem, it is a disclosure.
  //
  // The read moved from the Blob mirror to readLeadContext (Postgres) so both
  // agents share one memory; the ORDER is what this test is really about and
  // it is unchanged. Locating the read explicitly rather than comparing an
  // indexOf that returns -1: if the call is ever renamed away again, this
  // must fail loudly rather than pass because it found nothing.
  const src = fs.readFileSync(path.join(EDGE, "lib/call-start.ts"), "utf8");
  assert.ok(src.includes(`resolveChannelDetailed(db, "voice", o.agentId)`), "it must resolve the tenant from the agent");
  assert.ok(src.includes("if (!routed)"), "it must have an explicit no-tenant branch");
  const guard = src.indexOf("if (!routed)");
  const read = src.indexOf("readLeadContext(");
  assert.ok(read !== -1, "the caller-context read must still exist and be findable");
  assert.ok(guard !== -1 && guard < read, "the no-tenant guard must come BEFORE the read");
  // And it must read the tenant it resolved, never a bare phone lookup.
  assert.ok(src.includes("readLeadContext(db, routed.tenantId"), "the read must be scoped to the resolved tenant");
});
