/**
 * The sync opens a folder for what it is asked for (apps/edge/lib/files/takes/sync.ts over sources/standing.ts; the
 * content loop PRD v3.1, pass 0, F1). A take brings in only what a folder being read lists, so a stopped folder takes
 * nothing. A return brings back a clip that came in, and a stopped folder's original is still read through its account,
 * so a return opens one, while its account reads. Where a folder will not open, it says whose it is to mend: the
 * account's (signed out, whoever connected it left) or the folder's own (Drive can't open it). A stopped folder is
 * never paused on the way: it stays stopped, and a watch again starts it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";
import { rows } from "../../_rows.mjs";
import { CONNECTION, OWNER, SOURCE, T, setEnv, sourceRow, world } from "./_world.mjs";

setEnv();
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { logger } = await import(at("apps/edge/lib/shared/log.ts"));
const { takeSync } = await import(at("apps/edge/lib/files/takes/sync.ts"));

after(() => setPg(null));

const LOG = logger({ tenant_id: T });
const named = { tenantId: T, sourceId: SOURCE };

/** A world whose one folder stands as asked, its account reading unless a case says otherwise. */
function folderIn(state, over = {}) {
  const w = world({ source: sourceRow({ state, ...over.source }), tables: over.tables ?? {} });
  setPg(w.db);
  return w;
}

test("a stopped folder opens for a return, never for a take", async () => {
  const w = folderIn("stopped");
  const back = await takeSync.open(w.db, named, LOG, "return");
  assert.equal(back.ok, true, "a return reads its original through the account's key");
  const take = await takeSync.open(w.db, named, LOG, "take");
  assert.deepEqual(take, { ok: false, skipped: "the folder is stopped", cause: "folder" });
  assert.equal(w.source().state, "stopped", "opened, and still stopped");
});

test("a folder being read opens for both", async () => {
  for (const state of ["setting_up", "watching"]) {
    const w = folderIn(state);
    assert.equal((await takeSync.open(w.db, named, LOG, "take")).ok, true, `${state}: a take`);
    assert.equal((await takeSync.open(w.db, named, LOG, "return")).ok, true, `${state}: a return`);
  }
});

test("a paused folder says its account, and a frozen one its folder", async () => {
  const paused = folderIn("paused", { source: { stopped_why: "signed_out" } });
  const fromPaused = await takeSync.open(paused.db, named, LOG, "return");
  assert.deepEqual([fromPaused.ok, fromPaused.cause], [false, "account"]);
  const frozen = folderIn("frozen", { source: { stopped_why: "cant_open" } });
  const fromFrozen = await takeSync.open(frozen.db, named, LOG, "return");
  assert.deepEqual([fromFrozen.ok, fromFrozen.cause], [false, "folder"]);
});

test("a stopped folder whose account needs connecting again says the account, and stays stopped", async () => {
  const w = folderIn("stopped", {
    tables: {
      source_connections: [
        rows.sourceConnection({
          id: CONNECTION,
          tenant_id: T,
          provider_account: "google-sub-1",
          email: "owner@example.com",
          connected_by: OWNER,
          credentials_ref: `source-creds-${CONNECTION}`,
          health: "needs_reconnect",
        }),
      ],
    },
  });
  const opened = await takeSync.open(w.db, named, LOG, "return");
  assert.deepEqual([opened.ok, opened.cause], [false, "account"]);
  assert.deepEqual([w.source().state, w.source().stopped_why], ["stopped", null], "never paused on the way");
});

test("a stopped folder whose connector left the workspace says the account, and stays stopped", async () => {
  const w = folderIn("stopped", { tables: { memberships: [] } });
  const opened = await takeSync.open(w.db, named, LOG, "return");
  assert.deepEqual([opened.ok, opened.cause], [false, "account"]);
  assert.equal(w.source().state, "stopped");
});
