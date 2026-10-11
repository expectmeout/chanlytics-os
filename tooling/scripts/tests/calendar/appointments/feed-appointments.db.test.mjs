/**
 * The calendar feed kept on the appointments record, on a real database (00348 on 00345's record, decision 0002).
 *
 * The hourly sweep hands appointments_feed_sync each read of a workspace's feed; what the door keeps is proved here,
 * since it is a definer door over a table with a guard: the same read twice adds nothing, an appointment that moves is
 * its own row moved, one the read stops naming is vanished and never cancelled, and back when it is named again;
 * nothing is inferred from time, and a booking tool's rows are never touched; a person who is not this workspace's, or
 * not living, is no one's match; an event's title is never kept, even when sent; a read older than the workspace's
 * last is refused, and a key past what the record keeps is left out, never cut; the record's guard holds the feed's
 * rows; a member reads their workspace's and writes none, a stranger reads nothing and the door is the service role's;
 * and an erasure's scrub (00345) takes a person's key, after which the calendar's next read names the visit again,
 * linked to nobody and with none of its words.
 * Skipped without a local database and SUPABASE_ANON_KEY (a member's read is a session's); never production.
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
/** One event of a read, as contracts feedAppointmentRows writes it, and a title as an older sender might add one. */
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
  "nothing is inferred from time (kept is step 8's, with a person's missed); outside the window a read covered nothing is vanished; a person who is not this workspace's or not living is no one's match; a title is never kept",
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
    assert.equal(r.kept, undefined, "the sync infers no status");
    assert.equal((await kept(`past-${RUN}`)).status, "booked", "over for days, and still only what the feed says");
    assert.equal((await kept(`today-${RUN}`)).status, "booked");
    assert.equal(
      (await kept(`past-${RUN}`)).title,
      null,
      "the event's words name the person: read for its service, never kept",
    );
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
  "the guard: kept, missed and cancelled are final; proposed is booked or cancelled, and booked never proposed again; a same-status update is no move",
  { skip },
  async () => {
    const at = Date.now() + 10 * D;
    await sync([row(`g1-${RUN}`, at), row(`g2-${RUN}`, at + H)]);
    const set = (key, status) =>
      db.from("appointments").update({ status }).eq("tenant_id", A).eq("external_id", key).select("status");
    ok(await set(`g1-${RUN}`, "booked"), "a same-status update is no move");
    ok(await set(`g1-${RUN}`, "cancelled"), "booked to cancelled");
    const refused = await set(`g1-${RUN}`, "booked");
    assert.match(refused.error?.message ?? "", /terminal/, "cancelled is final");
    // A booked visit is never a request again (00397): a request is written proposed, and only moves on from there.
    const back = await set(`g2-${RUN}`, "proposed");
    assert.match(back.error?.message ?? "", /not proposed again/, "booked does not go back to proposed");
    // A request, as a booking tool or the receptionist writes one (decision 0002's `proposed`): its edges.
    const at3 = Date.now() + 12 * D;
    ok(
      await db.from("appointments").insert({
        tenant_id: A,
        source: "booking_email",
        external_id: `g3-${RUN}`,
        status: "proposed",
        starts_at: new Date(at3).toISOString(),
        ends_at: new Date(at3 + H).toISOString(),
        timezone: "America/New_York",
      }),
      "a request",
    );
    const kept3 = await db
      .from("appointments")
      .update({ status: "kept" })
      .eq("tenant_id", A)
      .eq("external_id", `g3-${RUN}`)
      .select("status");
    assert.match(kept3.error?.message ?? "", /booked or cancelled/, "a proposed appointment is booked or cancelled");
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
  "an erasure's scrub takes the key of the person's feed rows; the calendar's next read names the visit again, linked to nobody and with none of its words",
  { skip },
  async () => {
    const who = await person();
    const at = Date.now() + 4 * D;
    await sync([row(`e1-${RUN}`, at, { contact_id: who })]);
    const before = await kept(`e1-${RUN}`);
    assert.equal(before.title, null, "never the event's own words");
    ok(await db.rpc("appointments_scrub", { p_tenant_id: A, p_contact_id: who, p_needles: [] }), "scrub");
    const scrubbed = ok(await db.from("appointments").select("title, external_id").eq("id", before.id).single());
    assert.deepEqual([scrubbed.title, scrubbed.external_id], [null, `erased:${before.id}`]);
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString(), phone_e164: null }).eq("id", who));
    await sync([row(`e1-${RUN}`, at, { contact_id: who })]);
    const again = await kept(`e1-${RUN}`);
    assert.notEqual(again.id, before.id, "a new row: the scrubbed one keeps nothing to match");
    assert.equal(again.contact_id, null, "the calendar's next read: nobody's");
    assert.equal(again.title, null, "and none of the words the erasure took: there were none to take");
  },
);

test(
  "a booking tool's row is never touched by the feed's read, which does not name it: not vanished, and its notices may still cancel it",
  { skip },
  async () => {
    const past = Date.now() - 3 * D;
    ok(
      await db.from("appointments").insert({
        tenant_id: A,
        source: "booking_email",
        tool: "acuity",
        external_id: `notice-${RUN}`,
        starts_at: iso(past),
        ends_at: iso(past + H),
        timezone: "UTC",
      }),
      "a notice's row",
    );
    const soon = Date.now() + 2 * D;
    ok(
      await db.from("appointments").insert({
        tenant_id: A,
        source: "booking_email",
        tool: "acuity",
        external_id: `notice-soon-${RUN}`,
        starts_at: iso(soon),
        ends_at: iso(soon + H),
        timezone: "UTC",
      }),
      "a notice's row ahead",
    );
    // A read that names nothing: every feed row in its window vanishes, and only those.
    await sync([]);
    const notices = ok(
      await db
        .from("appointments")
        .select("status, vanished_at")
        .eq("tenant_id", A)
        .in("external_id", [`notice-${RUN}`, `notice-soon-${RUN}`]),
    );
    assert.deepEqual(
      notices.map((n) => [n.status, n.vanished_at]),
      [
        ["booked", null],
        ["booked", null],
      ],
    );
  },
);

test(
  "a read older than the one the workspace last had is refused, and leaves the newer rows as they are; a key past what the record keeps is left out, never cut short",
  { skip },
  async () => {
    const at = Date.now() + 6 * D;
    const now = Date.now();
    await sync([row(`s1-${RUN}`, at)], { now });
    // The sweep stamps the workspace with its tick's time once its read is kept (tenant_config.calendar_checked_at).
    ok(
      await db
        .from("tenant_config")
        .upsert({ tenant_id: A, calendar_checked_at: iso(now) }, { onConflict: "tenant_id" }),
      "stamp",
    );
    try {
      const older = await sync([], { now: now - H });
      assert.equal(older.stale, true, "a tick that overlapped a later one: its read is the older");
      assert.equal(older.vanished, 0);
      assert.equal((await kept(`s1-${RUN}`)).vanished_at, null, "the newer read's rows stand");
      const later = await sync([row(`s1-${RUN}`, at)], { now: now + 1000 });
      assert.equal(later.stale, false, "a read after the stamp is kept");
    } finally {
      ok(await db.from("tenant_config").update({ calendar_checked_at: null }).eq("tenant_id", A), "unstamp");
    }

    const long = "u".repeat(513);
    const r = await sync([row(`s1-${RUN}`, at), row(long, at + H)]);
    assert.equal(r.seen, 1, "the long key is not one the record keeps");
    const stored = ok(await db.from("appointments").select("id").eq("tenant_id", A).like("external_id", "uuuu%"));
    assert.deepEqual(stored, [], "nothing cut to fit: a cut key would never be found again");
    const again = await sync([row(`s1-${RUN}`, at), row(long, at + H)]);
    assert.equal(again.added, 0, "and the next read meets no collision");
  },
);
