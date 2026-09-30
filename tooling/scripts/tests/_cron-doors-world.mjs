/**
 * The harness the sweep tests share -- the knock at the cron door, the
 * captured wire and the environment -- for the files that RUN a route under
 * apps/edge/api/cron over a database in memory (cron-health-door,
 * cron-deadman-door, cron-playbooks-door, cron-calendar-door).
 *
 * ORDER MATTERS in each file: set process.env, then import pg.ts and the
 * route through `at()`, then `setPg(fakeDb(...))` per case. The routes read
 * their mailbox at the call, not at import, so LEAD_TO and the rest may also
 * be changed for one case with withEnv().
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/* ------------------------------------------------------------- the knock */

/** The sweep key Vault holds, for this process. */
export const KEY = "sweep-key-for-this-file";
/** The one rpc every door asks before anything else. */
export const vault = { get_cron_sweep_key: () => KEY };

/** pg_net's call, as pg_cron makes it: a bare POST with the key in its header. `null` knocks with no key at all. */
export const knock = (POST, route, key = KEY) =>
  POST(
    new Request(`http://edge/api/cron/${route}`, { method: "POST", headers: key == null ? {} : { "x-cron-key": key } }),
  );
export const answer = async (res) => [res.status, await res.json()];

/** Set (or with undefined, unset) variables for one call, and put them back. */
export async function withEnv(patch, fn) {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* -------------------------------------------------------------- the wire */

const ok = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });

/**
 * Every request the sweep makes, captured and answered -- by `reply(url,
 * init)` when given, else with 200 and an empty object, which is what Resend
 * answers a delivered mail with.
 */
export function wire(reply = ok) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    return reply(u, init);
  };
  const to = (part) => calls.filter((c) => c.url.includes(part));
  return {
    calls,
    to,
    /** What Resend was asked to send, in order: { from, to, subject, text }. */
    mail: () => to("api.resend.com").map((c) => JSON.parse(c.init.body)),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

/* -------------------------------------------------------------- the door */

/**
 * The door, run against one sweep's POST: the wrong key (or none) is a 401, a
 * key Vault cannot produce is a 503 `key_unavailable`, and no database at all
 * is a 503 `no_database`. In every refusal the key is the only thing asked of
 * the database -- nothing past the door is consulted -- which is why the fakes
 * here model no rpc but the key's: a sweep that got past would throw by name.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unset in the process, so
 * that `setPg(null)` really is no database.
 */
export async function refusedAtTheDoor(POST, route, setPg) {
  const asked = (db) => db.seen.map((s) => s.rpc ?? `${s.table}.${s.op}`);

  const held = fakeDb({}, {}, vault);
  setPg(held);
  assert.deepEqual(await answer(await knock(POST, route, "not-the-key")), [401, { ok: false, error: "unauthorized" }]);
  assert.deepEqual(
    await answer(await knock(POST, route, null)),
    [401, { ok: false, error: "unauthorized" }],
    "no key at all",
  );
  assert.deepEqual(
    asked(held),
    ["get_cron_sweep_key", "get_cron_sweep_key"],
    "the key is the only thing asked of the database",
  );

  for (const db of [
    fakeDb(
      {},
      {},
      {
        get_cron_sweep_key: () => {
          throw new Error("permission denied for function get_cron_sweep_key");
        },
      },
    ),
    fakeDb({}, {}, { get_cron_sweep_key: () => null }),
  ]) {
    setPg(db);
    assert.deepEqual(
      await answer(await knock(POST, route)),
      [503, { ok: false, error: "key_unavailable" }],
      "a key Vault cannot produce is never a way in",
    );
    assert.deepEqual(asked(db), ["get_cron_sweep_key"]);
  }

  // No database is no fake AND no credentials: pg() builds the real client whenever SUPABASE_URL and the service key
  // are set, as they are in the nightly's node step, and there this case asked the credentialed project's Vault for
  // the key and got a 401 (the scorecard's defect 61: the two reach-out doors failed every night).
  setPg(null);
  await withEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, async () =>
    assert.deepEqual(
      await answer(await knock(POST, route)),
      [503, { ok: false, error: "no_database" }],
      "no database: refused before the key is even asked for",
    ),
  );
}
