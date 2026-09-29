/**
 * The sweeps' pages on a real database (00245). playbooks_due judges due-ness by each workspace's own clock -- at or
 * past its hour there, not past the last hour the caller names, and not yet run for that clock's day, whatever UTC's
 * date says -- never run first, then the least recently run, bounded, every row carrying the count of all that were
 * due; a reach-out step is on its own page, judged the same way. calendars_due takes a feed's address never read or
 * last read before the hour, never read first; a row whose calendar has no address is not a feed, and a feed read this
 * hour is neither in the page nor counted. Neither door opens to anon. packages/db reads both as the sweeps do.
 *
 * Each read is kept to this suite's own workspaces (p_tenant_id), so the database suites running beside it keep
 * their rows out of these pages and counts. Local stack only: it makes workspaces.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { runDueNow } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const H = 3_600_000;
const D = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const stamp = Date.now().toString(36);
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

let db;
let duePlaybooks;
let dueCalendars;
const made = [];

/** A workspace on its own clock, with the template its moments send. */
async function workspace(name, timezone) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `pages-${name}-${stamp}`, name: `Pages ${name}`, timezone })
      .select("id")
      .single(),
  ).id;
  made.push(id);
  const template = ok(
    await db
      .from("templates")
      .insert({ tenant_id: id, channel: "whatsapp", name: "winback_offer", language: "en_US", meta_status: "approved" })
      .select("id")
      .single(),
  ).id;
  return { id, template };
}
/** A running daily moment at ten that has never run, as its row reads. */
async function moment(ws, name, over = {}) {
  return ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: ws.id,
        name,
        trigger: "quiet_30",
        template_id: ws.template,
        template_name: "winback_offer",
        template_language: "en_US",
        params: [],
        policy_class: "reengage",
        state: "running",
        run_hour: 10,
        cap_per_run: 25,
        gap_days: 90,
        cadence_days: 30,
        ...over,
      })
      .select("id")
      .single(),
  ).id;
}
/** One workspace's moments page at `at`, as the sweep asks it: the last hour a message may go out is twenty. */
const page = async (ws, at, over = {}) =>
  ok(
    await db.rpc("playbooks_due", {
      p_kind: "moment",
      p_at: at,
      p_last_hour: 20,
      p_limit: 100,
      p_tenant_id: ws.id,
      ...over,
    }),
  );
const ids = (rows) => rows.map((r) => r.playbook.id);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ duePlaybooks, dueCalendars } = await import("@chanlytics/db"));
});
after(async () => {
  if (skip) return;
  for (const id of made) ok(await db.from("tenants").delete().eq("id", id));
});

/* ------------------------------------------------------------ playbooks */

test(
  "a playbook is due by its workspace's own clock: at or past its hour there, not past the caller's last hour, and not yet run for that clock's day, whatever UTC's date says",
  { skip },
  async () => {
    // One in the morning UTC on the 27th is eight in the evening on the 26th in Chicago, and ten in the morning on
    // the 27th in Tokyo.
    const AT = "2026-09-27T01:00:00.000Z";
    const chicago = await workspace("chicago", "America/Chicago");
    const tokyo = await workspace("tokyo", "Asia/Tokyo");
    const c = {
      due: await moment(chicago, "Never run"),
      ranToday: await moment(chicago, "Ran today, by its own clock", {
        last_run_for: "2026-09-26",
        last_run_at: iso(Date.parse(AT) - 10 * H),
      }),
      ranUtcToday: await moment(chicago, "Ran for UTC's day, which is not its day", { last_run_for: "2026-09-27" }),
      evening: await moment(chicago, "Set for eight in the evening", { run_hour: 20 }),
      paused: await moment(chicago, "Paused", { state: "paused" }),
    };
    const t = {
      due: await moment(tokyo, "Never run"),
      ranToday: await moment(tokyo, "Ran today", { last_run_for: "2026-09-27" }),
      eleven: await moment(tokyo, "Set for eleven", { run_hour: 11 }),
    };

    const inChicago = await page(chicago, AT);
    assert.deepEqual(
      ids(inChicago).sort(),
      [c.due, c.ranUtcToday, c.evening].sort(),
      "due at eight in the evening: never run, run for a day that is not its own, and the one set for eight; not the one that ran today, nor the paused one",
    );
    assert.ok(
      inChicago.every((r) => r.timezone === "America/Chicago" && r.due_total === 3),
      "each row names the zone it was judged in and the count of all that were due",
    );
    const inTokyo = await page(tokyo, AT);
    assert.deepEqual(
      ids(inTokyo),
      [t.due],
      "due at ten in the morning: not the one that ran today, nor the one set for eleven",
    );
    assert.deepEqual([inTokyo[0].timezone, inTokyo[0].due_total], ["Asia/Tokyo", 1]);
    // The last hour is the caller's, and it bounds the clock, not the playbook's own hour: at twenty with the last
    // hour at nineteen nothing is due, the ones set for ten included (runDueNow: hour <= PLAYBOOK_HOURS.max).
    assert.deepEqual(await page(chicago, AT, { p_last_hour: 19 }), []);
    // With the last hour at twenty, as the sweep asks, the one set for eight is due at eight.
    assert.ok(ids(await page(chicago, AT, { p_last_hour: 20 })).includes(c.evening));
    // Seven in the evening in Chicago (00:00Z on the 27th): the one set for eight is not yet due; the others are.
    assert.deepEqual(
      ids(await page(chicago, "2026-09-27T00:00:00.000Z")).sort(),
      [c.due, c.ranUtcToday].sort(),
      "at nineteen: never run and run for a day that is not its own; not the one set for eight",
    );
    // An hour later in Tokyo the one set for eleven is due too; the one that ran today still is not.
    assert.deepEqual(ids(await page(tokyo, "2026-09-27T02:00:00.000Z")).sort(), [t.due, t.eleven].sort());
    // Nine in the morning in Chicago (14:00Z): nothing is at its hour yet.
    assert.deepEqual(await page(chicago, "2026-09-26T14:00:00.000Z"), []);
    // The row comes whole, as the sweep's run reads it.
    const whole = inChicago.find((r) => r.playbook.id === c.due).playbook;
    assert.deepEqual(
      [whole.tenant_id, whole.kind, whole.state, whole.run_hour, whole.last_run_for, whole.last_run_at, whole.name],
      [chicago.id, "moment", "running", 10, null, null, "Never run"],
    );
  },
);

test(
  "the page is never run first, then the least recently run, bounded, and every row carries the count of all that were due -- so packages/db knows what was left behind",
  { skip },
  async () => {
    const ws = await workspace("order", "America/Chicago");
    const AT = "2026-09-26T16:30:00.000Z"; // half past eleven in the morning in Chicago
    const at = Date.parse(AT);
    const first = await moment(ws, "Never run, made first", { created_at: iso(at - 5 * D) });
    const second = await moment(ws, "Never run, made after", { created_at: iso(at - 4 * D) });
    const oldest = await moment(ws, "Ran three days ago", { last_run_for: "2026-09-23", last_run_at: iso(at - 3 * D) });
    const middle = await moment(ws, "Ran two days ago", { last_run_for: "2026-09-24", last_run_at: iso(at - 2 * D) });
    const latest = await moment(ws, "Ran yesterday", { last_run_for: "2026-09-25", last_run_at: iso(at - D) });
    await moment(ws, "Ran today", { last_run_for: "2026-09-26", last_run_at: iso(at - H) });
    await moment(ws, "Set for the evening", { run_hour: 20 });

    const all = await page(ws, AT);
    assert.deepEqual(ids(all), [first, second, oldest, middle, latest], "never run first, then the least recently run");
    assert.ok(
      all.every((r) => r.due_total === 5),
      "five were due: the one that ran today and the one set for the evening are not counted",
    );
    const three = await page(ws, AT, { p_limit: 3 });
    assert.deepEqual(ids(three), [first, second, oldest], "the three that have waited longest");
    assert.deepEqual(
      three.map((r) => r.due_total),
      [5, 5, 5],
      "each still carrying the count of all five, so two are known to be left behind",
    );
    assert.deepEqual(await page(ws, AT, { p_limit: 0 }), [], "a page of none");
    assert.deepEqual(await page(ws, AT, { p_limit: -1 }), [], "a limit below none is none");

    // Through packages/db, as the sweep reads it: the page, each row with its zone, and what is left beyond it.
    const read = await duePlaybooks(db, { kind: "moment", at: new Date(AT), limit: 3, tenantId: ws.id });
    assert.deepEqual(
      read.rows.map((r) => [r.playbook.id, r.timezone]),
      [
        [first, "America/Chicago"],
        [second, "America/Chicago"],
        [oldest, "America/Chicago"],
      ],
    );
    assert.equal(read.remaining, 2);
    assert.equal(
      (await duePlaybooks(db, { kind: "moment", at: new Date(AT), limit: 100, tenantId: ws.id })).remaining,
      0,
    );
    assert.deepEqual(
      await duePlaybooks(db, { kind: "moment", at: new Date("2026-09-26T14:00:00.000Z"), limit: 3, tenantId: ws.id }),
      {
        rows: [],
        remaining: 0,
      },
    );
  },
);

test("a reach-out step is on its own page, judged the same way, and never on the moments'", { skip }, async () => {
  const ws = await workspace("reach", "America/Chicago");
  const AT = "2026-09-26T16:30:00.000Z";
  const search = ok(
    await db
      .from("lead_searches")
      .insert({ tenant_id: ws.id, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} })
      .select("id")
      .single(),
  ).id;
  const email = ok(
    await db
      .from("templates")
      .insert({
        tenant_id: ws.id,
        channel: "email",
        source: "chanlytics",
        name: `reach_first_${stamp}`,
        language: "en",
        category: "marketing",
        meta_status: "approved",
        components: [{ type: "BODY", text: "Hi {{business}}" }],
      })
      .select("id")
      .single(),
  ).id;
  const reachOut = (name, over = {}) =>
    db
      .from("playbooks")
      .insert({
        tenant_id: ws.id,
        kind: "reach_out",
        policy_class: "outreach",
        gap_minutes: 5,
        template_id: email,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        params: [],
        name,
        trigger: "lead_first",
        lead_search_id: search,
        ...over,
      })
      .select("id")
      .single();
  const root = ok(await reachOut("Movers")).id;
  // The chain's next step (one chain per search, 00197): it ran today by its own clock.
  ok(
    await reachOut("Movers, ran today", {
      trigger: "after_step",
      lead_search_id: null,
      after_playbook_id: root,
      after_days: 2,
      last_run_for: "2026-09-26",
      last_run_at: iso(Date.parse(AT) - H),
    }),
  );
  const beside = await moment(ws, "A moment beside them");

  const reach = ok(
    await db.rpc("playbooks_due", { p_kind: "reach_out", p_at: AT, p_last_hour: 20, p_limit: 100, p_tenant_id: ws.id }),
  );
  assert.deepEqual(
    reach.map((r) => [r.playbook.id, r.playbook.kind, r.due_total]),
    [[root, "reach_out", 1]],
    "the step that has not run today, and only it",
  );
  assert.deepEqual(ids(await page(ws, AT)), [beside], "the moments' page has no reach-out on it");
  const read = await duePlaybooks(db, { kind: "reach_out", at: new Date(AT), limit: 25, tenantId: ws.id });
  assert.deepEqual([read.rows.map((r) => r.playbook.id), read.remaining], [[root], 0]);
});

test(
  "a zone the database does not know is judged in UTC (safe_zone), and one such workspace never fails the page for the others",
  { skip },
  async () => {
    // tenants.timezone is owner-settable text, checked against pg_timezone_names only at creation: a name Postgres
    // does not know can be stored, and `at time zone` on it raises.
    const mars = await workspace("mars", "Mars/Olympus");
    const due = await moment(mars, "On a clock nobody has");
    assert.equal(ok(await db.rpc("safe_zone", { p: "Mars/Olympus" })), "UTC");
    assert.equal(ok(await db.rpc("safe_zone", { p: "America/Chicago" })), "America/Chicago");
    assert.equal(ok(await db.rpc("safe_zone", { p: "UTC" })), "UTC");
    // Half past four in the afternoon, UTC: due at ten. One in the morning, UTC: not.
    assert.deepEqual(
      (await page(mars, "2026-09-26T16:30:00.000Z")).map((r) => [r.playbook.id, r.timezone, r.due_total]),
      [[due, "UTC", 1]],
      "judged in UTC, and the page says so",
    );
    assert.deepEqual(await page(mars, "2026-09-27T01:00:00.000Z"), []);
    // Every workspace at once, the bad one among them: both pages still answer.
    ok(
      await db.rpc("playbooks_due", {
        p_kind: "moment",
        p_at: "2026-09-26T16:30:00.000Z",
        p_last_hour: 20,
        p_limit: 1,
      }),
    );
    ok(await db.rpc("calendars_due", { p_before: iso(Date.now()), p_limit: 1 }));
  },
);

test(
  "a paused workspace's playbooks are not due while it is paused, and not counted (one clause for both pages, which differ only by kind) -- so its twenty-six never hold the page another workspace's are waiting for -- and are due again, their day still open, once it resumes",
  { skip },
  async () => {
    const AT = "2026-09-26T16:30:00.000Z"; // half past eleven in the morning in Chicago
    const paused = await workspace("paused", "America/Chicago");
    const sound = await workspace("sound", "America/Chicago");
    ok(await db.from("tenants").update({ status: "paused" }).eq("id", paused.id));
    const held = [];
    for (let i = 0; i < 26; i += 1)
      held.push(await moment(paused, `Paused ${i}`, { last_run_at: iso(Date.parse(AT) - 30 * D) }));
    const runs = await moment(sound, "Ran yesterday", {
      last_run_for: "2026-09-25",
      last_run_at: iso(Date.parse(AT) - D),
    });

    assert.deepEqual(await page(paused, AT), [], "none of the paused workspace's moments is due");
    // Every workspace at once, as the sweep asks: of these two workspaces the sound one's moment is on the page, and
    // the paused twenty-six are neither ahead of it nor counted behind it.
    const all = ok(await db.rpc("playbooks_due", { p_kind: "moment", p_at: AT, p_last_hour: 20, p_limit: 1000 }));
    const mine = all.filter((r) => [paused.id, sound.id].includes(r.playbook.tenant_id));
    assert.deepEqual(ids(mine), [runs], "the sound workspace's moment is due; no paused one is");

    ok(await db.from("tenants").update({ status: "active" }).eq("id", paused.id));
    assert.deepEqual(
      ids(await page(paused, AT)).sort(),
      [...held].sort(),
      "resumed, all twenty-six are due: nothing closed their day while it was paused",
    );
  },
);

test(
  "the page is runDueNow's rule, hour by hour: eight zones (a daylight-saving change, half and three-quarter hours, both ends of the offsets, a POSIX string and a name nobody knows) over forty-eight hours, twelve moments each, and the page is exactly what contracts' rule says is due in the zone the page names",
  { skip },
  async () => {
    // Europe/London leaves summer time at 01:00Z on 25 October 2026, inside the window.
    const ZONES = [
      "America/Chicago",
      "Europe/London",
      "Asia/Kathmandu",
      "Pacific/Chatham",
      "Etc/GMT+12",
      "Etc/GMT-14",
      "UTC+5",
      "Mars/Olympus",
    ];
    const FROM = Date.parse("2026-10-24T00:00:00.000Z");
    const grid = [];
    for (const [z, zone] of ZONES.entries()) {
      const ws = await workspace(`grid-${z}`, zone);
      const rows = [];
      for (const run_hour of [9, 10, 15, 20])
        for (const last_run_for of [null, "2026-10-24", "2026-10-25"])
          rows.push({
            id: await moment(ws, `At ${run_hour}, ran ${last_run_for}`, { run_hour, last_run_for }),
            run_hour,
            last_run_for,
          });
      grid.push({ ws, zone, named: ok(await db.rpc("safe_zone", { p: zone })), rows });
    }
    assert.deepEqual(
      grid.map((g) => g.named),
      [...ZONES.slice(0, 6), "UTC", "UTC"],
      "an Area/Location name Postgres knows is itself; a POSIX string and an unknown name are UTC, as the edge reads them",
    );
    for (let h = 0; h < 48; h += 1) {
      const at = new Date(FROM + h * H);
      for (const g of grid) {
        const got = await page(g.ws, at.toISOString());
        const want = g.rows.filter((r) => runDueNow({ state: "running", ...r }, g.named, at)).map((r) => r.id);
        assert.deepEqual(ids(got).sort(), want.sort(), `${g.zone} at ${at.toISOString()}`);
        assert.ok(got.every((r) => r.timezone === g.named && r.due_total === want.length));
      }
    }
  },
);

/* ------------------------------------------------------------ calendars */

test(
  "calendars_due: a feed's address never read or last read before the hour, never read first; a row whose calendar has no address is not a feed; a feed read this hour is neither in the page nor counted",
  { skip },
  async () => {
    const at = Date.now();
    const before = iso(at - 55 * 60_000);
    const never = await workspace("cal-never", "America/Chicago");
    const older = await workspace("cal-older", "America/Chicago");
    const old = await workspace("cal-old", "America/Chicago");
    const fresh = await workspace("cal-fresh", "America/Chicago");
    const half = await workspace("cal-half", "America/Chicago");
    const blank = await workspace("cal-blank", "America/Chicago");
    const none = await workspace("cal-none", "America/Chicago");
    const mars = await workspace("cal-mars", "Mars/Olympus");
    const feed = (ws) => ({ calendar: { ical_url: `https://cal.example/${ws.id}.ics` } });
    // Every workspace has its config row from the tenants trigger (00017); these give some of them a calendar.
    const set = async (ws, config, checked) =>
      assert.equal(
        ok(
          await db
            .from("tenant_config")
            .update({ config, calendar_checked_at: checked })
            .eq("tenant_id", ws.id)
            .select("tenant_id"),
        ).length,
        1,
        `${ws.id}: one config row`,
      );
    await set(never, feed(never), null);
    await set(older, feed(older), iso(at - 3 * H));
    await set(old, feed(old), iso(at - 2 * H));
    await set(fresh, feed(fresh), iso(at - 10 * 60_000));
    await set(half, { calendar: {} }, null);
    await set(blank, { calendar: { ical_url: "  " } }, null);
    await set(mars, feed(mars), null);

    const one = async (ws) => ok(await db.rpc("calendars_due", { p_before: before, p_limit: 10, p_tenant_id: ws.id }));
    assert.deepEqual(
      (await one(never)).map((r) => [r.tenant_id, r.config, r.timezone, r.due_total]),
      [[never.id, feed(never), "America/Chicago", 1]],
      "never read: due, with its configuration as stored and the zone its feed is read in",
    );
    assert.deepEqual(
      (await one(mars)).map((r) => [r.tenant_id, r.timezone]),
      [[mars.id, "UTC"]],
      "a zone nobody knows: its feed is read in UTC, and the page still answers",
    );
    assert.deepEqual(
      (await one(old)).map((r) => r.tenant_id),
      [old.id],
      "read two hours ago: due",
    );
    for (const [ws, why] of [
      [fresh, "read ten minutes ago"],
      [half, "a calendar with no address"],
      [blank, "a calendar with a blank address"],
      [none, "no calendar at all"],
    ])
      assert.deepEqual(await one(ws), [], `${why}: not in the page, not counted`);

    // Across every workspace, as the sweep asks: never read first, then the least recently read.
    const mine = new Set([never, older, old, fresh, half, blank, none, mars].map((w) => w.id));
    const all = ok(await db.rpc("calendars_due", { p_before: before, p_limit: 1000 }));
    assert.deepEqual(
      all.filter((r) => mine.has(r.tenant_id)).map((r) => r.tenant_id),
      // Two never read, in the order of their ids (a uuid orders as its hex does); then the oldest read.
      [...[never.id, mars.id].sort(), older.id, old.id],
      "never read first, then the oldest; the fresh one and the rows without an address are not the queue",
    );
    assert.ok(
      all.length < 1000 && all.every((r) => r.due_total === all.length),
      "with the whole queue in the page, every row counts the page",
    );
    // Through packages/db, as the sweep reads it: what is left beyond a page of one is everything but the one.
    const whole = await dueCalendars(db, { before: new Date(before), limit: 1000 });
    assert.equal(whole.remaining, 0);
    const first = await dueCalendars(db, { before: new Date(before), limit: 1 });
    assert.equal(first.rows.length, 1);
    // Four of this suite's own are due (never, mars, older, old), so at least three are beyond a page of one; the
    // exact figure is another call's, and the suites beside this one may add feeds between the two.
    assert.ok(first.remaining >= 3, `what is left beyond a page of one: ${first.remaining}`);
    const kept = await dueCalendars(db, { before: new Date(before), limit: 1, tenantId: old.id });
    assert.deepEqual(kept, {
      rows: [{ tenant_id: old.id, config: feed(old), timezone: "America/Chicago" }],
      remaining: 0,
    });
  },
);

/* ------------------------------------------------------------- the door */

test("neither page opens to anon", { skip: skip || (!ANON && "no anon key in env") }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  for (const [fn, args] of [
    ["playbooks_due", { p_kind: "moment", p_at: iso(Date.now()), p_last_hour: 20, p_limit: 1 }],
    ["calendars_due", { p_before: iso(Date.now()), p_limit: 1 }],
  ]) {
    const { error } = await anon.rpc(fn, args);
    assert.ok(error, `${fn}: refused`);
    assert.match(error.message, /permission denied/, fn);
  }
});
