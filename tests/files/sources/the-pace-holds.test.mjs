/**
 * The read pace's own rules (the footage sources plan, D18), and what a listing says of an item: pure functions, run
 * as they are. The pace is one named setting, and these hold what it means: how a read's finds set the next read, when
 * a signal's read falls due, when a re-walk may agree with a hold, what counts as a wave, and which state a listing
 * gives an item without ever writing over one the taking of a file set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";

const { SOURCE_PACE, agreesWithHold, isChannelDue, isMassGone, nextReadOf, nextWalkOf, signalDueOf, soonestRewalkOf } =
  await import(at("apps/edge/lib/files/sources/pace.ts"));
const { planPage } = await import(at("apps/edge/lib/files/sources/items.ts"));

const NOW = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("the pace is the plan's starting values, in one place", () => {
  assert.deepEqual(
    {
      gap: SOURCE_PACE.readGapMs / MIN,
      busyGap: SOURCE_PACE.busyGapMs / MIN,
      floor: SOURCE_PACE.floorMs / HOUR,
      quietFloor: SOURCE_PACE.quietFloorMs / HOUR,
      quietAfter: SOURCE_PACE.quietAfterMs / DAY,
      rewalk: SOURCE_PACE.rewalkMs / DAY,
      quietRewalk: SOURCE_PACE.quietRewalkMs / DAY,
      channelRenew: SOURCE_PACE.channelRenewBeforeMs / DAY,
      hold: [SOURCE_PACE.holdItems, SOURCE_PACE.holdShare],
      firstWatch: [SOURCE_PACE.firstWatchDays, SOURCE_PACE.firstWatchItems],
      itemsMax: SOURCE_PACE.itemsMax,
    },
    {
      gap: 5,
      busyGap: 30,
      floor: 1,
      quietFloor: 6,
      quietAfter: 7,
      rewalk: 1,
      quietRewalk: 7,
      channelRenew: 2,
      hold: [20, 0.1],
      firstWatch: [30, 50],
      itemsMax: 50_000,
    },
    "D18: at most one read in 5 minutes, 30 for a Drive busy elsewhere; a floor each hour, 6 for a quiet folder; a re-walk daily or weekly. D11 and D15 beside it",
  );
});

test("a read sets the next: the floor after it, one gap on when a signal came while it ran", () => {
  const standing = { busyReads: 0, lastChangeAt: iso(NOW - HOUR) };
  const nothing = { changes: 0, inside: 0, signalled: false };
  assert.equal(nextReadOf(standing, nothing, NOW).nextReadAt, iso(NOW + HOUR), "the hour's floor");
  assert.equal(nextReadOf(standing, { ...nothing, signalled: true }, NOW).nextReadAt, iso(NOW + 5 * MIN));
  const quiet = { busyReads: 0, lastChangeAt: iso(NOW - 8 * DAY) };
  assert.equal(nextReadOf(quiet, nothing, NOW).nextReadAt, iso(NOW + 6 * HOUR), "a quiet folder's floor");
  assert.equal(nextReadOf({ busyReads: 0, lastChangeAt: null }, nothing, NOW).nextReadAt, iso(NOW + 6 * HOUR));
  // Something inside changed: the folder is live from now, whatever it was.
  const live = nextReadOf(quiet, { changes: 3, inside: 1, signalled: false }, NOW);
  assert.deepEqual([live.lastChangeAt, live.nextReadAt, live.busyReads], [iso(NOW), iso(NOW + HOUR), 0]);
});

test("reads that keep finding changes elsewhere and none inside lengthen the gap; one change inside ends it", () => {
  let standing = { busyReads: 0, lastChangeAt: iso(NOW - HOUR) };
  const elsewhere = { changes: 40, inside: 0, signalled: true };
  const gaps = [];
  for (let n = 0; n < 4; n++) {
    const next = nextReadOf(standing, elsewhere, NOW);
    gaps.push(next.readGapSeconds);
    standing = { busyReads: next.busyReads, lastChangeAt: next.lastChangeAt };
  }
  assert.deepEqual(gaps, [300, 300, 1800, 1800], "the third such read in a row makes the account busy elsewhere");
  assert.equal(
    nextReadOf(standing, elsewhere, NOW).nextReadAt,
    iso(NOW + 30 * MIN),
    "a signal then waits thirty minutes",
  );
  // A read with nothing in the list at all neither adds to the count nor ends it.
  assert.equal(nextReadOf(standing, { changes: 0, inside: 0, signalled: false }, NOW).busyReads, standing.busyReads);
  const ended = nextReadOf(standing, { changes: 40, inside: 2, signalled: true }, NOW);
  assert.deepEqual([ended.busyReads, ended.readGapSeconds], [0, 300]);
});

test("a signal's read falls due now, or one gap after the folder's last read, whichever is later", () => {
  assert.equal(signalDueOf(null, 300, NOW).getTime(), NOW, "never read: now");
  assert.equal(signalDueOf(iso(NOW - HOUR), 300, NOW).getTime(), NOW, "read long ago: now");
  assert.equal(signalDueOf(iso(NOW - MIN), 300, NOW).getTime(), NOW + 4 * MIN, "read a minute ago: four minutes on");
  assert.equal(signalDueOf(iso(NOW - MIN), 1800, NOW).getTime(), NOW + 29 * MIN, "a busy account's gap is its own");
  assert.equal(signalDueOf(iso(NOW - MIN), null, NOW).getTime(), NOW + 4 * MIN, "no gap on the row: the pace's");
});

test("a folder is walked again in a day where something inside changed within the week, else in a week", () => {
  assert.equal(nextWalkOf(iso(NOW - 2 * DAY), NOW), iso(NOW + DAY));
  assert.equal(nextWalkOf(iso(NOW - 8 * DAY), NOW), iso(NOW + 7 * DAY));
  assert.equal(nextWalkOf(null, NOW), iso(NOW + 7 * DAY));
  assert.equal(nextWalkOf(iso(NOW - 6 * DAY), NOW), iso(NOW + DAY), "six days quiet is not yet a quiet folder");
});

test("a tree's routine re-walk is held to about 2,400 units a day: a large tree is walked less often, thirty days at most", () => {
  const lively = iso(NOW - HOUR);
  const daysOn = (units, changed = lively) => (Date.parse(nextWalkOf(changed, NOW, units)) - NOW) / DAY;
  assert.deepEqual([SOURCE_PACE.rewalkUnitsADay, SOURCE_PACE.rewalkLongestMs / DAY], [2400, 30]);
  assert.equal(daysOn(2105), 1, "a footage folder of 21 folders: still daily");
  assert.ok(Math.abs(daysOn(14_205) - 5.92) < 0.01, "a shared drive whose walk spent 14,205 units: every six days");
  assert.equal(daysOn(170_000), 30, "a tree of 1,700 folders outside a shared drive: every thirty days, never more");
  assert.equal(daysOn(2105, null), 7, "a quiet folder keeps its week");
  assert.equal(daysOn(48_000, null), 20, "and a quiet large one waits what its walk spent");
  assert.equal(daysOn(0), 1, "a walk that spent nothing changes nothing");

  // A folder that just changed is walked a day on, and never sooner after its last whole walk than that walk allows.
  assert.equal(soonestRewalkOf(iso(NOW - HOUR), 2105, NOW), NOW + DAY);
  assert.equal(soonestRewalkOf(iso(NOW - 2 * DAY), 170_000, NOW), NOW + 28 * DAY);
  assert.equal(soonestRewalkOf(null, 170_000, NOW), NOW + DAY, "one never walked whole has nothing to wait out");
});

test("a channel is due when none is kept or the one kept ends within two days", () => {
  assert.equal(isChannelDue(null, NOW), true);
  assert.equal(isChannelDue(iso(NOW + 5 * DAY), NOW), false);
  assert.equal(isChannelDue(iso(NOW + 2 * DAY - MIN), NOW), true);
  assert.equal(isChannelDue(iso(NOW - HOUR), NOW), true, "one that already ended");
});

test("a wave is more than twenty items or more than a tenth of the folder, and never fewer than five", () => {
  assert.equal(isMassGone(21, 10_000), true, "more than twenty, in any folder");
  assert.equal(isMassGone(20, 10_000), false);
  assert.equal(isMassGone(6, 50), true, "more than a tenth of a small folder");
  assert.equal(isMassGone(5, 50), false, "a tenth exactly is not more than a tenth");
  assert.equal(isMassGone(4, 5), false, "under the least: four files gone from five is no wave");
  assert.equal(isMassGone(1, 3), false);
});

test("a re-walk agrees with a hold only when it began a day or more after the hold was written", () => {
  const holdAt = iso(NOW);
  assert.equal(agreesWithHold(holdAt, iso(NOW + DAY)), true);
  assert.equal(agreesWithHold(holdAt, iso(NOW + DAY - MIN)), false, "a walk already due when the hold came does not");
  assert.equal(agreesWithHold(holdAt, iso(NOW - HOUR)), false, "nor the walk that wrote it");
  assert.equal(agreesWithHold(null, iso(NOW)), false);
  assert.equal(agreesWithHold(holdAt, null), false);
});

/* ---------------------------------------------------------------------------------------- what a listing says -- */

const item = (over = {}) => ({
  id: "item-1",
  kind: "video",
  parentId: "folder-root",
  name: "clip.MOV",
  mime: "video/quicktime",
  modifiedAt: iso(NOW),
  createdAt: iso(NOW - HOUR),
  checksum: "abc",
  bytes: 50_000_000,
  seconds: 30,
  addedBy: null,
  trashed: false,
  ...over,
});

const REF = { tenantId: "11111111-1111-4111-8111-111111111111", sourceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
/** What a listing says of an item seen for the first time: the state its row is written with, and why. */
const freshStateOf = (seen, wanted) => {
  const [insert] = planPage(REF, [seen], [], wanted).inserts;
  return { state: insert.state, why: insert.why };
};

test("a listing says what an item is: a folder, something passed over, too big with which cap, listed or waiting", () => {
  assert.deepEqual(freshStateOf(item({ kind: "folder" }), true), { state: "listed", why: null });
  assert.deepEqual(freshStateOf(item({ kind: "other" }), true), { state: "not_media", why: null });
  assert.deepEqual(freshStateOf(item(), false), { state: "listed", why: null });
  assert.deepEqual(freshStateOf(item(), true), { state: "waiting", why: null });
  assert.deepEqual(freshStateOf(item({ bytes: 500_000_001 }), true), { state: "too_big", why: "bytes" });
  assert.deepEqual(freshStateOf(item({ bytes: 500_000_000, seconds: 600 }), true), { state: "waiting", why: null });
  assert.deepEqual(freshStateOf(item({ seconds: 601 }), true), { state: "too_big", why: "seconds" });
  assert.deepEqual(
    freshStateOf(item({ seconds: null }), true),
    { state: "waiting", why: null },
    "a length Drive has not given yet does not keep a clip out: its taking screens it again",
  );
  assert.deepEqual(freshStateOf(item({ kind: "image", bytes: 25_000_001 }), true), { state: "too_big", why: "bytes" });
  assert.deepEqual(freshStateOf(item({ kind: "image", bytes: 24_000_000, seconds: null }), true), {
    state: "waiting",
    why: null,
  });
});

/** The row of `item()` as the database answers it: its moment written the database's way. */
const row = (over = {}) => ({
  provider_id: "item-1",
  kind: "video",
  parent_id: "folder-root",
  name: "clip.MOV",
  modified_at: iso(NOW).replace(".000Z", "+00:00"),
  state: "listed",
  why: null,
  checksum: "abc",
  bytes: 50_000_000,
  seconds: 30,
  added_by: null,
  length_until: null,
  file_id: null,
  take_tries: 0,
  ...over,
});
const movesOf = (plan) => plan.moves.map((move) => [move.standing.state, move.standing.why, move.providerIds]);

test("a page's plan: new items inserted with their state, known ones' facts kept, and states moved only where they should", () => {
  const fresh = planPage(REF, [item(), item({ id: "folder-2", kind: "folder" })], [], true);
  assert.deepEqual(
    fresh.inserts.map((insert) => [insert.provider_id, insert.state]),
    [
      ["item-1", "waiting"],
      ["folder-2", "listed"],
    ],
  );
  assert.deepEqual(fresh.folders, ["folder-2"], "a folder new to the tree is still to be listed");
  assert.deepEqual([fresh.facts, fresh.moves], [[], []]);

  // Seen again by a walk, unchanged: nothing is written and nothing moves, listed or waiting alike.
  for (const state of ["listed", "waiting"]) {
    const again = planPage(REF, [item()], [row({ state })], false);
    assert.deepEqual([again.inserts.length, again.facts.length, again.moves.length], [0, 0, 0], state);
  }
  // Anything its provider says anew of it is written over what was kept: its name, where it sits, its length.
  for (const change of [{ name: "renamed.MOV" }, { parentId: "folder-2" }, { seconds: 31 }, { addedBy: "Sam" }]) {
    const changed = planPage(REF, [item(change)], [row()], false);
    assert.deepEqual([changed.facts.length, changed.moves.length], [1, 0], JSON.stringify(change));
  }
  // A change found it, but it is the same bytes (a rename): a listed item stays listed.
  assert.deepEqual(movesOf(planPage(REF, [item({ name: "renamed.MOV" })], [row()], true)), []);
  // New bytes are a new file to take in, whoever saw them.
  assert.deepEqual(movesOf(planPage(REF, [item({ checksum: "xyz" })], [row()], false)), [
    ["waiting", null, ["item-1"]],
  ]);
  // The same bytes are the same length: one its provider does not give takes nothing from a row that knows it, so
  // an item the taking measured and found too long stays too long, and nothing is written.
  const tooLong = row({ state: "too_big", why: "seconds", seconds: 900 });
  const unmeasured = planPage(REF, [item({ seconds: null })], [tooLong], false);
  assert.deepEqual([unmeasured.facts, unmeasured.moves], [[], []]);
  // New bytes are a new file: its length is asked anew, and it waits to be taken in.
  const replaced = planPage(REF, [item({ seconds: null, checksum: "xyz" })], [tooLong], false);
  assert.deepEqual(
    [replaced.facts.map((facts) => facts.seconds), movesOf(replaced)],
    [[null], [["waiting", null, ["item-1"]]]],
  );
  // Its length arrived, and it is over the cap.
  assert.deepEqual(movesOf(planPage(REF, [item({ seconds: 900 })], [row({ state: "waiting" })], true)), [
    ["too_big", "seconds", ["item-1"]],
  ]);
});

test("a video listed without its length is waited for a day from its upload, and never judged by the lack", () => {
  const fresh = planPage(REF, [item({ seconds: null })], [], true);
  assert.deepEqual(
    fresh.inserts.map((insert) => [insert.state, insert.length_until]),
    [["waiting", iso(NOW - HOUR + DAY)]],
    "wanted like any other, with the wait kept on its row",
  );
  // Nothing else waits: a video with its length, a photo, a folder, or a record with no upload time.
  for (const other of [
    {},
    { kind: "image", seconds: null },
    { kind: "folder", seconds: null },
    { seconds: null, createdAt: null },
  ])
    assert.equal(planPage(REF, [item(other)], [], true).inserts[0].length_until, null, JSON.stringify(other));
  // Seen again while it waits: nothing is written. Its length arrives: it is kept and the wait is over.
  const waits = row({
    state: "waiting",
    seconds: null,
    length_until: iso(NOW - HOUR + DAY).replace(".000Z", "+00:00"),
  });
  assert.deepEqual(planPage(REF, [item({ seconds: null })], [waits], false).facts, []);
  const arrived = planPage(REF, [item({ seconds: 12 })], [waits], false);
  assert.deepEqual(
    [arrived.facts.map((facts) => [facts.seconds, facts.length_until]), arrived.moves],
    [[[12, null]], []],
  );
  // It arrives over the cap: said too long then, and never before.
  assert.deepEqual(movesOf(planPage(REF, [item({ seconds: 900 })], [waits], false)), [
    ["too_big", "seconds", ["item-1"]],
  ]);
});

test("an item that was away is here again, and one the taking holds keeps its state while its bytes are the ones taken", () => {
  for (const away of ["gone", "outside", "no_access"]) {
    assert.deepEqual(
      movesOf(planPage(REF, [item()], [row({ state: away })], true)),
      [["waiting", null, ["item-1"]]],
      away,
    );
    assert.deepEqual(
      movesOf(planPage(REF, [item()], [row({ state: away })], false)),
      [["listed", null, ["item-1"]]],
      away,
    );
  }
  const back = planPage(
    REF,
    [item({ id: "folder-2", kind: "folder" })],
    [row({ provider_id: "folder-2", kind: "folder", state: "outside" })],
    false,
  );
  assert.deepEqual(back.folders, ["folder-2"], "a folder back in the tree is listed again");

  for (const held of ["taking", "in", "let_go", "failed"]) {
    const same = planPage(REF, [item()], [row({ state: held })], true);
    assert.deepEqual(
      [same.facts, same.places, same.moves, same.retakes, same.letGo],
      [[], [], [], [], []],
      `${held}: where it was, as it was called`,
    );
    const plan = planPage(REF, [item({ name: "renamed.MOV" })], [row({ state: held })], true);
    assert.deepEqual([plan.inserts, plan.facts, plan.moves, plan.retakes], [[], [], [], []], held);
    assert.deepEqual(
      plan.places,
      [
        {
          tenant_id: REF.tenantId,
          source_id: REF.sourceId,
          provider_id: "item-1",
          kind: "video",
          parent_id: "folder-root",
          name: "renamed.MOV",
        },
      ],
      `${held}: only where it sits and its name`,
    );
  }
});

test("new bytes are a new file: an item the taking holds is asked for again, with what its provider says of it now", () => {
  for (const held of ["taking", "in", "let_go", "failed"]) {
    // Seen by a re-walk or by a change, renamed or not: the bytes are what is asked about.
    for (const wanted of [true, false]) {
      const plan = planPage(
        REF,
        [item({ name: "renamed.MOV", checksum: "xyz", bytes: 1, seconds: 12 })],
        [row({ state: held, file_id: "file-1" })],
        wanted,
      );
      assert.deepEqual([plan.inserts, plan.facts, plan.places, plan.moves, plan.letGo], [[], [], [], [], []], held);
      assert.deepEqual(
        plan.retakes.map((facts) => [facts.provider_id, facts.name, facts.checksum, facts.bytes, facts.seconds]),
        [["item-1", "renamed.MOV", "xyz", 1, 12]],
        `${held}: asked for again with the new facts`,
      );
    }
  }
  // The same size under another checksum, or the other way round: either is other bytes.
  assert.equal(planPage(REF, [item({ checksum: "xyz" })], [row({ state: "in" })], false).retakes.length, 1);
  assert.equal(planPage(REF, [item({ bytes: 49_999_999 })], [row({ state: "in" })], false).retakes.length, 1);
  // A folder holds no bytes: one the taking somehow held is never asked for.
  const folder = planPage(
    REF,
    [item({ id: "folder-2", kind: "folder", checksum: null, bytes: null })],
    [row({ provider_id: "folder-2", kind: "folder", state: "in" })],
    false,
  );
  assert.deepEqual(folder.retakes, []);
});

test("a file that was in, left and is seen again is asked for at once, by a re-walk as by a change, and keeps its file", () => {
  for (const away of ["gone", "outside", "no_access"]) {
    for (const wanted of [true, false]) {
      const back = planPage(REF, [item()], [row({ state: away, file_id: "file-1" })], wanted);
      assert.deepEqual(movesOf(back), [["waiting", null, ["item-1"]]], `${away}, wanted ${wanted}`);
      assert.deepEqual([back.letGo, back.retakes], [[], []], "the same bytes: the file it had is still its own");
    }
    // One that holds no file is as before: a re-walk only lists it.
    assert.deepEqual(movesOf(planPage(REF, [item()], [row({ state: away })], false)), [["listed", null, ["item-1"]]]);
    // Back with other bytes: it lets go of the file it held, and waits to be taken as a new one.
    const other = planPage(REF, [item({ checksum: "xyz" })], [row({ state: away, file_id: "file-1" })], false);
    assert.deepEqual([movesOf(other), other.letGo], [[["waiting", null, ["item-1"]]], ["item-1"]], away);
  }
  // One that came back before this was the rule sits listed with its file: the next listing asks for it.
  assert.deepEqual(movesOf(planPage(REF, [item()], [row({ state: "listed", file_id: "file-1" })], false)), [
    ["waiting", null, ["item-1"]],
  ]);
  // Already waiting with its file, and its bytes change before it is taken: no move, and the file is let go of.
  const waiting = planPage(REF, [item({ checksum: "xyz" })], [row({ state: "waiting", file_id: "file-1" })], false);
  assert.deepEqual([movesOf(waiting), waiting.letGo], [[], ["item-1"]]);
  // A folder is never asked for, whatever its row holds.
  const folder = planPage(
    REF,
    [item({ id: "folder-2", kind: "folder", checksum: null, bytes: null })],
    [row({ provider_id: "folder-2", kind: "folder", state: "gone", checksum: null, bytes: null, file_id: "file-1" })],
    false,
  );
  assert.deepEqual(movesOf(folder), [["listed", null, ["folder-2"]]]);
});
