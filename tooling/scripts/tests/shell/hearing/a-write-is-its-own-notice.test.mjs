/**
 * A write is its own notice (decision 0058; the wiring's second audit, lane R7, stage A): the surfaces a write re-reads, derived from
 * what it changes, against the rows of the refresh map written by hand.
 *
 * The refresh map (refresh-map.ts AFTER) is a hundred and more lists kept by hand, and three findings were lists that had fallen
 * behind what their write changes (W-visit-deal-4, W-review-facts-rules-9, S10-6). What a write changes is the tracer's to say
 * (trace-routes.mjs), and what a change reads is the runner's own router's (wantsRefresh, as the feed's notice of it is judged): so
 * what a write's own notice would read on each page can be derived (_write-reach.mjs), and set beside the row.
 *
 *  1. What each write changes: the tables its own code writes, with the events each makes, less the machinery's. A narrowed table's
 *     update (packages/db realtime.ts narrowedUpdates: the feed tells it only when a column a page draws moved) is a tell unless it is
 *     listed below as a stamp, with why: the tracer sees no columns. What its edge doors may change beside it is kept apart, since a
 *     door serves every action of its feature and its whole file is the most a write may do through it.
 *  2. What its own notice would read, on every family of addresses (PAGE_HEARS, asked where page-hears.test.mjs asks): the surfaces the
 *     router reads for each change it makes, and the surfaces that read a table it changes that no notice tells them of, where the page
 *     draws them.
 *  3. The golden, baselines/writes/reach.json: for each row, what it changes and where the row and the derivation differ: a surface
 *     the row names and no change reaches (`extra`), one only the write's edge doors may change (`door`), one a change reaches that the
 *     row does not name (`missing`: the feed's notice reads it there, a moment later), each with the families it differs on. A change to
 *     a row, to what a write changes or to what a surface hears is a change to the golden, read in review. UPDATE_HEARING=1 writes it.
 *     Stage B holds the trace to what production's requests touched and sets a sample of real writes beside their rows
 *     (tooling/scripts/ops/write-shadow.mjs); stage C replaces rows, cluster by cluster, where the golden's difference is explained,
 *     and keeps the hand rows and this derivation as their test where it is not.
 *  4. The write path's own rule (S10-6): a surface a row reads where it is drawn (drawnHere) is read on every page that draws it, and
 *     left for those pages from every other, read once by the first of them to come on screen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, importSrc } from "../../_source.mjs";
import { BASELINES_DIR } from "../../_ratchet.mjs";
import { at, writeReach } from "./_write-reach.mjs";

const reach = await writeReach();
const { AFTER, PAGE_HEARS, routes, narrowed, surfaces, families, askedAt, drawsTheScreen } = reach;
const { drawnHere, readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 1. What a write changes                                                                                                  *
 * ------------------------------------------------------------------------------------------------------------------------ */

/**
 * The updates of a narrowed table a write makes that move no column the feed is told for (`write -> table`), each with why: the
 * tracer sees the table, never the columns. An update not listed is a tell. May only name an update the write makes.
 */
const STAMPS = {};

const changesOf = (write) => reach.changesOf(write, STAMPS);

test("every write of the refresh map is one the trace follows", () => {
  const lost = Object.keys(AFTER).filter((write) => !routes[write]);
  assert.deepEqual(lost, [], "a row the trace does not know: a route that moved, or a key that is not one");
});

test("a stamp listed is an update of a narrowed table its write makes, and says why it moves nothing a page draws", () => {
  for (const [pair, why] of Object.entries(STAMPS)) {
    const [write, table] = pair.split(" -> ");
    assert.ok(write in AFTER, `${pair}: no row of the refresh map`);
    assert.ok(table in narrowed, `${pair}: ${table}'s updates are told whole, so none is a stamp`);
    assert.ok(routes[write]?.verbs[table]?.includes("UPDATE"), `${pair}: the write makes no update of ${table}`);
    assert.ok(why.trim().length >= 60, `${pair}: say why in a sentence`);
  }
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 2 and 3. What its own notice would read, against its row: the golden                                                     *
 * ------------------------------------------------------------------------------------------------------------------------ */

/** The families as a review reads them: every page, or the ones named. */
const familiesLine = (list) => (list.length === families.length ? "every page" : [...list].sort().join(", "));

/** Each key a map holds, sorted, with the families it was met on as one line; those `keep` keeps. */
const linesOf = (map, keep) =>
  Object.fromEntries(
    [...map]
      .filter(([key]) => keep(key))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, list]) => [key, familiesLine(list)]),
  );

/** A row's entry in the golden: what its write changes, and where the row and the derivation differ. */
function entryOf(write) {
  const changes = changesOf(write);
  const doors = reach.doorTablesOf(write);
  const extra = new Map();
  const missing = new Map();
  const note = (map, key, family) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(family);
  };
  for (const family of families) {
    const route = askedAt(family);
    const hand = reach.handOn(write, route);
    const derived = reach.derivedOn(changes, route);
    for (const key of hand) if (!derived.has(key)) note(extra, key, family);
    for (const key of derived) if (!hand.has(key)) note(missing, key, family);
  }
  /** A surface the row names that reads a table only the write's doors may change. */
  const byDoor = (key) => [...(surfaces.find((s) => s.key === key)?.tables.keys() ?? [])].some((t) => doors.has(t));
  const entry = {
    changes: Object.entries(changes)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([table, events]) => `${table} ${[...events].sort().join(" ")}`)
      .join(" · "),
  };
  const tells = Object.keys(changes).filter((t) => t in narrowed && changes[t].includes("UPDATE"));
  if (tells.length) entry.tells = tells.sort().join(" · ");
  if (doors.size) entry.doors = [...doors].sort().join(" · ");
  const ex = linesOf(extra, (key) => !byDoor(key));
  const door = linesOf(extra, byDoor);
  const miss = linesOf(missing, () => true);
  if (Object.keys(ex).length) entry.extra = ex;
  if (Object.keys(door).length) entry.door = door;
  if (Object.keys(miss).length) entry.missing = miss;
  return entry;
}

const WRITE = process.env.UPDATE_HEARING === "1";
const GOLDEN = path.join(ROOT, BASELINES_DIR, "writes", "reach.json");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** The golden as the code says it now: every row, and how many differ from their derivation. */
function goldenNow() {
  const writes = {};
  for (const write of Object.keys(AFTER).sort()) writes[write] = entryOf(write);
  at("today");
  const differ = Object.values(writes).filter((e) => e.extra || e.door || e.missing).length;
  return { rows: Object.keys(writes).length, same: Object.keys(writes).length - differ, differ, writes };
}

const now = goldenNow();
if (WRITE) {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, json(now));
}

test("what each row of the refresh map re-reads, against what its write's own notice would read on every page, is the golden", () => {
  assert.ok(fs.existsSync(GOLDEN), `${path.relative(ROOT, GOLDEN)} is missing: UPDATE_HEARING=1 writes it`);
  const kept = fs.readFileSync(GOLDEN, "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    kept,
    json(now),
    "a row, what a write changes or what a surface hears changed: run UPDATE_HEARING=1 and read the difference in baselines/writes/reach.json (each row's extra, door and missing, by family), then keep it",
  );
});

test("the derivation is not empty: every row is compared, and most writes change a table the trace sees", () => {
  assert.equal(now.rows, Object.keys(AFTER).length);
  const changing = Object.values(now.writes).filter((e) => e.changes).length;
  assert.ok(changing > now.rows / 2, `${changing} of ${now.rows} rows change a table the trace sees`);
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 4. The write path's own rule                                                                                             *
 * ------------------------------------------------------------------------------------------------------------------------ */

/** The surfaces the map reads where they are drawn and leaves for those pages elsewhere (refresh-map.ts, drawnHere). */
const LEFT_WHERE_NOT_DRAWN = ["playbooks", "broadcasts", "calendar", "calendar_runs", "setup"];

test("a surface a write leaves where it is not drawn is read once, on the first page that draws it, and on no page that does not (drawnHere, S10-6)", () => {
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  for (const key of LEFT_WHERE_NOT_DRAWN) {
    const s = surfaces.find((x) => x.key === key);
    assert.ok(s, `${key} is a surface the shell registers`);
    const drawing = families.filter((f) => drawsTheScreen(key, askedAt(f)));
    const elsewhere = families.filter((f) => !drawing.includes(f));
    assert.ok(drawing.length > 0 && elsewhere.length > 0, `${key} is drawn somewhere, and not everywhere`);
    for (const family of drawing) {
      at(askedAt(family));
      assert.deepEqual(drawnHere([s.override]), [s.override], `${key} is read at once on ${family}, which draws it`);
    }
    for (const from of elsewhere) {
      const read = [];
      const stop = readWhatWasMissed([{ key }], (k) => read.push(...k), win);
      try {
        at(askedAt(from));
        assert.deepEqual(drawnHere([s.override]), [], `${key} is not read from ${from}`);
        for (const other of elsewhere) {
          at(askedAt(other));
          win.on?.();
        }
        assert.deepEqual(read, [], `${key}, left from ${from}: read on no page that does not draw it`);
        at(askedAt(drawing[0]));
        win.on?.();
        assert.deepEqual(read, [key], `${key}, left from ${from}: read as ${drawing[0]} comes on screen`);
        at(askedAt(drawing[drawing.length - 1]));
        win.on?.();
        assert.deepEqual(read, [key], `${key}, left from ${from}: once`);
      } finally {
        stop();
      }
    }
  }
  at("today");
});

test("Today draws the composers and owns neither, so a write made there reads them, where a keep for their own page would not", () => {
  const today = askedAt("today");
  for (const key of ["playbooks", "broadcasts"]) {
    assert.equal(drawsTheScreen(key, today), true, `Today draws ${key}`);
    assert.equal(PAGE_HEARS.today[key], undefined, `and owns no part of ${key}`);
  }
});
