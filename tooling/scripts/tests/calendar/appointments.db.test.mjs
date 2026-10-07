/**
 * An appointment is a record, on a real database (00346, decision 0002).
 *
 * The hourly sweep hands appointments_feed_sync each read of a workspace's feed; what the door keeps is proved here,
 * since it is a table, a guard, a definer door and a trigger: the same read twice adds nothing, an appointment that
 * moves is its own row moved, one the read stops naming is vanished and never cancelled, and back when it is named
 * again; a booked appointment over for a day is kept, from time alone; a person who is not this workspace's, or not
 * living, is no one's match; the guard holds the moves; a member reads their workspace's and writes none, a stranger
 * reads nothing and the door is the service role's; and an erasure takes the person's appointments. Skipped without a
 * local database and SUPABASE_ANON_KEY (a member's read is a session's); never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and customers"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: a member's read is a session's"
        : false;

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const H = 3_600_000;
const D = 24 * H;
let db;
let A; // the workspace
let B; // another workspace
let member;
let stranger;
const users = [];
let serial = 0;
const phone = () => `+1646555${String(1300 + ++serial).slice(-4)}`;

async function session(label, tenantId, role) {
  const email = `appt-${label}-${RUN}@example.com`;
  const password = `pw-${RUN}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  if (tenantId) ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `appt-${tag}-${RUN}`, name: `Appointments ${tag}` })
        .select("id")
        .single(),
    ).id;
  A = await workspace("a");
  B = await workspace("b");
  member = await session("operator", A, "operator");
  stranger = await session("stranger", B, "owner");
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const person = async (tenant = A) =>
  ok(await db.from("contacts").insert({ tenant_id: tenant, phone_e164: phone() }).select("id").single(), "person").id;
const iso = (ms) => new Date(ms).toISOString();
/** One event of a read, as contracts feedAppointmentRows writes it. */
const row = (key, startMs, o = {}) => ({
  external_id: key,
  starts_at: iso(startMs),
  ends_at: iso(startMs + H),
  all_day: false,
  title: `Haircut ${key}`,
  service: "Haircut",
  consultation: false,
  contact_id: null,
  ...o,
});
/** One read of the feed: the rows and the window it covered (ninety days either side of now). */
const sync = async (rows, { tenant = A, now = Date.now() } = {}) =>
  ok(
    await db.rpc("appointments_feed_sync", {
      p_tenant_id: tenant,
      p_timezone: "America/New_York",
      p_rows: rows,
      p_from: iso(now - 90 * D),
      p_to: iso(now + 90 * D),
      p_now: iso(now),
    }),
    "appointments_feed_sync",
  );
const kept = async (key, tenant = A) =>
  ok(
    await db
      .from("appointments")
      .select("id, contact_id, status, starts_at, vanished_at, title, service, timezone, source")
      .eq("tenant_id", tenant)
      .eq("external_id", key)
      .maybeSingle(),
    `appointment ${key}`,
  );
const changes = async (id) =>
  ok(
    await db.from("events").select("data").eq("subject_id", id).eq("kind", "appointment.changed").order("created_at"),
    "events",
  ).map((e) => e.data.change);

test(
  "a read is kept once: the same read again adds nothing; a move is the same row moved; a row the read stops naming is vanished, never cancelled, and back when it is named again; each change is said once",
  { skip },
  async () => {
    const soon = Date.now() + 3 * D;
    const who = await person();
    const first = await sync([row(`k1-${RUN}`, soon, { contact_id: who }), row(`k2-${RUN}`, soon + D)]);
    assert.deepEqual([first.added, first.moved, first.vanished, first.seen], [2, 0, 0, 2]);
    const again = await sync([row(`k1-${RUN}`, soon, { contact_id: who }), row(`k2-${RUN}`, soon + D)]);
    assert.deepEqual(
      [again.added, again.moved, again.vanished, again.back],
      [0, 0, 0, 0],
      "the same read changes nothing",
    );

    const one = await kept(`k1-${RUN}`);
    assert.deepEqual(
      [one.contact_id, one.status, one.source, one.timezone, one.service],
      [who, "booked", "calendar_feed", "America/New_York", "Haircut"],
    );

    // k1 moved two hours later; k2 is no longer on the calendar.
    const moved = await sync([row(`k1-${RUN}`, soon + 2 * H, { contact_id: who })]);
    assert.deepEqual([moved.added, moved.moved, moved.vanished], [0, 1, 1]);
    const after = await kept(`k1-${RUN}`);
    assert.equal(after.id, one.id, "the same row, moved");
    assert.equal(Date.parse(after.starts_at), soon + 2 * H);
    const gone = await kept(`k2-${RUN}`);
    assert.ok(gone.vanished_at, "vanished");
    assert.equal(gone.status, "booked", "never cancelled: a feed that drops an event says nothing of why");

    const back = await sync([row(`k1-${RUN}`, soon + 2 * H, { contact_id: who }), row(`k2-${RUN}`, soon + D)]);
    assert.equal(back.back, 1);
    assert.equal((await kept(`k2-${RUN}`)).vanished_at, null, "named again, it is back");
    assert.deepEqual(await changes(one.id), ["added", "moved"]);
    assert.deepEqual(await changes(gone.id), ["added", "vanished", "back"]);
  },
);

test(
  "kept from time alone, a day after it ended with nobody saying otherwise; outside the window a read covered nothing is vanished; a person who is not this workspace's or not living is no one's match",
  { skip },
  async () => {
    const now = Date.now();
    const ours = await person();
    const theirs = await person(B);
    const erased = await person();
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString(), phone_e164: null }).eq("id", erased));
    const r = await sync([
      row(`past-${RUN}`, now - 3 * D, { contact_id: ours }),
      row(`today-${RUN}`, now - 2 * H, { contact_id: theirs }),
      row(`gone-person-${RUN}`, now + D, { contact_id: erased }),
    ]);
    assert.equal(r.kept, 1, "the one over for a day; the one that ended two hours ago waits for its day");
    assert.equal((await kept(`past-${RUN}`)).status, "kept");
    assert.equal((await kept(`today-${RUN}`)).status, "booked");
    assert.equal((await kept(`today-${RUN}`)).contact_id, null, "another workspace's person is nobody here");
    assert.equal((await kept(`gone-person-${RUN}`)).contact_id, null, "an erased person is nobody's match");

    // A read whose window ends before an appointment starts does not vanish it: it was not looked at.
    const far = now + 120 * D;
    ok(
      await db.rpc("appointments_feed_sync", {
        p_tenant_id: A,
        p_timezone: "America/New_York",
        p_rows: [row(`far-${RUN}`, far)],
        p_from: iso(far - D),
        p_to: iso(far + D),
        p_now: iso(now),
      }),
    );
    await sync([]);
    assert.equal((await kept(`far-${RUN}`)).vanished_at, null, "outside the window this read covered");
  },
);

test(
  "the guard: kept, missed and cancelled are final; proposed is booked or cancelled; a same-status update is no move",
  { skip },
  async () => {
    const at = Date.now() + 10 * D;
    await sync([row(`g1-${RUN}`, at), row(`g2-${RUN}`, at + H)]);
    const set = (key, status) =>
      db.from("appointments").update({ status }).eq("tenant_id", A).eq("external_id", key).select("status");
    ok(await set(`g1-${RUN}`, "booked"), "a same-status update is no move");
    ok(await set(`g1-${RUN}`, "cancelled"), "booked to cancelled");
    const refused = await set(`g1-${RUN}`, "booked");
    assert.match(refused.error?.message ?? "", /stays so/, "cancelled is final");
    // A hold, as a booking tool will write one (decision 0002's `proposed`): set here by the service role to test its edges.
    ok(await set(`g2-${RUN}`, "proposed"), "a hold");
    const kept2 = await set(`g2-${RUN}`, "kept");
    assert.match(kept2.error?.message ?? "", /booked or cancelled/, "a proposed appointment is booked or cancelled");
  },
);

test(
  "who reads and writes: a member reads their workspace's and writes none; a stranger reads nothing; the door is the service role's",
  { skip },
  async () => {
    await sync([row(`r1-${RUN}`, Date.now() + 5 * D)]);
    const mine = ok(await member.client.from("appointments").select("external_id").eq("external_id", `r1-${RUN}`));
    assert.equal(mine.length, 1);
    const theirs = ok(await stranger.client.from("appointments").select("id").eq("external_id", `r1-${RUN}`));
    assert.deepEqual(theirs, [], "another workspace's member reads nothing");
    const write = await member.client
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("external_id", `r1-${RUN}`)
      .select("id");
    assert.ok(write.error || (write.data ?? []).length === 0, "a member writes nothing");
    const door = await member.client.rpc("appointments_feed_sync", {
      p_tenant_id: A,
      p_timezone: "UTC",
      p_rows: [],
      p_from: iso(Date.now() - D),
      p_to: iso(Date.now() + D),
    });
    assert.ok(door.error, "the door is the service role's");
    assert.equal((await kept(`r1-${RUN}`)).status, "booked");
  },
);

test(
  "an erasure takes the person's appointments; the next read of the calendar writes what it still names, linked to nobody",
  { skip },
  async () => {
    const who = await person();
    const at = Date.now() + 4 * D;
    await sync([row(`e1-${RUN}`, at, { contact_id: who })]);
    assert.ok(await kept(`e1-${RUN}`));
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString(), phone_e164: null }).eq("id", who));
    assert.equal(await kept(`e1-${RUN}`), null, "gone with the person");
    await sync([row(`e1-${RUN}`, at, { contact_id: who })]);
    assert.equal((await kept(`e1-${RUN}`)).contact_id, null, "the calendar's next read: nobody's");
  },
);
