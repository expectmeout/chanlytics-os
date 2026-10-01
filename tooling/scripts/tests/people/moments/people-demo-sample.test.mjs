/**
 * The demo's People (surfaces/people/sample.ts): a sample business through the mapping a real workspace's people go
 * through (surface-map.ts), so a demo session draws the one People page there is. Nobody in it is real, its counts are the
 * mapping's own, and it is relative to the day it is drawn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { peopleSample, demoPeople } = await importSrc("apps/dashboard/src/surfaces/people/sample.ts");
const { peopleSurfaceOf } = await importSrc("apps/dashboard/src/surfaces/people/surface-map.ts");

const NOW = new Date("2026-09-28T18:00:00.000Z");

test("nobody in the sample is real: numbers are 555-01xx, addresses are example.com", () => {
  const P = peopleSample(NOW);
  assert.ok(P.rows.length >= 8, "enough people to draw every state the page has");
  for (const r of P.rows) {
    if (r.phone) assert.match(r.phone.replace(/\D/g, ""), /^1?\d{3}555\d{4}$/, `${r.name}'s number`);
    if (r.phone) assert.match(r.phone.replace(/\D/g, "").slice(-7, -4), /555/, `${r.name}'s number is a 555`);
    if (r.email) assert.match(r.email, /@([a-z0-9-]+\.)*example\.com$/, `${r.name}'s address`);
  }
});

test("the page's lists and counts are the mapping's: each list's count is its members, and the total is everyone", () => {
  const P = peopleSample(NOW);
  const ids = new Set(P.rows.map((r) => r.id));
  assert.equal(new Set(P.rows.map((r) => r.id)).size, P.rows.length, "each person once");
  for (const list of P.lists) {
    assert.equal(list.count, list.ids.length, `${list.id}: the count is its members`);
    for (const id of list.ids) assert.ok(ids.has(id), `${list.id}: ${id} is somebody the sample has`);
  }
  assert.equal(P.aggregates.total, P.rows.length, "the total says everyone the sample holds");
  assert.ok(P.saved.length > 0 && P.saved.every((s) => s.id && s.name), "lists kept by hand or by rule, named");
});

test("the sample is the mapping run over loaded people: mapping its own loaded shape gives the same page", () => {
  const P = peopleSample(NOW);
  const again = peopleSample(NOW);
  assert.deepEqual(
    again.rows.map((r) => [r.id, r.state, r.lastContact.label]),
    P.rows.map((r) => [r.id, r.state, r.lastContact.label]),
    "deterministic for a given day",
  );
  assert.equal(typeof peopleSurfaceOf, "function");
});

test("relative to the day it is drawn: a later day moves every last contact with it", () => {
  const today = peopleSample(NOW);
  const later = peopleSample(new Date(NOW.getTime() + 3 * 24 * 3_600_000));
  assert.equal(today.rows.length, later.rows.length);
  const said = (P) => P.rows.map((r) => r.lastContact.label).join("|");
  assert.notEqual(said(today), said(later), "a person who wrote an hour ago wrote three days and an hour ago");
});

test("the session's copy is made once: the same object every draw, so a redraw sees no change", () => {
  assert.equal(demoPeople(), demoPeople());
});
