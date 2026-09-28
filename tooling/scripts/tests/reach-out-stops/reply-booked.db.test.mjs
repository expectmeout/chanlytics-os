/**
 * 00227 on the database (Reach out Part 5, PR 9; G19, N3): a booking or a deal stops a reach-out, through the one
 * converter.
 *
 *   1. an appointment naming the lead's address, or its person's number, starting after the reach-out's email left,
 *      converts the lead (how booking), and the send door's facts then say it is converted; a second call moves nothing;
 *   2. one starting before the email, one naming a lead the reach-out never wrote to, and what is not an appointment
 *      move nothing;
 *   3. a deal for the lead's person converts every ready and nurture lead of that person (an archived one stays), whichever lead the deal
 *      names (how deal, with the deal's id); another workspace's deal does nothing here.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and leads"
      : false;

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
let db;
let A;
let B;
let template;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** A person and their lead, in `tenant`, at `stage`. */
async function leadOf(tenant, { stage = "nurture", person } = {}) {
  n += 1;
  const address = `office-${n}@booked-${stamp}.example`;
  const phone = `+1512555${String(1000 + n).slice(-4)}`;
  const contact =
    person ??
    (await one(
      db
        .from("contacts")
        .insert({ tenant_id: tenant, email: address, phone_e164: phone, display_name: `Fixture ${n}` }),
    ));
  const lead = await one(
    db.from("leads").insert({
      tenant_id: tenant,
      place_id: `ChIJfixtureBooked${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: address,
      email_state: "ok",
      stage,
      contact_id: contact,
      website_host: `booked-${stamp}.example`,
    }),
  );
  return { address, phone, person: contact, lead };
}

/** A lead the reach-out's first step wrote to two days ago. */
async function wroteTo() {
  const ro = await leadOf(A);
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  const root = await one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 5,
      template_id: template,
      template_name: `reach_booked_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: search,
      state: "running",
      signed_by: "Sam",
    }),
  );
  const run = await one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Movers · sent",
      template_id: template,
      template_name: `reach_booked_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state: "sent",
      scheduled_for: iso(Date.now() - 2 * DAY),
      playbook_id: root,
      run_for: new Date(Date.now() - (n + 2) * DAY).toISOString().slice(0, 10),
    }),
  );
  ok(
    await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      broadcast_id: run,
      playbook_id: root,
      root_id: root,
      lead_id: ro.lead,
      contact_id: ro.person,
      state: "sent",
      send_at: iso(Date.now() - 2 * DAY),
      sent_at: iso(Date.now() - 2 * DAY),
    }),
  );
  return ro;
}
const booked = async (seen, tenant = A) => ok(await db.rpc("reach_out_booked", { p_tenant_id: tenant, p_seen: seen }));
const stageOf = async (lead) => ok(await db.from("leads").select("stage").eq("id", lead).single()).stage;
const converted = async (lead) =>
  ok(await db.from("events").select("data").eq("subject_id", lead).eq("kind", "lead.converted")).map((e) => e.data);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `booked-a-${stamp}`, name: "Harbor Moving Co", timezone: "America/Chicago" }),
  );
  B = await one(
    db.from("tenants").insert({ slug: `booked-b-${stamp}`, name: "Other Moving Co", timezone: "America/Chicago" }),
  );
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_booked_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [
        { type: "HEADER", format: "TEXT", text: "A quick question" },
        { type: "BODY", text: "Hi {{business}}, a quick question." },
      ],
    }),
  );
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
});

test(
  "an appointment after the reach-out's email converts its lead, by its address or its person's number",
  { skip },
  async () => {
    const ro = await wroteTo();
    const start = iso(Date.now() + 3 * DAY);
    assert.equal(await booked([{ email: ro.address.toUpperCase(), start }]), 1, "an address, whatever its case");
    assert.equal(await stageOf(ro.lead), "converted");
    assert.deepEqual(await converted(ro.lead), [{ how: "booking", start: (await converted(ro.lead))[0].start }]);
    assert.equal(Date.parse((await converted(ro.lead))[0].start), Date.parse(start));
    const facts = ok(
      await db.rpc("outreach_lead_facts", {
        p_tenant_id: A,
        p_contact_id: ro.person,
        p_to: ro.address,
        p_lead_id: ro.lead,
      }),
    );
    assert.equal(facts.lead_stage, "converted", "the send door's facts stop its next nudge");
    assert.equal(await booked([{ email: ro.address, start }]), 0, "converted once");

    const byPhone = await wroteTo();
    assert.equal(await booked([{ phone: byPhone.phone, start: iso(Date.now() - DAY) }]), 1, "a recent one, by number");
    assert.equal(await stageOf(byPhone.lead), "converted");
  },
);

test(
  "before the email, a lead never written to, another workspace, and what is not an appointment: nothing moves",
  { skip },
  async () => {
    const ro = await wroteTo();
    assert.equal(await booked([{ email: ro.address, start: iso(Date.now() - 3 * DAY) }]), 0, "booked before the email");
    const never = await leadOf(A);
    assert.equal(await booked([{ email: never.address, start: iso(Date.now() + DAY) }]), 0, "never written to");
    assert.equal(await booked([{ email: ro.address, start: iso(Date.now() + DAY) }], B), 0, "another workspace");
    assert.equal(
      await booked([{ email: ro.address, start: "next Tuesday" }, { email: ro.address }, "x", 7]),
      0,
      "no start that is a time",
    );
    assert.equal(await booked({ email: ro.address }), 0, "not a list");
    assert.deepEqual([await stageOf(ro.lead), await stageOf(never.lead)], ["nurture", "nurture"]);
  },
);

test(
  "a deal converts every ready and nurture lead of its person, whichever lead it names; another workspace's does nothing",
  { skip },
  async () => {
    const first = await leadOf(A, { stage: "ready" });
    const second = await leadOf(A, { stage: "nurture", person: first.person });
    const archived = await leadOf(A, { stage: "archived", person: first.person });
    const theirs = await leadOf(B);
    const mine = await leadOf(A);
    const deal = await one(
      db.from("deals").insert({ tenant_id: A, contact_id: first.person, lead_id: second.lead, stage: "proposed" }),
    );
    assert.deepEqual(
      [await stageOf(first.lead), await stageOf(second.lead), await stageOf(archived.lead)],
      ["converted", "converted", "archived"],
    );
    assert.deepEqual(await converted(first.lead), [{ how: "deal", deal_id: deal }]);
    await one(db.from("deals").insert({ tenant_id: B, contact_id: theirs.person, stage: "proposed" }));
    assert.equal(await stageOf(mine.lead), "nurture", "B's deal is B's");
    assert.equal(await stageOf(theirs.lead), "converted");
  },
);
