/**
 * 00632 on the database: a lead who tries their preview rings the bell, and Health counts what previews came to.
 *
 *   1. The first message rings once, for the sender's workspace: titled with the business and what it did, its body the
 *      lead's number, opening the lead. A second message says nothing more.
 *   2. The first call rings once too, apart from the message's line.
 *   3. The number: none on the listing, or one marked wrong, says none is on file; one of another country is said as kept.
 *   4. A lead blanked leaves its lines without its name and its number, and closed.
 *   5. Health's read: what was made, tried, said and called, and what the model cost on a preview's workspace.
 *
 * Local stack only: it makes workspaces and leads with the service key, and removes them.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

let db;
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const tenants = [];
/** Chanlytics' own (ours: it makes previews). */
let A;
let n = 0;

const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureTried${stamp}${n}`,
      business_name: `Fixture Barbers ${n}`,
      city: "Austin",
      region: "TX",
      stage: "ready",
      email: `l${n}-${stamp}@example.com`,
      email_state: "ok",
      phone_e164: "+15125550142",
      ...over,
    }),
  );
};
/** A preview made under `name` and built ready. */
async function ready(over = {}, name = "Fixture Barbers") {
  const leadId = await lead(over);
  const p = ok(
    await db.rpc("preview_make", {
      p_tenant_id: A,
      p_lead_id: leadId,
      p_name: name,
      p_timezone: "America/Chicago",
      p_by: null,
    }),
  );
  tenants.push(p.preview_tenant_id);
  assert.equal(ok(await db.rpc("preview_built", { p_id: p.id, p_ok: true })), true);
  return { ...p, leadId };
}
const say = (p, text = "Do you open Sundays?") =>
  db.rpc("preview_said", { p_id: p.id, p_text: text, p_reply: { text: "We're closed Sundays." } });
const call = (p, seconds = 75) =>
  db.rpc("preview_called", { p_preview_tenant_id: p.preview_tenant_id, p_seconds: seconds });
const linesOf = async (leadId) =>
  ok(
    await db
      .from("notifications")
      .select("kind, title, body, route, subject_type, subject_id, closed_at")
      .eq("tenant_id", A)
      .eq("kind", "preview_tried")
      .eq("subject_id", leadId)
      .order("created_at"),
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db
      .from("tenants")
      .insert({ slug: `tried-a-${stamp}`, name: "Chanlytics", timezone: "America/New_York", ours: true }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  tenants.push(A);
});

after(async () => {
  if (skip) return;
  for (const id of tenants.filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test(
  "the first message rings once: the business, what it did, its number, and the lead to open",
  { skip },
  async () => {
    const p = await ready();
    assert.deepEqual(await linesOf(p.leadId), [], "made and built says nothing");
    assert.equal(ok(await say(p)), 1);
    assert.deepEqual(await linesOf(p.leadId), [
      {
        kind: "preview_tried",
        title: "Fixture Barbers texted their preview",
        body: "Their number is +1 (512) 555-0142.",
        route: `clients/leads:p-${p.leadId}`,
        subject_type: "lead",
        subject_id: p.leadId,
        closed_at: null,
      },
    ]);
    assert.equal(ok(await say(p, "And Mondays?")), 2);
    assert.equal((await linesOf(p.leadId)).length, 1, "a second message says nothing more");
  },
);

test("the first call rings once too, apart from the message's line", { skip }, async () => {
  const p = await ready();
  assert.equal(ok(await call(p)), true);
  assert.deepEqual(
    (await linesOf(p.leadId)).map((l) => l.title),
    ["Fixture Barbers called their preview"],
  );
  ok(await call(p, 30));
  assert.equal((await linesOf(p.leadId)).length, 1, "a second call says nothing more");
  ok(await say(p));
  assert.deepEqual(
    (await linesOf(p.leadId)).map((l) => l.title),
    ["Fixture Barbers called their preview", "Fixture Barbers texted their preview"],
    "their first message after is its own news",
  );
});

test(
  "the number: none, or one marked wrong, says none is on file; another country's is said as kept",
  { skip },
  async () => {
    const none = await ready({ phone_e164: null });
    ok(await say(none));
    assert.equal((await linesOf(none.leadId))[0].body, "No number is on file for them.");
    const wrong = await ready({ phone_wrong: true });
    ok(await say(wrong));
    assert.equal((await linesOf(wrong.leadId))[0].body, "No number is on file for them.");
    const abroad = await ready({ phone_e164: "+442079460000" });
    ok(await say(abroad));
    assert.equal((await linesOf(abroad.leadId))[0].body, "Their number is +442079460000.");
  },
);

test("a lead blanked leaves its lines without its name and its number, and closed", { skip }, async () => {
  const p = await ready();
  const kept = await ready();
  ok(await say(p));
  ok(await say(kept));
  ok(await db.rpc("lead_blank", { p_lead_id: p.leadId }));
  const [scrubbed] = await linesOf(p.leadId);
  assert.deepEqual([scrubbed.title, scrubbed.body, scrubbed.route], ["A lead tried their preview", "", null]);
  assert.ok(scrubbed.closed_at, "and closed");
  const [other] = await linesOf(kept.leadId);
  assert.deepEqual([other.title, other.closed_at], ["Fixture Barbers texted their preview", null]);
});

test(
  "Health's read: what was made, tried, said and called, and what the model cost on a preview",
  { skip },
  async () => {
    const was = ok(await db.rpc("platform_health_previews", { p_days: 7 }));
    const p = await ready();
    ok(await say(p));
    ok(await say(p, "And Mondays?"));
    ok(await call(p, 75));
    ok(
      await db.from("ai_usage").insert({
        tenant_id: p.preview_tenant_id,
        purpose: "website_read",
        model_asked: "fixture-model",
        model: "fixture-model",
        outcome: "answered",
        usd: 0.25,
      }),
    );
    const now = ok(await db.rpc("platform_health_previews", { p_days: 7 }));
    const moved = (key) => Number(now[key]) - Number(was[key]);
    assert.deepEqual(
      ["made", "made_today", "tried", "claimed", "messages", "call_seconds"].map(moved),
      [1, 1, 1, 0, 2, 75],
    );
    assert.ok(Math.abs(moved("usd") - 0.25) < 1e-9, `the model's cost on its workspace: ${moved("usd")}`);
    // The window is held between a day and ninety: a nonsense ask reads a day, never everything.
    assert.equal(typeof ok(await db.rpc("platform_health_previews", { p_days: 0 })).made, "number");
  },
);
