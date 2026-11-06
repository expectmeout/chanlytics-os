/**
 * 00304 on a real Postgres, in a zone that is not UTC: report_series and metrics_summary count only what they say.
 * A broadcast is not "you"; a call that errored before anyone spoke is not a call; an erased person is not new, and
 * Reports and Today agree on who is; each reply carries its hold; and arrivals say each message and call by the local
 * day and quarter hour. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

const ZONE = "America/New_York";
let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);
const plus = (d, s) => new Date(d.getTime() + s * 1000).toISOString();
/** The day and quarter hour an instant falls in on the tenant's clock. */
function local(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { d: `${p.year}-${p.month}-${p.day}`, q: Number(p.hour) * 4 + Math.floor(Number(p.minute) / 15) };
}

/**
 * The instant a wall time on the tenant's clock is, on a given local day: 23:20 in New York is 03:20 or 04:20 UTC the
 * next day, so its local day is never its UTC day, whatever hour the suite runs.
 */
function atLocal(day, hour, minute) {
  const [y, mo, d] = day.split("-").map(Number);
  for (const offset of [4, 5]) {
    const t = new Date(Date.UTC(y, mo - 1, d, hour + offset, minute));
    const k = local(t);
    if (k.d === day && k.q === hour * 4 + Math.floor(minute / 15)) return t;
  }
  throw new Error(`${hour}:${minute} on ${day} does not exist in ${ZONE}`);
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-counts-${Date.now()}`, name: "Harbor Counts", timezone: ZONE })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

test("Reports and Today count only what they say", { skip }, async () => {
  const mk = async (phone, over = {}) => {
    const c = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: phone, display_name: "Harbor Guest", ...over })
        .select("id")
        .single(),
    );
    const v = ok(
      await db
        .from("conversations")
        .insert({ tenant_id: tenantId, contact_id: c.id, state: "open", last_message_at: ago(1).toISOString() })
        .select("id")
        .single(),
    );
    return { contact: c.id, conv: v.id };
  };
  const msg = (p, over) => ({
    tenant_id: tenantId,
    conversation_id: p.conv,
    contact_id: p.contact,
    channel: "whatsapp",
    type: "text",
    body: "hi",
    meta: {},
    ...over,
  });
  const a = await mk("+15550138101");
  const b = await mk("+15550138102");
  const gone = await mk("+15550138103", { erased_at: new Date().toISOString() });
  const askA = ago(300);
  const askB = ago(200);
  const askGone = ago(100);
  // A message at a fixed hour on the tenant's clock, three days back: its local day is not its UTC day at any time of
  // the run, so a day taken in UTC instead of the tenant's zone cannot pass. Quarter 93 is 23:15 to 23:30.
  const lateDay = local(ago(3 * 24 * 60)).d;
  const askLate = atLocal(lateDay, 23, 20);
  assert.notEqual(askLate.toISOString().slice(0, 10), lateDay, "the fixture's UTC day is not its local day");
  ok(
    await db.from("messages").insert([
      // An inbound message carries the provider's time as production's ingest_inbound stamps it: a person's first
      // moment is the earliest of those.
      msg(a, {
        direction: "inbound",
        sender: "customer",
        status: "received",
        created_at: askA.toISOString(),
        channel_ts: askA.toISOString(),
      }),
      msg(a, {
        direction: "outbound",
        sender: "ai",
        status: "sent",
        body: "hello",
        created_at: plus(askA, 61),
        meta: { source: "veto_window", delay_ms: 60000 },
      }),
      msg(b, {
        direction: "inbound",
        sender: "customer",
        status: "received",
        created_at: askB.toISOString(),
        channel_ts: askB.toISOString(),
      }),
      msg(b, {
        direction: "outbound",
        sender: "human",
        status: "sent",
        body: "Offer",
        created_at: plus(askB, 20),
        meta: { source: "broadcast" },
      }),
      msg(b, {
        direction: "outbound",
        sender: "human",
        status: "sent",
        body: "Saturday works",
        created_at: plus(askB, 600),
      }),
      msg(gone, {
        direction: "inbound",
        sender: "customer",
        status: "received",
        created_at: askGone.toISOString(),
        channel_ts: askGone.toISOString(),
      }),
      // On the erased person's thread, so no one's answer, first moment or send changes: only arrivals count it.
      msg(gone, {
        direction: "inbound",
        sender: "customer",
        status: "received",
        created_at: askLate.toISOString(),
        channel_ts: askLate.toISOString(),
      }),
    ]),
  );
  const callOk = ago(50);
  ok(
    await db.from("calls").insert([
      {
        tenant_id: tenantId,
        retell_call_id: `cnt-${Date.now()}-a`,
        contact_id: a.contact,
        status: "ended",
        started_at: callOk.toISOString(),
        duration_ms: 60_000,
      },
      {
        tenant_id: tenantId,
        retell_call_id: `cnt-${Date.now()}-b`,
        contact_id: a.contact,
        status: "error",
        started_at: ago(40).toISOString(),
        duration_ms: 0,
      },
    ]),
  );

  const r = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 7 }));
  const now = r.series.slice(-7);
  const sum = (k) => now.reduce((s, d) => s + d[k], 0);

  assert.equal(sum("answered_ai"), 1);
  assert.equal(sum("answered_you"), 1, "the owner's reply; the broadcast before it answered nobody");
  assert.equal(sum("out_you"), 1, "the broadcast is not the owner's send");
  assert.equal(sum("calls"), 1, "the call that errored before anyone spoke is not a call");
  assert.equal(sum("new_contacts"), 2, "a and b; the erased person is not new");
  assert.deepEqual(
    r.replies.map((x) => [x.s, x.hold]),
    [[61, 60]],
  );
  assert.equal("instagram" in r.channels.current, false);

  const want = new Map();
  for (const t of [askA, askB, askGone, askLate, callOk]) {
    const k = local(t);
    const key = `${k.d}|${k.q}`;
    want.set(key, (want.get(key) ?? 0) + 1);
  }
  const got = new Map(r.arrivals.map((x) => [`${x.d}|${x.q}`, x.n]));
  assert.deepEqual(got, want, "each message and connected call by its local day and quarter hour");
  assert.deepEqual(
    r.arrivals.filter((x) => x.d === lateDay),
    [{ d: lateDay, q: 93, n: 1 }],
    "23:20 local is the local day's quarter 93, not the UTC day's",
  );

  const m = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 7 }));
  assert.equal(m.period.new_contacts, sum("new_contacts"), "Reports and Today say the same people are new");
  assert.equal(m.period.calls, 1);
  assert.equal(m.period.messages_out_you, 1);
  assert.equal(m.period.answered_by_you, 1);
});
