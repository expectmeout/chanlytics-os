/**
 * The Instagram token sweep, run (decision 0001, step 8; lib/instagram/token-sweep.ts): each connected account's 60-day
 * token refreshed once it is a week old, kept in the Vault with its new clock on the row; a younger one left alone; one
 * Instagram refuses for the token itself marked lapsed and its workspace told once; one that got no answer left for
 * tomorrow; and no account read at all a 503.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL"]) delete process.env[k];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { sweepInstagramTokens } = await import(at("apps/edge/lib/instagram/token-sweep.ts"));

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-10-27T06:23:00Z");

/** Instagram's refresh endpoint, answering each token as `refresh` says. */
let refresh = () => [200, { access_token: "fresh-token", token_type: "bearer", expires_in: 5184000 }];
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  asked.push(u);
  const token = new URL(u).searchParams.get("access_token");
  const [status, body] = u.startsWith("https://graph.instagram.com/refresh_access_token") ? refresh(token) : [200, {}];
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

const silent = { info() {}, warn() {}, error() {} };
let seq = 0;

/** Accounts on the platform, each with its token's age in days (null: nothing in the Vault). */
function world(ages, faults = {}) {
  const rows = ages.map((age, n) => {
    const i = ++seq;
    return {
      row: {
        id: `abcdabcd-2222-4000-8000-${String(i).padStart(12, "0")}`,
        tenant_id: `dcbadcba-2222-4000-8000-${String(i).padStart(12, "0")}`,
        kind: "instagram",
        external_id: `17841${String(i).padStart(12, "0")}`,
        credentials_ref: age === null ? null : `ref-${i}`,
        status: "active",
        config: { username: `studio${n}` },
        created_at: new Date(NOW - (100 - n) * DAY).toISOString(),
      },
      age,
    };
  });
  const vault = Object.fromEntries(
    rows
      .filter((r) => r.age !== null)
      .map((r) => [
        r.row.id,
        {
          access_token: `old-${r.row.id}`,
          account_id: r.row.external_id,
          refreshed_at: new Date(NOW - r.age * DAY).toISOString(),
          expires_at: null,
        },
      ]),
  );
  const tables = { tenant_channels: rows.map((r) => r.row), notifications: [], tenant_config: [], tenants: [] };
  const puts = [];
  const db = fakeDb(tables, faults, {
    get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
    put_channel_credentials: ({ p_channel_id, p_secret }) => {
      puts.push({ id: p_channel_id, secret: p_secret });
      vault[p_channel_id] = p_secret;
      return null;
    },
  });
  setPg(db);
  return { db, rows: rows.map((r) => r.row), tables, vault, puts };
}
const run = async (w, started = NOW) => {
  const res = await sweepInstagramTokens({ db: w.db, L: silent, started }, () => NOW);
  return [res.status, await res.json()];
};

test("a token a week old is refreshed and kept with its new clock; a younger one is left as it is", async () => {
  resetBreakers();
  refresh = () => [200, { access_token: "fresh-token", token_type: "bearer", expires_in: 5184000 }];
  const w = world([8, 2]);
  const [status, out] = await run(w);
  assert.equal(status, 200);
  assert.equal(out.refreshed, 1);
  assert.equal(out.fresh, 1);
  assert.deepEqual(
    w.puts.map((p) => p.id),
    [w.rows[0].id],
  );
  assert.equal(w.vault[w.rows[0].id].access_token, "fresh-token");
  assert.equal(w.vault[w.rows[0].id].account_id, w.rows[0].external_id);
  assert.equal(w.vault[w.rows[0].id].refreshed_at, new Date(NOW).toISOString());
  assert.equal(w.rows[0].config.token_refreshed_at, new Date(NOW).toISOString());
  assert.equal(w.rows[0].config.token_expires_at, new Date(NOW + 5184000 * 1000).toISOString());
  assert.equal(w.rows[0].config.username, "studio0", "merged beside the config, never over it");
  assert.equal(w.vault[w.rows[1].id].access_token, `old-${w.rows[1].id}`);
});

test("a token Instagram refuses is marked lapsed and its workspace told once; no answer is left for tomorrow", async () => {
  resetBreakers();
  const w = world([30, 30]);
  refresh = (token) =>
    token === `old-${w.rows[0].id}`
      ? [
          400,
          {
            error: { message: "Error validating access token: Session has expired", type: "OAuthException", code: 190 },
          },
        ]
      : [503, { error: { message: "Service temporarily unavailable", code: 2 } }];
  const [status, out] = await run(w);
  assert.equal(status, 200);
  assert.equal(out.lapsed, 1);
  assert.equal(out.unanswered, 1);
  assert.equal(w.puts.length, 0, "no token was replaced");
  assert.equal(w.rows[0].config.token_lapsed_at, new Date(NOW).toISOString());
  assert.equal(w.rows[1].config.token_lapsed_at, undefined);
  const told = w.tables.notifications.filter((n) => n.tenant_id === w.rows[0].tenant_id);
  assert.equal(told.length, 1);
  assert.match(told[0].title, /@studio0 needs to be connected again/);
  // Asked again tomorrow, the notice is the one already kept.
  await run(w);
  assert.equal(w.tables.notifications.filter((n) => n.tenant_id === w.rows[0].tenant_id).length, 1);
});

test("an account with nothing in the Vault is counted, a round past its budget leaves the rest, and no accounts read is a 503", async () => {
  resetBreakers();
  refresh = () => [200, { access_token: "fresh-token", token_type: "bearer", expires_in: 5184000 }];
  const w = world([null, 9]);
  // A round begun a minute ago, a whole function's life, is past any budget a refresh may start within.
  const [, out] = await run(w, NOW - 60_000);
  assert.equal(out.left, 2, "past the budget, nothing starts");
  const [, again] = await run(w);
  assert.equal(again.no_token, 1);
  assert.equal(again.refreshed, 1);
  const broken = world([9], { "tenant_channels.select": { message: "connection reset" } });
  assert.deepEqual(await run(broken), [503, { ok: false, error: "no_database" }]);
});
