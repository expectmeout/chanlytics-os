/**
 * The on-demand read cache: what the activity log and the back office paint
 * before their own read lands.
 *
 * The one that matters is the scoping. This holds real rows -- a customer's
 * consent answers, another business's provisioning state -- and a hit that
 * crossed a workspace line would paint one tenant's history on another's page.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The cache scopes by the workspace the REQUEST is built for, which is the one
// in the address (legacy-bridge/workspace.ts reads location.pathname) -- not a
// global. A fake that set a global instead passed while the real thing did not.
globalThis.window = globalThis.window || {};
globalThis.window.location = { pathname: "/w/salon", hash: "" };

const { readCache, clearReadCaches } = await import("../../../apps/dashboard/src/legacy-bridge/read-cache.ts");

const asWorkspace = (slug) => { globalThis.window.location.pathname = `/w/${slug}`; };

beforeEach(() => { asWorkspace("salon"); clearReadCaches(); });

test("nothing is held until a read goes through it, and then the next paint is synchronous", async () => {
  const c = readCache("rows");
  assert.equal(c.peek("a"), null, "a cold tab holds nothing");

  let reads = 0;
  const fresh = async () => { reads++; return { ok: true, rows: [1, 2, 3] }; };
  const first = await c.through("a", fresh);
  assert.deepEqual(first.rows, [1, 2, 3]);
  assert.equal(reads, 1);

  // The point of the whole file: no await.
  assert.deepEqual(c.peek("a").rows, [1, 2, 3], "the answer is there for the next first paint");
  assert.equal(c.peek("b"), null, "and only for the key it was read under");
});

test("a refusal is never held: a page that seeds from this must not paint an error as rows", async () => {
  const c = readCache("rows", (r) => r.ok);
  await c.through("a", async () => ({ ok: false, message: "Could not be read right now." }));
  assert.equal(c.peek("a"), null);
  await c.through("a", async () => ({ ok: true, rows: [7] }));
  assert.deepEqual(c.peek("a").rows, [7], "and the read that works is");
});

test("an answer read under one workspace is invisible under another", async () => {
  const c = readCache("rows");
  await c.through("first-page", async () => ({ ok: true, rows: ["the salon's history"] }));
  assert.ok(c.peek("first-page"), "held for the workspace it was read under");

  asWorkspace("harbor-moving");
  assert.equal(c.peek("first-page"), null, "REGRESSION: one tenant's rows reached another tenant's page");

  await c.through("first-page", async () => ({ ok: true, rows: ["harbor's history"] }));
  assert.deepEqual(c.peek("first-page").rows, ["harbor's history"]);

  asWorkspace("salon");
  assert.deepEqual(c.peek("first-page").rows, ["the salon's history"], "and each keeps its own");
});

test("warming reads once, and not at all for something already held", async () => {
  const c = readCache("rows");
  let reads = 0;
  const fresh = async () => { reads++; return { ok: true, rows: [reads] }; };

  c.warm("a", fresh);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reads, 1, "a pointer reaching the tab starts the read");
  assert.deepEqual(c.peek("a").rows, [1]);

  c.warm("a", fresh);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reads, 1, "resting on it again spends nothing");
});

test("a read that throws while warming is swallowed: nothing on the page asked for it", async () => {
  const c = readCache("rows");
  c.warm("a", async () => { throw new Error("offline"); });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(c.peek("a"), null, "and nothing is held");
});

test("clearing is what a write does, and it empties every cache at once", async () => {
  const one = readCache("one");
  const two = readCache("two");
  await one.through("k", async () => ({ ok: true, rows: [1] }));
  await two.through("k", async () => ({ ok: true, rows: [2] }));

  one.clear();
  assert.equal(one.peek("k"), null);
  assert.ok(two.peek("k"), "a cache clears alone when it is the one that went stale");

  await one.through("k", async () => ({ ok: true, rows: [1] }));
  clearReadCaches();
  assert.equal(one.peek("k"), null);
  assert.equal(two.peek("k"), null, "and the workspace being dropped empties them all");
});

test("a log paged deep does not evict its own head", async () => {
  const c = readCache("rows");
  // 24 entries is the ceiling; page a log past it and the FIRST page is the one
  // a reader coming back needs, so it must not be the one that goes.
  for (let i = 0; i < 24; i++) await c.through(`page-${i}`, async () => ({ ok: true, rows: [i] }));
  assert.deepEqual(c.peek("page-0").rows, [0]);

  // Re-reading the head moves it to the newest end...
  await c.through("page-0", async () => ({ ok: true, rows: [0] }));
  await c.through("page-24", async () => ({ ok: true, rows: [24] }));
  assert.deepEqual(c.peek("page-0").rows, [0], "the head survives");
  assert.equal(c.peek("page-1"), null, "the oldest one goes instead");
});

test("a \"not in your workspace\" is never held: it is the one answer that changes the moment somebody is added", async () => {
  // The person cache is built with exactly this rule (legacy-bridge/people-detail.ts).
  const c = readCache("person", (vm) => vm !== null);
  await c.through("p-1", async () => null);
  assert.equal(c.peek("p-1"), null, "asking again asks the server, not the memory");
  await c.through("p-1", async () => ({ name: "Ana" }));
  assert.deepEqual(c.peek("p-1"), { name: "Ana" }, "and once they exist, they are held");
});
