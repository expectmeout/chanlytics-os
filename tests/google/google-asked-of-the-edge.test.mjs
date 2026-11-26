/**
 * A search for the business's listing, run through its route to an edge that answers as the test says.
 *
 * With no words of its own, the search asks Google for the business by the name and the address on record; what Google
 * says when it refuses (a key it does not take, an API switched off) is for the log, and the owner hears that the search
 * did not happen and that Chanlytics knows. The way to Google is signed for the workspace and the person who started it,
 * the way back hands the edge the code and never the client's secret, a reply is a line on the ledger, and a disconnect
 * is the edge's to do. Setup's Google row is ready where either half is. Pinned as the routes', google-actions.ts's and
 * setup.ts's text in google.test.mjs and google/profile/ until 26 Nov 2026. Its own file because the deployment decides as its modules load whether it reaches providers
 * (env.ts `deployment`), and google-routes.test.mjs holds a deployment with no edge.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { logLineOf } from "../_log-lines.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The dashboard knocks on the edge with its secret, as a deployment that reaches the providers; what answers is the
// stand-in below.
process.env.EDGE_URL = "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
process.env.GOOGLE_OAUTH_STATE_SECRET = "state-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const search = await import(at("apps/dashboard/app/api/v1/google/search/route.ts"));
const connect = await import(at("apps/dashboard/app/api/v1/google/connect/route.ts"));
const callback = await import(at("apps/dashboard/app/api/v1/google/callback/route.ts"));
const connection = await import(at("apps/dashboard/app/api/v1/google/connection/route.ts"));
const reply = await import(at("apps/dashboard/app/api/v1/google/reviews/[id]/reply/route.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/google/reviews/[id]/draft/route.ts"));
const { verifyState } = await import("@chanlytics/channels/tokens");
beforeEach(() => setRateStore(memoryStore()));

const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRAIN = {
  business_name: "Bayside Salon",
  system_prompt: "Answer as the front desk of Bayside Salon: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { address: "12 Pier Rd, Chicago" },
};

/** The search, asked by Bayside's owner with `body`, against an edge that answers `edge`; what crossed and was logged. */
async function searched(body, edge) {
  const supabase = fakeDb({
    memberships: [
      { user_id: "u1", tenant_id: B, role: "owner", tenants: { slug: "bayside" }, created_at: "2026-02-01" },
    ],
    tenant_config: [{ tenant_id: B, config: { brain: BRAIN } }],
    tenants: [{ id: B, name: "Al", timezone: "America/Chicago" }],
  });
  const asked = [];
  const lines = [];
  const was = { fetch: globalThis.fetch, error: console.error };
  globalThis.fetch = async (url, init) => {
    asked.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(edge.body), {
      status: edge.status,
      headers: { "content-type": "application/json" },
    });
  };
  console.error = (...args) => lines.push(logLineOf(args));
  try {
    const out = await search.POST.run(
      new Request(`http://localhost/api/v1/google/search?workspace=${B}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { supabase, userId: "u1", email: "ada@example.com", params: {} },
    ).then(
      (answer) => ({ answer }),
      (refused) => ({ refused }),
    );
    return { ...out, asked, lines: lines.filter(Boolean) };
  } finally {
    globalThis.fetch = was.fetch;
    console.error = was.error;
  }
}

test("with no words of its own, the search asks the edge for the business's name and the address on record", async () => {
  const { answer, asked } = await searched({}, { status: 200, body: { ok: true, candidates: [] } });
  assert.deepEqual(
    asked.map((a) => [a.path, a.body.op, a.body.query]),
    [["/api/admin/google", "search", "Bayside Salon, 12 Pier Rd, Chicago"]],
  );
  assert.equal(answer.query, "Bayside Salon, 12 Pier Rd, Chicago", "and says what it asked");
});

test("Google's own words go to the log, never to the owner, who hears the search did not happen and that Chanlytics knows", async () => {
  const WORDS = "REQUEST_DENIED: The provided API key is invalid.";
  const { refused, lines } = await searched(
    { query: "Bayside Salon, Chicago" },
    { status: 502, body: { ok: false, error: WORDS } },
  );
  assert.equal(refused.code, "upstream_provider");
  assert.equal(
    refused.message,
    "Couldn't search Google just now. Try again in a minute. Chanlytics is told if it keeps happening.",
  );
  assert.ok(!refused.message.includes("API key"), "nothing of Google's");
  assert.deepEqual(
    lines.filter((l) => l.event === "google_search_failed").map((l) => [l.status, l.error]),
    [[502, WORDS]],
    "Google's words, in the log",
  );
});

test("Setup's Google row is ready where the edge can look a listing up or connect a profile, either one: the listing arrives with the connection", async (t) => {
  // Pinned as setup/setup.ts's text in google.test.mjs until 26 Nov 2026. Setup's whole answer, read as the back office
  // reads it, over an edge whose Google door says what this deployment can do and whose other doors say nothing.
  const { setupDtoFor } = await import(at("apps/dashboard/src/server/setup/setup.ts"));
  const supabase = () =>
    fakeDb({ tenants: [{ id: B, name: "Al", timezone: "America/Chicago", status: "active" }], tenant_config: [] });
  // What the deployment can do is held five minutes (connections/google.ts): each case is asked past the last one's.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-07T15:00:00Z") });
  const googleOf = async (ready) => {
    t.mock.timers.tick(6 * 60_000);
    const was = globalThis.fetch;
    globalThis.fetch = async (url) =>
      new URL(String(url)).pathname === "/api/admin/google"
        ? new Response(JSON.stringify({ ok: true, ready, profile: { client_id: "c", redirect_uri: "r" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify({ ok: false, error: "not_here" }), { status: 503 });
    try {
      const { google } = await setupDtoFor(supabase(), B, { kind: "staff" });
      return [google.ready, google.places, google.profile];
    } finally {
      globalThis.fetch = was;
    }
  };
  assert.deepEqual(await googleOf({ places: true, profile: false }), [true, true, false], "a listing to look up");
  assert.deepEqual(await googleOf({ places: false, profile: true }), [true, false, true], "a profile to connect");
  assert.deepEqual(await googleOf({ places: false, profile: false }), [false, false, false], "neither: not ready");
});

/** Bayside, its owner a member, against an edge whose Google door answers `answer(body)` and says the profile can connect. */
function world(answer = () => ({ ok: true })) {
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: B, role: "owner", tenants: { slug: "bayside" }, created_at: "2026-02-01" },
    ],
    tenant_config: [{ tenant_id: B, config: { brain: BRAIN } }],
    tenants: [{ id: B, name: "Al", timezone: "America/Chicago" }],
    decisions: [],
  };
  const asked = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(String(init.body));
    if (new URL(String(url)).pathname !== "/api/admin/google") throw new Error(`no door at ${url}`);
    if (body.op === "status")
      return json({
        ok: true,
        ready: { places: true, profile: true },
        profile: { client_id: "client-1", redirect_uri: REDIRECT },
      });
    asked.push(body);
    return json(answer(body));
  };
  const ctx = (params = {}) => ({ supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", params });
  return { tables, asked, fetch, ctx };
}
const REDIRECT = "https://app.chanlytics.com/api/v1/google/callback";
const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
/** `run` with the edge stand-in answering; the readiness Google's door gave is held five minutes, so a test starts past it. */
const clocked = new WeakSet();
async function over(w, t, run) {
  if (!clocked.has(t)) t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 60 * 60_000 });
  clocked.add(t);
  const was = globalThis.fetch;
  globalThis.fetch = w.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = was;
  }
}

test("the way to Google is signed for this workspace and this person, with the first run's way back where it asked, and goes as a redirect", async (t) => {
  const w = world();
  const res = await over(w, t, () =>
    connect.GET.run(new Request(`http://localhost/api/v1/google/connect?workspace=${B}&back=start`), w.ctx()),
  );
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get("location"));
  assert.equal(to.origin, "https://accounts.google.com");
  assert.deepEqual([to.searchParams.get("client_id"), to.searchParams.get("redirect_uri")], ["client-1", REDIRECT]);
  const proof = await verifyState("state-secret-for-this-file", to.searchParams.get("state"), Date.now());
  assert.ok(proof.ok, "a state only this deployment's key signs");
  assert.deepEqual([proof.state.t, proof.state.u, proof.state.b], [B, "u1", "start"]);
  assert.ok(proof.state.exp > Date.now() && typeof proof.state.n === "string", "for a while, once");
});

test("the way back hands the edge the code for the workspace the state named, and never the client's secret", async (t) => {
  const w = world(() => ({ ok: true }));
  const state = async () => {
    const start = await connect.GET.run(new Request(`http://localhost/api/v1/google/connect?workspace=${B}`), w.ctx());
    return new URL(start.headers.get("location")).searchParams.get("state");
  };
  const res = await over(w, t, async () =>
    callback.GET.run(
      new Request(`http://localhost/api/v1/google/callback?state=${await state()}&code=code-from-google`),
      w.ctx(),
    ),
  );
  assert.equal(res.status, 302);
  assert.deepEqual(w.asked, [{ op: "connect", tenant_id: B, user_id: "u1", code: "code-from-google" }]);
  assert.ok(!JSON.stringify(w.asked).includes("secret"), "the dashboard never holds the client's secret");
  assert.equal(new URL(res.headers.get("location")).searchParams.get("google"), "connected");
});

test("a reply that went through is a line on the ledger, the review's, with what was said and when Google took it; a disconnect is the edge's", async (t) => {
  const R1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
  const w = world((body) =>
    body.op === "reply"
      ? { ok: true, replied_at: "2026-09-07T15:01:00Z", reply_text: body.comment }
      : { ok: true, removed: true },
  );
  const out = await over(w, t, () =>
    reply.POST.run(
      new Request(`http://localhost/api/v1/google/reviews/${R1}/reply?workspace=${B}`, {
        method: "POST",
        body: JSON.stringify({ comment: "Thank you for coming in!" }),
      }),
      w.ctx({ id: R1 }),
    ),
  );
  assert.deepEqual(w.asked, [
    { op: "reply", tenant_id: B, user_id: "u1", id: R1, comment: "Thank you for coming in!" },
  ]);
  assert.deepEqual(
    w.tables.decisions.map((d) => [d.subject_type, d.subject_id, d.verb, d.payload]),
    [["review", R1, "reply_review", { comment: "Thank you for coming in!", replied_at: "2026-09-07T15:01:00Z" }]],
  );
  assert.equal(out.decision_id, w.tables.decisions[0].id);
  w.asked.length = 0;
  await over(w, t, () =>
    connection.DELETE.run(
      new Request(`http://localhost/api/v1/google/connection?workspace=${B}`, { method: "DELETE" }),
      w.ctx(),
    ),
  );
  assert.deepEqual(
    w.asked.map((a) => [a.op, a.tenant_id]),
    [["disconnect", B]],
  );
});

test("a draft is asked of the edge for the review, and is no decision: nothing on the ledger; Never is said in Autonomy's words", async (t) => {
  // Pinned as the draft route's text in google/review-reply.test.mjs until 26 Nov 2026.
  const R1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
  let edge = () => ({ ok: true, text: "Thank you, Rosa.", mode: "ask" });
  const w = world((body) => edge(body));
  const ask = () =>
    draft.POST.run(
      new Request(`http://localhost/api/v1/google/reviews/${R1}/draft?workspace=${B}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      w.ctx({ id: R1 }),
    );
  assert.deepEqual(await over(w, t, ask), { text: "Thank you, Rosa.", mode: "ask" });
  assert.deepEqual(
    w.asked.map((a) => [a.op, a.tenant_id, a.id]),
    [["draft", B, R1]],
  );
  assert.deepEqual(w.tables.decisions, [], "a draft is not a decision; sending is");
  edge = () => ({ ok: false, error: "policy_never" });
  await assert.rejects(over(w, t, ask), (e) => {
    assert.match(e.message, /^Review replies are set to Stays quiet on Autonomy\./);
    return true;
  });
});
