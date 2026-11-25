/**
 * A load on a device that holds a page's rows reads only what changed (bridge/hearing/kept.ts; 25 Nov 2026).
 *
 * Every load read every page's rows again once the page on screen was drawn: 240 of the 264 database calls behind a load
 * of People, on the nightly's own stack. The device already holds a copy of each surface, and the database keeps what its
 * topic told (GET changes): the boot asks once what was told since the oldest copy, and reads only the surfaces told of.
 * A copy stands only where an open tab's read would: a surface the feed tells of, read on the business's own today, still
 * inside what the surface says it is good for, and judged by an answer that says every notice.
 *
 * Run over the rule itself, with surfaces, copies and notices of the test's own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { keptUnchanged } = await import(at("apps/dashboard/src/bridge/hearing/kept.ts"));

const NOON = Date.parse("2026-11-24T17:00:00Z");
const MIN = 60_000;
const TENANT = "11111111-1111-4111-8111-111111111111";

/** A surface the feed tells of, by the tables it hears. */
const surface = (key, tables, over = {}) => ({
  key,
  fresh: "live",
  refreshOnTables: tables,
  apply: async () => {},
  ...over,
});
const inbox = surface("inbox", ["messages", "conversations"]);
const calendar = surface("calendar", ["appointments"]);
const people = surface("clients", ["contacts", "appointments"], { fresh: "its-page" });

/** What the boot asks with: copies read `ago` minutes back, a feed that answers `notices`, a clock at noon in New York. */
function asking({ kept = {}, notices = [], zone = "America/New_York", catchUp } = {}) {
  const asked = [];
  return {
    asked,
    ask: {
      catchUp:
        catchUp === undefined
          ? async (since) => {
              asked.push(since);
              return notices;
            }
          : catchUp,
      keptAt: (o) => (o.key in kept ? NOON - kept[o.key] * MIN : null),
      dayAt: (ms) =>
        zone ? new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "short" }).format(new Date(ms)) : null,
      serversClockOf: (ms) => ms - 250,
      tenant: () => TENANT,
      now: NOON,
    },
  };
}
const notice = (table, minutesAgo, over = {}) => ({
  table,
  event: "UPDATE",
  statuses: null,
  at: new Date(NOON - minutesAgo * MIN).toISOString(),
  ...over,
});
const keys = (copies) => copies.map((copy) => copy.surface.key).sort();

test("with nothing told since their copies were read, none of the surfaces the device holds is read again", async () => {
  const a = asking({ kept: { inbox: 5, calendar: 90, clients: 30 } });
  const unchanged = await keptUnchanged([inbox, calendar, people], a.ask);
  assert.deepEqual(keys(unchanged), ["calendar", "clients", "inbox"]);
  assert.deepEqual(a.asked, [NOON - 90 * MIN], "the feed's record asked once, since the oldest copy");
  assert.equal(
    unchanged.find((c) => c.surface.key === "calendar").at,
    NOON - 90 * MIN,
    "each dated when its copy was read",
  );
});

test("a surface told of since its copy was read is read; one whose copy is newer than the notice is not", async () => {
  // A visit changed forty minutes ago: the Calendar's copy is from before it, People's from after.
  const a = asking({ kept: { inbox: 5, calendar: 90, clients: 30 }, notices: [notice("appointments", 40)] });
  assert.deepEqual(keys(await keptUnchanged([inbox, calendar, people], a.ask)), ["clients", "inbox"]);
  // A message that came a minute ago: the Inbox alone hears it.
  const came = notice("messages", 1, { event: "INSERT" });
  const b = asking({ kept: { inbox: 5, calendar: 90, clients: 30 }, notices: [came] });
  assert.deepEqual(keys(await keptUnchanged([inbox, calendar, people], b.ask)), ["calendar", "clients"]);
});

test("a notice is judged as the surface's own rule judges a live one, and one with no clock is not judged at all", async () => {
  const delivered = surface("inbox", ["messages"], { refreshOnMessageStatuses: ["failed"] });
  const tick = notice("messages", 1, { statuses: ["delivered"] });
  assert.deepEqual(keys(await keptUnchanged([delivered], asking({ kept: { inbox: 5 }, notices: [tick] }).ask)), [
    "inbox",
  ]);
  const failed = notice("messages", 1, { statuses: ["delivered", "failed"] });
  assert.deepEqual(keys(await keptUnchanged([delivered], asking({ kept: { inbox: 5 }, notices: [failed] }).ask)), []);
  const unclocked = { table: "appointments", event: "UPDATE", statuses: null, at: null };
  assert.deepEqual(
    keys(await keptUnchanged([calendar], asking({ kept: { calendar: 5 }, notices: [unclocked] }).ask)),
    [],
    "no clock to judge it by: read again",
  );
});

test("where the feed's record cannot say every notice, or cannot be asked, everything is read as before", async () => {
  const kept = { inbox: 5, calendar: 90 };
  assert.deepEqual(await keptUnchanged([inbox, calendar], asking({ kept, catchUp: async () => null }).ask), []);
  const failing = async () => {
    throw new Error("the server did not answer");
  };
  assert.deepEqual(await keptUnchanged([inbox, calendar], asking({ kept, catchUp: failing }).ask), []);
  assert.deepEqual(
    await keptUnchanged([inbox, calendar], asking({ kept, catchUp: null }).ask),
    [],
    "a runner given none",
  );
});

test("a copy stands only where an open tab's read would", async () => {
  // Nothing kept: a first load reads it.
  const none = asking({ kept: {} });
  assert.deepEqual(await keptUnchanged([inbox], none.ask), []);
  assert.deepEqual(none.asked, [], "and the feed's record is not asked for nothing");
  // A surface the feed tells nothing: read at the boot, its only word of a change made elsewhere.
  const ownChange = surface("views", [], { fresh: "own-change", refreshOnTables: undefined });
  const aged = surface("activity", ["events"], { fresh: { aged: 5 } });
  assert.deepEqual(await keptUnchanged([ownChange, aged], asking({ kept: { views: 1, activity: 1 } }).ask), []);
  // A copy from the business's yesterday: what counts the day so far is read again at the day's turn. Noon in New York
  // is 17:00Z, so a copy read thirteen hours ago is yesterday's there.
  assert.deepEqual(await keptUnchanged([calendar], asking({ kept: { calendar: 13 * 60 } }).ask), []);
  assert.deepEqual(keys(await keptUnchanged([calendar], asking({ kept: { calendar: 11 * 60 } }).ask)), ["calendar"]);
  // The zone not known yet: no day to judge by.
  assert.deepEqual(await keptUnchanged([calendar], asking({ kept: { calendar: 5 }, zone: null }).ask), []);
  // Past what the surface itself says a read is good for.
  const feed = surface("calendar", ["appointments"], { readEveryMs: 10 * MIN });
  assert.deepEqual(await keptUnchanged([feed], asking({ kept: { calendar: 11 } }).ask), []);
  assert.deepEqual(keys(await keptUnchanged([feed], asking({ kept: { calendar: 9 } }).ask)), ["calendar"]);
  const expired = surface("clients", ["contacts"], { validUntil: () => NOON - 1 });
  assert.deepEqual(await keptUnchanged([expired], asking({ kept: { clients: 5 } }).ask), []);
  // A copy dated ahead of this clock is no copy to trust.
  assert.deepEqual(await keptUnchanged([inbox], asking({ kept: { inbox: -5 } }).ask), []);
});
