/**
 * An Instagram account connected through Meta (decision 0117, Instagram API with Unified Login): the edge's op table
 * (lib/instagram/meta-connect.ts runMetaOp) run over a database in memory, with Meta's answers as its Unified Login pages
 * document them.
 *
 * The way in: only where the workspace's content_preview is on; the code is traded for the business's own token with the
 * Meta app's id and secret; debug_token says what it may do, and a token without the account and its DMs keeps nothing;
 * the one account the business shared is read (several are refused with the list); one another workspace has connected,
 * and a second account for a workspace that has one, are refused before anything is written; its webhook is subscribed
 * for the fields its permissions allow; then the row (the account's one row, whichever login), its token in the Vault
 * and the row on are one write (00677). A working Instagram row it takes over is untouched when the Vault refuses the
 * new token, and otherwise has its old login's subscription removed. A disconnect lets the account go (decision 0143):
 * the row off and holding no account, its token deleted, Meta's subscription removed, and the account is then any
 * workspace's to connect; moving back gives the first workspace its own row again.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import { accountDoors } from "./_account-doors.mjs";

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
const { contentPreviewOf } = await import(at("packages/contracts/src/content/address.ts"));

const T = "abababab-3333-4000-8000-000000000001";
const OTHER = "abababab-3333-4000-8000-000000000002";
const U = "cdcdcdcd-3333-4000-8000-000000000001";
const auth = { ok: true, via: "token", workspace: T, user: U };
const theirAuth = { ok: true, via: "token", workspace: OTHER, user: U };
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
  // A Page the sign-in shared to post to, read by its id (pass 5), where a test names one.
  for (const [id, answer] of Object.entries(answers.pages ?? {}))
    if (u.startsWith(`https://graph.facebook.com/v27.0/${id}?`)) return json(...answer);
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
    tenants: [
      { id: T, name: "Harbor Nails" },
      { id: OTHER, name: "Harbor Spa" },
    ],
    tenant_config: [
      { tenant_id: T, config: { features: { content_preview: on } } },
      { tenant_id: OTHER, config: { features: { content_preview: true } } },
    ],
  };
  const vault = {};
  const db = fakeDb(tables, {}, accountDoors(tables, vault, { vaultFails: () => vaultFails }));
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

test("the switch is on only where the workspace's config says content_preview is true", () => {
  assert.equal(contentPreviewOf({ features: { content_preview: true } }), true);
  for (const off of [null, {}, { features: null }, { features: { content_preview: "true" } }])
    assert.equal(contentPreviewOf(off), false, JSON.stringify(off));
});

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

test("an account another workspace has connected is refused, with who holds it, before anything is written or subscribed", async () => {
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
  assert.equal(body.held_by, OTHER, "the dashboard is told which, and says it only to someone who is in it");
  assert.ok(!asked.slice(w.mark).some((c) => c.url.includes("/subscribed_apps")), "nothing was subscribed");
  // A connection Meta stopped accepting is still connected: only its own Disconnect lets the account go.
  w.tables.tenant_channels[0].config = { token_lapsed_at: "2026-11-21T00:00:00.000Z" };
  const [lapsed] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(lapsed, 409);
});

test("a working Instagram row taken over keeps flowing: untouched if the Vault refuses, its old subscription removed if not", async () => {
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
  assert.equal(b1.error, "channel_write_failed");
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

test("a disconnect lets the account go: the row off and holding nothing, its token deleted, Meta's subscription removed; another's row is not found", async () => {
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
    config: { login: "meta", username: "harbor.nails", scopes: ALL, token_checked_at: "2026-11-21T00:00:00.000Z" },
  });
  assert.deepEqual(await heard(await runMetaOp(auth, { op: "disconnect", tenant_id: T, channel_id: id })), [
    200,
    { ok: true },
  ]);
  const [row] = w.tables.tenant_channels;
  assert.deepEqual([row.status, row.external_id, row.credentials_ref], ["disabled", `let-go:${id}`, null]);
  assert.equal(row.config.account_id, w.ACCOUNT);
  assert.equal(row.config.username, "harbor.nails", "the row still says whose it was");
  assert.equal(row.config.disconnected_by, U);
  assert.equal(row.config.scopes, undefined, "what was true of a token it no longer keeps goes with it");
  assert.equal(w.vault[id], undefined, "no token is kept for an account that was disconnected");
  assert.deepEqual(w.tables.events.find((e) => e.kind === "channel.disconnected").data, {
    kind: "instagram",
    login: "meta",
    account_id: w.ACCOUNT,
    username: "harbor.nails",
    by: U,
  });
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

test("a disconnected account connects in another workspace, and moving back gives the first workspace its own row", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  const [, first] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(first.ok, true);
  await runMetaOp(auth, { op: "disconnect", tenant_id: T, channel_id: first.channel_id });
  // The move that was refused for ever (21 Nov 2026, twice, on a silent page): the same account, another workspace.
  const [status, moved] = await heard(await runMetaOp(theirAuth, { op: "connect", tenant_id: OTHER, code: "AQB" }));
  assert.equal(status, 200, JSON.stringify(moved));
  assert.notEqual(moved.channel_id, first.channel_id);
  const theirs = w.tables.tenant_channels.find((r) => r.id === moved.channel_id);
  assert.deepEqual([theirs.tenant_id, theirs.status, theirs.external_id], [OTHER, "active", w.ACCOUNT]);
  const mine = w.tables.tenant_channels.find((r) => r.id === first.channel_id);
  assert.deepEqual([mine.tenant_id, mine.status], [T, "disabled"], "the first workspace's row stays its own");
  assert.equal(w.vault[first.channel_id], undefined);
  assert.equal(w.vault[moved.channel_id].access_token, "bisu-token");
  // The first workspace is the one refused now, until the second disconnects; then it gets its own row again.
  const [held, body] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.deepEqual([held, body.error, body.held_by], [409, "instagram_account_taken", OTHER]);
  await runMetaOp(theirAuth, { op: "disconnect", tenant_id: OTHER, channel_id: moved.channel_id });
  const [, back] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(back.channel_id, first.channel_id, "its threads, people and Activity name this row");
  assert.equal(w.tables.tenant_channels.filter((r) => r.tenant_id === T).length, 1);
  const again = w.tables.tenant_channels.find((r) => r.id === first.channel_id);
  assert.deepEqual([again.status, again.external_id, again.config.account_id], ["active", w.ACCOUNT, undefined]);
});

test("a second, different account for a workspace that has one is refused with the one it has, and nothing is subscribed", async () => {
  Object.assign(process.env, APP);
  resetBreakers();
  const w = world();
  w.tables.tenant_channels.push({
    id: "efefefef-3333-4000-8000-000000000005",
    tenant_id: T,
    kind: "instagram",
    external_id: "17841500000099999",
    status: "active",
    config: { login: "meta", username: "harbor.spa" },
  });
  const [status, body] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
  assert.equal(status, 409);
  assert.equal(body.error, "instagram_another_connected");
  assert.equal(body.username, "harbor.spa");
  assert.equal(w.tables.tenant_channels.length, 1);
  assert.ok(!asked.slice(w.mark).some((c) => c.url.includes("/subscribed_apps")), "nothing was subscribed");
});

test("a sign-in that shared a Page to post to keeps it on the row: the one linked to the account, else the only one", async () => {
  Object.assign(process.env, APP);
  const PAGE = "100200300400500";
  const OTHER_PAGE = "100200300400599";
  const connectWith = async (pages, answersByPage) => {
    resetBreakers();
    const w = world({ scopes: [...ALL, "pages_manage_posts", "pages_read_engagement", "pages_show_list"] });
    answers.debug[1].data.granular_scopes.push({ scope: "pages_manage_posts", target_ids: pages });
    answers.pages = answersByPage(w.ACCOUNT);
    const [status] = await heard(await runMetaOp(auth, { op: "connect", tenant_id: T, code: "AQB" }));
    assert.equal(status, 200, "Instagram connects whatever the Page");
    return w.tables.tenant_channels.find((r) => r.external_id === w.ACCOUNT).config.page ?? null;
  };
  // Two Pages: the one linked to the account is kept.
  const linked = await connectWith([OTHER_PAGE, PAGE], (account) => ({
    [OTHER_PAGE]: [200, { id: OTHER_PAGE, name: "Harbor Spa" }],
    [PAGE]: [200, { id: PAGE, name: "Harbor Nails", instagram_business_account: { id: account } }],
  }));
  assert.deepEqual(linked, { id: PAGE, name: "Harbor Nails" });
  // One Page, linked to nothing: it is the one shared, and kept.
  assert.deepEqual(await connectWith([PAGE], () => ({ [PAGE]: [200, { id: PAGE, name: "Harbor Nails" }] })), {
    id: PAGE,
    name: "Harbor Nails",
  });
  // Two, neither linked: none is guessed. A Page that cannot be read: none is kept.
  assert.equal(
    await connectWith([PAGE, OTHER_PAGE], () => ({
      [PAGE]: [200, { id: PAGE, name: "Harbor Nails" }],
      [OTHER_PAGE]: [200, { id: OTHER_PAGE, name: "Harbor Spa" }],
    })),
    null,
  );
  assert.equal(await connectWith([PAGE], () => ({ [PAGE]: [403, { error: { message: "(#200)", code: 200 } }] })), null);
});
