/**
 * An Instagram account connected through Meta (decision 0117, Instagram API with Unified Login): the edge's op table
 * (lib/instagram/meta-connect.ts runMetaOp) run over a database in memory, with Meta's answers as its Unified Login pages
 * document them.
 *
 * The way in: only where the workspace's content_preview is on; the code is traded for the business's own token with the
 * Meta app's id and secret; debug_token says what it may do, and a token without the account and its DMs keeps nothing;
 * the one account the business shared is read (several are refused with the list); one another workspace holds is refused
 * before anything is written; its webhook is subscribed for the fields its permissions allow; the row (the account's one
 * row, whichever login) is written, the token kept, and only then the row turned on. A working Instagram row it takes over
 * is put back as it was when the Vault refuses the new token, and otherwise has its old login's subscription removed. A
 * disconnect turns the row off and removes Meta's subscription.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";

for (const k of ["META_APP_ID", "META_APP_SECRET", "META_LOGIN_CONFIG_ID", "META_REDIRECT_URI", "SUPABASE_URL"])
  delete process.env[k];
const APP = {
  META_APP_ID: "990000000000077",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_LOGIN_CONFIG_ID: "880000000000001",
  META_REDIRECT_URI: "https://app.example.com/api/v1/channels/meta/callback",
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { runMetaOp } = await import(at("apps/edge/lib/instagram/meta-connect.ts"));

const T = "abababab-3333-4000-8000-000000000001";
const OTHER = "abababab-3333-4000-8000-000000000002";
const U = "cdcdcdcd-3333-4000-8000-000000000001";
const auth = { ok: true, via: "token", workspace: T, user: U };
const ALL = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
];

/** Meta, as the way in meets it: each endpoint answers as `answers` says, and what it was asked is kept. */
let answers = {};
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = init?.method ?? "GET";
  asked.push({ url: u, method });
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const pick = (k) => answers[k] ?? [200, {}];
  if (u.startsWith("https://graph.facebook.com/v27.0/oauth/access_token")) return json(...pick("code"));
  if (u.startsWith("https://graph.facebook.com/v27.0/debug_token")) return json(...pick("debug"));
  if (u.startsWith("https://graph.facebook.com/v27.0/me/assigned_instagram_accounts")) return json(...pick("accounts"));
  if (u.startsWith("https://graph.facebook.com/v27.0/me?")) return json(...pick("business"));
  if (u.startsWith("https://graph.instagram.com/") && u.includes("/subscribed_apps")) return json(...pick("old"));
  if (u.includes("/subscribed_apps")) return json(...pick(method === "DELETE" ? "unsubscribe" : "subscribe"));
  if (u.startsWith("https://graph.facebook.com/v27.0/")) return json(...pick("account"));
  return json(200, {});
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

let seq = 0;
/** A workspace with its switch as `on` says, none of its accounts yet, and the Vault the connect writes to. */
function world({ on = true, vaultFails = false, scopes = ALL } = {}) {
  const i = ++seq;
  const ACCOUNT = `1784150000${String(i).padStart(7, "0")}`;
  const tables = {
    tenant_channels: [],
    events: [],
    tenants: [{ id: T, name: "Harbor Nails" }],
    tenant_config: [{ tenant_id: T, config: { features: { content_preview: on } } }],
  };
  const vault = {};
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
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
    code: [200, { access_token: "bisu-token", token_type: "bearer" }],
    debug: [
      200,
      {
        data: {
          app_id: APP.META_APP_ID,
          type: "SYSTEM_USER",
          is_valid: true,
          expires_at: 0,
          scopes,
          granular_scopes: [{ scope: "instagram_basic", target_ids: [ACCOUNT] }],
        },
      },
    ],
    business: [200, { client_business_id: "583355900000001", id: "61550000000001" }],
    accounts: [200, { data: [{ id: ACCOUNT, username: "harbor.nails" }] }],
    account: [200, { id: ACCOUNT, username: "harbor.nails", name: "Harbor Nails" }],
    subscribe: [200, { success: true }],
    unsubscribe: [200, { success: true }],
    old: [200, { success: true }],
  };
  return { ACCOUNT, tables, vault, mark: asked.length };
}
const heard = async (res) => [res.status, await res.json()];
const proofOf = (token) => createHmac("sha256", APP.META_APP_SECRET).update(token).digest("hex");

test("status says whether the app's login is held here and whether this workspace's switch is on", async () => {
  world({ on: false });
  assert.deepEqual(await heard(await runMetaOp(auth, { op: "status", tenant_id: T })), [
    200,
    { ok: true, ready: false, on: false },
  ]);
  Object.assign(process.env, APP);
  assert.deepEqual(await heard(await runMetaOp(auth, { op: "status", tenant_id: T })), [
    200,
    {
      ok: true,
      ready: true,
      on: false,
      app: { client_id: APP.META_APP_ID, config_id: APP.META_LOGIN_CONFIG_ID, redirect_uri: APP.META_REDIRECT_URI },
    },
  ]);
  world({ on: true });
  const [, on] = await heard(await runMetaOp(auth, { op: "status", tenant_id: T }));
  assert.equal(on.on, true);
});

test("a workspace whose switch is off is refused before Meta is asked anything", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world({ on: false });
  const [status, body] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(status, 409);
  assert.equal(body.error, "meta_off");
  assert.equal(asked.length, w.mark, "nothing went to Meta");
  assert.equal(w.tables.tenant_channels.length, 0);
});

test("a code becomes the business's own token, its account the one row: subscribed, kept, then turned on", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  const [status, body] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB-code#_" }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.account_id, w.ACCOUNT);
  const [row] = w.tables.tenant_channels;
  assert.equal(row.kind, "instagram");
  assert.equal(row.external_id, w.ACCOUNT);
  assert.equal(row.status, "active");
  assert.equal(row.config.login, "meta");
  assert.equal(row.config.username, "harbor.nails");
  assert.equal(row.config.business_id, "583355900000001");
  assert.deepEqual(row.config.scopes, ALL);
  const kept = w.vault[row.id];
  assert.equal(kept.login, "meta");
  assert.equal(kept.access_token, "bisu-token");
  assert.equal(kept.account_id, w.ACCOUNT);
  assert.equal(kept.expires_at, null, "a token that does not expire has no clock");
  const calls = asked.slice(w.mark);
  // The code went with the Meta app's id and secret and the exact return address, the code's "#_" taken off.
  const code = new URL(calls.find((c) => c.url.includes("/oauth/access_token")).url).searchParams;
  assert.equal(code.get("client_id"), APP.META_APP_ID);
  assert.equal(code.get("client_secret"), APP.META_APP_SECRET);
  assert.equal(code.get("redirect_uri"), APP.META_REDIRECT_URI);
  assert.equal(code.get("code"), "AQB-code");
  // debug_token is asked with the app's own token; every call with the business's token carries its proof.
  const debug = new URL(calls.find((c) => c.url.includes("/debug_token")).url).searchParams;
  assert.equal(debug.get("access_token"), `${APP.META_APP_ID}|${APP.META_APP_SECRET}`);
  for (const c of calls.filter((c) => new URL(c.url).searchParams.get("access_token") === "bisu-token"))
    assert.equal(new URL(c.url).searchParams.get("appsecret_proof"), proofOf("bisu-token"), c.url);
  const sub = calls.find((c) => c.url.includes("/subscribed_apps"));
  assert.equal(sub.method, "POST");
  assert.match(sub.url, new RegExp(`^https://graph\\.facebook\\.com/v27\\.0/${w.ACCOUNT}/subscribed_apps\\?`));
  assert.equal(
    new URL(sub.url).searchParams.get("subscribed_fields"),
    "messages,message_reactions,messaging_postbacks,messaging_referral,messaging_seen,comments,live_comments,mentions,story_insights",
  );
  const event = w.tables.events.find((e) => e.kind === "channel.connected");
  assert.equal(event.data.login, "meta");
});

test("a token with only some permissions subscribes only the fields they allow", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world({ scopes: ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"] });
  const [status] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(status, 200);
  const sub = asked.slice(w.mark).find((c) => c.url.includes("/subscribed_apps"));
  assert.equal(
    new URL(sub.url).searchParams.get("subscribed_fields"),
    "messages,message_reactions,messaging_postbacks,messaging_referral,messaging_seen",
  );
});

test("a token without the account's messages keeps nothing; several accounts are refused with the list", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world({ scopes: ["instagram_basic", "instagram_content_publish"] });
  const [s1, b1] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(s1, 403);
  assert.equal(b1.error, "instagram_messages_not_granted");
  assert.equal(w.tables.tenant_channels.length, 0);
  const w2 = world();
  answers.accounts = [
    200,
    {
      data: [
        { id: w2.ACCOUNT, username: "harbor.nails" },
        { id: "17841500000099999", username: "harbor.spa" },
      ],
    },
  ];
  const [s2, b2] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(s2, 409);
  assert.equal(b2.error, "instagram_accounts_several");
  assert.deepEqual(
    b2.accounts.map((a) => a.username),
    ["harbor.nails", "harbor.spa"],
  );
  assert.equal(w2.tables.tenant_channels.length, 0);
  assert.ok(!asked.slice(w2.mark).some((c) => c.url.includes("/subscribed_apps")), "nothing was subscribed");
});

test("an account another workspace holds is refused before anything is written or subscribed", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  w.tables.tenant_channels.push({
    id: "efefefef-3333-4000-8000-000000000001",
    tenant_id: OTHER,
    kind: "instagram",
    external_id: w.ACCOUNT,
    status: "active",
    config: {},
  });
  const [status, body] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(status, 409);
  assert.equal(body.error, "instagram_account_taken");
  assert.ok(!asked.slice(w.mark).some((c) => c.url.includes("/subscribed_apps")), "nothing was subscribed");
});

test("a working Instagram row taken over keeps flowing: put back as it was if the Vault refuses, its old subscription removed if not", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const id = "efefefef-3333-4000-8000-000000000002";
  const before = { username: "harbor.nails", connected_by: U, token_refreshed_at: "2026-11-01T00:00:00.000Z" };
  const failing = world({ vaultFails: true });
  failing.tables.tenant_channels.push({
    id,
    tenant_id: T,
    kind: "instagram",
    external_id: failing.ACCOUNT,
    status: "active",
    credentials_ref: "vault-old",
    config: before,
  });
  const [s1, b1] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(s1, 500);
  assert.equal(b1.error, "credentials_failed");
  const [kept] = failing.tables.tenant_channels;
  assert.equal(kept.status, "active", "the account still answers its DMs on its old token");
  assert.deepEqual(kept.config, before);

  resetBreakers();
  const w = world();
  w.vault[id] = { access_token: "old-ig-token", account_id: w.ACCOUNT, refreshed_at: "2026-11-01T00:00:00.000Z" };
  w.tables.tenant_channels.push({
    id,
    tenant_id: T,
    kind: "instagram",
    external_id: w.ACCOUNT,
    status: "active",
    credentials_ref: "vault-old",
    config: before,
  });
  const [s2] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(s2, 200);
  assert.equal(w.tables.tenant_channels.length, 1, "the one row, taken over");
  assert.equal(w.tables.tenant_channels[0].config.login, "meta");
  assert.equal(w.vault[id].login, "meta");
  const calls = asked.slice(w.mark);
  const old = calls.find((c) => c.url.startsWith("https://graph.instagram.com/"));
  assert.equal(old.method, "DELETE");
  assert.match(old.url, new RegExp(`/${w.ACCOUNT}/subscribed_apps\\?access_token=old-ig-token`));
  const newSub = calls.findIndex((c) => c.url.includes("graph.facebook.com") && c.url.includes("/subscribed_apps"));
  assert.ok(newSub >= 0 && newSub < calls.indexOf(old), "Meta's subscription stands before the old one goes");
});

test("a disconnect turns the row off and removes Meta's subscription; another workspace's row is not found", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  const id = "efefefef-3333-4000-8000-000000000003";
  w.vault[id] = { access_token: "bisu-token", account_id: w.ACCOUNT, login: "meta" };
  w.tables.tenant_channels.push({
    id,
    tenant_id: T,
    kind: "instagram",
    external_id: w.ACCOUNT,
    status: "active",
    credentials_ref: "vault-x",
    config: { login: "meta" },
  });
  assert.deepEqual(await heard(await runMetaOp(auth, { op: "disconnect", tenant_id: T, channel_id: id })), [
    200,
    { ok: true },
  ]);
  assert.equal(w.tables.tenant_channels[0].status, "disabled");
  const del = asked.slice(w.mark).find((c) => c.method === "DELETE");
  assert.match(del.url, new RegExp(`^https://graph\\.facebook\\.com/v27\\.0/${w.ACCOUNT}/subscribed_apps\\?`));
  assert.equal(new URL(del.url).searchParams.get("appsecret_proof"), proofOf("bisu-token"));
  const theirs = "efefefef-3333-4000-8000-000000000004";
  w.tables.tenant_channels.push({
    id: theirs,
    tenant_id: OTHER,
    kind: "instagram",
    external_id: "1",
    status: "active",
  });
  const [s] = await heard(await runMetaOp(auth, { op: "disconnect", tenant_id: T, channel_id: theirs }));
  assert.equal(s, 404);
});
