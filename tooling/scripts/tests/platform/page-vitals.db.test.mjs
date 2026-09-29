/**
 * Field data's table and its two functions (00252), on a real database.
 *
 * note_page_vitals keeps a load's reports under the browser's own ids, and a later report of an id replaces its value
 * (INP and CLS grow while a page is open); an id twice in one call keeps one rather than failing the call; the
 * table's checks refuse what the route would. page_vitals_p75 answers the 75th percentile of each metric over every
 * page (page null) and over each page, from the latest p_most reports of the last p_days, so its cost is bounded by
 * what it is asked for, not by the platform's traffic. Every row this suite writes carries its own id prefix and
 * goes when it ends. Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes and deletes page timings"
      : false;

const RUN = `t${crypto.randomBytes(4).toString("hex")}`;
const id = (n) => `${RUN}-${n}`;
let db;

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  await db.from("page_vitals").delete().like("id", `${RUN}-%`);
});

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const mine = async () =>
  ok(await db.from("page_vitals").select("id, page, metric, value").like("id", `${RUN}-%`).order("id"));

test(
  "a load's reports are kept under their ids, a later report replaces the value, and an id twice keeps one",
  { skip },
  async () => {
    const kept = ok(
      await db.rpc("note_page_vitals", {
        p_page: "inbox",
        p_vitals: [
          { id: id("a"), name: "LCP", value: 2140.5 },
          { id: id("b"), name: "INP", value: 120 },
        ],
      }),
    );
    assert.equal(kept, 2);
    ok(await db.rpc("note_page_vitals", { p_page: "inbox", p_vitals: [{ id: id("b"), name: "INP", value: 320 }] }));
    ok(
      await db.rpc("note_page_vitals", {
        p_page: "today",
        p_vitals: [
          { id: id("c"), name: "CLS", value: 0.02 },
          { id: id("c"), name: "CLS", value: 0.02 },
        ],
      }),
    );
    assert.deepEqual(await mine(), [
      { id: id("a"), page: "inbox", metric: "LCP", value: 2140.5 },
      { id: id("b"), page: "inbox", metric: "INP", value: 320 },
      { id: id("c"), page: "today", metric: "CLS", value: 0.02 },
    ]);
  },
);

test("the table refuses what the route refuses", { skip }, async () => {
  const bad = [
    { id: id("x1"), page: "inbox", metric: "FID", value: 10 },
    { id: id("x2"), page: "Inbox", metric: "LCP", value: 10 },
    { id: id("x3"), page: "inbox", metric: "LCP", value: -1 },
    { id: id("x4"), page: "inbox", metric: "LCP", value: 600_001 },
    { id: "a b", page: "inbox", metric: "LCP", value: 10 },
  ];
  for (const row of bad) {
    const { error } = await db.from("page_vitals").insert(row);
    assert.notEqual(error, null, `${JSON.stringify(row)} was kept`);
    assert.equal(error.code, "23514", error.message);
  }
});

test(
  "the 75th percentile of each metric, over every page and over each, from the latest reports of the last days",
  { skip },
  async () => {
    // A page no other suite writes, and a window no other row reaches: this run's own reports, backdated to a
    // stretch of time only it has, read with a p_days that ends before any other row was written.
    const page = `p${RUN.slice(1)}`;
    const values = [100, 200, 300, 400, 500];
    for (const [i, v] of values.entries()) {
      ok(await db.rpc("note_page_vitals", { p_page: page, p_vitals: [{ id: id(`l${i}`), name: "LCP", value: v }] }));
    }
    ok(await db.rpc("note_page_vitals", { p_page: "today", p_vitals: [{ id: id("t0"), name: "LCP", value: 900 }] }));
    const rows = ok(await db.rpc("page_vitals_p75", { p_days: 7, p_most: 25000 }));
    const lcp = rows.find((r) => r.metric === "LCP" && r.page === page);
    // percentile_cont interpolates: the 75th of 100..500 is 400.
    assert.deepEqual({ samples: lcp.samples, p75: lcp.p75 }, { samples: 5, p75: 400 });
    const every = rows.find((r) => r.metric === "LCP" && r.page === null);
    assert.ok(every.samples >= 6, "every page's row counts this page's and today's");

    // p_most keeps the latest reports: the two written last are this run's `today` one and its fifth.
    const latest = ok(await db.rpc("page_vitals_p75", { p_days: 7, p_most: 2 }));
    assert.equal(latest.find((r) => r.metric === "LCP" && r.page === null).samples, 2);

    // p_days leaves out a report older than the window.
    ok(
      await db
        .from("page_vitals")
        .update({ at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
        .in(
          "id",
          values.map((_, i) => id(`l${i}`)),
        ),
    );
    const week = ok(await db.rpc("page_vitals_p75", { p_days: 7, p_most: 25000 }));
    assert.equal(
      week.find((r) => r.page === page),
      undefined,
      "a page whose every report is older than the window is not named",
    );
  },
);
