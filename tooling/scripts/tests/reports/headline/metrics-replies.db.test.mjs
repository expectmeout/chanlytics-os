/**
 * 00359 on a real Postgres: metrics_summary answers the day's replies it read to count who answered, so Today's read asks
 * first_replies once, inside the function, and not a second time beside it. The rows are the ones the server read for itself
 * (packages/db `firstReplies` from 26 hours back, kept to the window's own midnight), reply for reply: the receptionist's only,
 * whole seconds and whole holds, in the order they were asked, and none of yesterday's. A longer window answers null, as its
 * replies are Reports'. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { HOUR_MS } from "@chanlytics/contracts";
import { firstReplies } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

/**
 * A zone in which it is about noon as the suite runs, so "a few minutes ago" is today and "25 hours ago" is not, whatever
 * hour that is: a fixed offset (the Etc zones name theirs backwards: Etc/GMT-5 is five hours ahead of UTC).
 */
const AHEAD = 12 - new Date().getUTCHours();
const ZONE = AHEAD === 0 ? "Etc/GMT" : `Etc/GMT${AHEAD > 0 ? "-" : "+"}${Math.abs(AHEAD)}`;

let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);
const plus = (d, s) => new Date(d.getTime() + s * 1000).toISOString();
/**
 * A reply as either reader lists it, the moment it was asked as an instant (the two spell one timestamp two ways), in the
 * order asked: the function's own order, and one first_replies promises nobody.
 */
const listed = (rows) =>
  rows.map((r) => ({ asked: Date.parse(r.asked_at), s: r.s, hold: r.hold })).sort((a, b) => a.asked - b.asked);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-day-replies-${Date.now()}`, name: "Harbor Day Replies", timezone: ZONE })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

async function person(phone) {
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone, display_name: "Harbor Guest" })
      .select("id")
      .single(),
  );
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: ago(1).toISOString() })
      .select("id")
      .single(),
  );
  return { contact: contact.id, conv: conv.id };
}

const message = (p, over) => ({
  tenant_id: tenantId,
  conversation_id: p.conv,
  contact_id: p.contact,
  channel: "whatsapp",
  type: "text",
  body: "hi",
  meta: {},
  ...over,
});
const asked = (p, at) =>
  message(p, {
    direction: "inbound",
    sender: "customer",
    status: "received",
    created_at: at.toISOString(),
    channel_ts: at.toISOString(),
  });
const answered = (p, at, seconds, over = {}) =>
  message(p, {
    direction: "outbound",
    sender: "ai",
    status: "sent",
    body: "hello",
    created_at: plus(at, seconds),
    ...over,
  });

test(
  "the day's numbers carry the day's replies: the receptionist's, whole, in the order asked, and the same rows first_replies lists",
  { skip },
  async () => {
    const quiet = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 1 }));
    assert.deepEqual(quiet.replies, [], "a day nobody was answered on carries none, which is not 'no answer' (null)");

    const held = await person("+15550139001");
    const atOnce = await person("+15550139002");
    const yours = await person("+15550139003");
    const waiting = await person("+15550139004");
    const yesterday = await person("+15550139005");
    const [t1, t2, t3, t4, t0] = [ago(30), ago(20), ago(15), ago(10), ago(25 * 60)];
    ok(
      await db.from("messages").insert([
        // Held a minute and sent as it ended: 60.6 seconds, which both readers call 61.
        asked(held, t1),
        answered(held, t1, 60.6, { meta: { source: "veto_window", delay_ms: 60000 } }),
        // Sent at once.
        asked(atOnce, t2),
        answered(atOnce, t2, 7.4),
        // The owner's own answer, and a message nobody has answered: neither is one of the receptionist's replies.
        asked(yours, t3),
        message(yours, {
          direction: "outbound",
          sender: "human",
          status: "sent",
          body: "Yes",
          created_at: plus(t3, 45),
        }),
        asked(waiting, t4),
        // Asked and answered before the window's midnight: yesterday's, and no part of today's.
        asked(yesterday, t0),
        answered(yesterday, t0, 61, { meta: { source: "veto_window", delay_ms: 60000 } }),
      ]),
    );

    const day = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 1 }));
    assert.deepEqual(listed(day.replies), [
      { asked: t1.getTime(), s: 61, hold: 60 },
      { asked: t2.getTime(), s: 7, hold: 0 },
    ]);
    assert.deepEqual(
      day.replies.map((r) => Date.parse(r.asked_at)),
      [t1.getTime(), t2.getTime()],
      "in the order they were asked",
    );
    assert.equal(day.period.answered_by_ai, 2, "the replies listed are the ones counted");

    // What the server read for itself before 00359, as it read it: from 26 hours back, kept to the window's midnight.
    const since = Date.parse(day.window.since);
    const beside = (await firstReplies(db, tenantId, new Date(Date.now() - 26 * HOUR_MS))).filter(
      (r) => Date.parse(r.asked_at) >= since,
    );
    assert.equal(beside.length, 2);
    assert.deepEqual(listed(day.replies), listed(beside), "REGRESSION: the two reads of one day disagree");

    const week = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 7 }));
    assert.equal(week.replies, null, "a longer window's replies are Reports': this answer carries none");
    assert.equal(week.period.answered_by_ai, 3, "though it counts them, yesterday's with today's");
  },
);
