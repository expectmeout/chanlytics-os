/**
 * New ad asks for a video's copy (the archive review of 28 Nov 2026, R1.6): the ad account door's `copy` op
 * (apps/edge/lib/ads/account-ops.ts), which hands the copy's one door the file and the purpose `ad`
 * (apps/edge/lib/files/copy/ensure.ts), run over the copies' own world: the real door, its doors in the database in
 * memory, and the jobs ledger.
 *
 * What must hold. A video whose copy stepped aside is asked back, once however often a draft comes to show it, and the
 * answer says it is on its way. One that is here is marked used, so it is not the next let go. A file that is no video
 * of this workspace's has no copy. Nothing of it reaches Meta, and it is asked only where New ad is offered.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { T, realFetch, setPg, watchedClip, world } from "./_world.mjs";

const { runAdsAccountOp } = await import(at("apps/edge/lib/ads/account-ops.ts"));

const U = "cdcdcdcd-1111-4000-8000-000000000001";
const ADS = {
  META_APP_ID: "990000000000079",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_ADS_CONFIG_ID: "880000000000004",
  META_ADS_REDIRECT_URI: "https://app.example.com/api/v1/ads/connect/callback",
  ADS_WORKSPACES: T,
};
const auth = { ok: true, via: "token", workspace: T, user: U };

/** Every call out while a test runs: asking for a copy reaches nobody. */
let reached = [];
beforeEach(() => {
  resetBreakers();
  Object.assign(process.env, ADS);
  reached = [];
  globalThis.fetch = async (url) => {
    reached.push(String(url));
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
});
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
  for (const name of Object.keys(ADS)) delete process.env[name];
});

/** One clip and its world: its copy here, or let go with its folder still holding the original. */
function clip(file) {
  const made = watchedClip({ copy_used_at: null, ...file });
  const w = world({ files: [made.row], items: [made.origin] });
  setPg(w.db);
  return { w, id: made.row.id, row: () => w.file(made.row.id) };
}
const ask = async (fileId, over = {}) => {
  const res = await runAdsAccountOp(auth, { op: "copy", tenant_id: T, user_id: U, file_id: fileId, ...over });
  return [res.status, await res.json()];
};

test("a video whose copy stepped aside is asked back at the pick, once however often it is picked", async () => {
  const { w, id } = clip({ copy_state: "away" });
  assert.deepEqual(await ask(id), [200, { ok: true, copy: "returning", why: null }]);
  assert.deepEqual(await ask(id), [200, { ok: true, copy: "returning", why: null }]);
  assert.equal(w.returns().length, 1, "one return on the ledger, however often a draft comes to show it");
  assert.deepEqual(w.returns()[0].payload, { file_id: id });
  assert.deepEqual(reached, [], "nothing is asked of Meta, or of anyone, for it");
});

test("a video whose copy is here is marked used, so it is not the next let go", async () => {
  const { w, id, row } = clip({ copy_state: "here" });
  assert.deepEqual(await ask(id), [200, { ok: true, copy: "here", why: null }]);
  assert.notEqual(row().copy_used_at, null, "when it was used is written");
  assert.equal(w.returns().length, 0);
});

test("a file that is no video of this workspace's has no copy, and a body that names none is refused", async () => {
  const { w } = clip({ copy_state: "away" });
  assert.deepEqual(await ask("f0f0f0f0-1111-4000-8000-00000000000f"), [200, { ok: true, copy: "none", why: null }]);
  const [status, body] = await ask("not-a-file");
  assert.deepEqual([status, body.error], [400, "bad_request"]);
  assert.equal(w.returns().length, 0, "and nothing is asked back");
});

test("asked only where New ad is offered: a workspace off the list makes no new ad, so none asks for a copy", async () => {
  const { w, id } = clip({ copy_state: "away" });
  process.env.ADS_WORKSPACES = "another-workspace";
  const [status, body] = await ask(id);
  assert.deepEqual([status, body.error], [409, "meta_off"]);
  assert.equal(w.returns().length, 0);
});
