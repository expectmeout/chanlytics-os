/**
 * Google's signal for a watched folder, and the footage clock (the footage sources plan, D18), run as their doors run
 * them over a database in memory: POST /api/sources/drive checks a signal's channel and token and puts one read on
 * the ledger, paced; POST /api/cron/sources hands each folder the read or the walk that has come due and reads nothing
 * itself. And the plan's own number: a day of signals from a Drive busy with other work costs no more reads than the
 * pace allows.
 */
import { test, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { KEY, at, answer, knock } from "../../_cron-doors-world.mjs";
import { ROOT, SOURCE, firstWalk, runJobs, schedule, setEnv, world } from "./_world.mjs";

setEnv();
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { POST: signalDoor } = await import(at("apps/edge/api/sources/drive.ts"));
const { POST: clockDoor } = await import(at("apps/edge/api/cron/sources.ts"));
const { SOURCE_PACE } = await import(at("apps/edge/lib/files/sources/pace.ts"));

let w;
beforeEach(() => resetBreakers());
afterEach(() => w?.restore());
after(() => setPg(null));

const MIN = 60_000;
const read = async () => {
  schedule(w, "source_read", { source_id: SOURCE }, [SOURCE]);
  return runJobs(w);
};

/** A watched folder whose first read has opened its channel; the door's database is this world's. */
async function watched(source = {}) {
  w = world({ source, rpcs: { get_cron_sweep_key: () => KEY } });
  setPg(w.db);
  w.drive.folder(ROOT, "Footage", null).video("clip-1", "a.MOV", ROOT);
  await firstWalk(w);
  return w;
}

/** A signal as Google sends it for the folder's channel: no body, the channel's id and its token in the headers. */
function signal(over = {}) {
  const channelId = over.channelId ?? w.source().channel_id;
  const token = over.token ?? w.drive.channels.get(w.source().channel_id).token;
  return signalDoor(
    new Request("https://edge.example.com/api/sources/drive", {
      method: "POST",
      headers: {
        "x-goog-channel-id": channelId,
        "x-goog-channel-token": token,
        "x-goog-resource-id": over.resourceId ?? "resource-1",
        "x-goog-resource-state": over.state ?? "change",
        "x-goog-message-number": "2",
      },
    }),
  );
}

test("a signal with its channel's own token puts one read on the ledger, due one gap after the folder's last read", async () => {
  await watched();
  const lastRead = w.source().last_read_at;
  const res = await signal();
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "", "answered at once, with nothing");
  const [job] = w.waiting("source_read");
  assert.deepEqual(job.payload.source_id, SOURCE);
  assert.equal(
    Date.parse(job.due_at),
    Date.parse(lastRead) + SOURCE_PACE.readGapMs,
    "a folder read a moment ago is read again five minutes after that read, not now",
  );
  assert.ok(w.source().signalled_at, "and its row says a signal came");
});

test("a hundred signals in a minute are one read", async () => {
  await watched();
  for (let n = 0; n < 100; n++) assert.equal((await signal()).status, 204);
  assert.equal(w.waiting("source_read").length, 1);
});

test("a signal with another token, or for a channel nobody holds, is answered and reads nothing", async () => {
  await watched();
  const stamped = w.source().signalled_at;
  for (const forged of [{ token: "not-the-channel's-token" }, { channelId: "someone-else's-channel" }]) {
    const res = await signal(forged);
    assert.equal(res.status, 204, "anything but a 2xx would be sent again");
  }
  assert.equal(w.waiting("source_read").length, 0);
  assert.equal(w.source().signalled_at, stamped, "the folder is not stamped by a signal that is not its own");
  // One with no token at all is refused before the database is asked.
  const bare = await signalDoor(
    new Request("https://edge.example.com/api/sources/drive", {
      method: "POST",
      headers: { "x-goog-channel-id": "x" },
    }),
  );
  assert.equal(bare.status, 400);
});

test("the message Google sends when a channel opens changes nothing and reads nothing", async () => {
  await watched();
  const res = await signal({ state: "sync" });
  assert.equal(res.status, 204);
  assert.equal(w.waiting("source_read").length, 0);
});

test("a channel its folder has moved on from is closed with that folder's own account", async () => {
  await watched();
  // An older channel of the same folder is still open at Drive: its closing failed the day it was replaced.
  const stale = `src-${SOURCE}-0badc0de`;
  w.drive.channels.set(stale, { id: stale, resourceId: "resource-old", token: "old-token" });
  const res = await signal({ channelId: stale, token: "old-token", resourceId: "resource-old" });
  assert.equal(res.status, 204);
  assert.equal(w.drive.channels.has(stale), false, "closed, so it stops signalling");
  assert.equal(w.drive.channels.has(w.source().channel_id), true, "the folder's own channel is left alone");
  assert.equal(w.waiting("source_read").length, 0);
});

test("a signal that comes while a read is running brings the next read one gap on, where the floor would be an hour", async () => {
  await watched();
  w.drive.video("clip-new", "b.MOV", ROOT);
  let signalled = null;
  w.drive.onEachCall((call) => {
    if (call.path === "/drive/v3/files/clip-new") signalled = signal();
  });
  await read();
  assert.equal((await signalled).status, 204);
  assert.equal(
    w.waiting("source_read").length,
    0,
    "the read that is running holds the folder's one place on the ledger",
  );
  const next = Date.parse(w.source().next_read_at) - Date.now();
  assert.ok(
    next > SOURCE_PACE.readGapMs - MIN && next <= SOURCE_PACE.readGapMs,
    `the clock reads it in five minutes (${next})`,
  );
});

test("a signal that lands while a read is finishing is not lost: the folder's own row is brought forward, and the clock hands it", async () => {
  await watched();
  // The folder's channel is due, so the read's last act is to open the next one: the signal lands just then, after
  // the read has looked for one and while it still holds the folder's one place on the ledger.
  w.source().channel_expires_at = new Date(Date.now() + SOURCE_PACE.channelRenewBeforeMs - MIN).toISOString();
  let late = null;
  w.drive.onEachCall((call) => {
    if (call.path === "/drive/v3/changes/watch") late = signal();
  });
  await read();
  assert.equal((await late).status, 204);
  assert.equal(w.waiting("source_read").length, 0, "no job could be written for it");
  const next = Date.parse(w.source().next_read_at) - Date.now();
  assert.ok(
    next > SOURCE_PACE.readGapMs - MIN && next <= SOURCE_PACE.readGapMs,
    `the row says five minutes, where the floor would be an hour (${next})`,
  );
});

test("a signal never puts a folder's read later than its row already holds", async () => {
  await watched();
  const soon = new Date(Date.now() + 30_000).toISOString();
  w.source().next_read_at = soon;
  assert.equal((await signal()).status, 204);
  assert.equal(w.source().next_read_at, soon, "a read due in half a minute stays due then");
});

test("a folder that is not watched hears its signal and reads nothing", async () => {
  await watched();
  w.source().state = "paused";
  assert.equal((await signal()).status, 204);
  assert.equal(w.waiting("source_read").length, 0);
});

/* ------------------------------------------------------------------------------------------------- the clock -- */

test("the clock hands each folder whose read is due one read, none twice, and asks Drive nothing", async () => {
  await watched();
  w.drive.calls.length = 0;
  w.source().next_read_at = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual(await answer(await knock(clockDoor, "sources")), [
    200,
    { ok: true, reads: 1, walks: 0, again: 0, takes: 0 },
  ]);
  assert.deepEqual(await answer(await knock(clockDoor, "sources")), [
    200,
    { ok: true, reads: 0, walks: 0, again: 0, takes: 0 },
  ]);
  assert.equal(w.waiting("source_read").length, 1);
  assert.equal(w.drive.calls.length, 0, "the clock hands work out; it reads nothing");
  const refused = await knock(clockDoor, "sources", "not-the-key");
  assert.equal(refused.status, 401);
});

test("the clock hands a folder nothing while its read is not due, and a paused or stopped one nothing at all", async () => {
  await watched();
  assert.deepEqual((await answer(await knock(clockDoor, "sources")))[1], {
    ok: true,
    reads: 0,
    walks: 0,
    again: 0,
    takes: 0,
  });
  for (const state of ["paused", "stopped"]) {
    Object.assign(w.source(), {
      state,
      next_read_at: new Date(Date.now() - 1000).toISOString(),
      next_walk_at: new Date(Date.now() - 1000).toISOString(),
    });
    assert.deepEqual(
      (await answer(await knock(clockDoor, "sources")))[1],
      { ok: true, reads: 0, walks: 0, again: 0, takes: 0 },
      state,
    );
  }
});

test("a folder chosen whose first walk never began is handed it by the clock, once it has stood half an hour", async () => {
  await watched();
  // The write of its first walk's first step was lost: the folder is still being set up, and nothing is on the ledger.
  Object.assign(w.source(), { state: "setting_up", walk_run: 0, updated_at: new Date().toISOString() });
  assert.deepEqual((await answer(await knock(clockDoor, "sources")))[1], {
    ok: true,
    reads: 0,
    walks: 0,
    again: 0,
    takes: 0,
  });
  w.source().updated_at = new Date(Date.now() - 31 * MIN).toISOString();
  assert.deepEqual((await answer(await knock(clockDoor, "sources")))[1], {
    ok: true,
    reads: 0,
    walks: 0,
    again: 1,
    takes: 0,
  });
  const [job] = w.waiting("source_walk");
  assert.deepEqual(job.payload, { source_id: SOURCE, run: "1", step: "0", walk: "snapshot" });
  await runJobs(w);
  assert.equal(w.source().state, "watching");
});

/* ------------------------------------------------------------------------------------ a day on a busy Drive -- */

test("a day of signals from a Drive busy with other work costs no more reads than the pace allows", async (t) => {
  await watched();
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  // The account's hour-long keys, for the day.
  for (let hour = 0; hour < 30; hour++)
    w.drive.grant({ access_token: `access-${hour}`, expires_in: 3600, scope: "drive" });
  w.drive.calls.length = 0;
  let signals = 0;

  // Every minute of a day someone edits their documents: two changes elsewhere in the account, and Google signals.
  for (let minute = 1; minute <= 24 * 60; minute++) {
    t.mock.timers.tick(MIN);
    w.drive.busyElsewhere(2);
    // Mid-morning, one clip is dropped into the watched folder among all that.
    if (minute === 600) w.drive.video("clip-day", "IMG_5000.MOV", ROOT);
    await signal();
    signals += 1;
    if (minute % 5 === 3) await knock(clockDoor, "sources");
    await runJobs(w, { kinds: ["source_read"] });
  }

  const reads = w.jobs("source_read").filter((job) => job.state === "done").length - 1;
  const lists = w.drive.count("/drive/v3/changes");
  assert.equal(signals, 1440);
  // A folder busy elsewhere is read once in thirty minutes at most: 48 a day, plus the short-gap reads before the pace
  // judged the account busy, twice (at the start, and again after the clip made the folder live for a while).
  const allowed = (24 * 60 * MIN) / SOURCE_PACE.busyGapMs + 2 * (SOURCE_PACE.busyAfterReads + 1);
  assert.ok(reads <= allowed, `${reads} reads for 1,440 signals, where the pace allows ${allowed}`);
  assert.ok(reads >= 40, `and the folder was still read through the day (${reads})`);
  assert.equal(lists, reads, "each read is one list of changes: a hundred units");
  assert.equal(w.item("clip-day")?.state, "waiting", "and the one clip among 2,880 other changes was found");
  const found = w.drive.calls.findIndex((call) => call.path === "/drive/v3/files/clip-day");
  assert.ok(found >= 0, "by its own record, read once");
  assert.equal(
    w.drive.calls.filter((call) => call.path.startsWith("/drive/v3/files/doc-")).length,
    0,
    "no other file was opened",
  );
  const units = w.drive.units((call) => call.path === "/drive/v3/changes" || call.path.startsWith("/drive/v3/files/"));
  assert.ok(units <= allowed * 100 + 10, `${units} units for the day's reads, under ${allowed * 100 + 10}`);
});

test("the same turn asks for every workspace's takes: the floor under the hand-outs a take, a clip and a read ask for", async () => {
  await watched();
  w.handOuts.length = 0;
  w.drive.calls.length = 0;
  const [status, body] = await answer(await knock(clockDoor, "sources"));
  assert.deepEqual([status, body.takes], [200, 0]);
  assert.equal(w.handOuts.length, 1, "asked once a turn");
  const [asked] = w.handOuts;
  assert.equal(asked.p_tenant_id, null, "for every workspace, not one");
  assert.ok(asked.p_in_flight > 0 && asked.p_limit > 0 && asked.p_videos_max > 0 && asked.p_stale_seconds > 0);
  assert.equal(w.drive.calls.length, 0, "and still it reads nothing");
});
