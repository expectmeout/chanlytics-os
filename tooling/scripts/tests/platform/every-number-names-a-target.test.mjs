/**
 * Every promise has a number with a target (decision 0031, invariant 12): each number the nightly rollup keeps is named
 * in contracts' PLATFORM_NUMBERS, a promise with its target or a count held to nothing, and the health sweep pages the
 * platform once for a day whose numbers went past the targets it answers for (apps/edge/lib/ops/day-watch.ts).
 *
 * The columns are read from the schema a replay builds, so a number added to platform_metrics without a word for it is
 * a red build; the page runs through the real watch over a database in memory and a pager that keeps what it sent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PLATFORM_NUMBERS, pastTarget, pastTargetPage } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

// The pager's addresses, made up, as the health door's suite sets them; the transport is the test's own.
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { watchTargets } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/day-watch.ts")).href);

/** platform_metrics' columns as the replayed schema holds them, less the workspace, the day and the roll's stamp. */
function rollupColumns() {
  const sql = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8");
  const body = /^CREATE TABLE public\.platform_metrics \(\n([\s\S]*?)\n\);/m.exec(sql)[1];
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("CONSTRAINT"))
    .map((l) => l.split(" ")[0])
    .filter((c) => !["tenant_id", "day", "rolled_at"].includes(c))
    .sort();
}

test("every number the rollup keeps is named, as a promise with its target or as a count; nothing is named that it does not keep", () => {
  assert.deepEqual(Object.keys(PLATFORM_NUMBERS).sort(), rollupColumns());
  for (const [name, n] of Object.entries(PLATFORM_NUMBERS)) {
    assert.ok(n.why.length > 10, `${name} says what it is`);
    if (!n.promise) continue;
    const figures = typeof n.most === "number" ? [n.most] : [...Object.values(n.most), n.otherwise];
    assert.ok(
      figures.every((f) => typeof f === "number" && f >= 0),
      `${name}: every key it may hold has a target`,
    );
    assert.ok(["ms", "count"].includes(n.unit), `${name} says its unit`);
  }
  const promised = Object.entries(PLATFORM_NUMBERS)
    .filter(([, n]) => n.promise)
    .map(([name, n]) => [name, n.alarm]);
  assert.deepEqual(promised, [
    ["brain_p95_ms", true],
    ["job_lag_ms", true],
    ["first_answer_ms", false],
    ["duplicate_sends", true],
    ["dead_letters", true],
    ["relay_lag_ms", true],
    ["intake_lag_ms", true],
  ]);
});

test("a day past a target: each key against its own, a key not named against the rest's, and nothing the day does not have", () => {
  const day = {
    brain_p95_ms: 12_000,
    job_lag_ms: { 0: 11_000, 1: 20_000, 2: 1_000, none: 400_000 },
    duplicate_sends: 0,
    dead_letters: { email_ingest: 2 },
    relay_lag_ms: null,
    intake_lag_ms: { meta: 5_000 },
    first_answer_ms: { whatsapp: 45_000, email: 600_000 },
  };
  assert.deepEqual(pastTarget(day), [
    { number: "brain_p95_ms", key: null, value: 12_000, most: 10_000 },
    { number: "job_lag_ms", key: "0", value: 11_000, most: 10_000 },
    { number: "job_lag_ms", key: "none", value: 400_000, most: 300_000 },
    { number: "dead_letters", key: "email_ingest", value: 2, most: 0 },
  ]);
  assert.deepEqual(
    pastTarget(day, { all: true }).filter((b) => b.number === "first_answer_ms"),
    [{ number: "first_answer_ms", key: "whatsapp", value: 45_000, most: 30_000 }],
    "the customers' wait is held to its target too, and shown, not paged",
  );
  assert.deepEqual(pastTarget({}), [], "a day rolled before the numbers were counted is past nothing");
  const page = pastTargetPage("2026-10-09", [{ tenantId: "t-1", name: "Harbor Moving", breaches: pastTarget(day) }]);
  assert.equal(page.subject, "1 workspace past a target on 2026-10-09");
  assert.match(
    page.body,
    /Harbor Moving \(t-1\): brain_p95_ms 12\.0 s, target 10\.0 s; job_lag_ms 0 11\.0 s, target 10\.0 s; job_lag_ms none 7 min, target 5 min; dead_letters email_ingest 2, target 0/,
  );
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const row = (tenant_id, day, over = {}) => ({
  tenant_id,
  day,
  messages_in: {},
  messages_out: {},
  asks: 0,
  answered: 0,
  replies_answered: 0,
  replies_held: 0,
  replies_handed_off: 0,
  brain_p95_ms: null,
  provider_failures: {},
  tokens: 0,
  rolled_at: `${day}T00:17:00Z`,
  job_lag_ms: {},
  first_answer_ms: {},
  duplicate_sends: null,
  dead_letters: {},
  relay_lag_ms: null,
  intake_lag_ms: {},
  ...over,
});

test("the morning's sweep pages once for yesterday's numbers past their targets, every workspace in one page; a quiet day, or the afternoon, pages nothing", async () => {
  const tables = {
    tenants: [
      { id: A, name: "Harbor Moving", slug: "harbor", status: "active" },
      { id: B, name: "Bayside Dental", slug: "bayside", status: "active" },
      { id: P, name: "Paused Movers", slug: "paused", status: "paused" },
    ],
    platform_metrics: [
      row(A, "2026-10-09", { relay_lag_ms: 20_000, job_lag_ms: { 0: 2_000 } }),
      row(B, "2026-10-09", { relay_lag_ms: 1_000, first_answer_ms: { sms: 90_000 } }),
      row(A, "2026-10-08", { relay_lag_ms: 99_000 }),
      // A paused workspace pages nobody, as the silence alarm reads only live ones.
      row(P, "2026-10-09", { relay_lag_ms: 50_000 }),
    ],
    operator_pages: [],
  };
  const db = fakeDb(tables);
  const sent = [];
  const pager = {
    send: async (_from, _to, subject, body) => {
      sent.push({ subject, body });
      return true;
    },
  };
  const morning = Date.parse("2026-10-10T00:47:00Z");
  assert.equal(
    await watchTargets(db, morning, { ...pager, now: () => morning }),
    1,
    "one workspace past a paged target",
  );
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /1 workspace past a target on 2026-10-09/);
  assert.match(
    sent[0].body,
    /Harbor Moving \(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\): relay_lag_ms 20\.0 s, target 15\.0 s/,
  );
  assert.doesNotMatch(
    sent[0].body,
    /Bayside/,
    "a customer's wait past its target is the workspace's, shown and not paged",
  );
  assert.doesNotMatch(sent[0].body, /99\.0 s/, "only yesterday");
  assert.doesNotMatch(sent[0].body, /Paused Movers/, "a paused workspace pages nobody");

  const afternoon = Date.parse("2026-10-10T12:17:00Z");
  assert.equal(await watchTargets(db, afternoon, { ...pager, now: () => afternoon }), 0, "the afternoon does not ask");
  tables.platform_metrics = [row(A, "2026-10-09", { relay_lag_ms: 1_000 })];
  assert.equal(await watchTargets(db, morning, { ...pager, now: () => morning }), 0, "a day within its targets");
  assert.equal(sent.length, 1);
});
