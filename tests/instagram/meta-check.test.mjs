/**
 * The daily check of an account connected through Meta (decision 0117; lib/instagram/token-sweep.ts checkMeta):
 * the business's own token does not lapse on a clock, so it is asked about, never refreshed. One Meta still takes keeps
 * what it may do on the row (`scopes`, from which Connections draws its five lines), and one whose permission was taken
 * back turns that line Off; one Meta no longer takes is marked lapsed and its workspace told once, as a lapsed Instagram
 * token is; a check with no answer changes nothing; and an account on Instagram's own login is still refreshed as before.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { metaLinesOf } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "META_APP_ID"]) delete process.env[k];
const realSecret = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = "meta-secret-for-the-check";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { sweepInstagramTokens } = await import(at("apps/edge/lib/instagram/token-sweep.ts"));

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-11-09T06:23:00Z");
const ALL = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
];

/** Meta's debug_token, answering each token as `debug` says; Instagram's refresh for the other login. */
let debug = () => [200, { data: { is_valid: true, expires_at: 0, scopes: ALL } }];
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  asked.push(u);
  const q = new URL(u).searchParams;
  const [status, body] = u.startsWith("https://graph.facebook.com/v27.0/debug_token")
    ? debug(q.get("input_token"))
    : u.startsWith("https://graph.instagram.com/refresh_access_token")
      ? [200, { access_token: "fresh-token", token_type: "bearer", expires_in: 5184000 }]
      : [200, {}];
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
  if (realSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = realSecret;
});

const silent = { info() {}, warn() {}, error() {} };
let seq = 0;

/** Accounts on the platform: `meta` ones hold the business's own token, the others Instagram's 60-day one, a week old. */
function world(logins) {
  const rows = logins.map((login, n) => {
    const i = ++seq;
    return {
      id: `abcdabcd-4444-4000-8000-${String(i).padStart(12, "0")}`,
      tenant_id: `dcbadcba-4444-4000-8000-${String(i).padStart(12, "0")}`,
      kind: "instagram",
      external_id: `17841${String(i).padStart(12, "0")}`,
      credentials_ref: `ref-${i}`,
      status: "active",
      config: login === "meta" ? { username: `studio${n}`, login: "meta", scopes: ALL } : { username: `studio${n}` },
      created_at: new Date(NOW - (100 - n) * DAY).toISOString(),
    };
  });
  const vault = Object.fromEntries(
    rows.map((r, n) => [
      r.id,
      logins[n] === "meta"
        ? { access_token: `bisu-${r.id}`, account_id: r.external_id, login: "meta", expires_at: null, refreshed_at: "" }
        : {
            access_token: `old-${r.id}`,
            account_id: r.external_id,
            refreshed_at: new Date(NOW - 8 * DAY).toISOString(),
            expires_at: null,
          },
    ]),
  );
  const tables = { tenant_channels: rows, notifications: [], tenant_config: [], tenants: [] };
  const puts = [];
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
      put_channel_credentials: ({ p_channel_id, p_secret }) => {
        puts.push(p_channel_id);
        vault[p_channel_id] = p_secret;
        return null;
      },
    },
  );
  setPg(db);
  return { db, rows, tables, vault, puts, mark: asked.length };
}
const run = async (w) => {
  const res = await sweepInstagramTokens({ db: w.db, L: silent, started: NOW }, () => NOW);
  return [res.status, await res.json()];
};

test("a token Meta still takes is checked, never refreshed, with what it may do kept; Instagram's own login is refreshed as before", async () => {
  resetBreakers();
  debug = () => [200, { data: { is_valid: true, expires_at: 0, scopes: ALL } }];
  const w = world(["meta", "instagram"]);
  const [status, out] = await run(w);
  assert.equal(status, 200);
  assert.equal(out.checked, 1);
  assert.equal(out.refreshed, 1);
  const [meta, ig] = w.rows;
  assert.equal(meta.config.token_checked_at, new Date(NOW).toISOString());
  assert.deepEqual(meta.config.scopes, ALL);
  assert.equal(meta.config.username, "studio0", "kept beside the config, never over it");
  assert.equal(meta.config.login, "meta");
  assert.deepEqual(w.puts, [ig.id], "only Instagram's own token was replaced");
  const calls = asked.slice(w.mark);
  const check = new URL(calls.find((u) => u.includes("/debug_token")));
  assert.equal(check.searchParams.get("input_token"), `bisu-${meta.id}`);
  assert.equal(
    check.searchParams.get("access_token"),
    "1823820738182125|meta-secret-for-the-check",
    "the app's own token asks",
  );
  assert.ok(
    !calls.some((u) => u.includes("refresh_access_token") && u.includes("bisu-")),
    "a Meta token is never refreshed",
  );
});

test("a permission taken back turns its line Off; a token Meta no longer takes is lapsed and told once; no answer changes nothing", async () => {
  resetBreakers();
  const w = world(["meta", "meta", "meta"]);
  const [dropped, gone, silentRow] = w.rows;
  debug = (token) =>
    token === `bisu-${dropped.id}`
      ? [200, { data: { is_valid: true, expires_at: 0, scopes: ["instagram_basic", "instagram_manage_messages"] } }]
      : token === `bisu-${gone.id}`
        ? [200, { data: { is_valid: false, expires_at: 0, scopes: [] } }]
        : [503, { error: { message: "Service temporarily unavailable", code: 2 } }];
  const [status, out] = await run(w);
  assert.equal(status, 200);
  assert.deepEqual([out.checked, out.lapsed, out.unanswered], [1, 1, 1]);
  assert.deepEqual(metaLinesOf(dropped.config.scopes), {
    messages: true,
    publish: false,
    sounds: false,
    comments: false,
    insights: false,
  });
  assert.equal(gone.config.token_lapsed_at, new Date(NOW).toISOString());
  const told = w.tables.notifications.filter((n) => n.tenant_id === gone.tenant_id);
  assert.equal(told.length, 1);
  assert.match(told[0].title, /@studio1 needs to be connected again/);
  assert.deepEqual(silentRow.config.scopes, ALL, "a check with no answer changes nothing");
  assert.equal(silentRow.config.token_checked_at, undefined);
  assert.equal(w.puts.length, 0, "no token was replaced");
  await run(w);
  assert.equal(w.tables.notifications.filter((n) => n.tenant_id === gone.tenant_id).length, 1, "told once");
});

test("without the Meta app's secret nothing can be asked, and nothing is changed", async () => {
  resetBreakers();
  delete process.env.META_APP_SECRET;
  try {
    const w = world(["meta"]);
    const [, out] = await run(w);
    assert.equal(out.unanswered, 1);
    assert.equal(w.rows[0].config.token_checked_at, undefined);
    assert.ok(!asked.slice(w.mark).some((u) => u.includes("/debug_token")));
  } finally {
    process.env.META_APP_SECRET = "meta-secret-for-the-check";
  }
});
