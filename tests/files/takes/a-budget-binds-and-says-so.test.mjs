/**
 * The day's budgets, room, and the Library's cap (apps/edge/lib/files/takes, the footage sources plan's D15 and D16):
 * each binds before any bytes move, the file waits on its own row with why and until when, every other waiting file
 * of the workspace waits with it, and the folder's line says so in the owner's words. A day's budget carries on the
 * next day, as Google counts a day; one business's budget never binds another's.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { squarePng } from "../../look/_png.mjs";
import { at } from "../../_cron-doors-world.mjs";
import { linesOf } from "../../_log-lines.mjs";
import {
  T,
  T2,
  TAKE_BUDGETS,
  bytesOf,
  itemRow,
  realFetch,
  runTakes,
  setPg,
  theSync,
  theWeb,
  world,
} from "./_world.mjs";

const { takeWaitLine } = await import(at("apps/edge/lib/files/takes/waits.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const MIB = 1_048_576;
const CLIP = { mime: "video/quicktime", name: "IMG_1561.MOV", seconds: 38.1, size: 255_147_868 };
const PHOTO = { mime: "image/png", name: "front.png", bytes: squarePng(600) };
const TODAY = "2026-11-17T18:00:00.000Z";

/** Items waiting, each with what Drive holds of it; clips each have their own first MiB. */
function waiting(helds) {
  const items = helds.map((held, i) =>
    itemRow({
      provider_id: `drive-file-${i + 1}`,
      kind: held.mime.startsWith("video/") ? "video" : "image",
      modified_at: `2026-11-16T10:00:0${9 - i}.000Z`,
    }),
  );
  const drive = Object.fromEntries(
    items.map((item, i) => [item.provider_id, { ...helds[i], bytes: helds[i].bytes ?? bytesOf(MIB, i + 1) }]),
  );
  return { items, drive };
}

/** What a workspace already took today: items in, each counted in its day. */
const takenToday = (count, bytes, tenantId = T) =>
  Array.from({ length: count }, () => itemRow({ tenant_id: tenantId, state: "in", taken_at: TODAY, bytes }));

const waitsLine = (lines) => lines.findLast((l) => l.event === "source_take_waits");

test("a workspace's takes for the day bind: the files wait for tomorrow, the line says so, and tomorrow they come in", async () => {
  const { items, drive } = waiting([PHOTO, CLIP, CLIP]);
  const w = world({ items: [...takenToday(TAKE_BUDGETS.workspaceTakesADay, 1_000), ...items] });
  theSync({ drive });
  const web = theWeb({ drive });
  const { result: ends, lines } = await linesOf(() => runTakes(w));
  assert.deepEqual(ends, [{ took: "waits:budget" }, { took: "waits:budget" }, { took: "waits:budget" }]);
  for (const item of items) {
    const row = w.item(item.id);
    assert.deepEqual([row.state, row.why], ["waiting", "budget"]);
    assert.equal(row.take_after, "2026-11-18T08:00:00.000Z", "until Google's day ends: midnight in Pacific time");
  }
  const said = waitsLine(lines);
  assert.deepEqual(
    [said.binds, said.waiting, said.line],
    ["workspace_takes", 3, "3 photos and videos wait for tomorrow."],
  );
  assert.equal(
    web.calls.filter((c) => c.url.includes("alt=media")).length,
    2,
    "each clip's first MiB, and no photo's bytes",
  );
  assert.equal(web.copies.length, 0, "the video platform is never asked");
  assert.equal(w.tables.files.length, 0);

  // The same evening the clock hands them nothing; once Google's day turns, they come in by themselves.
  assert.deepEqual(await runTakes(w), []);
  w.nowMs = Date.parse("2026-11-18T08:00:01Z");
  assert.deepEqual(await runTakes(w), [{ took: "in" }, { took: "asked" }, { took: "asked" }]);
  assert.equal(web.copies.length, 2);
});

test("a workspace's bytes for the day bind a clip that does not fit what is left of it", async () => {
  const { items, drive } = waiting([CLIP, PHOTO]);
  const w = world({ items: [...takenToday(1, TAKE_BUDGETS.workspaceBytesADay - 200_000_000), ...items] });
  theSync({ drive });
  const web = theWeb({ drive });
  const { result: ends, lines } = await linesOf(() => runTakes(w));
  // 255 MB does not fit the 200 MB left of the day. The photo was handed its job in the same turn, and fits.
  assert.deepEqual(ends, [{ took: "waits:budget" }, { took: "in" }]);
  assert.equal(waitsLine(lines).binds, "workspace_bytes");
  assert.deepEqual([w.item(items[0].id).state, w.item(items[0].id).why], ["waiting", "budget"]);
  assert.equal(web.copies.length, 0);
});

test("the platform's bytes for the day bind every workspace, and its units stop the takes well before Google's own", async () => {
  for (const [spent, binds] of [
    [{ bytes: TAKE_BUDGETS.platformBytesADay - 100_000_000, takes: 9_000, units: 0 }, "platform_bytes"],
    [{ bytes: 0, takes: 0, units: TAKE_BUDGETS.unitsADay - 100 }, "units"],
  ]) {
    const { items, drive } = waiting([CLIP]);
    const w = world({ items });
    w.tables.source_days.push({ day: "2026-11-17", ...spent });
    theSync({ drive });
    const web = theWeb({ drive });
    const { result: ends, lines } = await linesOf(() => runTakes(w));
    assert.deepEqual(ends, [{ took: "waits:budget" }], binds);
    assert.deepEqual([waitsLine(lines).binds, waitsLine(lines).line], [binds, "1 file waits for tomorrow."]);
    assert.equal(web.copies.length, 0);
    assert.equal(w.tables.source_days[0].bytes, spent.bytes, "a take that waits spends no bytes");
  }
});

test("one business's day never binds another's", async () => {
  const mine = waiting([CLIP]);
  const theirs = itemRow({ tenant_id: T2, provider_id: "drive-file-9", source_id: null });
  const w = world({
    tenants: [T, T2],
    items: [...takenToday(TAKE_BUDGETS.workspaceTakesADay, 1_000), ...mine.items, theirs],
  });
  theirs.source_id = w.tables.media_sources[1].id;
  const drive = { ...mine.drive, [theirs.provider_id]: { ...CLIP, bytes: bytesOf(MIB, 7) } };
  theSync({ drive });
  theWeb({ drive });
  await runTakes(w);
  assert.deepEqual([w.item(mine.items[0].id).state, w.item(mine.items[0].id).why], ["waiting", "budget"]);
  assert.equal(w.item(theirs.id).state, "taking", "the other workspace's clip is on its way");
  assert.equal(w.tables.files.filter((f) => f.tenant_id === T2).length, 1);
});

test("the videos are full: a clip waits for room on its own row, a photo still comes in, and nothing is fetched", async () => {
  const uploads = {
    id: "ffffffff-0000-4000-8000-000000000009",
    tenant_id: T,
    kind: "video",
    source: "upload",
    fingerprint: "an-upload",
    media_ref: "9".repeat(32),
    media_status: "ready",
    seconds: 3_590,
    removed_at: null,
  };
  const { items, drive } = waiting([CLIP, CLIP, PHOTO]);
  const w = world({ items, files: [uploads] });
  theSync({ drive });
  const web = theWeb({ drive });
  const { result: ends, lines } = await linesOf(() => runTakes(w));
  assert.deepEqual(ends, [{ took: "waits:room" }, { took: "waits:room" }, { took: "in" }]);
  const said = waitsLine(lines);
  assert.equal(said.line, "Your videos are full: 60 minutes at most. 2 clips wait until there is room.");
  assert.ok(!/delete/i.test(said.line), "never 'Delete one' about a clip its owner did not add");
  assert.equal(web.copies.length, 0, "room is judged before the video platform is asked");
  assert.equal(w.tables.source_days[0].bytes, PHOTO.bytes.length, "and before the day's bytes are spent");
  const hours = (Date.parse(w.item(items[0].id).take_after) - Date.now()) / 3_600_000;
  assert.ok(hours > 5.9 && hours <= 6, "asked after again in six hours");

  // A 10-second clip fits the ten seconds left: the same door lets it in.
  const short = waiting([{ ...CLIP, seconds: 10 }]);
  const w2 = world({ items: short.items, files: [uploads] });
  theSync({ drive: short.drive });
  theWeb({ drive: short.drive });
  assert.deepEqual(await runTakes(w2), [{ took: "asked" }]);
});

test("the Library is full: a file waits, its bytes are not kept, and the line says what is full", async () => {
  const full = Array.from({ length: 1_000 }, (_, i) => ({
    id: `f${i}`,
    tenant_id: T,
    kind: "image",
    source: "upload",
    fingerprint: `print-${i}`,
    removed_at: null,
  }));
  const { items, drive } = waiting([PHOTO, CLIP]);
  const w = world({ items, files: full });
  theSync({ drive });
  const web = theWeb({ drive });
  const { result: ends, lines } = await linesOf(() => runTakes(w));
  assert.deepEqual(ends, [{ took: "waits:library_full" }, { took: "waits:library_full" }]);
  assert.equal(
    waitsLine(lines).line,
    "Your Library is full: 1,000 files at most. 2 photos and videos wait until there is room.",
  );
  assert.deepEqual(
    w.bucket.removed.length,
    w.bucket.uploaded.length,
    "what was stored for the photo is taken back out",
  );
  assert.equal(web.copies.length, 0);
  assert.equal(w.tables.files.length, 1_000);
});

test("a workspace that takes no videos yet keeps its clips waiting and its photos coming", async () => {
  const { items, drive } = waiting([CLIP, PHOTO]);
  const w = world({ items, takesVideos: false });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "waits:videos_off" }, { took: "in" }]);
  assert.equal(web.calls.filter((c) => c.url.includes("alt=media")).length, 1, "only the photo's bytes are read");
});

test("the folder's line says what waits in the owner's words, and nothing for a wait that ends by itself", () => {
  assert.equal(takeWaitLine({ why: "budget", count: 40, videosOnly: true }), "40 clips wait for tomorrow.");
  assert.equal(takeWaitLine({ why: "budget", count: 1, videosOnly: true }), "1 clip waits for tomorrow.");
  assert.equal(
    takeWaitLine({ why: "budget", count: 1_200, videosOnly: false }),
    "1,200 photos and videos wait for tomorrow.",
  );
  for (const why of ["folder", "pace", "deadline", "retry", "videos_off"])
    assert.equal(takeWaitLine({ why, count: 3, videosOnly: false }), null, why);
  assert.equal(takeWaitLine({ why: "budget", count: 0, videosOnly: false }), null);
});
