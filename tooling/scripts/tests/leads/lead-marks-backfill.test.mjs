/**
 * The backfill for leads found before 00161 (tooling/scripts/lead-marks-backfill.mjs): the collect's own mark step
 * over the leads with a site and no copy, and a write guarded on the state each lead was planned in. The script's
 * main (the reads, the backup, the preflight) needs production and is not run here; these are the three parts it
 * is made of, run for real over a world in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { markLeads, planMarks, writeMarks } from "../../lead-marks-backfill.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { notAnImage, png } from "../_mark-images.mjs";

const T1 = "11111111-1111-4111-8111-111111111111";
const lead = (id, over = {}) => ({
  id,
  tenant_id: T1,
  website_host: `${id}.example`,
  logo_url: null,
  mark_path: null,
  blanked_at: null,
  erased_at: null,
  ...over,
});

test("the plan is every lead with a site and no copy yet, and never one blanked or erased", () => {
  const rows = [
    lead("a"),
    lead("b", { logo_url: "https://b.example/logo.png" }),
    lead("c", { website_host: null }),
    lead("d", { mark_path: `${"d".repeat(64)}.png` }),
    lead("e", { blanked_at: "2026-09-20T00:00:00Z" }),
    lead("f", { erased_at: "2026-09-20T00:00:00Z" }),
  ];
  assert.deepEqual(
    planMarks(rows).map((p) => [p.id, p.website_host, p.logo_url]),
    [
      ["a", "a.example", null],
      ["b", "b.example", "https://b.example/logo.png"],
    ],
  );
});

test("the collect's own step marks the planned leads, and says where each copy came from and what it is called", async () => {
  const pages = {
    "https://a.example": `<head><link rel="apple-touch-icon" href="/t.png"></head>`,
    "https://b.example": `<head><link rel="icon" type="image/png" href="/i.png"></head>`,
    "https://c.example": `<head></head>`,
  };
  const images = { "https://a.example/t.png": png(180, 180), "https://b.example/i.png": notAnImage };
  const stored = [];
  const marked = await markLeads(
    planMarks([lead("a"), lead("b", { logo_url: "https://b.example/old.png" }), lead("c")]),
    {
      fetchText: async (url) => pages[url] ?? null,
      fetchBytes: async (url) => images[url] ?? null,
      storeMark: async (bytes, image) => {
        stored.push(image.kind);
        return `${"a".repeat(64)}.${image.kind}`;
      },
    },
  );
  assert.deepEqual(marked, [
    { id: "a", tenant_id: T1, had: null, logo_url: "https://a.example/t.png", mark_path: `${"a".repeat(64)}.png` },
  ]);
  assert.deepEqual(stored, ["png"], "an error page where the icon should be is never stored");
});

test("the write lands only where the lead still has no copy and is still whole, and counts what it matched", async () => {
  const NAME = `${"e".repeat(64)}.png`;
  const tables = {
    leads: [
      lead("a"),
      lead("b", { logo_url: "https://b.example/said.png" }),
      lead("c", { mark_path: `${"f".repeat(64)}.png` }), // marked by a collect since the plan
      lead("d", { blanked_at: "2026-09-22T00:00:00Z" }), // blanked since the plan
    ],
  };
  const db = fakeDb(tables);
  const m = (id, had, logo_url) => ({ id, tenant_id: T1, had, logo_url, mark_path: NAME });
  const { written, skipped } = await writeMarks(db, [
    m("a", null, "https://a.example/t.png"),
    m("b", "https://b.example/said.png", "https://b.example/touch.png"),
    m("c", null, "https://c.example/t.png"),
    m("d", null, "https://d.example/t.png"),
  ]);
  assert.deepEqual(
    written.map((w) => w.id),
    ["a", "b"],
  );
  assert.deepEqual(
    skipped.map((s) => s.id),
    ["c", "d"],
    "a lead marked or blanked since the plan is left as it is",
  );
  const row = (id) => tables.leads.find((l) => l.id === id);
  assert.deepEqual(
    [row("a").mark_path, row("a").logo_url],
    [NAME, "https://a.example/t.png"],
    "a lead with no address gains the one its copy came from",
  );
  assert.deepEqual(
    [row("b").mark_path, row("b").logo_url],
    [NAME, "https://b.example/said.png"],
    "and one with an address keeps it",
  );
  assert.equal(row("c").mark_path, `${"f".repeat(64)}.png`, "the collect's copy is not overwritten");
  assert.equal(row("d").mark_path, null, "a blanked lead gains nothing back");
});
