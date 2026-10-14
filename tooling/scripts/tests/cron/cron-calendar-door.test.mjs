/**
 * The calendar sweep, run: POST /api/cron/calendar over a database in memory
 * and a captured wire to the workspaces' feeds and the mailer. Until 13 Sep
 * 2026 its text was pinned by three assertions and its POST had never been
 * called.
 *
 * Every hour, a bounded page of the workspaces with a calendar connected --
 * the never-read first, then the least recently read, and none read twice in
 * an hour. Each feed's appointments put the people they name in People: a
 * phone in the event is the key, the name as the event gives it fills only an
 * empty one, a service the workspace lists is never mistaken for a name, and
 * each person created gets an event saying where they came from. Each row goes
 * through the one door a person is resolved by (resolve_person, decision 0034),
 * which the database in memory answers from its rows. The owner hears the good
 * news as a row on the bell, never as a mail.
 * A read is stamped only on success, so a feed that was briefly unreachable
 * is retried next tick rather than skipped for an hour. What the page could
 * not reach is noted; three ticks of that in a row and the sweep says so with
 * a 503 that sweep_health turns red.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at, knock, answer, wire, refusedAtTheDoor, vault } from "../_cron-doors-world.mjs";

// The mailer and the platform mailbox are configured on purpose: what is not
// mailed below is not mailed by decision, not for want of an address.
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/calendar.ts"));
const { forgetFeeds } = await import(at("apps/edge/lib/calendar/availability.ts"));
const { CALENDAR_PER_TICK, CALENDAR_SWEEP_BUDGET_MS } = await import(at("apps/edge/lib/ops/sweep-rotation.ts"));
after(() => setPg(null));

const D = 86_400_000;
const H = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const fresh = (iso) => iso && Date.now() - Date.parse(iso) < 60_000;

/* --------------------------------------------------------------- the feeds */

const stamp = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
/** An iCal feed as a booking tool writes one: each appointment a few days out, the client's number in its description. */
function ics(events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//booking tool//EN"];
  for (const e of events) {
    const start = new Date(Date.now() + (e.inDays ?? 3) * D);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(start.getTime() + H))}`,
      `SUMMARY:${e.title}`,
      ...(e.phone ? [`DESCRIPTION:Client: ${e.phone}`] : []),
      ...(e.organizer ? [`ORGANIZER:mailto:${e.organizer}`] : []),
      ...(e.guest ? [`ATTENDEE;CN=${e.guest.name}:mailto:${e.guest.email}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
/** Feed address → its text. An address not here is a calendar that is gone. */
const feeds = new Map();
const reply = (u) =>
  u.includes("api.resend.com")
    ? new Response("{}", { status: 200 })
    : feeds.has(u)
      ? new Response(feeds.get(u), { status: 200, headers: { "content-type": "text/calendar" } })
      : new Response("no such calendar", { status: 404 });
const read = (line) => line.calls.filter((c) => c.url.includes("cal.example")).map((c) => c.url);

/* -------------------------------------------------------------- the world */

/**
 * The world. The booking door (00227 reach_out_booked) answers `booked(args)`: none moved by default, and a throw is the
 * database refusing it. Each call is kept. `rpcs` answers any other door by name.
 */
function world({ ticks = 1, faults = {}, booked = () => 0, rpcs = {} } = {}) {
  // One handler instance keeps every feed for five minutes; each case starts with none.
  forgetFeeds();
  feeds.clear();
  const tables = { tenants: [], tenant_config: [], contacts: [], events: [], notifications: [] };
  const backlog = [];
  const bookings = [];
  const kept = [];
  const db = fakeDb(tables, faults, {
    ...vault,
    note_sweep_backlog: (a) => {
      backlog.push(a);
      return ticks;
    },
    reach_out_booked: (a) => {
      bookings.push(a);
      return booked(a);
    },
    // Everyone in People, as people_list answers a page of them: who an appointment can be matched to.
    people_list: (a) =>
      tables.contacts
        .filter((c) => c.tenant_id === a.p_tenant_id && !c.erased_at && !c.merged_into_contact_id)
        .map((c) => ({
          id: c.id,
          display_name: c.display_name ?? null,
          wa_profile_name: c.wa_profile_name ?? null,
          phone_e164: c.phone_e164 ?? null,
          email: c.email ?? null,
        })),
    // The appointments door (00348), whose SQL is proved on a stack (calendar/appointments/feed-appointments.db.test.mjs): kept here as
    // what each read handed it.
    appointments_feed_sync: (a) => {
      kept.push(a);
      return { added: a.p_rows.length, moved: 0, back: 0, vanished: 0, seen: a.p_rows.length, stale: false };
    },
    ...rpcs,
  });
  setPg(db);
  return { db, tables, backlog, bookings, kept, tick: () => knock(POST, "calendar") };
}
/**
 * A workspace with a calendar connected, last read at `checkedAt` (null:
 * never), listing `services` on its profile. Its feed's address back. A brain
 * is whole or absent -- the schema takes no partial one, and a config it
 * rejects reads to the sweep as no calendar at all -- so services come with
 * the rest of a receptionist.
 */
function connected(tables, id, checkedAt, events = [], services = []) {
  const url = `https://cal.example/${id}.ics`;
  const profile = services.length
    ? {
        brain: {
          business_name: `Workspace ${id}`,
          booking_link: `https://book.example/${id}`,
          system_prompt: "Answer as the front desk: brief, warm, and never a price or a booking over text.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { services: services.map((name) => ({ name })) },
        },
      }
    : {};
  tables.tenants.push({ id, name: `Workspace ${id}`, timezone: "America/New_York", status: "active" });
  tables.tenant_config.push({
    tenant_id: id,
    config: { calendar: { ical_url: url }, ...profile },
    calendar_checked_at: checkedAt,
  });
  feeds.set(url, ics(events));
  return url;
}
const checkedAt = (w, id) => w.tables.tenant_config.find((r) => r.tenant_id === id).calendar_checked_at;
/** Since when the workspace's link has failed every read (00434), null while it answers. */
const failedSince = (w, id) => w.tables.tenant_config.find((r) => r.tenant_id === id).calendar_failed_since ?? null;
const people = (w, id) =>
  w.tables.contacts
    .filter((c) => c.tenant_id === id)
    .map((c) => [c.phone_e164, c.display_name])
    .sort();
const bell = (w, id) => w.tables.notifications.filter((n) => n.tenant_id === id).map((n) => [n.kind, n.route, n.title]);

/* -------------------------------------------------------------- the door */

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "calendar", setPg);
});

/* --------------------------------------------------------- the rotation */

test("the rotation, and what a read leaves behind: the never-read workspace first, then the oldest, the one read ten minutes ago left alone; the feed's people go into People with an event each, a known number gains its name, a listed service is nobody's name; the owner hears it as a row on the bell, not a mail; each read is stamped", async () => {
  const w = world();
  const N = "never-read",
    O = "read-two-hours-ago",
    F = "read-ten-minutes-ago",
    X = "no-calendar";
  const urlN = connected(w.tables, N, null, [
    { uid: "n1", title: "Maria Lopez - Balayage", phone: "+1 305 555 0142" },
    { uid: "n2", title: "Haircut with Dana Whitfield", phone: "(305) 555-0177", inDays: 5 },
  ]);
  // O lists a service of two capitalised words -- exactly what a name looks like. The sweep must hand the
  // workspace's services to the guesser, or "Keratin Treatment" becomes a person and Priya is never named.
  const urlO = connected(
    w.tables,
    O,
    ago(2 * H),
    [
      { uid: "o1", title: "Keratin Treatment", phone: "+1 646 555 0123" },
      { uid: "o2", title: "Keratin Treatment - Priya Natarajan", phone: "+1 646 555 0188", inDays: 4 },
    ],
    ["Keratin Treatment"],
  );
  const tenMinutesAgo = ago(10 * 60_000);
  connected(w.tables, F, tenMinutesAgo, [{ uid: "f1", title: "Must not be read", phone: "+1 917 555 0199" }]);
  // Every workspace has a config row; most never connect a calendar. Those rows are not the queue.
  w.tables.tenants.push({ id: X, name: "No calendar", timezone: "America/New_York", status: "active" });
  w.tables.tenant_config.push({ tenant_id: X, config: {}, calendar_checked_at: null });
  // Maria is already in People, by number, without a name.
  w.tables.contacts.push({
    id: "c-maria",
    tenant_id: N,
    phone_e164: "+13055550142",
    display_name: null,
    erased_at: null,
    merged_into_contact_id: null,
  });

  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      tenants: 2,
      seen: 4,
      added: 3,
      named: 1,
      emailed: 0,
      booked: 0,
      failed: 0,
      remaining: 0,
    });
    assert.deepEqual(
      read(line),
      [urlN, urlO],
      "never-read first, then the oldest; the fresh one is not fetched, and a workspace without a calendar is not in the queue",
    );

    // People
    assert.deepEqual(
      people(w, N),
      [
        ["+13055550142", "Maria Lopez"],
        ["+13055550177", "Dana Whitfield"],
      ],
      "the known number gained its name; the new one is a person now",
    );
    assert.equal(w.tables.contacts.find((c) => c.phone_e164 === "+13055550142").id, "c-maria", "named, not duplicated");
    assert.deepEqual(
      people(w, O),
      [
        ["+16465550123", null],
        ["+16465550188", "Priya Natarajan"],
      ],
      "the workspace's own service is nobody's name, even at two capitalised words; the client is whoever follows it",
    );
    assert.deepEqual(people(w, F), []);
    const dana = w.tables.contacts.find((c) => c.phone_e164 === "+13055550177");
    const keratin = w.tables.contacts.find((c) => c.phone_e164 === "+16465550123");
    const priya = w.tables.contacts.find((c) => c.phone_e164 === "+16465550188");
    assert.deepEqual(
      w.tables.events
        .filter((e) => e.kind === "contact.added")
        .map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data.source, e.data.uid])
        .sort(),
      [
        [N, "contact.added", "contact", "contact", dana.id, "calendar", "n2"],
        [O, "contact.added", "contact", "contact", keratin.id, "calendar", "o1"],
        [O, "contact.added", "contact", "contact", priya.id, "calendar", "o2"],
      ].sort(),
      "each person created says where they came from; the one merely named gets none",
    );
    assert.deepEqual(
      w.tables.events
        .filter((e) => e.kind === "person.resolved")
        .map((e) => [e.subject_id, e.data.outcome, e.data.source, e.data.assurance])
        .sort(),
      [
        ["c-maria", "filled", "calendar", "found"],
        [dana.id, "new", "calendar", "found"],
        [keratin.id, "new", "calendar", "found"],
        [priya.id, "new", "calendar", "found"],
      ].sort(),
      "every appointment went through the door, as the feed's word, and the ledger has each resolution",
    );
    assert.ok(
      w.tables.contacts.every((c) => c.consent === undefined),
      "consent untouched: a booking is not a yes",
    );

    // The bell, not the mailbox
    assert.deepEqual(bell(w, N), [["calendar_people", "clients", "1 person added from your calendar"]]);
    assert.deepEqual(bell(w, O), [["calendar_people", "clients", "2 people added from your calendar"]]);
    assert.deepEqual(bell(w, F), []);
    assert.deepEqual(
      line.mail(),
      [],
      "good news is a row, not an email -- with a mailer and a mailbox both configured",
    );

    // The stamps
    assert.ok(fresh(checkedAt(w, N)) && fresh(checkedAt(w, O)), "both reads stamped");
    assert.equal(checkedAt(w, F), tenMinutesAgo, "the fresh one untouched");
    assert.equal(checkedAt(w, X), null);
    assert.deepEqual(w.backlog, [{ p_sweep: "calendar", p_remaining: 0 }], "the queue drained");
    assert.ok(
      !w.db.seen.some((s) => s.table === "tenants"),
      "each feed's zone comes with the page: the workspace row is not read per feed",
    );
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------------ the booking */

test("the booking door is handed each appointment's address and number with its start, the owner's and the organiser's left out, and what it moved is counted", async () => {
  const w = world({ booked: (a) => a.p_seen.length && 1 });
  const B = "books";
  connected(w.tables, B, null, [
    {
      uid: "b1",
      title: "Intro call",
      phone: "+1 305 555 0110",
      organizer: "owner@business.example.com",
      guest: { name: "Sam Rivera", email: "Sam@Brightwater.example.com" },
      inDays: 2,
    },
    { uid: "b2", title: "Blocked out", inDays: 1 },
  ]);
  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.equal(body.booked, 1);
    assert.equal(w.bookings.length, 1, "one call a workspace");
    const [{ p_tenant_id, p_seen }] = w.bookings;
    assert.equal(p_tenant_id, B);
    assert.deepEqual(
      p_seen.map((s) => s.email ?? s.phone).sort(),
      ["+13055550110", "sam@brightwater.example.com"],
      "the guest's address, lower-cased, and the number; never the organiser's",
    );
    const start = p_seen[0].start;
    assert.ok(p_seen.every((s) => s.start === start) && Math.abs(Date.parse(start) - (Date.now() + 2 * D)) < 60_000);
  } finally {
    line.restore();
  }
});

test("a booking door that refuses counts nothing and fails nothing: People is filled and the read is stamped", async () => {
  const w = world({
    booked: () => {
      throw new Error("function public.reach_out_booked(uuid, jsonb) does not exist");
    },
  });
  connected(w.tables, "no-door", null, [{ uid: "d1", title: "Maria Lopez - Balayage", phone: "+1 305 555 0142" }]);
  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual([body.booked, body.failed, body.added], [0, 0, 1]);
    assert.ok(fresh(checkedAt(w, "no-door")), "stamped: the appointment is read again next hour anyway");
  } finally {
    line.restore();
  }
});

/* --------------------------------------------------------------- failure */

test("a feed that cannot be read fails that workspace only and moves it to the back of the page: stamped as tried, so it is read again the next hour behind the feeds that can be, no row, the rest of the page served", async () => {
  const w = world();
  const G = "feed-gone",
    K = "feed-fine";
  const urlG = connected(w.tables, G, null);
  feeds.delete(urlG);
  const urlK = connected(w.tables, K, ago(3 * H), [{ uid: "k1", title: "Trim", phone: "+1 212 555 0100" }]);

  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      tenants: 2,
      seen: 1,
      added: 1,
      named: 0,
      emailed: 0,
      booked: 0,
      failed: 1,
      remaining: 0,
    });
    assert.deepEqual(read(line), [urlG, urlK]);
    assert.ok(fresh(checkedAt(w, G)), "stamped as tried: to the back of the page, read again the next hour");
    assert.ok(fresh(checkedAt(w, K)));
    assert.deepEqual(people(w, G), []);
    assert.deepEqual(people(w, K), [["+12125550100", null]]);
    assert.deepEqual(bell(w, G), []);
    assert.deepEqual(bell(w, K), [["calendar_people", "clients", "1 person added from your calendar"]]);
    assert.deepEqual(line.mail(), []);
  } finally {
    line.restore();
  }
});

test("a link that stopped answering keeps since when from its first failure; a day on, its owner is told once, on the bell, with the door to the link; the read that works clears the stamp and closes the notice (the wiring's second audit, R11 S11-4)", async () => {
  const w = world();
  const G = "link-down";
  const urlG = connected(w.tables, G, null);
  feeds.delete(urlG);
  const row = w.tables.tenant_config.find((r) => r.tenant_id === G);
  /** The next hour: the workspace due again, the feed read afresh rather than from the five minutes' memory. */
  const anHourOn = () => {
    row.calendar_checked_at = ago(2 * H);
    forgetFeeds();
  };
  const told = () => w.tables.notifications.filter((n) => n.tenant_id === G && n.kind === "sweep");

  const line = wire(reply);
  try {
    // The first failure starts the stamp, and tells nobody: one read failing is routine.
    const [s1, b1] = await answer(await w.tick());
    assert.equal(s1, 200, JSON.stringify(b1));
    assert.equal(b1.failed, 1);
    const started = failedSince(w, G);
    assert.ok(fresh(started), "since when, from the first read that failed");
    assert.ok(fresh(checkedAt(w, G)), "and stamped as tried, as before");
    assert.deepEqual(bell(w, G), []);

    // A day of failures later (its start moved back, as a day of ticks would leave it): told, once.
    row.calendar_failed_since = ago(25 * H);
    const dayOld = row.calendar_failed_since;
    anHourOn();
    await answer(await w.tick());
    assert.equal(failedSince(w, G), dayOld, "a link already failing keeps when it began");
    assert.deepEqual(
      bell(w, G),
      [["sweep", "admin/workspace/calendar", "Your calendar link stopped answering"]],
      "the owner told, with the door to the link in Settings",
    );
    assert.match(told()[0].body, /^Your calendar link stopped answering 1d ago\. Until it answers again/);
    anHourOn();
    await answer(await w.tick());
    assert.equal(told().length, 1, "once: the next hour's failure finds the notice kept under the same breakage");

    // It answers again: the stamp is cleared with the read's own, and the notice closes.
    feeds.set(urlG, ics([]));
    anHourOn();
    const [s4, b4] = await answer(await w.tick());
    assert.equal(s4, 200, JSON.stringify(b4));
    assert.equal(b4.failed, 0);
    assert.equal(failedSince(w, G), null, "answering: no stamp");
    assert.ok(fresh(checkedAt(w, G)));
    assert.ok(told()[0].closed_at, "the notice closed by the read that works (contracts NOTICE_MENDS)");
    assert.deepEqual(line.mail(), [], "nobody on file to mail: the bell's row is the notice");
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------------- the budget */

test("the budget: once the tick has spent its forty seconds, the rest of the page is left for the next hour -- unread, unstamped, counted as remaining and noted as backlog -- instead of the function being killed part way with nothing counted", async () => {
  const w = world();
  const S = "slow-first",
    R2 = "read-three-hours-ago",
    R1 = "read-two-hours-ago";
  const urlS = connected(w.tables, S, null, [{ uid: "s1", title: "Trim", phone: "+1 212 555 0100" }]);
  const twoHoursAgo = ago(2 * H);
  const threeHoursAgo = ago(3 * H);
  connected(w.tables, R1, twoHoursAgo, [{ uid: "r1", title: "Must not be read", phone: "+1 917 555 0199" }]);
  connected(w.tables, R2, threeHoursAgo, [{ uid: "r2", title: "Nor this", phone: "+1 917 555 0198" }]);

  // The clock the budget is kept on: reading the first feed takes the whole of it.
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  const line = wire((u) => {
    const r = reply(u);
    if (u.endsWith(`/${S}.ics`)) skew = CALENDAR_SWEEP_BUDGET_MS + 1_000;
    return r;
  });
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      tenants: 1,
      seen: 1,
      added: 1,
      named: 0,
      emailed: 0,
      booked: 0,
      failed: 0,
      remaining: 2,
    });
    assert.deepEqual(read(line), [urlS], "the never-read feed was read; the two behind it were not fetched");
    assert.deepEqual(people(w, S), [["+12125550100", null]]);
    assert.deepEqual([people(w, R1), people(w, R2)], [[], []]);
    assert.ok(fresh(checkedAt(w, S)), "what was read is stamped");
    assert.deepEqual(
      [checkedAt(w, R1), checkedAt(w, R2)],
      [twoHoursAgo, threeHoursAgo],
      "what was not read is not stamped: it keeps its place at the front of the next page",
    );
    assert.deepEqual(
      w.backlog,
      [{ p_sweep: "calendar", p_remaining: 2 }],
      "noted as backlog, so three such ticks alarm",
    );
  } finally {
    Date.now = realNow;
    line.restore();
  }
});

/* ------------------------------------------------------------ the backlog */

/** More workspaces than a tick takes, read oldest-first `hoursApart` hours apart. */
function queue(w, n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `t${String(i).padStart(2, "0")}`;
    ids.push(id);
    // t00 read the longest ago; the last two, most recently.
    connected(w.tables, id, ago((n - i + 1) * H));
  }
  return ids;
}

test("more due than a tick takes: forty are read, the two read most recently wait, and the backlog is noted -- nothing is stamped that was not read", async () => {
  const w = world();
  const ids = queue(w, CALENDAR_PER_TICK + 2);
  const before = Object.fromEntries(ids.map((id) => [id, checkedAt(w, id)]));

  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      tenants: CALENDAR_PER_TICK,
      seen: 0,
      added: 0,
      named: 0,
      emailed: 0,
      booked: 0,
      failed: 0,
      remaining: 2,
    });
    assert.deepEqual(
      read(line),
      ids.slice(0, CALENDAR_PER_TICK).map((id) => `https://cal.example/${id}.ics`),
      "the forty read longest ago, oldest first",
    );
    const stamped = ids.filter((id) => fresh(checkedAt(w, id)));
    const waited = ids.filter((id) => checkedAt(w, id) === before[id]);
    assert.deepEqual(stamped, ids.slice(0, CALENDAR_PER_TICK));
    assert.deepEqual(
      waited,
      ids.slice(CALENDAR_PER_TICK),
      "the two read most recently wait for the next tick, their stamps untouched",
    );
    assert.deepEqual(w.backlog, [{ p_sweep: "calendar", p_remaining: 2 }]);
    assert.deepEqual(w.tables.notifications, [], "empty calendars: nobody added, nobody told");
  } finally {
    line.restore();
  }
});

test("three ticks in a row with work left behind: the sweep says so with a 503, having still done the tick's work", async () => {
  const w = world({ ticks: 3 });
  const ids = queue(w, CALENDAR_PER_TICK + 1);
  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 503, "sweep_health turns this red and mails the platform");
    assert.deepEqual(body, {
      ok: false,
      error: "calendar_backlog",
      backlog_ticks: 3,
      tenants: CALENDAR_PER_TICK,
      seen: 0,
      added: 0,
      named: 0,
      emailed: 0,
      booked: 0,
      failed: 0,
      remaining: 1,
    });
    assert.equal(read(line).length, CALENDAR_PER_TICK, "the page was still served");
    assert.equal(ids.filter((id) => fresh(checkedAt(w, id))).length, CALENDAR_PER_TICK);
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------- cannot be read */

test("a queue that cannot be read is a 500, and no feed is fetched: a database without the page's function included, so the edge deployed ahead of its migration is loud, never quiet", async () => {
  for (const refusal of [
    "permission denied for function calendars_due",
    "Could not find the function public.calendars_due(p_before, p_limit) in the schema cache",
  ]) {
    const w = world({
      rpcs: {
        calendars_due: () => {
          throw new Error(refusal);
        },
      },
    });
    connected(w.tables, "any", null);
    const line = wire(reply);
    try {
      assert.deepEqual(await answer(await w.tick()), [500, { ok: false }], refusal);
      assert.deepEqual(read(line), []);
      assert.deepEqual(w.backlog, []);
      assert.equal(checkedAt(w, "any"), null);
    } finally {
      line.restore();
    }
  }
});

/* ------------------------------------------------------ only what is due */

test("a row whose calendar has no address is not a feed: it holds no place in the page and is not counted, so the fortieth feed behind it is read in the same tick", async () => {
  // Nothing ever stamps such a row read, so a page that took it would take it
  // first, every hour, for ever -- and count the feed it pushed out as a backlog.
  const w = world();
  const ids = queue(w, CALENDAR_PER_TICK);
  w.tables.tenants.push({ id: "half", name: "Half connected", timezone: "America/New_York", status: "active" });
  w.tables.tenant_config.push({ tenant_id: "half", config: { calendar: {} }, calendar_checked_at: null });
  w.tables.tenants.push({ id: "blank", name: "Blank address", timezone: "America/New_York", status: "active" });
  w.tables.tenant_config.push({
    tenant_id: "blank",
    config: { calendar: { ical_url: "" } },
    calendar_checked_at: null,
  });

  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      tenants: CALENDAR_PER_TICK,
      seen: 0,
      added: 0,
      named: 0,
      emailed: 0,
      booked: 0,
      failed: 0,
      remaining: 0,
    });
    assert.deepEqual(
      read(line),
      ids.map((id) => `https://cal.example/${id}.ics`),
      "every feed read, oldest first; the rows without an address are not the queue",
    );
    assert.equal(ids.filter((id) => fresh(checkedAt(w, id))).length, CALENDAR_PER_TICK);
    assert.deepEqual([checkedAt(w, "half"), checkedAt(w, "blank")], [null, null]);
    assert.deepEqual(w.backlog, [{ p_sweep: "calendar", p_remaining: 0 }], "nothing due was left behind");
  } finally {
    line.restore();
  }
});

/* -------------------------------------------------------- the appointments */

test("REGRESSION: the season's standing bookings make the calendar's copy of one a twin, so the bell does not tell it again; a cancelled booking at that time does not, and an event of nobody's is no copy (the review of the wiring's second audit, B5, B7)", async () => {
  const w = world();
  connected(w.tables, "copies", null, [
    { uid: "c1", title: "Dana Rivera - Balayage", phone: "+1 305 555 0144" },
    { uid: "c2", title: "Lee Park - Cut", phone: "+1 305 555 0155", inDays: 5 },
    { uid: "c3", title: "Walk-in", inDays: 6 },
  ]);
  const at = (days) => new Date(Date.now() + days * D).toISOString();
  const booking = (id, phone, days, status) => ({
    id,
    tenant_id: "copies",
    source: "booking_email",
    status,
    client_phone: phone,
    client_email: null,
    contact_id: null,
    starts_at: at(days),
    ends_at: at(days + 0.05),
  });
  // Dana's booking stands; Lee's was cancelled, and the calendar's entry at that time is a booking of its own.
  w.tables.appointments = [booking("b1", "+13055550144", 3, "booked"), booking("b2", "+13055550155", 5, "cancelled")];
  const line = wire(reply);
  try {
    assert.equal((await w.tick()).status, 200);
    const [k] = w.kept;
    assert.deepEqual(
      k.p_rows.map((r) => [r.external_id, r.twin]),
      [
        ["c1", true],
        ["c2", false],
        ["c3", false],
      ],
    );
  } finally {
    line.restore();
  }
});

test("a calendar's first read kept, empty or not, is stamped once, so the next read's additions are no first read; a read that was not the first stamps nothing (the review of the wiring's second audit, M2)", async () => {
  for (const first of [true, false]) {
    const w = world({
      rpcs: {
        appointments_feed_sync: (a) => ({
          added: a.p_rows.length,
          moved: 0,
          back: 0,
          vanished: 0,
          seen: 0,
          stale: false,
          first,
        }),
      },
    });
    connected(w.tables, "fresh", null, []);
    const line = wire(reply);
    try {
      assert.equal((await w.tick()).status, 200);
    } finally {
      line.restore();
    }
    const stamped = w.tables.tenant_config.find((r) => r.tenant_id === "fresh").calendar_feed_kept_at ?? null;
    assert.equal(stamped !== null, first, `the door answered first=${first}`);
  }
});

test("a season's bookings that cannot be read keep nothing of the read: no copy is told as a booking for want of them (the review's follow-up to B7)", async () => {
  const w = world({ faults: { "appointments.select": { message: "statement timeout" } } });
  connected(w.tables, "unread", null, [{ uid: "u1", title: "Dana Rivera - Balayage", phone: "+1 305 555 0144" }]);
  const line = wire(reply);
  try {
    assert.equal((await w.tick()).status, 200);
  } finally {
    line.restore();
  }
  assert.equal(w.kept.length, 0, "nothing handed to the door");
});

test("each read is kept as the workspace's appointments (decision 0002): every event inside the season the read covered, keyed by its UID, its person the one the board would name (after this read put them in People), its service and whether it is a consultation; a feed that cannot be read keeps nothing, and a keep that fails costs the workspace nothing it already did", async () => {
  const w = world();
  connected(
    w.tables,
    "books",
    null,
    [
      { uid: "a1", title: "Maria Lopez - Balayage", phone: "+1 305 555 0142" },
      { uid: "a2", title: "Balayage consult", inDays: 6 },
    ],
    ["Balayage"],
  );
  connected(w.tables, "gone", null, []);
  feeds.delete("https://cal.example/gone.ics");
  const line = wire(reply);
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.equal(body.failed, 1, "the calendar that is gone fails that workspace alone");
    assert.equal(w.kept.length, 1, "one keep, for the feed that was read; a read that failed vanishes nothing");
    const [k] = w.kept;
    assert.equal(k.p_tenant_id, "books");
    assert.equal(k.p_timezone, "America/New_York");
    const days = (Date.parse(k.p_to) - Date.parse(k.p_from)) / D;
    assert.ok(days >= 179 && days <= 181, `the season the read covers, ninety days either side (${days})`);
    const maria = w.tables.contacts.find((c) => c.phone_e164 === "+13055550142");
    assert.ok(maria, "the read put Maria in People first");
    assert.deepEqual(
      k.p_rows.map((r) => [r.external_id, r.service, r.consultation, r.contact_id]),
      [
        ["a1", "Balayage", false, maria.id],
        ["a2", "Balayage", true, null],
      ],
      "keyed by the event's UID; the person by the number in the event; the service the title names; a consultation by its words",
    );
    assert.ok(
      k.p_rows.every((r) => !("title" in r)),
      "never the event's title: the owner's words about a visit name the person",
    );
    assert.deepEqual(
      k.p_rows.map((r) => [r.series, r.twin]),
      [
        [false, false],
        [false, false],
      ],
      "what the bell asks of each addition (00419): neither is a series, and the season holds no booking either copies",
    );
    assert.equal(
      k.p_now,
      checkedAt(w, "books"),
      "the read's time is the stamp's, so an older read is refused as stale",
    );
  } finally {
    line.restore();
  }

  // A keep the database refuses is said in the log, and the workspace is still read: its people are in People.
  const again = world({
    rpcs: {
      appointments_feed_sync: () => {
        throw new Error("relation does not exist");
      },
    },
  });
  connected(again.tables, "books", null, [{ uid: "b1", title: "Haircut - Dana Whitfield", phone: "(305) 555-0177" }]);
  const line2 = wire(reply);
  try {
    const [status, body] = await answer(await again.tick());
    assert.equal(status, 200);
    assert.deepEqual([body.failed, body.added], [0, 1], "not a failed workspace: Dana is in People");
    assert.ok(fresh(checkedAt(again, "books")), "and the read is stamped");
  } finally {
    line2.restore();
  }
});
