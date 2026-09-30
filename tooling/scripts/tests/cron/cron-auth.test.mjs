/**
 * The door every scheduled route stands behind, run rather than read. Each
 * route used to carry its own copy of this comparison, and five tests pinned
 * those copies by their text; one door, proved once, replaces them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, fakeLog } from "../_fake-db.mjs";
import { authorizeCron } from "../../../../apps/edge/lib/cron-auth.ts";
import { setPg } from "../../../../apps/edge/lib/pg.ts";
import { sweepDoor } from "../../../../apps/edge/lib/ops/sweep-door.ts";
import { logLineOf } from "../_log-lines.mjs";

const req = (key) =>
  new Request("https://edge.test/api/cron/any", {
    method: "POST",
    headers: key == null ? {} : { "x-cron-key": key },
  });
const vault = (key) => fakeDb({}, {}, { get_cron_sweep_key: () => key });

test("the key Vault holds comes in", async () => {
  assert.equal(await authorizeCron(req("s3cret-key"), vault("s3cret-key"), fakeLog()), null);
});

test("a missing, wrong, short, long or differently cased key does not", async () => {
  // No trailing-space case: the Fetch Headers API trims a header's value before
  // any route sees it, so whitespace is never part of what is compared.
  for (const k of [null, "", "s3cret-ke", "s3cret-key2", "S3CRET-KEY", "other"]) {
    const r = await authorizeCron(req(k), vault("s3cret-key"), fakeLog());
    assert.equal(r?.status, 401, JSON.stringify(k));
    assert.deepEqual(await r.json(), { ok: false, error: "unauthorized" });
  }
});

test("a key that cannot be read is a 503 and a log line, never a way in", async () => {
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
    vault(null),
  ]) {
    const L = fakeLog();
    const r = await authorizeCron(req("anything"), db, L);
    assert.equal(r?.status, 503);
    assert.deepEqual(await r.json(), { ok: false, error: "key_unavailable" });
    assert.deepEqual(L.events(), ["cron_key_unavailable"], "and whoever reads the logs can see why");
  }
});

/*
 * What each route under api/cron is: sweepDoor with the sweep it stands for. Run, not read: a knock without the sweep
 * key is refused before the sweep is asked to do anything, no database is a 503 (and says its own line when the route
 * names one), and the key runs the sweep with its database, its logger and the moment the door was reached.
 */
test("a sweep runs only for the key, and is handed its database, its logger and when the door was reached", async () => {
  const ticks = [];
  const route = sweepDoor({ sweep: "any" }, async (tick) => {
    ticks.push(tick);
    return new Response("{}", { status: 200 });
  });
  const db = vault("s3cret-key");
  try {
    setPg(db);
    for (const key of [null, "not-the-key"]) assert.equal((await route(req(key))).status, 401, JSON.stringify(key));
    assert.equal(ticks.length, 0, "a knock without the key never reaches the sweep");
    const before = Date.now();
    assert.equal((await route(req("s3cret-key"))).status, 200);
    assert.equal(ticks.length, 1);
    assert.equal(ticks[0].db, db);
    assert.ok(ticks[0].started >= before && ticks[0].started <= Date.now(), "the moment the door was reached");
    assert.equal(typeof ticks[0].L.info, "function");
  } finally {
    setPg(null);
  }
});

test("without a database a sweep is a 503, and says the line its route names", async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const lines = [];
  const realError = console.error;
  console.error = (...args) => {
    const line = logLineOf(args);
    if (line) lines.push(line);
  };
  try {
    setPg(null);
    let ran = false;
    const sweep = async () => {
      ran = true;
      return new Response("{}");
    };
    for (const [spec, said] of [
      [{ sweep: "any", noDbEvent: "deadman_no_db" }, ["deadman_no_db"]],
      [{ sweep: "any" }, []],
    ]) {
      lines.length = 0;
      const res = await sweepDoor(spec, sweep)(req("s3cret-key"));
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { ok: false, error: "no_database" });
      assert.deepEqual(
        lines.map((l) => l.event),
        said,
      );
    }
    assert.equal(ran, false);
  } finally {
    console.error = realError;
    if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
    if (saved.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});
