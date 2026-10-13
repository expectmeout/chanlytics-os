/**
 * A call is logged on the person (decision 0052, canvas A M4) -- on a real database.
 *
 * person_call_logged keeps what the member said of a call they made: a note (the team's own unless the receptionist should
 * know; with a day, a step, which is always the team's, beside the note where the receptionist reads it), and, where the
 * person's business is an open lead, the outcome through lead_set_stage. Rows, rights and events reading source cannot
 * prove, so these run against Postgres in the database workflow; skipped without a local database.
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
      ? "refusing a database that is not on this machine: this suite writes customers"
      : !process.env.SUPABASE_ANON_KEY
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in need it"
        : false;

const RUN = Date.now().toString(36);
const PASSWORD = "a-long-test-password-1";
let serial = 0;
let db;
let tenantId;
const users = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const one = async (q, what) => ok(await q.select("id").single(), what).id;
const phone = () => `+1555011${String(++serial).padStart(4, "0")}`;

/** A member of the workspace, signed in as themselves. */
const member = async (role, tag) => {
  const email = `call-logged-${tag}-${RUN}@example.test`;
  const { data: made, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(made.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.user.id, role }), "membership");
  const as = createClient(URL_, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  ok(await as.auth.signInWithPassword({ email, password: PASSWORD }), "sign in");
  return { id: made.user.id, as };
};

const person = (row) => one(db.from("contacts").insert({ tenant_id: tenantId, ...row }), "person");
const business = (name, row = {}) =>
  one(
    db
      .from("leads")
      .insert({ tenant_id: tenantId, place_id: `call-logged-${++serial}-${RUN}`, business_name: name, ...row }),
    "lead",
  );
const notesOf = async (id) =>
  ok(
    await db
      .from("person_notes")
      .select("body, team_only, due_on, author_user_id")
      .eq("contact_id", id)
      .order("created_at"),
    "notes",
  );
const leadRow = async (id) =>
  ok(
    await db
      .from("leads")
      .select("stage, closed_reason, phone_wrong, last_outcome, last_note, contact_id")
      .eq("id", id)
      .single(),
    "lead",
  );
const told = async (subject, kind) =>
  ok(
    await db.from("events").select("data").eq("tenant_id", tenantId).eq("subject_id", subject).eq("kind", kind),
    "events",
  );

/** The door's arguments as the route sends them (contracts personCallNote, personCallLeadArgs): words by hand here. */
const log = (who, id, a) => who.as.rpc("person_call_logged", { p_contact_id: id, p_tell: false, ...a });

let maria;
let viewer;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = await one(db.from("tenants").insert({ slug: `call-logged-${RUN}`, name: "Call logged" }), "tenant");
  maria = await member("operator", "maria");
  viewer = await member("viewer", "viewer");
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "a call on someone at no business is a note: the team's own, a step with a day; the receptionist's to read when told, the step then beside it; a viewer logs nothing",
  { skip },
  async () => {
    const emily = await person({ display_name: "Emily Chen", phone_e164: phone() });
    const refused = ok(await log(viewer, emily, { p_outcome: "spoke", p_body: "Call · Spoke" }), "viewer");
    assert.deepEqual(refused, { error: "not_found" }, "a viewer is a stranger to the door");

    const plain = ok(await log(maria, emily, { p_outcome: "voicemail", p_body: "Call · Left a voicemail" }), "plain");
    assert.equal(plain.lead, null, "no business, no lead");
    assert.equal(plain.step, null);
    ok(
      await log(maria, emily, {
        p_outcome: "call_back",
        p_body: "Call · Call back later: after five",
        p_due_on: "2026-10-20",
      }),
      "with a day",
    );
    const told1 = ok(
      await log(maria, emily, {
        p_outcome: "spoke",
        p_body: "Call · Spoke: wants rates by email",
        p_tell: true,
        p_due_on: "2026-10-21",
        p_step_body: "Call back",
      }),
      "told",
    );
    assert.ok(told1.note && told1.step, "the note and its step");
    assert.deepEqual(
      (await notesOf(emily)).map((n) => [n.body, n.team_only, n.due_on, n.author_user_id === maria.id]),
      [
        ["Call · Left a voicemail", true, null, true],
        ["Call · Call back later: after five", true, "2026-10-20", true],
        ["Call · Spoke: wants rates by email", false, null, true],
        ["Call back", true, "2026-10-21", true],
      ],
    );
    assert.equal((await told(emily, "contact.noted")).length, 4, "each note told once, as every note is");
    assert.deepEqual(ok(await log(maria, emily, { p_outcome: "hung_up", p_body: "Call" }), "bad"), {
      error: "bad_outcome",
    });
    assert.deepEqual(ok(await log(maria, emily, { p_outcome: "spoke", p_body: "   " }), "empty"), { error: "empty" });
  },
);

test(
  "at an open lead the outcome moves it as Leads' call does, in the same press: a call that went nowhere keeps it Talking; Not interested closes it; Spoke is no lead's",
  { skip },
  async () => {
    const leah = await person({ display_name: "Leah Brooks", phone_e164: phone() });
    const lead = await business("Hyde Park Physio", { contact_id: leah, stage: "converted" });
    assert.equal((await leadRow(lead)).contact_id, leah);

    ok(await log(maria, leah, { p_outcome: "spoke", p_body: "Call · Spoke" }), "spoke");
    assert.equal((await leadRow(lead)).last_outcome, null, "Spoke is no lead's outcome");

    const r = ok(
      await log(maria, leah, {
        p_outcome: "no_answer",
        p_body: "Call · No answer",
        p_lead_stage: "nurture",
        p_lead_note: "rang twice",
      }),
      "no answer",
    );
    assert.equal(
      r.lead.stage,
      "converted",
      "a lead Talking is never taken back to Contacted by a call that went nowhere",
    );
    const after1 = await leadRow(lead);
    assert.deepEqual([after1.stage, after1.last_outcome, after1.last_note], ["converted", "no_answer", "rang twice"]);
    assert.equal((await told(lead, "lead.call")).length, 1, "Leads' own call log hears it");

    ok(
      await log(maria, leah, {
        p_outcome: "wrong_number",
        p_body: "Call · Wrong number",
      }),
      "wrong",
    );
    assert.equal((await leadRow(lead)).phone_wrong, false, "their own number was wrong, never the listing's");

    ok(
      await log(maria, leah, {
        p_outcome: "not_interested",
        p_body: "Call · Not interested",
        p_lead_stage: "archived",
        p_lead_reason: "said_no",
      }),
      "no",
    );
    const after2 = await leadRow(lead);
    assert.deepEqual([after2.stage, after2.closed_reason], ["archived", "said_no"]);

    ok(
      await log(maria, leah, { p_outcome: "voicemail", p_body: "Call · Left a voicemail", p_lead_stage: "nurture" }),
      "closed",
    );
    assert.equal((await leadRow(lead)).last_outcome, "not_interested", "a closed lead is not moved again");
    assert.equal((await notesOf(leah)).length, 5, "and every call is a note on the person all the same");
  },
);

test(
  "the listing's phone: a wrong number marks the listing's, Interested names the stand-in as typed, and a lead nobody stands for is never moved",
  { skip },
  async () => {
    // A colleague linked by hand to a business never written to: its Interested would make a second person, so no lead moves.
    const colleague = await person({ display_name: "Sam Ortiz", name_source: "typed" });
    const unwritten = await business("Southgate Frames", { phone_e164: phone() });
    ok(await db.from("contacts").update({ lead_id: unwritten }).eq("id", colleague), "works there");
    const kept = ok(await log(maria, colleague, { p_outcome: "interested", p_body: "Call · Interested" }), "kept");
    assert.equal(kept.lead, null);
    const still = await leadRow(unwritten);
    assert.deepEqual(
      [still.stage, still.contact_id, still.last_outcome],
      ["ready", null, null],
      "nobody made, nothing moved",
    );

    const standIn = await person({ display_name: "Bloom & Vow Bridal", name_source: "lead" });
    const lead = await business("Bloom & Vow Bridal", { phone_e164: phone(), contact_id: standIn });
    assert.equal((await leadRow(lead)).contact_id, standIn, "the business's own person");

    ok(await log(maria, standIn, { p_outcome: "wrong_number", p_body: "Call · Wrong number" }), "wrong");
    assert.equal((await leadRow(lead)).phone_wrong, true, "no number of their own: the call rang the listing");

    const r = ok(
      await log(maria, standIn, {
        p_outcome: "interested",
        p_body: "Call · Interested",
        p_spoke_with: "Priya Nair",
      }),
      "interested",
    );
    assert.equal(r.lead.converted, true);
    const after = await leadRow(lead);
    assert.deepEqual([after.stage, after.contact_id], ["converted", standIn], "this person, never a second one");
    const named = ok(await db.from("contacts").select("display_name, name_source").eq("id", standIn).single(), "named");
    assert.deepEqual([named.display_name, named.name_source], ["Priya Nair", "typed"]);
  },
);

/** The person's thread (one a person), holding an open request of `reason` (escalation_open, the one door for it). */
const holding = async (contactId, reason) => {
  const id = await one(db.from("conversations").insert({ tenant_id: tenantId, contact_id: contactId }), "thread");
  const opened = ok(
    await db.rpc("escalation_open", {
      p_tenant_id: tenantId,
      p_conversation_id: id,
      p_reason: reason,
      p_details: "Call me after five.",
    }),
    reason,
  );
  assert.equal(opened, "opened");
  return id;
};
const holdOf = async (thread) =>
  ok(
    await db
      .from("escalations")
      .select("state, reason, resolved_by_user_id, decision_id")
      .eq("conversation_id", thread)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    "the hold",
  );
const threadOf = async (id) =>
  ok(await db.from("conversations").select("state, assignee_user_id").eq("id", id).single(), "thread");

test(
  "REGRESSION (the wiring's second audit, X3-1): a call that was the call back they asked for hands their thread back, as the caller, and its bell row closes; a thread asking something else, a call not ticked as it, and a viewer move nothing",
  { skip },
  async () => {
    const ana = await person({ display_name: "Ana Ruiz", phone_e164: phone() });
    const bo = await person({ display_name: "Bo Lind", phone_e164: phone() });
    const asked = await holding(ana, "callback");
    const handoff = await holding(bo, "manual");
    const rang = ok(
      await db
        .from("notifications")
        .insert({
          tenant_id: tenantId,
          kind: "call",
          title: "Ana asked for a call back",
          body: "Call me after five.",
          subject_type: "conversation",
          subject_id: asked,
        })
        .select("id")
        .single(),
      "the bell's row",
    ).id;

    // Not ticked: the note alone, as before 00422.
    const plain = ok(await log(maria, ana, { p_outcome: "spoke", p_body: "Call · Spoke" }), "not ticked");
    assert.equal(plain.handed_back, false);
    assert.equal((await holdOf(asked)).state, "open", "a call not said to be the call back closes nothing");
    // A viewer may not, and moves nothing.
    assert.deepEqual(
      ok(await log(viewer, ana, { p_outcome: "spoke", p_body: "Call · Spoke", p_closes_call_back: true }), "viewer"),
      { error: "not_found" },
    );
    assert.equal((await holdOf(asked)).state, "open");

    const done = ok(
      await log(maria, ana, { p_outcome: "spoke", p_body: "Call · Spoke: booked Friday", p_closes_call_back: true }),
      "the call back",
    );
    assert.equal(done.handed_back, true, "their thread, holding the call-back request");
    assert.ok(done.note, "and the note, in the same press");
    const hold = await holdOf(asked);
    assert.deepEqual([hold.state, hold.resolved_by_user_id], ["resolved", maria.id], "resolved as the caller");
    const decided = ok(
      await db.from("decisions").select("verb, actor_user_id, payload").eq("id", hold.decision_id).single(),
      "the decision",
    );
    assert.deepEqual([decided.verb, decided.actor_user_id, decided.payload.via], ["hand_back", maria.id, "call"]);
    assert.deepEqual(
      await threadOf(asked),
      { state: "open", assignee_user_id: null },
      "handed back to the receptionist",
    );
    const row = ok(await db.from("notifications").select("closed_at").eq("id", rang).single(), "the bell's row");
    assert.ok(row.closed_at, "the bell stops asking (00421's hold trigger)");
    // A thread asking for a person is not a call back: a call to them, said to be one, leaves it standing.
    const bos = ok(
      await log(maria, bo, { p_outcome: "spoke", p_body: "Call · Spoke", p_closes_call_back: true }),
      "a handoff",
    );
    assert.equal(bos.handed_back, false);
    assert.equal((await holdOf(handoff)).state, "open", "a handoff is left to its own Done");

    // Nothing open to close: the call is logged, and nothing is handed back.
    const again = ok(
      await log(maria, ana, { p_outcome: "spoke", p_body: "Call · Spoke", p_closes_call_back: true }),
      "nothing left",
    );
    assert.equal(again.handed_back, false);
    assert.ok(again.note);
  },
);
