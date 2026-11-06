/**
 * A post on the business's Google profile, at the edge's door (apps/edge/lib/google/local-posts.ts, decision 0099, step 3): POST
 * /api/admin/google over a database in memory, Vault's door over a map, and a captured wire where Google would be. It goes as the
 * owner, and the ledger keeps Google's name for it, which is how it comes down; it never goes by itself, and a name that isn't this
 * connection's takes nothing down.
 *
 * ORDER OF SETUP MATTERS, as in google-door.test.mjs: lib/google/places.ts binds fetch at module scope, so the wire goes in first.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";
process.env.GOOGLE_OAUTH_AUDIENCE = "testing";
for (const k of ["ANTHROPIC_API_KEY", "DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
    };
    wire.calls.push(req);
    if (!wire.answer) throw new Error(`nothing on the wire answers ${req.method} ${req.url}`);
    const a = await wire.answer(req);
    return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? {}), {
      status: a.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  after(() => {
    globalThis.fetch = realFetch;
  });
}
const wired = (answer) => {
  wire.calls = [];
  wire.answer = answer;
  return wire;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const door = await import(at("apps/edge/api/admin/google.ts"));
after(() => setPg(null));

const AUD = "/api/admin/google";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const FILE = "ffffffff-0000-4000-8000-000000000001";
const HOUR = 3_600_000;
const POSTS_URL = "https://mybusiness.googleapis.com/v4/accounts/111/locations/222/localPosts";
const NAME = "accounts/111/locations/222/localPosts/999";
const PHOTO = "https://storage.example/files/google.jpg?token=t";

const knock = (body) => {
  const raw = JSON.stringify(body);
  const token = signEdgeToken(process.env.EDGE_CALL_SECRET, AUD, { workspace: A, user: U, body: raw });
  return door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { "x-edge-token": token, "content-type": "application/json" },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];

const connRow = (over = {}) => ({
  tenant_id: A,
  google_email: "owner@example.com",
  google_sub: "sub-1",
  account_name: "accounts/111",
  account_title: "Harbor",
  location_name: "locations/222",
  location_title: "Harbor Moving",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
  connected_by: U,
  connected_at: "2026-11-01T00:00:00Z",
  last_synced_at: "2026-11-05T00:00:00Z",
  sync_error: null,
  reviews_complete: false,
  ...over,
});

function use({ connections = [connRow()], creds = true } = {}) {
  const tables = {
    tenants: [{ id: A, name: "Harbor Moving", slug: "harbor-moving", timezone: "UTC", status: "active" }],
    google_listings: [],
    google_connections: connections,
    google_reviews: [],
    notifications: [],
    events: [],
    policies: [],
    tenant_config: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      get_google_credentials: () =>
        creds
          ? {
              refresh_token: "rt-1",
              access_token: "at-good",
              expires_at: Date.now() + HOUR,
              scope: "openid email",
            }
          : null,
    },
  );
  setPg(db);
  return tables;
}

const asked = { file_id: FILE, summary: "Open late this Saturday.", photo_url: PHOTO, language: "es", call: true };

test("a post goes up as the owner, with what the person wrote and Google's own Call button, and the ledger keeps its name", async () => {
  const tables = use();
  const net = wired(() => ({
    body: { name: NAME, state: "PROCESSING", searchUrl: "https://local.google.com/place?use=posts" },
  }));
  assert.deepEqual(await answer(await knock({ op: "post", ...asked })), [
    200,
    { ok: true, name: NAME, search_url: "https://local.google.com/place?use=posts", state: "PROCESSING" },
  ]);
  assert.equal(net.calls.length, 1);
  const [call] = net.calls;
  assert.deepEqual([call.method, call.url], ["POST", POSTS_URL]);
  assert.equal(call.headers.Authorization, "Bearer at-good", "the token Vault holds");
  assert.deepEqual(JSON.parse(call.body), {
    languageCode: "es",
    summary: "Open late this Saturday.",
    topicType: "STANDARD",
    media: [{ mediaFormat: "PHOTO", sourceUrl: PHOTO }],
    callToAction: { actionType: "CALL" },
  });
  const [said] = tables.events.filter((e) => e.kind === "file.posted");
  assert.deepEqual(said.data, {
    file_id: FILE,
    post_name: NAME,
    search_url: "https://local.google.com/place?use=posts",
    by: U,
  });
});

test("a post with no number on it asks for no Call button, and one Google has not placed yet has no address", async () => {
  use();
  const net = wired(() => ({ body: { name: NAME } }));
  const [status, body] = await answer(await knock({ op: "post", ...asked, call: false, language: "en" }));
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, name: NAME, search_url: null, state: null });
  const sent = JSON.parse(net.calls[0].body);
  assert.equal(sent.callToAction, undefined);
  assert.equal(sent.languageCode, "en");
});

test("what is wrong with the asking is said, and nothing reaches Google", async () => {
  use();
  const net = wired(() => {
    throw new Error("nothing may reach Google");
  });
  const cases = [
    [{ ...asked, file_id: "nope" }, "file_id is required"],
    [{ ...asked, summary: "   " }, "summary is required, within Google's limit"],
    [{ ...asked, summary: "x".repeat(1501) }, "summary is required, within Google's limit"],
    [{ ...asked, photo_url: "http://storage.example/x.jpg" }, "photo_url must be an https address"],
    [{ ...asked, photo_url: undefined }, "photo_url must be an https address"],
  ];
  for (const [body, detail] of cases)
    assert.deepEqual(await answer(await knock({ op: "post", ...body })), [
      400,
      { ok: false, error: "bad_request", detail },
    ]);
  assert.equal(net.calls.length, 0);
});

test("with no connection, or no location chosen, or no token, it says which, and nothing is on the ledger", async () => {
  for (const [world, code, error] of [
    [{ connections: [] }, 409, "not_connected"],
    [{ connections: [connRow({ location_name: null })] }, 409, "not_connected"],
  ]) {
    const tables = use(world);
    const net = wired(() => {
      throw new Error("nothing may reach Google");
    });
    const [status, body] = await answer(await knock({ op: "post", ...asked }));
    assert.deepEqual([status, body.error], [code, error]);
    assert.equal(net.calls.length, 0);
    assert.deepEqual(tables.events, []);
  }
  const tables = use({ creds: false });
  wired(() => ({ status: 400, body: { error: "invalid_grant" } }));
  const [status, body] = await answer(await knock({ op: "post", ...asked }));
  assert.deepEqual([status, body.error], [502, "no_token"]);
  assert.deepEqual(tables.events, []);
});

test("what Google refuses comes back in its words, and is on no ledger", async () => {
  const tables = use();
  wired(() => ({ status: 400, body: { error: { message: "Photo could not be fetched" } } }));
  const [status, body] = await answer(await knock({ op: "post", ...asked }));
  assert.deepEqual([status, body.error], [502, "google_refused"]);
  assert.match(body.detail, /Photo could not be fetched/);
  assert.deepEqual(tables.events, []);
});

test("an answer from Google with no name is no post: nothing could ever take it down", async () => {
  const tables = use();
  wired(() => ({ body: {} }));
  const [status, body] = await answer(await knock({ op: "post", ...asked }));
  assert.deepEqual([status, body.error], [502, "google_refused"]);
  assert.deepEqual(tables.events, []);
});

test("a post comes down by its name, and the ledger says so", async () => {
  const tables = use();
  const net = wired(() => ({ body: {} }));
  assert.deepEqual(await answer(await knock({ op: "unpost", file_id: FILE, post_name: NAME })), [200, { ok: true }]);
  assert.deepEqual(
    net.calls.map((c) => [c.method, c.url]),
    [["DELETE", `https://mybusiness.googleapis.com/v4/${NAME}`]],
  );
  const [said] = tables.events.filter((e) => e.kind === "file.unposted");
  assert.deepEqual(said.data, { file_id: FILE, post_name: NAME, by: U });
});

test("one Google has already let go is what was asked for", async () => {
  const tables = use();
  wired(() => ({ status: 404, body: { error: { message: "gone" } } }));
  assert.deepEqual(await answer(await knock({ op: "unpost", file_id: FILE, post_name: NAME })), [200, { ok: true }]);
  assert.equal(tables.events.filter((e) => e.kind === "file.unposted").length, 1);
});

test("a name that isn't this connection's takes nothing down, whatever a caller sends", async () => {
  const tables = use();
  const net = wired(() => {
    throw new Error("nothing may reach Google");
  });
  for (const other of ["accounts/999/locations/222/localPosts/1", "accounts/111/locations/333/localPosts/1"]) {
    const [status, body] = await answer(await knock({ op: "unpost", file_id: FILE, post_name: other }));
    assert.deepEqual([status, body.error], [404, "not_found"], other);
  }
  assert.deepEqual(await answer(await knock({ op: "unpost", file_id: FILE, post_name: "accounts/111" })), [
    400,
    { ok: false, error: "bad_request", detail: "post_name is required" },
  ]);
  assert.equal(net.calls.length, 0);
  assert.deepEqual(tables.events, []);
});

test("what Google refuses as it comes down leaves it on the record as up", async () => {
  const tables = use();
  wired(() => ({ status: 403, body: { error: { message: "No" } } }));
  const [status, body] = await answer(await knock({ op: "unpost", file_id: FILE, post_name: NAME }));
  assert.deepEqual([status, body.error], [502, "google_refused"]);
  assert.deepEqual(tables.events, []);
});
