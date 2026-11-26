/**
 * Settings apply on the next message. The edge's tenant runtime is cached per
 * instance and re-checked against one freshness stamp per message: the same
 * stamp serves the cache, a different one reloads, a failed read keeps what
 * it has.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MIN_MS } from "@chanlytics/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const { loadTenantRuntime } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/shared/tenant-runtime.ts")).href
);

/** A database that answers from `state` and records what was read. */
function fakeDb(state) {
  const reads = [];
  const answer = (table) => {
    reads.push(table);
    if (table === "tenant_config") return { data: { config: state.config }, error: null };
    if (table === "policies") return { data: state.policies, error: null };
    if (table === "tenants") return { data: { timezone: state.timezone }, error: null };
    return { data: null, error: null };
  };
  const chain = (table) => {
    const p = new Proxy(function () {}, {
      get: (_, k) => (k === "then" ? (res, rej) => Promise.resolve(answer(table)).then(res, rej) : () => p),
      apply: () => p,
    });
    return p;
  };
  return {
    reads,
    from: (table) => chain(table),
    rpc: async (name) => {
      reads.push(`rpc:${name}`);
      if (name === "runtime_stamp")
        return state.stampFails ? { data: null, error: { message: "down" } } : { data: state.stamp, error: null };
      return { data: null, error: null };
    },
  };
}

test("served from the cache while the stamp agrees, reloaded the moment it changes, kept when the stamp cannot be read", async () => {
  const state = {
    config: {},
    policies: [{ class: "reply", mode: "auto", limits: { pause_hours: 4 } }],
    timezone: "America/New_York",
    stamp: "1|a|b",
  };
  const db = fakeDb(state);
  const routed = {
    tenantId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    channelId: "ch1",
    kind: "whatsapp",
    credentialsRef: null,
  };

  const first = await loadTenantRuntime(db, routed);
  assert.equal(first.timezone, "America/New_York");
  assert.equal(first.policy.reply.mode, "auto");
  assert.ok(
    db.reads.includes("tenant_config") && db.reads.includes("rpc:runtime_stamp"),
    "a cold load reads everything and takes the stamp",
  );

  db.reads.length = 0;
  const second = await loadTenantRuntime(db, routed);
  assert.equal(second, first, "the same object: served from the cache");
  assert.deepEqual(db.reads, ["rpc:runtime_stamp"], "one cheap door, nothing else");

  // The owner saves a setting: a new stamp.
  state.stamp = "2|a|b";
  state.policies[0].mode = "ask";
  state.timezone = "Europe/Madrid";
  db.reads.length = 0;
  const third = await loadTenantRuntime(db, routed);
  assert.notEqual(third, first);
  assert.equal(third.policy.reply.mode, "ask", "the receptionist sees the change on this message");
  assert.equal(third.timezone, "Europe/Madrid");
  assert.ok(db.reads.includes("tenant_config"), "reloaded");

  // The door blips: what is cached is served, not thrown away.
  state.stampFails = true;
  db.reads.length = 0;
  const fourth = await loadTenantRuntime(db, routed);
  assert.equal(fourth, third, "kept");
  assert.deepEqual(db.reads, ["rpc:runtime_stamp"]);
});

test("ten minutes on, a warm runtime is read again though its stamp agrees: the backstop for what the stamp does not see", async (t) => {
  // The stamp door's own answers, what it reads and who may call it, run on a real database in
  // receptionist/the-runtime-stamp-covers-what-the-runtime-reads.db.test.mjs. Until 26 Nov 2026 this test read 00059's
  // text and tenant-runtime.ts's; 00330 has made the function again since.
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-26T12:00:00Z") });
  const state = {
    config: {},
    policies: [{ class: "reply", mode: "auto", limits: {} }],
    timezone: "America/New_York",
    stamp: "1|a|b",
  };
  const db = fakeDb(state);
  const routed = {
    tenantId: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
    channelId: "ch2",
    kind: "whatsapp",
    credentialsRef: null,
  };
  const first = await loadTenantRuntime(db, routed);

  t.mock.timers.tick(10 * MIN_MS - 1);
  db.reads.length = 0;
  assert.equal(await loadTenantRuntime(db, routed), first, "a moment short of ten minutes: served, the stamp agreeing");
  assert.deepEqual(db.reads, ["rpc:runtime_stamp"]);

  t.mock.timers.tick(1);
  db.reads.length = 0;
  const again = await loadTenantRuntime(db, routed);
  assert.notEqual(again, first, "at ten minutes: read again, though nothing the stamp sees changed");
  assert.ok(db.reads.includes("tenant_config") && db.reads.includes("policies"), "the whole runtime, read again");
});
