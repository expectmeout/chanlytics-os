/**
 * Watching a folder again takes back what stopped with it (the content loop PRD v3.1, pass 0, F2; Ruben's call 2 of
 * 21 Nov 2026). The first real run switched folder A for B while six of A's clips (all three of the iPhone's own HEVC
 * `.mov` among them) waited, and they were marked failed, stopped; A watched again, they stayed failed and nothing
 * said so. A watch, and a watch again of the same folder, hands every item that failed only because its job stopped
 * back to its turn, as new, and nothing else: a clip that was tried and could not be read, one the video platform could
 * not prepare, one too long, and what came in all stay as they were.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";
import { CONNECTION, OWNER, ROOT, SOURCE, T, setEnv, sourceRow, world } from "./_world.mjs";

setEnv();
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { runSourcesOp } = await import(at("apps/edge/lib/files/sources/ops.ts"));

let w;
afterEach(() => w?.restore());
after(() => setPg(null));

let serial = 0;
/** One of the folder's files as its row stands. */
const item = (state, why, over = {}) => ({
  id: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`,
  tenant_id: T,
  source_id: SOURCE,
  provider_id: `item-${serial}`,
  kind: "video",
  name: `clip-${serial}.mov`,
  state,
  why,
  take_tries: state === "failed" ? 3 : 0,
  take_after: null,
  ...over,
});

/** The folder as it stands, with its files, its account connected and Drive holding the folder. */
function folderWith(state, items) {
  w = world({
    source: sourceRow({ state, reconciled_at: "2026-11-20T18:00:00.000Z", walk_run: 1 }),
    tables: { google_connections: [], mailbox_connections: [], source_items: items },
  });
  setPg(w.db);
  w.drive.folder(ROOT, "Footage", null, { root: false });
  return w;
}

const knock = async (body) => {
  const res = await runSourcesOp({ ok: true, via: "token", workspace: T, user: OWNER }, body);
  return [res.status, await res.json()];
};
const watch = () => knock({ op: "watch", connection_id: CONNECTION, folder_id: ROOT });
const rowOf = (id) => w.tables.source_items.find((row) => row.id === id);

/** What each kind of item becomes: only what stopped returns to its turn. */
function theFolder() {
  return {
    stopped: [item("failed", "stopped"), item("failed", "stopped", { kind: "image", name: "photo.heic" })],
    unread: item("failed", "unreadable"),
    unprepared: item("failed", "stream"),
    tooLong: item("too_big", "seconds"),
    in: item("in", null, { file_id: "eeeeeeee-0000-4000-8000-000000000001" }),
    waiting: item("waiting", "folder", { take_after: "2026-11-21T10:00:00.000Z" }),
  };
}

test("watching a stopped folder again hands back what stopped with it, as new, and nothing else", async () => {
  const items = theFolder();
  folderWith("stopped", Object.values(items).flat());
  const [status, body] = await watch();
  assert.deepEqual([status, body.made], [200, false]);
  for (const stopped of items.stopped)
    assert.deepEqual(
      [rowOf(stopped.id).state, rowOf(stopped.id).why, rowOf(stopped.id).take_tries, rowOf(stopped.id).take_after],
      ["waiting", null, 0, null],
      "waits its turn, its tries spent by the stop given back",
    );
  for (const [name, kept] of [
    ["unread", items.unread],
    ["unprepared", items.unprepared],
    ["tooLong", items.tooLong],
    ["in", items.in],
    ["waiting", items.waiting],
  ])
    assert.deepEqual(
      [rowOf(kept.id).state, rowOf(kept.id).why, rowOf(kept.id).take_tries],
      [kept.state, kept.why, kept.take_tries],
      `${name}: as it was`,
    );
});

test("choosing the folder watched now again hands back what stopped too, and is still one watch", async () => {
  const items = theFolder();
  folderWith("watching", Object.values(items).flat());
  const [status, body] = await watch();
  assert.deepEqual([status, body.made, body.source_id], [200, false, SOURCE]);
  assert.deepEqual(
    items.stopped.map((stopped) => rowOf(stopped.id).state),
    ["waiting", "waiting"],
  );
  assert.equal(rowOf(items.unread.id).state, "failed", "a clip that could not be read is not tried again for it");
  assert.equal(w.tables.media_sources.length, 1);
});

test("another workspace's items are never handed back by this one's watch", async () => {
  const mine = item("failed", "stopped");
  const theirs = item("failed", "stopped", {
    tenant_id: "22222222-2222-4222-8222-222222222222",
    source_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  });
  folderWith("stopped", [mine, theirs]);
  await watch();
  assert.deepEqual([rowOf(mine.id).state, rowOf(theirs.id).state], ["waiting", "failed"]);
});
