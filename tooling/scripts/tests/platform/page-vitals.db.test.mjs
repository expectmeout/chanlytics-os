/**
 * Field data's table and its functions (00255, 00412), on a real database.
 *
 * note_page_vitals keeps a load's reports under the browser's own ids, and a later report of an id replaces its value
 * (INP and CLS grow while a page is open); an id twice in one call keeps one rather than failing the call; the
 * table's checks refuse what the route would. page_vitals_p75 answers the 75th percentile of each metric over every
 * page (page null) and over each page, from the latest p_most reports of the last p_days, so its cost is bounded by
 * what it is asked for, not by the platform's traffic. Since 00412 (decision 0053) a report may be the shell's own
 * (READY, SETTLED), of a part of a page, of a move from another page, held or read, from a device and a build, with what
 * its time went on; page_vitals_p75 reads page loads alone, and page_speed and page_spots are the new card's reads.
 * Every row this suite writes carries its own id prefix and goes when it ends. Skipped without a local database.
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

test(
  "a load says its device and build, a report its page, part, the page it left, held rows and what it waited on",
  { skip },
  async () => {
    const kept = ok(
      await db.rpc("note_page_vitals", {
        p_page: "today",
        p_device: "phone",
        p_build: "b220a8b74abc",
        p_vitals: [
          { id: id("s1"), name: "READY", value: 900, warm: false, detail: { wait: "metrics", wait_ms: 600, db_n: 7 } },
          { id: id("s2"), name: "READY", value: 400, part: "queue", warm: false },
          { id: id("s3"), name: "READY", value: 350, page: "calendar", from: "today", warm: true },
          { id: id("s4"), name: "SETTLED", value: 2600, warm: false },
        ],
      }),
    );
    assert.equal(kept, 4);
    const rows = ok(
      await db
        .from("page_vitals")
        .select("id, page, metric, part, came_from, warm, device, build, detail")
        .in("id", [id("s1"), id("s2"), id("s3"), id("s4")])
        .order("id"),
    );
    assert.deepEqual(
      rows.map((r) => [r.page, r.metric, r.part, r.came_from, r.warm, r.device, r.build]),
      [
        ["today", "READY", null, null, false, "phone", "b220a8b74abc"],
        ["today", "READY", "queue", null, false, "phone", "b220a8b74abc"],
        ["calendar", "READY", null, "today", true, "phone", "b220a8b74abc"],
        ["today", "SETTLED", null, null, false, "phone", "b220a8b74abc"],
      ],
      "a report that names its page keeps it; one that names none is of the page the load landed on",
    );
    assert.deepEqual(rows[0].detail, { wait: "metrics", wait_ms: 600, db_n: 7 });
    // A grown report replaces what its time went on with its value.
    ok(
      await db.rpc("note_page_vitals", {
        p_page: "today",
        p_vitals: [{ id: id("s1"), name: "READY", value: 950, detail: { wait: "calendar" } }],
      }),
    );
    const again = ok(await db.from("page_vitals").select("value, detail").eq("id", id("s1")).single());
    assert.deepEqual(again, { value: 950, detail: { wait: "calendar" } });
  },
);

test(
  "the table refuses a part, a page left, a device or a build the route would, and what the time went on past its size",
  { skip },
  async () => {
    const bad = [
      { id: id("y1"), page: "today", metric: "READY", value: 10, part: "Queue" },
      { id: id("y2"), page: "today", metric: "READY", value: 10, came_from: "To day" },
      { id: id("y3"), page: "today", metric: "READY", value: 10, device: "tablet" },
      { id: id("y4"), page: "today", metric: "READY", value: 10, build: "a" },
      { id: id("y5"), page: "today", metric: "READY", value: 10, detail: ["a list"] },
      { id: id("y6"), page: "today", metric: "READY", value: 10, detail: { el: "x".repeat(3000) } },
      { id: id("y7"), page: "today", metric: "PART", value: 10 },
    ];
    for (const row of bad) {
      const { error } = await db.from("page_vitals").insert(row);
      assert.notEqual(error, null, `${JSON.stringify(row).slice(0, 80)} was kept`);
      assert.equal(error.code, "23514", error.message);
    }
  },
);

test(
  "the first card reads page loads alone; where the time goes reads each page by how it was reached, its parts and held rows",
  { skip },
  async () => {
    const page = `q${RUN.slice(1)}`;
    const ready = (n, value, extra = {}) => ({ id: id(`r${n}`), name: "READY", value, ...extra });
    ok(
      await db.rpc("note_page_vitals", {
        p_page: page,
        p_device: "desk",
        p_vitals: [
          ready(1, 1000, { warm: false, detail: { wait: "contacts" } }),
          ready(2, 300, { part: "table", warm: false }),
          ready(3, 200, { from: "today", warm: true }),
          ready(4, 600, { from: "today", warm: false, detail: { wait: "contacts" } }),
          ready(5, 80, { part: "thread", from: page, warm: true }),
          {
            id: id("r6"),
            name: "LCP",
            value: 700,
            from: "today",
            detail: { el: "people-table", phase: "render_delay" },
          },
          { id: id("r7"), name: "INP", value: 240, detail: { el: "people-add", phase: "processing" } },
          { id: id("r8"), name: "INP", value: 120, detail: { el: "people-add", phase: "processing" } },
        ],
      }),
    );
    const p75 = ok(await db.rpc("page_vitals_p75", { p_days: 7, p_most: 25000 }));
    assert.equal(
      p75.find((r) => r.page === page && r.metric === "LCP"),
      undefined,
      "a move's paint is no page load's",
    );
    assert.equal(p75.find((r) => r.page === page && r.metric === "INP").samples, 2, "a load's taps are its own");
    assert.equal(
      p75.find((r) => r.page === page && r.metric === "READY"),
      undefined,
      "the shell's two are not the five",
    );

    const speed = ok(await db.rpc("page_speed", { p_days: 7, p_most: 50000 }));
    const at = (part, how, device = "all", warm = "all", metric = "READY") =>
      speed.find(
        (r) =>
          r.metric === metric &&
          r.page === page &&
          r.part === part &&
          r.how === how &&
          r.device === device &&
          r.warm === warm,
      );
    assert.deepEqual([at("", "load").samples, at("", "load").p75, at("", "load").waits_on], [1, 1000, "contacts"]);
    assert.deepEqual([at("", "move").samples, at("", "move").p75], [2, 500], "the 75th of 200 and 600");
    assert.equal(at("", "move", "all", "held").p75, 200);
    assert.deepEqual([at("", "move", "all", "read").p75, at("", "move", "all", "read").waits_on], [600, "contacts"]);
    assert.equal(at("", "move", "desk").samples, 2);
    assert.equal(at("table", "load").p75, 300);
    assert.equal(at("thread", "within").p75, 80, "a move inside the page is its own way in");
    assert.equal(at("", "all").samples, 3, "over every way in");
    assert.equal(at("", "move", "all", "all", "LCP").p75, 700, "the browser's paint of a move, by its page");

    const spots = ok(await db.rpc("page_spots", { p_days: 7, p_most: 50000 }));
    const tap = spots.find((s) => s.page === page && s.metric === "INP" && s.el === "people-add");
    assert.deepEqual([tap.samples, tap.p75, tap.phase], [2, 210, "processing"], "the 75th of 120 and 240");
    assert.equal(spots.find((s) => s.page === page && s.el === "people-table").phase, "render_delay");
  },
);
