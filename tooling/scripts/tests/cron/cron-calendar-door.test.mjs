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
 * each person created gets an event saying where they came from. The owner
 * hears the good news as a row on the bell, never as a mail.
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
const { CALENDAR_PER_TICK } = await import(at("apps/edge/lib/ops/sweep-rotation.ts"));
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
    ...rpcs,
  });
  setPg(db);
  return { db, tables, backlog, bookings, tick: () => knock(POST, "calendar") };
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
        .map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data.source, e.data.uid])
        .sort(),
      [
        [N, "contact.added", "contact", "contact", dana.id, "calendar", "n2"],
        [O, "contact.added", "contact", "contact", keratin.id, "calendar", "o1"],
        [O, "contact.added", "contact", "contact", priya.id, "calendar", "o2"],
      ].sort(),
      "each person created says where they came from; the one merely named gets none",
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

test("a feed that cannot be read fails that workspace only and leaves it due: no stamp, no row, the rest of the page served", async () => {
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
    assert.equal(checkedAt(w, G), null, "not stamped: still due, retried next tick");
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
