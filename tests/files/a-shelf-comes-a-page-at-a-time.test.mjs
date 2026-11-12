/**
 * Settings › Files reads a page of one shelf and how the whole library stands (decision 0099), run through route() over a database
 * in memory, and the page's two moves over the real read. A workspace at its cap read its whole list, each look with it, on every
 * change: a megabyte for a page that draws a screen of tiles.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/files/route.ts"));
const { fileCursorOf, filesSayOf } = await import(at("packages/contracts/src/files/files.ts"));
const { FILE_SHELVES, filesTallyOf, shelfFilterOf, shelfOf } = await import(
  at("packages/contracts/src/files/views.ts")
);
const { FILE_SHOWS, FILE_SOURCES, FILE_STATUSES, FILES_PAGE } = await import(
  at("packages/contracts/src/files/limits.ts")
);

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const idOf = (n) => `ffffffff-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A file a minute newer than the last, by its number. */
const row = (n, over = {}) => ({
  id: idOf(n),
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: `photo-${n}`,
  mime: "image/jpeg",
  bytes: 1000,
  width: 1200,
  height: 900,
  look: { line: "A shopfront." },
  look_status: "done",
  shows: "storefront",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(),
  updated_at: "2026-11-01T00:00:00Z",
  ...over,
});

const read = async (rows, query = "", role = "owner") => {
  const ctx = {
    supabase: fakeDb(
      {
        files: rows,
        memberships: [
          {
            user_id: USER,
            tenant_id: A,
            role,
            tenants: { slug: "harbor" },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      {},
      {},
    ),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  return route.GET.run(new Request(`http://localhost/api/v1/files?workspace=${A}${query ? `&${query}` : ""}`), ctx);
};
const many = (n, over) => Array.from({ length: n }, (_, i) => row(i + 1, over));

/* ------------------------------------------------------------------------- one rule, two ways round */

test("what a shelf asks the database for is what shelfOf says, over every file there can be", () => {
  const stands = (f, shelf) => {
    const asked = shelfFilterOf(shelf);
    if (f.status !== asked.status) return false;
    if (asked.made === true && f.source !== "made") return false;
    if (asked.made === false && f.source === "made") return false;
    if (!asked.shows) return true;
    return f.shows === null ? asked.orUnsorted === true : asked.shows.includes(f.shows);
  };
  let looked = 0;
  for (const status of FILE_STATUSES)
    for (const source of FILE_SOURCES)
      for (const shows of [...FILE_SHOWS, null])
        for (const shelf of FILE_SHELVES) {
          const f = { status, source, shows };
          // Kept is what the business brought and keeps: what Ask made is a shelf of its own.
          const says = shelf === "all" ? status === "filed" && source !== "made" : shelfOf(f) === shelf;
          assert.equal(stands(f, shelf), says, `${JSON.stringify(f)} on ${shelf}`);
          looked += 1;
        }
  assert.equal(looked, FILE_STATUSES.length * FILE_SOURCES.length * (FILE_SHOWS.length + 1) * FILE_SHELVES.length);
});

test("every kind of thing a file can show stands on a shelf a person can press", () => {
  for (const shows of FILE_SHOWS) assert.ok(FILE_SHELVES.includes(shelfOf({ status: "filed", shows })), shows);
});

/* ------------------------------------------------------------------------- how the library stands */

test("the tally counts every file by what it says of itself, and the page says what is kept (not what Ask made), what waits and what is being looked at", () => {
  const tally = filesTallyOf([
    { status: "filed", shows: "storefront", source: "upload", look_status: "done" },
    { status: "filed", shows: "work", source: "upload", look_status: "waiting" },
    { status: "filed", shows: "graphic", source: "made", look_status: "done" },
    { status: "inbox", shows: "work", source: "website", look_status: "done" },
    { status: "set_aside", shows: "work", source: "upload", look_status: "done" },
  ]);
  assert.deepEqual(tally, {
    total: 5,
    kept: 2,
    videos: 0,
    waiting: 1,
    looking: 1,
    shelves: { place: 1, work: 1, made: 1, inbox: 1, set_aside: 1 },
  });
  assert.equal(filesSayOf(tally), "2 photos, 1 waiting for you, Ask is still looking at 1");
  assert.equal(filesSayOf({ kept: 1, waiting: 0, looking: 0 }), "1 photo");
});

/* ------------------------------------------------------------------------- the route */

test("a read answers a page of the shelf, newest first, and the tally of the whole library, whichever page it holds", async () => {
  const rows = many(FILES_PAGE + 5);
  const said = await read(rows);
  assert.equal(said.shelf, "all", "where it opens");
  assert.equal(said.files.length, FILES_PAGE);
  assert.equal(said.files[0].id, idOf(FILES_PAGE + 5), "newest first");
  assert.equal(said.tally.total, FILES_PAGE + 5, "the tally counts what the page does not hold");
  assert.equal(said.next, fileCursorOf(said.files.at(-1)));
});

test("the next page starts just past the last, and none is read twice or missed, whoever comes in between", async () => {
  const rows = many(FILES_PAGE + 5);
  const first = await read(rows);
  // Kept while a person scrolls: newer than anything on the page they hold, so it moves nothing past them.
  const later = [...rows, row(9_000)];
  const second = await read(later, `before=${encodeURIComponent(first.next)}`);
  assert.equal(second.files.length, 5);
  assert.equal(second.next, null, "the last page says so");
  const seen = [...first.files, ...second.files].map((f) => f.id);
  assert.equal(new Set(seen).size, FILES_PAGE + 5);
  assert.ok(!seen.includes(idOf(9_000)));
});

test("two kept at one instant have an order, so a page can end between them", async () => {
  const sameInstant = "2026-11-01T00:30:00.000Z";
  const rows = [row(1, { created_at: sameInstant }), row(2, { created_at: sameInstant }), row(3)];
  const one = await read(rows, "limit=2");
  assert.equal(one.files.length, 2);
  const two = await read(rows, `limit=2&before=${encodeURIComponent(one.next)}`);
  assert.deepEqual(
    [...one.files, ...two.files].map((f) => f.id).sort(),
    [idOf(1), idOf(2), idOf(3)].sort(),
    "each once",
  );
  assert.equal(two.next, null);
});

test("a page that has scrolled reads what it holds again in one read", async () => {
  const said = await read(many(FILES_PAGE * 2 + 1), `limit=${FILES_PAGE * 2}`);
  assert.equal(said.files.length, FILES_PAGE * 2);
  assert.ok(said.next);
});

test("a shelf holds what stands on it, and only that", async () => {
  const rows = [
    row(1),
    row(2, { shows: "work" }),
    row(3, { shows: null }),
    row(4, { shows: "other" }),
    row(5, { source: "made", shows: "graphic" }),
    row(6, { status: "inbox" }),
    row(7, { status: "set_aside" }),
    row(8, { removed_at: "2026-11-02T00:00:00Z" }),
    row(9, { tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
  ];
  const on = async (shelf) => (await read(rows, `shelf=${shelf}`)).files.map((f) => f.id).sort();
  assert.deepEqual(await on("place"), [idOf(1)]);
  assert.deepEqual(await on("work"), [idOf(2)]);
  assert.deepEqual(await on("other"), [idOf(3), idOf(4)], "one nothing was said of too");
  assert.deepEqual(await on("made"), [idOf(5)]);
  assert.deepEqual(await on("inbox"), [idOf(6)]);
  assert.deepEqual(await on("set_aside"), [idOf(7)]);
  assert.deepEqual(
    await on("all"),
    [idOf(1), idOf(2), idOf(3), idOf(4)],
    "Kept is what the business brought, not what Ask made",
  );
  const { tally } = await read(rows);
  assert.equal(tally.total, 7, "neither a removed file nor another workspace's");
});

test("the Inbox comes whole, since its one press covers all of it", async () => {
  const said = await read(many(FILES_PAGE + 40, { status: "inbox" }), "shelf=inbox");
  assert.equal(said.files.length, FILES_PAGE + 40);
  assert.equal(said.next, null);
});

test("a shelf a change left empty falls back to where the library opens, and says so", async () => {
  const said = await read([row(1)], "shelf=team");
  assert.equal(said.shelf, "all");
  assert.equal(said.files.length, 1);
});

test("what is asked of the library opening depends on who asks: a reader has no Inbox to answer", async () => {
  const rows = [row(1), row(2, { status: "inbox" })];
  assert.equal((await read(rows, "", "owner")).shelf, "inbox");
  assert.equal((await read(rows, "", "viewer")).shelf, "all");
});

test("an empty library says so, and has no next page", async () => {
  const said = await read([]);
  assert.deepEqual(said.files, []);
  assert.equal(said.next, null);
  assert.equal(said.tally.total, 0);
});

test("a cursor this route did not give reads nothing", async () => {
  for (const bad of ["nonsense", "2026-11-01T00:00:00Z", `not-a-date|${idOf(1)}`, `2026-11-01T00:00:00Z|x`, "a|b|c"])
    await assert.rejects(read([row(1)], `before=${encodeURIComponent(bad)}`), (e) => e.code === "validation", bad);
});

test("a shelf no one has, and a limit past the cap, are refused at the door", async () => {
  await assert.rejects(read([row(1)], "shelf=everything"), (e) => e.code === "validation");
  await assert.rejects(read([row(1)], "limit=100000"), (e) => e.code === "validation");
});
