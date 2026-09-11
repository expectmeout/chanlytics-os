/**
 * The typed client, run with a fake fetch: what it sends, what it answers,
 * and what it does on the way (sign-out, invalidation, refresh). The types
 * are proved by the bridge compiling against it; this is the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createApi, ApiError, unwrap } = await import(at("apps/dashboard/src/client/api.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const envelope = (data) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const refusal = (status, code, message) => new Response(JSON.stringify({ ok: false, error: { code, message } }), { status });

function harness(answer, { workspace = A } = {}) {
  const sent = [];
  const events = [];
  let clock = 1_000;
  const api = createApi({
    fetch: async (url, init) => { sent.push({ url, init }); return typeof answer === "function" ? await answer(url, init) : answer; },
    workspace: () => workspace,
    onSignedOut: () => events.push("signed-out"),
    onChooseWorkspace: () => events.push("choose-workspace"),
    refresh: async (key) => { events.push(`refresh:${key}`); },
    now: () => clock,
  });
  return { api, sent, events, tick: (ms) => { clock += ms; } };
}

test("a read: the path with its params, the query, the workspace the tab holds, and the envelope's data", async () => {
  const h = harness(envelope({ conversation: { id: C1 }, messages: [] }));
  const r = await h.api("GET conversations/[id]", { params: { id: C1 }, query: { before: "2026-09-01T00:00:00Z" } });
  assert.deepEqual(r, { ok: true, data: { conversation: { id: C1 }, messages: [] } });
  assert.equal(h.sent[0].url, `/api/v1/conversations/${C1}?before=2026-09-01T00%3A00%3A00Z&workspace=${A}`);
  assert.equal(h.sent[0].init.method, "GET");
  assert.deepEqual(h.events, [], "a read invalidates and refreshes nothing");
  const bare = harness(envelope({ workspaces: [] }), { workspace: null });
  await bare.api("GET workspaces");
  assert.equal(bare.sent[0].url, "/api/v1/workspaces", "no workspace known yet: none is named");
});

test("a write: JSON in, the idempotency key and the via marker on the wire, then invalidate and the refresh map", async () => {
  const h = harness(envelope({ message_id: "m1", status: "queued" }));
  const r = await h.api("POST conversations/[id]/reply", { params: { id: C1 }, body: { text: "On our way." }, idempotencyKey: "k1", via: "ask", onAccepted: () => h.events.push("accepted") });
  assert.equal(r.ok, true);
  const { init } = h.sent[0];
  assert.equal(init.method, "POST");
  assert.equal(init.body, JSON.stringify({ text: "On our way." }));
  assert.equal(init.headers["content-type"], "application/json");
  assert.equal(init.headers["idempotency-key"], "k1");
  assert.equal(init.headers["x-via"], "ask");
  assert.deepEqual(h.events, ["accepted", "refresh:POST conversations/[id]/reply"], "after a 2xx: the caller's accepted hook, then the map");
  const bodiless = harness(envelope({ status: "active" }));
  await bodiless.api("POST billing/sync");
  assert.equal(bodiless.sent[0].init.body, undefined);
  assert.equal(bodiless.sent[0].init.headers["content-type"], undefined, "no body, no content type");
  const held = harness(envelope({ ok: true }));
  await held.api("PUT contacts/[id]/consent", { params: { id: C1 }, body: { consent: "opted_in", source: "desk" }, refresh: false });
  assert.deepEqual(held.events, [], "refresh: false holds the map, for a bulk verb that re-reads once at its end");
});

test("a refusal is the server's words and code; a 401 signs out; a network failure changes nothing and says so", async () => {
  const refused = harness(refusal(403, "forbidden", "Viewers can see everything and change nothing."));
  assert.deepEqual(await refused.api("POST conversations/[id]/reply", { params: { id: C1 }, body: { text: "x" } }), { ok: false, code: "forbidden", status: 403, message: "Viewers can see everything and change nothing." });
  assert.deepEqual(refused.events, [], "nothing refreshed for a refusal");
  const out = harness(refusal(401, "unauthorized", "Sign in required."));
  assert.deepEqual(await out.api("GET conversations"), { ok: false, code: "unauthorized", status: 401, message: "Signed out." });
  assert.deepEqual(out.events, ["signed-out"]);
  // The first error code the client reads: the server would not guess the
  // workspace, so the bridge forgets its choice and boots again.
  const unnamed = harness(refusal(400, "choose_workspace", "This account belongs to more than one workspace — say which one first."));
  assert.deepEqual(await unnamed.api("GET conversations"), { ok: false, code: "choose_workspace", status: 400, message: "This account belongs to more than one workspace — say which one first." });
  assert.deepEqual(unnamed.events, ["choose-workspace"]);
  const down = harness(() => { throw new TypeError("fetch failed"); });
  assert.deepEqual(await down.api("PUT settings", { body: { config: {}, version: 1 } }), { ok: false, code: "network", status: 0, message: "Network error — nothing was changed." });
  assert.deepEqual(await down.api("GET conversations"), { ok: false, code: "network", status: 0, message: "Chanlytics could not be reached." });
  const gone = harness(new Response("<html>", { status: 502 }));
  assert.deepEqual(await gone.api("GET conversations"), { ok: false, code: "internal", status: 502, message: "Request failed (502)." });
});

test("identical reads within two seconds share one request; a write never does; a settled read is not shared past its burst", async () => {
  let n = 0;
  const h = harness(() => { n += 1; return envelope({ conversations: [] }); });
  await Promise.all([h.api("GET conversations"), h.api("GET conversations")]);
  assert.equal(n, 1, "the second joined the first");
  h.tick(2_001);
  await h.api("GET conversations");
  assert.equal(n, 2, "after the burst, a fresh request");
  await Promise.all([h.api("POST billing/sync"), h.api("POST billing/sync")]);
  assert.equal(n, 4, "writes are never collapsed");
  await h.api("GET conversations", { query: { workspace: A } });
  assert.equal(n, 5, "a different URL is a different request");
});

test("a write forgets every read in flight, so the refresh that follows never shares a response issued before the change", async () => {
  let n = 0;
  let release = () => {};
  const gate = new Promise((r) => { release = r; });
  const h = harness(async (url) => { n += 1; if (url.startsWith("/api/v1/conversations")) await gate; return envelope({ conversations: [], status: "ok" }); });
  const before = h.api("GET conversations");
  await h.api("POST billing/sync");
  const after = h.api("GET conversations");
  release();
  await Promise.all([before, after]);
  assert.equal(n, 3, "the read after the write is its own request, not the one issued before it");
});

test("raw: the Response itself, for the two redirects and the stream; a 401 there still signs out", async () => {
  const h = harness(new Response("line\n", { status: 200 }));
  const res = await h.api.raw("POST ask", { body: { text: "Who booked this week?" } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "line\n");
  assert.equal(h.sent[0].init.method, "POST");
  const out = harness(new Response(null, { status: 401 }));
  await out.api.raw("GET google/connect");
  assert.deepEqual(out.events, ["signed-out"]);
});

test("unwrap throws the refusal as an ApiError the runner can read, and hands the data through otherwise", async () => {
  const h = harness(refusal(503, "upstream_auth", "Signing in is not working right now."));
  await assert.rejects(async () => unwrap(await h.api("GET conversations")), (e) => e instanceof ApiError && e.code === "upstream_auth" && e.status === 503 && e.message === "Signing in is not working right now.");
  assert.deepEqual(unwrap({ ok: true, data: 7 }), 7);
});

test("the URL alone, for a link the browser follows rather than a request it makes", () => {
  const h = harness(null);
  assert.equal(h.api.url("GET google/connect", {}), `/api/v1/google/connect?workspace=${A}`);
  assert.equal(h.api.url("GET conversations/[id]/export", { params: { id: C1 } }), `/api/v1/conversations/${C1}/export?workspace=${A}`);
});

test("the refresh map names surfaces only for writes, and every key it names is a route", async () => {
  const { ROUTES } = await import(at("apps/dashboard/src/client/routes.generated.ts"));
  const { AFTER_KEYS } = await import(at("apps/dashboard/src/legacy-bridge/refresh-map.ts"));
  assert.ok(AFTER_KEYS.length >= 40, `the couriers' lists moved in: ${AFTER_KEYS.length}`);
  for (const k of AFTER_KEYS) {
    assert.ok(ROUTES[k], `${k}: not a route`);
    assert.notEqual(ROUTES[k].method, "GET", `${k}: a read refreshes nothing`);
  }
});
