/**
 * A lead's own words at one step (00545, decision 0096), on a real database, as the service role and as a signed-in
 * member: the door is a member's who may act, for a lead of its own workspace; the table is read by members and written by
 * the door alone; a body saves and none puts the step's words back, each answering what stood; the words are kept for the
 * lead and the step, not one send, so a send taken away and made again finds them; saving moves no state, a check under way
 * writes nothing onto them, and a checked email's mark becomes theirs, unless words that name a line find none written;
 * an email that has gone, or is its owner's to send, refuses them; Rewrite is refused where they hold no line; and they go
 * with the lead's details. Every refusal says contracts' own sentence. Local stack only: it makes workspaces and people.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { REACH_OUT_REFUSALS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const MIN = 60_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
/** The sender's mark, as saveLeadWords would make it; a door reads it as words alone. */
const MARK = "a-mark-of-these-words";

let db;
let A;
let B;
const users = [];
const as = {};
let n = 0;
let root;
let nudge;
let run;
let template;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;
const refusedWith = (res, code, words) => {
  assert.ok(res.error, "refused");
  assert.equal(res.error.code, code, res.error.message);
  if (words) assert.equal(res.error.message, words);
};

async function person(role, tenant, label = role) {
  const email = `words-${label}-${stamp}@fixture-words.example`;
  const password = `pw-${stamp}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}
const lead = (tenant = A) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: tenant,
      place_id: `ChIJfixtureWords${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: `owner-${stamp}-${n}@fixture-words.example`,
      email_state: "ok",
      stage: "ready",
    }),
  );
};
const runFor = (day) =>
  one(
    db.from("sequence_batches").insert({
      tenant_id: A,
      name: "Movers",
      template_id: template,
      template_name: "reach_words",
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state: "scheduled",
      scheduled_for: iso(Date.now()),
      step_id: root,
      run_for: day,
    }),
  );
const sendFor = async (leadId, over = {}, step = root) => {
  const id = crypto.randomUUID();
  ok(
    await db.from("sequence_sends").insert({
      id,
      tenant_id: A,
      batch_id: run,
      step_id: step,
      sequence_id: root,
      lead_id: leadId,
      send_at: iso(Date.now() + MIN),
      ...over,
    }),
  );
  return id;
};
const sendRow = async (id) => ok(await db.from("sequence_sends").select("*").eq("id", id).single());
const wordsOf = async (leadId, step = root) =>
  ok(
    await db.from("sequence_lead_words").select("subject, body, written_by").eq("step_id", step).eq("lead_id", leadId),
  );
const set = (leadId, words, over = {}, c = as.operator.c) =>
  c.rpc("sequence_lead_words_set", {
    p_step_id: over.step ?? root,
    p_lead_id: leadId,
    ...(words ? { p_body: words.body, ...(words.subject ? { p_subject: words.subject } : {}) } : {}),
    p_checked_words: MARK,
    p_needs_line: over.needsLine ?? false,
  });
const OWN = { subject: "Your weekend chair", body: "Saw the chair is booked out.\n\n{{your name}}" };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `words-a-${stamp}`, name: "Harbor Moving Co" }));
  B = await one(db.from("tenants").insert({ slug: `words-b-${stamp}`, name: "Other Movers" }));
  for (const t of [A, B]) {
    ok(await db.rpc("provision_tenant", { p_tenant_id: t }));
    ok(await db.from("billing_accounts").upsert({ tenant_id: t, mode: "direct", status: "active" }));
  }
  for (const role of ["owner", "operator", "viewer"]) as[role] = await person(role, A);
  as.stranger = await person("owner", B, "stranger");
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  const saved = ok(
    await db.rpc("reach_out_save", {
      p_tenant_id: A,
      p_user_id: as.operator.id,
      p_chain: {
        name: "Reach out · Movers",
        search_id: search,
        include_unconfirmed: false,
        gap_minutes: 12,
        mailbox_ids: [],
        signed_by: "Sam",
        steps: [
          { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}", after_days: null },
          { subject: null, body: "Just checking in.", after_days: 4 },
        ],
      },
    }),
  );
  root = saved.root_id;
  nudge = saved.step_ids.find((id) => id !== root);
  ({ template_id: template } = ok(await db.from("sequence_steps").select("template_id").eq("id", root).single()));
  run = await runFor("2098-01-01");
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) ok(await db.from("tenants").delete().eq("id", t));
  for (const u of users) await db.auth.admin.deleteUser(u);
});

test(
  "the door is a member's who may act, for a lead of its workspace; the table is written by the door alone",
  { skip },
  async () => {
    const l = await lead();
    refusedWith(await set(l, OWN, {}, as.viewer.c), "P0002", REACH_OUT_REFUSALS.stepGone);
    refusedWith(await set(l, OWN, {}, as.stranger.c), "P0002", REACH_OUT_REFUSALS.stepGone);
    refusedWith(await set(await lead(B), OWN), "P0002", REACH_OUT_REFUSALS.leadNotFound);
    assert.deepEqual(await wordsOf(l), []);

    const signedOut = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await set(l, OWN, {}, signedOut)).error, "no session, no door");

    const row = { tenant_id: A, step_id: root, lead_id: l, body: "Typed past the door." };
    assert.ok((await as.operator.c.from("sequence_lead_words").insert(row)).error, "a member writes through the door");
    assert.deepEqual(await wordsOf(l), []);
  },
);

test(
  "a body saves and none puts the step's words back, each answering what stood; members read them, a stranger none",
  { skip },
  async () => {
    const l = await lead();
    const first = ok(await set(l, OWN));
    assert.deepEqual(
      [first.step_id, first.lead_id, first.send_id, first.was],
      [root, l, null, null],
      "no send yet, and nothing stood",
    );
    assert.deepEqual(await wordsOf(l), [{ ...OWN, written_by: as.operator.id }]);

    const again = { subject: "Another", body: "Still mine." };
    assert.deepEqual(ok(await set(l, again, {}, as.owner.c)).was, { subject: OWN.subject, body: OWN.body });
    assert.deepEqual(await wordsOf(l), [{ ...again, written_by: as.owner.id }], "written by whoever wrote them last");

    const read = async (c) => ok(await c.from("sequence_lead_words").select("body").eq("lead_id", l));
    assert.deepEqual(await read(as.viewer.c), [{ body: "Still mine." }], "a viewer reads");
    assert.deepEqual(await read(as.stranger.c), [], "a stranger does not");

    assert.deepEqual(ok(await set(l, null)).was, { subject: "Another", body: "Still mine." });
    assert.deepEqual(await wordsOf(l), []);
    assert.equal(ok(await set(l, null)).was, null, "putting back what is back moves nothing");
  },
);

test(
  "a later step takes words with no subject, and the rows' own limits hold what the rules let through",
  { skip },
  async () => {
    const l = await lead();
    ok(await set(l, { subject: null, body: "Still around." }, { step: nudge }));
    assert.deepEqual(await wordsOf(l, nudge), [{ subject: null, body: "Still around.", written_by: as.operator.id }]);
    refusedWith(await set(l, { subject: "x".repeat(81), body: "Fine." }), "23514");
    refusedWith(await set(l, { subject: "Fine", body: "x".repeat(1201) }), "23514");
  },
);

test(
  "the words are the lead's at the step, not one send's: a send taken away and made again finds them, and each step has its own",
  { skip },
  async () => {
    const l = await lead();
    const send = await sendFor(l);
    assert.equal(ok(await set(l, OWN)).send_id, send);
    ok(await db.from("sequence_sends").delete().eq("id", send));
    assert.equal((await wordsOf(l)).length, 1, "it stands with no send");
    const made = await sendFor(l);
    assert.deepEqual(ok(await set(l, { subject: "Next", body: "Mine." })).was, {
      subject: OWN.subject,
      body: OWN.body,
    });
    assert.equal(ok(await set(l, { subject: "Next", body: "Mine." })).send_id, made);
    assert.deepEqual(await wordsOf(l, nudge), [], "the step after has the sequence's words");
  },
);

test(
  "saving moves no state: a check under way writes nothing onto them, and one done keeps its line, marked for these words",
  { skip },
  async () => {
    // Under a check: the version moves, so what it read writes nothing; no mark, since it is not checked.
    const leased = await sendFor(await lead(), { check_started_at: iso(Date.now()), check_gen: 3 });
    ok(await set((await sendRow(leased)).lead_id, OWN));
    const u = await sendRow(leased);
    assert.deepEqual(
      [u.state, u.check_gen, u.check_started_at, u.checked_at, u.checked_words],
      ["planned", 4, null, null, null],
    );

    // Checked, with a line: it stands, for the step's words coming back, and goes without being checked again.
    const at = iso(Date.now() - MIN);
    const checked = await sendFor(await lead(), {
      checked_at: at,
      checked_words: "the-step-s-mark",
      opening: "A 4.9 says it.",
      angle: "their reviews",
    });
    ok(await set((await sendRow(checked)).lead_id, OWN));
    const c = await sendRow(checked);
    assert.deepEqual(
      [c.state, c.opening, c.angle, c.checked_words],
      ["planned", "A 4.9 says it.", "their reviews", MARK],
    );
    assert.equal(new Date(c.checked_at).getTime(), new Date(at).getTime(), "it stays checked");

    // Held: it stays held for its owner's answer, with what it was held for.
    const held = await sendFor(await lead(), {
      state: "held",
      reason: "chain",
      hold_detail: "site:3",
      checked_at: at,
      checked_words: "the-step-s-mark",
    });
    ok(await set((await sendRow(held)).lead_id, OWN));
    const h = await sendRow(held);
    assert.deepEqual([h.state, h.reason, h.hold_detail, h.checked_words], ["held", "chain", "site:3", MARK]);
  },
);

test(
  "words that name a line, on an email checked with none written, go back to be checked; one with a line stays",
  { skip },
  async () => {
    const none = await sendFor(await lead(), {
      checked_at: iso(Date.now() - MIN),
      checked_words: "the-step-s-mark",
      check_gen: 1,
    });
    const withLine = { subject: "Mine", body: "{{opening}}\n\nMine." };
    ok(await set((await sendRow(none)).lead_id, withLine, { needsLine: true }));
    const r = await sendRow(none);
    assert.deepEqual([r.state, r.checked_at, r.checked_words, r.check_gen], ["planned", null, null, 2]);

    const line = await sendFor(await lead(), {
      checked_at: iso(Date.now() - MIN),
      checked_words: "the-step-s-mark",
      opening: "A 4.9 says it.",
    });
    ok(await set((await sendRow(line)).lead_id, withLine, { needsLine: true }));
    const k = await sendRow(line);
    assert.deepEqual([k.opening, k.checked_words, !!k.checked_at], ["A 4.9 says it.", MARK, true]);
  },
);

test(
  "an email that has gone refuses them, and one that is its owner's to send says where to change it",
  { skip },
  async () => {
    const gone = await lead();
    await sendFor(gone, { state: "sent", sent_at: iso(Date.now()) });
    refusedWith(await set(gone, OWN), "22023", REACH_OUT_REFUSALS.gone);
    refusedWith(await set(gone, null), "22023", REACH_OUT_REFUSALS.gone);
    assert.deepEqual(await wordsOf(gone), []);

    const claimedLead = await lead();
    const claimed = await sendFor(claimedLead, { checked_at: iso(Date.now() - MIN) });
    ok(
      await db
        .from("sequence_sends")
        .update({ state: "claimed", claimed_at: iso(Date.now()) })
        .eq("id", claimed),
    );
    refusedWith(await set(claimedLead, OWN), "22023", REACH_OUT_REFUSALS.gone);

    const hers = await lead();
    const draft = await sendFor(hers, { checked_at: iso(Date.now() - MIN) });
    ok(
      await db
        .from("sequence_sends")
        .update({ state: "claimed", claimed_at: iso(Date.now()) })
        .eq("id", draft),
    );
    const { email } = ok(await db.from("leads").select("email").eq("id", hers).single());
    ok(
      await db
        .from("sequence_sends")
        .update({
          state: "drafted",
          drafted_at: iso(Date.now()),
          draft: { to: email, subject: "A quick one", body: "Hello there.", text: "Hello there.\n\nThe foot." },
        })
        .eq("id", draft),
    );
    refusedWith(await set(hers, OWN), "22023", REACH_OUT_REFUSALS.yoursToSend);

    // The latest send at the step decides: one its canceled run skipped, and the next run's planned, takes them again.
    const back = await lead();
    await sendFor(back, { state: "skipped", reason: "run_canceled", created_at: iso(Date.now() - 60 * MIN) });
    const fresh = await sendFor(back, { batch_id: await runFor("2098-01-02") });
    assert.equal(ok(await set(back, OWN)).send_id, fresh);
  },
);

test("Rewrite is refused where they hold no line, and asked as ever where they keep one", { skip }, async () => {
  const held = async () => {
    const l = await lead();
    const id = await sendFor(l, {
      state: "held",
      reason: "unbacked_fact",
      hold_detail: "a 5.0",
      checked_at: iso(Date.now() - MIN),
    });
    return { l, id };
  };
  const decide = (id) => as.operator.c.rpc("reach_out_send_decide", { p_send_id: id, p_decision: "rewrite" });

  const none = await held();
  ok(await set(none.l, OWN));
  refusedWith(await decide(none.id), "22023", REACH_OUT_REFUSALS.youWroteIt);
  assert.equal((await sendRow(none.id)).state, "held", "it stays as it stood");
  ok(await set(none.l, null));
  ok(await decide(none.id));
  assert.equal((await sendRow(none.id)).state, "planned", "the step's words back: Rewrite again");

  const kept = await held();
  ok(await set(kept.l, { subject: "Mine", body: "{{ opening }}\n\nMine." }));
  ok(await decide(kept.id));
  assert.equal((await sendRow(kept.id)).state, "planned");

  // Include still answers it, with its words as they are.
  const included = await held();
  ok(await set(included.l, OWN));
  ok(await as.operator.c.rpc("reach_out_send_decide", { p_send_id: included.id, p_decision: "include" }));
  const i = await sendRow(included.id);
  assert.deepEqual([i.state, i.reason], ["planned", null]);
});

test("they go with the lead's details, and with the step", { skip }, async () => {
  const blanked = await lead();
  ok(await set(blanked, OWN));
  ok(await db.rpc("lead_blank", { p_lead_id: blanked }));
  assert.deepEqual(await wordsOf(blanked), [], "they may name the lead and its people");
  refusedWith(await set(blanked, OWN), "P0002", REACH_OUT_REFUSALS.leadNotFound);

  const removed = await lead();
  ok(await set(removed, OWN));
  ok(await db.from("leads").delete().eq("id", removed));
  assert.deepEqual(await wordsOf(removed), [], "a lead's row gone takes them");
});
