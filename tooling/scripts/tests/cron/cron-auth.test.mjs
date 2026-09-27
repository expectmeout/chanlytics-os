/**
 * The door every scheduled route stands behind, run rather than read. Each
 * route used to carry its own copy of this comparison, and five tests pinned
 * those copies by their text; one door, proved once, replaces them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, fakeLog } from "../_fake-db.mjs";
import { authorizeCron } from "../../../../apps/edge/lib/cron-auth.ts";

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
