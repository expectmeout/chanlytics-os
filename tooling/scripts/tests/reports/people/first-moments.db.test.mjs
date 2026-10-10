/**
 * 00394 on a real Postgres: a new person is one who reached you. contact_first_moments names a person's first reach-in,
 * the earlier of their first inbound message in their own words and their first inbound call that connected, and
 * nobody else: not automated mail, not a reply we wrote, not a call we placed, not a history moved in, not an erased
 * person, not a dial nobody took. report_series (Overview's New people), metrics_summary (Today's, and Ask's `today`)
 * and people_series (00395) read it, so the three say one number.
 * Runs against the database `supabase start` builds on this machine, never production.
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

let db;
const tenants = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
/** An instant `days` days (and `min` more minutes) before now. */
const ago = (days, min = 0) => new Date(Date.now() - (days * DAY_MINUTES + min) * MINUTE);

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
});

/** A workspace in UTC with no one in it yet. */
async function workspace(slug) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}`, name: "Harbor First Moments", timezone: "UTC" })
      .select("id")
      .single(),
  ).id;
  tenants.push(id);
  return id;
}

/** One person and the one conversation they are in. */
async function person(tenantId, phone, over = {}) {
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone, display_name: "Harbor Guest", ...over })
      .select("id")
      .single(),
  ).id;
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: contact, state: "open", last_message_at: ago(0, 1).toISOString() })
      .select("id")
      .single(),
  ).id;
  return { tenantId, contact, conv };
}

/** A message the person sent (inbound, from the customer) unless `over` says otherwise; `meta` is what the intake kept. */
const message = (p, over = {}) => ({
  tenant_id: p.tenantId,
  conversation_id: p.conv,
  contact_id: p.contact,
  channel: "whatsapp",
  direction: "inbound",
  sender: "customer",
  status: "received",
  type: "text",
  body: "hi",
  meta: {},
  ...over,
});

/** A call the person made to us (inbound, connected, a minute long) unless `over` says otherwise. */
let callNo = 0;
const call = (p, startedAt, over = {}) => ({
  tenant_id: p.tenantId,
  contact_id: p.contact,
  retell_call_id: `fm-${Date.now()}-${(callNo += 1)}`,
  direction: "inbound",
  status: "ended",
  started_at: startedAt.toISOString(),
  duration_ms: MINUTE,
  ...over,
});

/**
 * Eleven people, each with one conversation. `named` holds the four who reached us, with the instant of their first
 * reach-in; the other seven (B, C, D, H, I, J, K) must never be named.
 */
async function world() {
  const tenantId = await workspace("harbor-first-moments");
  const who = {};
  for (const [i, key] of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].entries()) {
    who[key] = await person(
      tenantId,
      `+15550139${200 + i}`,
      key === "I" ? { erased_at: new Date().toISOString() } : {},
    );
  }
  const at = {
    A: ago(3),
    E: ago(4),
    F: ago(2),
    Gmessage: ago(1),
    Gcall: ago(5),
    Hmessage: ago(3),
    Hmoved: ago(40),
  };
  const stamped = (when) => ({ created_at: when.toISOString(), channel_ts: when.toISOString() });
  ok(
    await db.from("messages").insert([
      // A: a first word on WhatsApp, three days ago.
      message(who.A, stamped(at.A)),
      // B: only an automatic reply from an address.
      message(who.B, { channel: "email", meta: { email: { claim: "auto_reply" } }, ...stamped(ago(2)) }),
      // C: only a reply the receptionist wrote (no provider time: a row we made).
      message(who.C, {
        direction: "outbound",
        sender: "ai",
        status: "sent",
        body: "hello",
        created_at: ago(2).toISOString(),
      }),
      // F: an inbound row the provider gave no time for: the row's own time stands in.
      message(who.F, { created_at: at.F.toISOString(), channel_ts: null }),
      // G: a word one day ago (the call five days ago came first).
      message(who.G, stamped(at.Gmessage)),
      // H: a word, and a history moved in beside it.
      message(who.H, stamped(at.Hmessage)),
      message(who.H, { meta: { backfill: "true" }, ...stamped(at.Hmoved) }),
      // I: a word from a person who asked to be forgotten.
      message(who.I, stamped(ago(2))),
      // K: only a call's note, written by the system on an inbound row with a provider time: the words are nobody's, so
      // the sender clause keeps it out on its own (C's outbound ai row would also fail the direction clause).
      message(who.K, { channel: "voice", sender: "system", type: "call_summary", ...stamped(ago(2)) }),
    ]),
  );
  ok(
    await db.from("calls").insert([
      // D: a call we placed that connected.
      call(who.D, ago(2), { direction: "outbound" }),
      // E: a call to us that connected, four days ago.
      call(who.E, at.E),
      // G: a call to us that connected, five days ago.
      call(who.G, at.Gcall),
      // J: a dial nobody took.
      call(who.J, ago(2), { status: "not_connected", duration_ms: null }),
    ]),
  );
  return {
    tenantId,
    who,
    named: new Map([
      [who.A.contact, at.A],
      [who.E.contact, at.E],
      [who.F.contact, at.F],
      [who.G.contact, at.Gcall],
    ]),
  };
}

test(
  "a first moment is the first inbound message in a person's own words or the first inbound call that connected: never automated mail, a reply we wrote, a call's note, a call we placed, a moved-in history, an erased person or a dial nobody took",
  { skip },
  async () => {
    const w = await world();
    const firsts = ok(await db.rpc("contact_first_moments", { p_tenant_id: w.tenantId }));
    assert.deepEqual(
      firsts.map((f) => f.contact_id).sort(),
      [...w.named.keys()].sort(),
      "exactly A, E, F and G, the people who wrote in their own words or phoned and were answered: not B, C, D, H, I, J or K",
    );
    for (const f of firsts) {
      assert.equal(
        new Date(f.first_at).getTime(),
        w.named.get(f.contact_id).getTime(),
        "A's message, E's call, F's created_at (no channel_ts), and G's call, which came before its message",
      );
    }
  },
);

test("Reports and Today say the same people are new, and they are the ones the function names", { skip }, async () => {
  const w = await world();
  const firsts = ok(await db.rpc("contact_first_moments", { p_tenant_id: w.tenantId }));
  const weekAgo = Date.now() - 7 * DAY_MINUTES * MINUTE;
  const inTheWeek = firsts.filter((f) => new Date(f.first_at).getTime() >= weekAgo).length;
  assert.equal(inTheWeek, 4, "A, E, F and G all reached us in the last 7 days");

  const r = ok(await db.rpc("report_series", { p_tenant_id: w.tenantId, p_days: 7 }));
  const reports = r.series.slice(-7).reduce((s, d) => s + d.new_contacts, 0);
  const m = ok(await db.rpc("metrics_summary", { p_tenant_id: w.tenantId, p_days: 7 }));
  assert.equal(reports, inTheWeek, "Overview's New people counts the function's people");
  assert.equal(m.period.new_contacts, inTheWeek, "Today's New people counts the same people");
});
