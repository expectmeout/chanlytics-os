/**
 * One dial saved leaves the others as they were, and leaves the mode alone (packages/db savePolicyChange, the door How
 * it runs and the autonomy pane write through; the route is PUT /api/v1/policies). A policy row's `limits` holds
 * several settings at once and its `mode` beside them, so a save is one write in the database (policy_change, 00624):
 * the dials given are merged into the limits on file, a mode not given is not written, and the change's row on the
 * ledger is written with it.
 *
 * It was three steps in the app: read the row, merge, write the mode and the limits back. A read that failed merged
 * over nothing and wiped every other dial; two saves at once each merged over the limits they had read, and the second
 * dropped the first's dial; a dial saved while a teammate changed the mode wrote the old mode back. Run over a database
 * in memory, which models the door; what two callers at once leave is the real database's to prove
 * (receptionist/policies/a-policy-save-is-one-step.db.test.mjs).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { savePolicyChange } from "@chanlytics/db/workspace";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const policies = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "99999999-9999-4999-8999-999999999999";
const HELD = { max_replies_day: 5, reply_delay_ms: 3000, min_confidence: 0.7, max_llm_tokens_day: 20000 };
const replyRow = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: T,
  class: "reply",
  mode: "ask",
  subject_type: null,
  subject_id: null,
  limits: { ...HELD },
  updated_at: "2026-10-01T00:00:00.000Z",
});
const world = () => ({
  memberships: [
    { user_id: USER, tenant_id: T, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  policies: [replyRow()],
});
const changesOn = (tables) => (tables.events ?? []).filter((e) => e.kind === "policy.changed");
const put = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${T}`, { method: "PUT", body: JSON.stringify(body) });
/** An operator's session over these tables, and the service role over the same ones, to see what is written as it. */
function sessionOver(tables) {
  const session = fakeDb(tables, {}, {}, { userId: USER });
  const service = fakeDb(tables);
  setServiceClient(service);
  return {
    session,
    service,
    ctx: (supabase) => ({ supabase, userId: USER, email: "ada@example.com", aal: "aal2", params: {} }),
  };
}

test("a dial saved is merged into the limits on file: the others stay, and the mode given is the mode kept", async () => {
  const tables = { policies: [replyRow()] };
  const row = await savePolicyChange(fakeDb(tables), T, "reply", {
    mode: "auto",
    limits: { min_confidence: 0.9 },
    via: null,
  });
  assert.deepEqual(row.limits, { ...HELD, min_confidence: 0.9 });
  assert.equal(tables.policies[0].mode, "auto");
});

test("a save the database refuses throws, and nothing is written: every dial and the mode stay, and no change is on the ledger", async () => {
  const tables = { policies: [replyRow()] };
  const refusing = {
    policy_change: () => {
      throw new Error("connection reset");
    },
  };
  await assert.rejects(
    savePolicyChange(fakeDb(tables, {}, refusing), T, "reply", {
      mode: "auto",
      limits: { min_confidence: 0.9 },
      via: null,
    }),
    /connection reset/,
  );
  assert.deepEqual(tables.policies, [replyRow()], "the row is exactly as it was: its mode too");
  assert.deepEqual(changesOn(tables), []);
});

test("REGRESSION: a dial saved while a teammate turns the replies off leaves them off -- the save read the row's mode and wrote it back", async () => {
  const tables = world();
  const { session, ctx } = sessionOver(tables);
  // The teammate's change lands after this save's first read of the row and before its write, whatever the write is.
  let reads = 0;
  let landed = false;
  const teammate = () => {
    if (landed) return;
    landed = true;
    tables.policies[0].mode = "never";
  };
  const between = {
    from(table) {
      if (table === "policies" && reads++ > 0) teammate();
      return session.from(table);
    },
    rpc(name, args) {
      teammate();
      return session.rpc(name, args);
    },
  };
  const saved = await policies.PUT.run(put({ class: "reply", min_confidence: 0.9 }), ctx(between));
  assert.equal(landed, true, "the teammate's change landed inside the save");
  assert.equal(tables.policies[0].mode, "never", "the mode a teammate set stays set");
  assert.deepEqual(tables.policies[0].limits, { ...HELD, min_confidence: 0.9 }, "and the dial is saved beside it");
  assert.equal(saved.policy.mode, "never", "the answer is the row as it stands");
  const call = session.seen.find((q) => q.rpc === "policy_change");
  assert.ok(call, "the save is the database's one write");
  assert.equal("p_mode" in call.args, false, "a dial alone hands the database no mode to write");
  assert.deepEqual(
    session.seen.filter((q) => q.table === "policies" && q.op === "update"),
    [],
    "the app writes the row nowhere else",
  );
});

test("REGRESSION: a change and its record are one write -- the ledger's row was a second write as the service role, lost when it failed", async () => {
  const tables = world();
  const { session, service, ctx } = sessionOver(tables);
  const saved = await policies.PUT.run(put({ class: "reply", mode: "veto", reply_delay_ms: 30000 }), {
    ...ctx(session),
    via: "ask",
  });
  assert.deepEqual([saved.policy.mode, saved.policy.limits.reply_delay_ms], ["veto", 30000]);
  assert.deepEqual(
    changesOn(tables).map((e) => [e.category, e.subject_type, e.subject_id, e.data]),
    [["system", "workspace", T, { class: "reply", mode: "veto", fields: ["reply_delay_ms"], by: USER, via: "ask" }]],
    "one row, written with the change: the class, the mode, the dials that moved and never their values, who, and the card",
  );
  assert.deepEqual(service.seen, [], "nothing is written as the service role: no second row");
  assert.deepEqual(saved.was, { mode: "ask", min_confidence: 0.7 }, "what the row held before, for an undo");
});
