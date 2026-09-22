/**
 * Google, run through route(): the real route modules, their `run` called
 * with a database in memory. What is proved is the policy each declares and
 * what the handler answers, not its text. Every verb reaches Google through
 * the edge, which this machine has no credential for: each stops there, in
 * the words the owner would read, with nothing on the ledger.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
/** The key that signs the OAuth state, so the callback's door can be walked through. */
const SECRET = "test-state-secret";
process.env.GOOGLE_OAUTH_STATE_SECRET = SECRET;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { signState, newNonce, STATE_TTL_MS } = await import("@chanlytics/channels");
const callback = await import(at("apps/dashboard/app/api/v1/google/callback/route.ts"));
const connect = await import(at("apps/dashboard/app/api/v1/google/connect/route.ts"));
const connection = await import(at("apps/dashboard/app/api/v1/google/connection/route.ts"));
const link = await import(at("apps/dashboard/app/api/v1/google/link/route.ts"));
const locations = await import(at("apps/dashboard/app/api/v1/google/locations/route.ts"));
const refresh = await import(at("apps/dashboard/app/api/v1/google/refresh/route.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/google/reviews/[id]/draft/route.ts"));
const reply = await import(at("apps/dashboard/app/api/v1/google/reviews/[id]/reply/route.ts"));
const search = await import(at("apps/dashboard/app/api/v1/google/search/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const R1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const ctxFor = (tables, params = {}) => ({ supabase: fakeDb(tables), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;
const state = (t, u, exp = Date.now() + STATE_TTL_MS) => signState(SECRET, { t, u, n: newNonce(), exp });
/** Where the browser lands: Integrations, with one word the card reads once. */
async function lands(p) {
  const res = await p;
  assert.equal(res.status, 302);
  const to = res.headers.get("location");
  assert.ok(to.endsWith("#/admin/integrations"), to);
  return new URL(to).searchParams;
}

test("the eleven declare their policy: the way there the owner's, the way back its own door as a read of the account, the listing and the account the owner's, a refresh, a draft and a reply an operator's", () => {
  const rd = (role, rate) => ({ kind: "read", scope: "workspace", role, rate, spend: false });
  const ws = (role, rate) => ({ kind: "write", scope: "workspace", role, rate, spend: false });
  assert.deepEqual(callback.GET.policy, { kind: "read", scope: "account", role: null, rate: null, spend: false });
  assert.deepEqual(connect.GET.policy, rd("owner", "google_link"));
  assert.deepEqual(locations.GET.policy, rd("owner", "google_search"));
  assert.deepEqual(connection.DELETE.policy, ws("owner", "google_link"));
  assert.deepEqual(link.POST.policy, ws("owner", "google_link"));
  assert.deepEqual(link.DELETE.policy, ws("owner", "google_link"));
  assert.deepEqual(locations.POST.policy, ws("owner", "google_link"));
  assert.deepEqual(search.POST.policy, ws("owner", "google_search"));
  assert.deepEqual(refresh.POST.policy, ws("operator", "google_refresh"));
  assert.deepEqual(draft.POST.policy, ws("operator", "google_draft"));
  assert.deepEqual(reply.POST.policy, ws("operator", "google_reply"));
});

test("the way back: nothing is trusted until the state proves itself, then the person, then the workspace and the owner's standing in it, then the code, then the edge — every outcome a word Integrations reads", async () => {
  const tables = { memberships: both("operator", "owner") };
  assert.deepEqual([...(await lands(callback.GET.run(get("?error=access_denied"), ctxFor(tables))))].sort(), [
    ["google", "error"],
    ["why", "declined"],
  ]);
  assert.equal(
    (await lands(callback.GET.run(get("?state=nope&code=abc"), ctxFor(tables)))).get("why"),
    "state_malformed",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, USER, Date.now() - 1)}&code=abc`), ctxFor(tables)))).get(
      "why",
    ),
    "state_expired",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, "u2")}&code=abc`), ctxFor(tables)))).get("why"),
    "someone_else",
    "the person who started it",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(A, USER)}&code=abc`), ctxFor(tables)))).get("why"),
    "not_owner",
    "an operator in harbor cannot finish what only an owner may start",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(C, USER)}&code=abc`), ctxFor(tables)))).get("why"),
    "no_workspace",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, USER)}`), ctxFor(tables)))).get("why"),
    "no_code",
  );
  const edge = ctxFor(tables);
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, USER)}&code=abc`), edge))).get("why"),
    "no_edge_credential",
    "proved and the owner's: then the edge, which this machine has no credential for",
  );
  assert.equal(writes(edge), 0);
});

test("the way there is the owner's and, with no edge here, not available; disconnecting, linking, unlinking and choosing a location are the owner's and stop at the edge's credential", async () => {
  const tables = { memberships: both("operator", "owner") };
  await refused(connect.GET.run(get(inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(
    connect.GET.run(get(inB), ctxFor(tables)),
    "conflict",
    409,
    "Connecting a Business Profile is not available here yet.",
  );
  await refused(connection.DELETE.run(send("DELETE", undefined, inA), ctxFor(tables)), "forbidden", 403);
  await refused(
    connection.DELETE.run(send("DELETE", undefined, inB), ctxFor(tables)),
    "internal",
    502,
    "no_edge_credential",
  );
  await refused(
    link.POST.run(send("POST", { place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4" }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(
    link.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Pick a listing from the search first.",
  );
  await refused(
    link.POST.run(send("POST", { place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4" }, inB), ctxFor(tables)),
    "internal",
    502,
    "The listing could not be linked (no_edge_credential).",
  );
  await refused(link.DELETE.run(send("DELETE", undefined, inA), ctxFor(tables)), "forbidden", 403);
  await refused(link.DELETE.run(send("DELETE", undefined, inB), ctxFor(tables)), "internal", 502, "no_edge_credential");
  await refused(locations.GET.run(get(inA), ctxFor(tables)), "forbidden", 403);
  await refused(
    locations.GET.run(get(inB), ctxFor(tables)),
    "internal",
    502,
    "Google could not be read: no_edge_credential",
  );
  await refused(
    locations.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Pick a location from the list first.",
  );
  await refused(
    locations.POST.run(
      send("POST", { account_name: "accounts/123", location_name: "locations/456" }, inB),
      ctxFor(tables),
    ),
    "internal",
    502,
    "The location could not be chosen (no_edge_credential).",
  );
});

test("a refresh, a draft and a reply are an operator's, each judged in its words, each stopping at the edge's credential — and a reply that did not go through is not on the ledger", async () => {
  const tables = { memberships: both("viewer", "operator"), decisions: [] };
  await refused(
    refresh.POST.run(send("POST", undefined, inA), ctxFor(tables)),
    "forbidden",
    403,
    "Viewers can see everything",
  );
  await refused(
    refresh.POST.run(send("POST", undefined, inB), ctxFor(tables)),
    "internal",
    502,
    "Google could not be read.",
  );
  await refused(draft.POST.run(send("POST", undefined, inA), ctxFor(tables, { id: R1 })), "forbidden", 403);
  // A malformed id in the URL's own parameter is a 404 through requireUuid, as
  // it is on every other [id] route: the thing named does not exist, because it
  // cannot. These two carried their own copy of the uuid pattern and answered
  // 400 instead, which read to a client as "you sent a bad field".
  await refused(
    draft.POST.run(send("POST", undefined, inB), ctxFor(tables, { id: "x" })),
    "not_found",
    404,
    "That review does not exist.",
  );
  await refused(
    draft.POST.run(send("POST", undefined, inB), ctxFor(tables, { id: R1 })),
    "internal",
    502,
    "No draft this time (no_edge_credential).",
  );
  await refused(
    reply.POST.run(send("POST", { comment: "Thank you!" }, inA), ctxFor(tables, { id: R1 })),
    "forbidden",
    403,
  );
  await refused(
    reply.POST.run(send("POST", { comment: "Thank you!" }, inB), ctxFor(tables, { id: "x" })),
    "not_found",
    404,
    "That review does not exist.",
  );
  await refused(
    reply.POST.run(send("POST", {}, inB), ctxFor(tables, { id: R1 })),
    "validation",
    400,
    "Write the reply first.",
  );
  const edge = ctxFor(tables, { id: R1 });
  await refused(
    reply.POST.run(send("POST", { comment: "Thank you for coming in!" }, inB), edge),
    "internal",
    502,
    "The reply did not go through (no_edge_credential).",
  );
  assert.equal(writes(edge), 0);
  assert.equal(tables.decisions.length, 0, "a reply that did not go through is not a decision");
});

test("a search is the owner's: with no words of its own it uses the facts on record, and with none of those it asks for them; with words it stops at the edge's credential", async () => {
  const tables = { memberships: both("operator", "owner"), tenant_config: [] };
  await refused(
    search.POST.run(send("POST", { query: "Bayside Salon, Chicago" }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(
    search.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Give the business name and where it is",
  );
  await refused(
    search.POST.run(send("POST", { query: "Bayside Salon, Chicago" }, inB), ctxFor(tables)),
    "internal",
    502,
    "Google could not be searched just now",
  );
});
