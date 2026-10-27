/**
 * An Instagram account connected to its workspace, and disconnected (decision 0001, step 8): the edge's op table
 * (lib/instagram/connect.ts instagramOp) run over a database in memory, with Instagram's answers as Meta documents them.
 *
 * The way in: the code is traded for a short token, then a 60-day one; the account it speaks for is read (`/me`'s
 * user_id: the id its webhooks name); an account another workspace holds is refused before anything is written or
 * subscribed; its DMs are subscribed to this app; the row is written disabled, the token put in the Vault, and only then
 * is the row turned on. Every refusal is a code with Meta's words beside it, and a token the Vault would not keep leaves
 * the row disabled.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

for (const k of ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_REDIRECT_URI", "SUPABASE_URL"])
  delete process.env[k];
const APP = {
  INSTAGRAM_APP_ID: "990000000000001",
  INSTAGRAM_APP_SECRET: "app-secret-for-this-file",
  INSTAGRAM_REDIRECT_URI: "https://app.example.com/api/v1/channels/instagram/callback",
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { instagramOp } = await import(at("apps/edge/lib/instagram/connect.ts"));

const T = "abababab-1111-4000-8000-000000000001";
const OTHER = "abababab-1111-4000-8000-000000000002";
const U = "cdcdcdcd-1111-4000-8000-000000000001";
const auth = { ok: true, via: "token", workspace: T, user: U };

/** Instagram, as the way in meets it: each endpoint answers as `answers` says, and what it was asked is kept. */
let answers = {};
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  asked.push({ url: u, init });
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const pick = (k) => answers[k] ?? [200, {}];
  if (u.startsWith("https://api.instagram.com/oauth/access_token")) return json(...pick("code"));
  if (u.startsWith("https://graph.instagram.com/access_token")) return json(...pick("long"));
  if (u.includes("/me?")) return json(...pick("me"));
  if (u.includes("/subscribed_apps")) return json(...pick("subscribe"));
  return json(200, {});
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

let seq = 0;
/** A world with one workspace and none of its accounts yet, and the Vault the connect writes to. */
function world({ vaultFails = false } = {}) {
  const i = ++seq;
  const ACCOUNT = `1784140000${String(i).padStart(7, "0")}`;
  const tables = { tenant_channels: [], events: [] };
  const vault = {};
  const db = fakeDb(
    tables,
    {},
    {
      put_channel_credentials: ({ p_channel_id, p_secret }) => {
        if (vaultFails) throw Object.assign(new Error("vault is read-only"), { code: "XX000" });
        vault[p_channel_id] = p_secret;
        const row = tables.tenant_channels.find((r) => r.id === p_channel_id);
        if (row) row.credentials_ref = `vault-${p_channel_id}`;
        return null;
      },
    },
  );
  setPg(db);
  answers = {
    code: [
      200,
      {
        data: [
          {
            access_token: "short-token",
            user_id: "1",
            permissions: "instagram_business_basic,instagram_business_manage_messages",
          },
        ],
      },
    ],
    long: [200, { access_token: "long-token", token_type: "bearer", expires_in: 5184000 }],
    me: [
      200,
      { user_id: ACCOUNT, username: "harbor.nails", name: "Harbor Nails", account_type: "BUSINESS", id: "app-scoped" },
    ],
    subscribe: [200, { success: true }],
  };
  return { ACCOUNT, tables, vault, mark: asked.length };
}
const heard = async (res) => [res.status, await res.json()];

test("without the app's id, secret and return address, nothing can be connected, and status says so", async () => {
  world();
  assert.deepEqual(await heard(await instagramOp(auth, { op: "status" })), [200, { ok: true, ready: false }]);
  assert.deepEqual(await heard(await instagramOp(auth, { op: "connect", code: "AQB" })), [
    503,
    { ok: false, error: "no_app_credentials" },
  ]);
  Object.assign(process.env, APP);
  assert.deepEqual(await heard(await instagramOp(auth, { op: "status" })), [
    200,
    { ok: true, ready: true, app: { client_id: APP.INSTAGRAM_APP_ID, redirect_uri: APP.INSTAGRAM_REDIRECT_URI } },
  ]);
});

test("a code becomes the business's 60-day token, its account a channel: subscribed, kept in the Vault, then turned on", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  const [status, body] = await heard(await instagramOp(auth, { op: "connect", code: "AQB-code#_" }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.account_id, w.ACCOUNT);
  assert.equal(body.username, "harbor.nails");
  const [row] = w.tables.tenant_channels;
  assert.equal(row.id, body.channel_id);
  assert.equal(row.tenant_id, T);
  assert.equal(row.kind, "instagram");
  assert.equal(row.external_id, w.ACCOUNT);
  assert.equal(row.status, "active");
  assert.equal(row.config.username, "harbor.nails");
  assert.equal(row.config.connected_by, U);
  const kept = w.vault[row.id];
  assert.equal(kept.access_token, "long-token");
  assert.equal(kept.account_id, w.ACCOUNT);
  assert.ok(Date.parse(kept.expires_at) - Date.parse(kept.refreshed_at) >= 59 * 24 * 3600 * 1000, "sixty days ahead");
  // The code went by form with the app's secret and the exact return address; the short token was traded for a long one.
  const calls = asked.slice(w.mark);
  const code = calls.find((c) => c.url === "https://api.instagram.com/oauth/access_token");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(code.init.body)), {
    client_id: APP.INSTAGRAM_APP_ID,
    client_secret: APP.INSTAGRAM_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: APP.INSTAGRAM_REDIRECT_URI,
    code: "AQB-code",
  });
  assert.match(calls.find((c) => c.url.includes("ig_exchange_token")).url, /access_token=short-token/);
  assert.match(
    calls.find((c) => c.url.includes("/subscribed_apps")).url,
    new RegExp(`/${w.ACCOUNT}/subscribed_apps\\?subscribed_fields=messages`),
  );
  const kinds = w.tables.events.map((e) => e.kind);
  assert.ok(kinds.includes("channel.connected"));
  assert.deepEqual(w.tables.events.find((e) => e.kind === "channel.connected").data.kind, "instagram");
});

test("an account another workspace holds is refused before anything is written or subscribed", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  w.tables.tenant_channels.push({
    id: "efefefef-1111-4000-8000-000000000001",
    tenant_id: OTHER,
    kind: "instagram",
    external_id: w.ACCOUNT,
    status: "active",
    config: {},
  });
  assert.deepEqual(await heard(await instagramOp(auth, { op: "connect", code: "AQB" })), [
    409,
    { ok: false, error: "instagram_account_taken" },
  ]);
  assert.equal(w.tables.tenant_channels.length, 1);
  assert.equal(w.tables.tenant_channels[0].tenant_id, OTHER);
  assert.ok(!asked.slice(w.mark).some((c) => c.url.includes("/subscribed_apps")), "nothing was subscribed");
});

test("Meta's refusals are codes with Meta's words, and a business that withheld its messages is told so", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  answers.code = [400, { error_type: "OAuthException", code: 400, error_message: "Invalid authorization code" }];
  assert.deepEqual(await heard(await instagramOp(auth, { op: "connect", code: "AQB" })), [
    502,
    { ok: false, error: "exchange_failed", detail: "Invalid authorization code" },
  ]);
  world();
  answers.code = [200, { data: [{ access_token: "short", user_id: "1", permissions: "instagram_business_basic" }] }];
  const [s, b] = await heard(await instagramOp(auth, { op: "connect", code: "AQB" }));
  assert.equal(s, 403);
  assert.equal(b.error, "instagram_messages_not_granted");
  assert.equal(w.tables.tenant_channels.length, 0);
  const unsubscribed = world();
  answers.subscribe = [200, { success: false }];
  const [s2, b2] = await heard(await instagramOp(auth, { op: "connect", code: "AQB" }));
  assert.equal(s2, 502);
  assert.equal(b2.error, "subscribe_failed");
  assert.equal(unsubscribed.tables.tenant_channels.length, 0, "no row for an account whose DMs would never arrive");
});

test("a token the Vault would not keep leaves the row disabled, so it never routes on nothing", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world({ vaultFails: true });
  assert.deepEqual(await heard(await instagramOp(auth, { op: "connect", code: "AQB" })), [
    500,
    { ok: false, error: "credentials_failed" },
  ]);
  assert.equal(w.tables.tenant_channels.length, 1);
  assert.equal(w.tables.tenant_channels[0].status, "disabled");
});

test("a disconnect turns this workspace's row off, and finds no row of another's", async () => {
  Object.assign(process.env, APP);
  const w = world();
  const id = "efefefef-1111-4000-8000-000000000002";
  w.tables.tenant_channels.push({
    id,
    tenant_id: T,
    kind: "instagram",
    external_id: w.ACCOUNT,
    status: "active",
    config: {},
  });
  assert.deepEqual(await heard(await instagramOp(auth, { op: "disconnect", channel_id: id })), [200, { ok: true }]);
  assert.equal(w.tables.tenant_channels[0].status, "disabled");
  const theirs = "efefefef-1111-4000-8000-000000000003";
  w.tables.tenant_channels.push({
    id: theirs,
    tenant_id: OTHER,
    kind: "instagram",
    external_id: "1",
    status: "active",
    config: {},
  });
  assert.deepEqual(await heard(await instagramOp(auth, { op: "disconnect", channel_id: theirs })), [
    404,
    { ok: false, error: "not_found" },
  ]);
  assert.equal(w.tables.tenant_channels[1].status, "active");
});
