/**
 * An export of any size (decision 0103): the route answers a chunk and where the next begins (server/leads/lead-export.ts
 * exportChunk), and the page asks until none is left and joins them (surfaces/leads/export-walk.ts). Over a fake read and a
 * fake wire: the route's own answer is lead-routes.test.mjs's. Every name here is made up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

const { exportChunk, exportLeads } = await importSrc("apps/dashboard/src/server/leads/lead-export.ts");
const { walkLeadsExport } = await importSrc("apps/dashboard/src/surfaces/leads/export-walk.ts");

const NOTHING_SAID = { progress: () => assert.fail("a file of one chunk says nothing meanwhile") };
const VIEW = { list: "all", sort: "stage", dir: "asc" };
const cursor = (n) => ({ key: `k${n}`, id: `m${n}` });

/** A row of the file, with an About as long as asked, and nothing else held. */
const row = (id, about = "") => ({
  id,
  business_name: `Quix ${id}`,
  category: null,
  street: null,
  city: null,
  state: null,
  phone: null,
  phone_agrees: false,
  phone_wrong: false,
  email: null,
  email_state: "none",
  website: null,
  instagram: null,
  rating: null,
  reviews: null,
  about,
  stage: "ready",
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  found_at: "2026-11-01T00:00:00Z",
  exported_at: null,
  member: { class: "qualified", fit: "strong", reason: "Independent", distance_m: null },
});

/** Pages of 500 rows of about a thousand bytes, `pages` of them in the view; the first says how many it keeps. */
const pagesOf = (pages) => {
  const asked = [];
  const read = async (after) => {
    asked.push(after);
    const at = asked.length;
    return {
      rows: Array.from({ length: 500 }, (_, i) => row(`${at}-${i}`, "x".repeat(1000))),
      next: at < pages ? cursor(at) : null,
      ...(at === 1 ? { view: { matching: pages * 500 } } : {}),
    };
  };
  return { asked, read };
};
const BY_BYTES = { bytes: 1_200_000, ms: 60_000 };

test("a chunk is pages until its text passes the budget, and says where the next begins", async () => {
  const { asked, read } = pagesOf(9);
  const chunk = await exportChunk(read, null, BY_BYTES);
  assert.deepEqual(asked, [null, cursor(1), cursor(2)], "three pages: the third passes 1.2 MB");
  assert.equal(chunk.lines.length, 1500);
  assert.deepEqual(chunk.ids.slice(0, 2), ["1-0", "1-1"]);
  assert.deepEqual(chunk.next, cursor(3), "the third's place");
  assert.equal(chunk.matching, 4500, "how many the view keeps, from its first page");
});

test("a chunk from a place walks on from there, and a view that ends first has no next", async () => {
  const { asked, read } = pagesOf(2);
  const chunk = await exportChunk(read, cursor(7), BY_BYTES);
  assert.deepEqual(asked, [cursor(7), cursor(1)]);
  assert.equal(chunk.next, null);
  assert.equal(chunk.lines.length, 1000);
});

test("a read grown slow stops the chunk early, at a page's end, and the rest is the next chunk's", async () => {
  const { asked, read } = pagesOf(9);
  const chunk = await exportChunk(read, null, { bytes: 1_200_000, ms: 0 });
  assert.equal(asked.length, 1, "one page, whatever the time: a chunk always walks on");
  assert.deepEqual(chunk.next, cursor(1));
});

test("the file says every fact a row holds, after today's columns, in the owner's words", async () => {
  const whole = {
    ...row("a"),
    phone: "+15125550142",
    phone_agrees: true,
    place: { name: "Local: your receptionist is built" },
    contacted_at: "2026-11-02T00:00:00Z",
    last_outcome: "voicemail",
    last_note: "Call after 3",
    kind: "company",
    facts: { size: "11 - 50", addressee: 0, people: [{ name: "Bo Quix", title: "Office manager" }] },
    claimed: false,
    instagram: "https://instagram.example/q",
    tiktok_url: "https://tiktok.example/q",
    exported_at: "2026-11-03T00:00:00Z",
    member: { class: "qualified", fit: "strong", reason: "Independent", distance_m: 1609.344 },
  };
  const line = async (r) =>
    (await exportChunk(async () => ({ rows: [r], next: null }), null)).lines[0].split(",").slice(-15);
  assert.deepEqual(await line(whole), [
    "Yes",
    "Local: your receptionist is built",
    "2026-11-02T00:00:00Z",
    "Left a voicemail",
    "Call after 3",
    "Bo Quix",
    "Office manager",
    "11 - 50",
    "No",
    "https://instagram.example/q",
    "https://tiktok.example/q",
    "Strong fit",
    "1.0 mi",
    "Business directory",
    "2026-11-03T00:00:00Z",
  ]);
  assert.equal((await line({ ...whole, phone_agrees: false }))[0], "No", "one source");
  assert.equal((await line({ ...whole, phone_wrong: true }))[0], "Wrong", "marked wrong, whoever agrees");
  assert.equal((await line({ ...whole, phone: null }))[0], "", "no number, nothing to say of it");
  assert.equal((await line({ ...whole, claimed: null }))[8], "", "a source that says nothing says nothing");
  assert.deepEqual(
    (await line({ ...whole, member: { class: "excluded", fit: "strong", reason: "A chain", distance_m: null } })).slice(
      11,
      13,
    ),
    ["", ""],
    "a lead left out wears no fit, and one with no distance says none",
  );
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEARCH = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
/** A lead as leads_page answers it, with a long About, so that three pages pass a chunk's budget. */
const pageRow = (id) => ({
  member_id: `m-${id}`,
  lead_id: `l-${id}`,
  place_id: `p-${id}`,
  search_id: SEARCH,
  class: "qualified",
  excluded_by: null,
  fit: "strong",
  reason: "independent",
  distance_m: 2400,
  counted: true,
  judgment: { reasons: ["fit"], answer: { ref: 1, reason: "one address", criteria: [] } },
  shares: [],
  business_name: `Quix ${id}`,
  about: "x".repeat(2000),
  email_state: "none",
  phone_sources: 0,
  phone_wrong: false,
  stage: "ready",
  found_at: "2026-09-19T10:00:00Z",
  places: 1,
  version: 3,
  page_key: `k-${id}`,
  sort_key: `k-${id}|m-${id}`,
});

test("the route's chunks: the heading and the ledger row with the first alone, and each marks what it took and no more", async () => {
  const marks = [];
  let pages = 0;
  const tables = {
    tenants: [{ id: A, name: "Zilker Strength", timezone: "America/Chicago" }],
    lead_searches: [{ id: SEARCH, tenant_id: A, name: "Trainers" }],
    decisions: [],
  };
  const rpcs = {
    leads_page: () => {
      pages += 1;
      const at = pages;
      return Array.from({ length: 500 }, (_, i) => pageRow(`${at}-${i}`));
    },
    lead_export_mark: (a) => {
      marks.push(a.p_ids);
      return a.p_ids.length;
    },
    lead_list_counts: () => ({ all: 3000, ready: 3000, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }),
    lead_view_counts: () => ({ view: 3000, matching: 3000, excluded_by: {} }),
    sequence_places_of: () => [],
  };
  const ctx = { supabase: fakeDb(tables, {}, rpcs), userId: "u1" };
  const first = await exportLeads(ctx, A, VIEW);
  assert.match(first.file, /^leads-Zilker-Strength-\d{8}\.csv$/);
  assert.match(first.csv, /^Business,/, "the heading");
  assert.equal(first.rows, 1500, "three pages of 1 MB pass the budget");
  assert.equal(first.matching, 3000);
  assert.deepEqual(first.next, { key: "k-3-499", id: "m-3-499" });
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.payload.what, d.payload.rows, d.payload.matching]),
    [["export", "leads", 1500, 3000]],
  );
  const later = await exportLeads(ctx, A, { ...VIEW, after_key: first.next.key, after_id: first.next.id });
  assert.match(later.csv, /^Quix 4-0,/, "no heading: one file has one");
  assert.equal(later.rows, 1500);
  assert.equal("matching" in later, false, "the first chunk said how many");
  assert.equal(tables.decisions.length, 1, "a walk is one copy, on the ledger once");
  assert.deepEqual(
    marks.map((ids) => [ids.length, ids[0]]),
    [
      [1500, "l-1-0"],
      [1500, "l-4-0"],
    ],
    "each chunk marks what it took, so a failed walk charges only what left",
  );
});

/** A wire of chunks by the cursor it is asked from; a function answers each time it is asked. */
const wire = (answers) => {
  const asked = [];
  const fetchChunk = async (view, after) => {
    asked.push(after ?? null);
    const a = answers[asked.length - 1];
    return typeof a === "function" ? a() : a;
  };
  return { asked, fetchChunk };
};
const chunk = (csv, rows, next, matching) => ({
  ok: true,
  data: { file: "leads-Quix-20261106.csv", csv, rows, next, ...(matching === undefined ? {} : { matching }) },
});
const refused = { ok: false, status: 500, error: "no" };

test("one chunk is the whole file, and nothing is said meanwhile", async () => {
  const { asked, fetchChunk } = wire([chunk("Business\r\nA\r\n", 1, null, 1)]);
  const r = await walkLeadsExport(VIEW, NOTHING_SAID, fetchChunk);
  assert.deepEqual(r, {
    ok: true,
    data: { file: "leads-Quix-20261106.csv", csv: "Business\r\nA\r\n", rows: 1, of: 1, whole: true },
  });
  assert.deepEqual(asked, [null]);
});

test("a first chunk that fails is the failure, as it always was", async () => {
  const r = await walkLeadsExport(VIEW, NOTHING_SAID, wire([refused]).fetchChunk);
  assert.equal(r, refused);
});

test("the chunks are joined in order, the heading once, and it says how far it has come", async () => {
  const said = [];
  const { asked, fetchChunk } = wire([
    chunk("Business\r\nA\r\nB\r\n", 2, cursor(1), 5),
    chunk("C\r\nD\r\n", 2, cursor(2)),
    chunk("E\r\n", 1, null),
  ]);
  const r = await walkLeadsExport(VIEW, { progress: (done, of) => said.push([done, of]) }, fetchChunk);
  assert.deepEqual(asked, [null, cursor(1), cursor(2)]);
  assert.equal(r.data.csv, "Business\r\nA\r\nB\r\nC\r\nD\r\nE\r\n");
  assert.deepEqual([r.data.rows, r.data.of, r.data.whole], [5, 5, true]);
  assert.deepEqual(
    said,
    [
      [2, 5],
      [4, 5],
    ],
    "after each chunk that has another behind it",
  );
});

test("a later chunk that fails once is asked again, from the same place", async () => {
  const { asked, fetchChunk } = wire([chunk("H\r\nA\r\n", 1, cursor(1), 2), refused, chunk("B\r\n", 1, null)]);
  const r = await walkLeadsExport(VIEW, { progress() {} }, fetchChunk);
  assert.deepEqual(asked, [null, cursor(1), cursor(1)]);
  assert.deepEqual([r.data.csv, r.data.rows, r.data.whole], ["H\r\nA\r\nB\r\n", 2, true]);
});

test("a later chunk that fails twice saves what it holds, and says so", async () => {
  const { asked, fetchChunk } = wire([chunk("H\r\nA\r\n", 1, cursor(1), 9), refused, refused]);
  const r = await walkLeadsExport(VIEW, { progress() {} }, fetchChunk);
  assert.equal(asked.length, 3);
  assert.equal(r.ok, true, "a file is saved");
  assert.deepEqual([r.data.csv, r.data.rows, r.data.of, r.data.whole], ["H\r\nA\r\n", 1, 9, false]);
});

test("a cursor that stands still ends the walk: never a loop, and its rows are not counted twice", async () => {
  const still = () => chunk("A again\r\n", 1, cursor(1));
  const { asked, fetchChunk } = wire([chunk("H\r\nA\r\n", 1, cursor(1), 9), still, still, still, still]);
  const r = await walkLeadsExport(VIEW, { progress() {} }, fetchChunk);
  assert.deepEqual(asked, [null, cursor(1), cursor(1)], "two calls for it, then no more");
  assert.deepEqual([r.data.csv, r.data.rows, r.data.whole], ["H\r\nA\r\n", 1, false]);
});
