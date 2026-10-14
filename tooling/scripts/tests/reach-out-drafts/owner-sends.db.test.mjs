/**
 * A reach-out its owner sends (00428), on the database:
 *
 *   1. The guard: a claim is drafted, a draft is sent or skipped, and nothing else; a draft is dated and whole; a send
 *      handed over and skipped since is sent on its owner's word, one never handed over is not.
 *   2. The draft claim takes an owner's due, checked sends of a running chain, a step after the first first, and lets
 *      their mailbox go; it never takes a mailbox chain's.
 *   3. Sent, on the owner's word (reach_out_send_said): the person, the email as sent under an id of its own, the send
 *      and the lead written to, in one transaction; said once; recorded whatever changed since it was handed, with what
 *      would refuse its lead now said beside it (since); Skip skips; a stranger is refused.
 *   4. What they wrote back, as the owner says it (reach_out_reply_said, the service role's for the member the route
 *      checked): a note on the person's thread that counts as no email, a reading of claim owner keyed to it, and the
 *      reading's effects (Talking, the lead's drafts skipped, written back for the followers); said once; refused while
 *      nothing went, and to a member's own session.
 *   5b. A draft's lead as the door would judge it (reach_out_draft_facts), and Reports counts no owner's email delivered.
 *   5. A draft is open (the run waits), given up fourteen days after it was handed over, and closed with its run.
 *   6. Stop writing and Leave out take a draft back; the lines count it; the chain saves who sends it, its root's alone.
 *
 * Local stack only: it makes workspaces, members, leads, chains, runs and emails.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

const stamp = Date.now().toString(36);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let db;
let A;
let B;
const users = [];
const as = {};
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

async function person(role, tenant, label) {
  const email = `drafts-${label}-${stamp}@fixture-drafts.example`;
  const password = `pw-${stamp}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}

const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureDrafts${stamp}${n}`,
      business_name: `Fixture Gym ${n}`,
      city: "Austin",
      region: "TX",
      stage: "ready",
      email: `gym-${n}-${stamp}@fixture-drafts.example`,
      email_state: "ok",
      ...over,
    }),
  );
};

/** A chain of its owner's, or a mailbox's: its root and a nudge after it, over a list of its own. */
async function chain(ownerSends, label) {
  const template = await one(
    db
      .from("templates")
      .insert({ tenant_id: A, channel: "email", name: `fixture_drafts_${label}_${stamp}`, language: "en_US" }),
  );
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "chosen", card: "local_businesses", name: `List ${label}`, asked: "", plan: {} }),
  );
  const step = (over) =>
    one(
      db.from("playbooks").insert({
        tenant_id: A,
        kind: "reach_out",
        policy_class: "outreach",
        state: "running",
        gap_minutes: 20,
        template_id: template,
        template_language: "en_US",
        template_name: `fixture_drafts_${label}_${stamp}`,
        ...over,
      }),
    );
  const root = await step({
    name: `Gyms ${label}`,
    trigger: "lead_first",
    lead_search_id: search,
    owner_sends: ownerSends,
  });
  const nudge = await step({
    name: `Gyms ${label} · a nudge`,
    trigger: "after_step",
    after_playbook_id: root,
    after_days: 4,
  });
  // A run a step a day: the first email's, and the nudge's.
  const runOf = (stepId, name) =>
    one(
      db.from("broadcasts").insert({
        tenant_id: A,
        name,
        state: "sending",
        scheduled_for: ago(HOUR),
        playbook_id: stepId,
        run_for: new Date().toISOString().slice(0, 10),
        template_id: template,
        template_name: `fixture_drafts_${label}_${stamp}`,
        template_language: "en_US",
        channels: ["email"],
        audience: { kind: "reach_out", root_id: root, step_id: stepId, search_id: search },
      }),
    );
  const run = await runOf(root, `Gyms ${label} · today`);
  const nudgeRun = await runOf(nudge, `Gyms ${label} · a nudge · today`);
  return { template, search, root, nudge, run, nudgeRun };
}

/** A send of a chain's run, planned (checked, due an hour ago unless said), for a lead. */
async function planned(c, leadId, over = {}) {
  const id = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id,
      tenant_id: A,
      broadcast_id: c.run,
      playbook_id: c.root,
      root_id: c.root,
      lead_id: leadId,
      state: "planned",
      send_at: ago(HOUR),
      checked_at: ago(HOUR),
      ...over,
    }),
  );
  return id;
}

/** A send moved on through the guard: planned, claimed, then drafted with its words. */
async function drafted(c, leadId, over = {}) {
  const id = await planned(c, leadId, over);
  ok(
    await db
      .from("reach_out_sends")
      .update({ state: "claimed", claimed_at: ago(0) })
      .eq("id", id),
  );
  const [{ email }] = ok(await db.from("leads").select("email").eq("id", leadId));
  ok(
    await db
      .from("reach_out_sends")
      .update({
        state: "drafted",
        drafted_at: over.drafted_at ?? ago(0),
        draft: { to: email, subject: "A quick one", body: "Hello there.", text: "Hello there.\n\nThe foot." },
      })
      .eq("id", id),
  );
  return id;
}

const send = async (id) => ok(await db.from("reach_out_sends").select("*").eq("id", id).single());

let W;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `drafts-a-${stamp}`, name: "Harbor Fitness Co", timezone: "America/Chicago" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `drafts-b-${stamp}`, name: "Elsewhere Co" }));
  as.owner = await person("owner", A, "owner");
  as.stranger = await person("owner", B, "stranger");
  W = { owner: await chain(true, "own"), mailbox: await chain(false, "box") };
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test(
  "the guard: a claim is drafted, a draft is sent or skipped, and nothing else; a draft is dated and whole",
  { skip },
  async () => {
    const L = await lead();
    const id = await planned(W.owner, L);
    const refused = await db
      .from("reach_out_sends")
      .update({ state: "drafted", drafted_at: ago(0), draft: {} })
      .eq("id", id);
    assert.match(
      refused.error?.message ?? "",
      /planned -> drafted refused/,
      "a planned send is claimed before it is drafted",
    );
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "claimed", claimed_at: ago(0) })
        .eq("id", id),
    );
    const bare = await db.from("reach_out_sends").update({ state: "drafted" }).eq("id", id);
    assert.match(bare.error?.message ?? "", /drafted_is_whole/, "a draft without its words or its day is refused");
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "drafted", drafted_at: ago(0), draft: { to: "x@y.example" } })
        .eq("id", id),
    );
    for (const to of ["planned", "queued", "claimed"]) {
      const back = await db.from("reach_out_sends").update({ state: to }).eq("id", id);
      assert.match(back.error?.message ?? "", /drafted -> \w+ refused/, `a draft never goes back to ${to}`);
    }
    ok(await db.from("reach_out_sends").update({ state: "skipped", reason: "kept_waiting" }).eq("id", id));
    // Handed over and skipped since: its owner's Sent is the truth, the email left their inbox.
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "sent", sent_at: ago(0) })
        .eq("id", id),
    );
    const never = await planned(W.owner, await lead());
    ok(await db.from("reach_out_sends").update({ state: "skipped", reason: "run_canceled" }).eq("id", never));
    const no = await db
      .from("reach_out_sends")
      .update({ state: "sent", sent_at: ago(0) })
      .eq("id", never);
    assert.match(no.error?.message ?? "", /skipped -> sent refused/, "a send never handed over is never sent");
  },
);

test(
  "the draft claim: an owner's due, checked sends, a nudge first, their mailbox let go; never a mailbox chain's",
  { skip },
  async () => {
    const [l1, l2, l3, l4, l5] = [await lead(), await lead(), await lead(), await lead(), await lead()];
    const first = await planned(W.owner, l1, { send_at: ago(2 * HOUR) });
    const nudge = await planned(W.owner, l2, {
      playbook_id: W.owner.nudge,
      broadcast_id: W.owner.nudgeRun,
      send_at: ago(HOUR),
    });
    const unchecked = await planned(W.owner, l3, { checked_at: null });
    const ahead = await planned(W.owner, l4, { send_at: new Date(Date.now() + HOUR).toISOString() });
    const theirs = await planned(W.mailbox, l5);
    const at = new Date().toISOString();
    // Room for one: the nudge is taken before the first email, though the first was due sooner.
    const one = ok(await db.rpc("reach_out_claim_drafts", { p_at: at, p_limit: 1, p_tenant_id: A }));
    assert.deepEqual(
      one.map((s) => s.id),
      [nudge],
      "the nudge before the first email",
    );
    const rest = ok(await db.rpc("reach_out_claim_drafts", { p_at: at, p_limit: 10, p_tenant_id: A }));
    assert.deepEqual(
      rest.map((s) => s.id),
      [first],
      "then the first email; nothing unchecked, ahead or a mailbox's",
    );
    assert.ok([...one, ...rest].every((s) => s.state === "claimed" && s.mailbox_id === null));
    for (const id of [unchecked, ahead, theirs]) assert.equal((await send(id)).state, "planned");
    // Out of the way of the tests after this one.
    for (const id of [first, nudge, unchecked, ahead, theirs])
      await db.from("reach_out_sends").update({ state: "skipped", reason: "run_canceled" }).eq("id", id);
  },
);

test(
  "Sent: the person, the email as sent, the send and the lead written to, in one transaction; said once",
  { skip },
  async () => {
    const L = await lead({ business_name: "Iron Fixture Gym" });
    const id = await drafted(W.owner, L);
    const said = ok(await as.owner.c.rpc("reach_out_send_said", { p_send_id: id, p_outcome: "sent" }));
    assert.equal(said.said, true);
    assert.equal(said.state, "sent");
    assert.equal(said.since, null, "nothing would refuse it now");
    const messageId = said.message_id;
    assert.ok(messageId, "the email is kept under an id of its own");
    const s = await send(id);
    assert.equal(s.state, "sent");
    assert.equal(s.message_id, messageId);
    assert.ok(s.contact_id && s.sent_at && s.said_at);
    assert.equal(s.said_by, as.owner.id);
    const [m] = ok(await db.from("messages").select("*").eq("id", messageId));
    assert.equal(m.channel, "email");
    assert.equal(m.direction, "outbound");
    assert.equal(m.status, "sent");
    assert.equal(m.contact_id, s.contact_id);
    assert.equal(m.meta.email.subject, "A quick one");
    assert.equal(m.meta.email.said_by, as.owner.id);
    assert.equal(m.meta.reach_out.send_id, id);
    assert.equal(
      m.meta.email.message_id,
      undefined,
      "no Message-ID: the owner's own client sent it, and nothing waits for one",
    );
    const [l] = ok(await db.from("leads").select("stage, last_outcome, contacted_at").eq("id", L));
    assert.deepEqual([l.stage, l.last_outcome, !!l.contacted_at], ["nurture", "emailed", true]);
    const events = ok(await db.from("events").select("kind, data").eq("tenant_id", A).eq("subject_id", L));
    assert.ok(events.some((e) => e.kind === "lead.emailed" && e.data.send_id === id));
    // A second word, from another tab or member, answers how it stands and writes nothing.
    const again = ok(await as.owner.c.rpc("reach_out_send_said", { p_send_id: id, p_outcome: "not_sent" }));
    assert.deepEqual([again.said, again.state], [false, "sent"]);
    W.sentLead = L;
    W.sentSend = id;
  },
);

test(
  "Skip skips with why; Sent is recorded whatever changed since, and says so; a stranger is refused",
  { skip },
  async () => {
    const L = await lead();
    const id = await drafted(W.owner, L);
    const stranger = await as.stranger.c.rpc("reach_out_send_said", { p_send_id: id, p_outcome: "not_sent" });
    assert.equal(stranger.error?.code, "P0002");
    ok(await as.owner.c.rpc("reach_out_send_said", { p_send_id: id, p_outcome: "not_sent" }));
    assert.deepEqual([(await send(id)).state, (await send(id)).reason], ["skipped", "owner_skipped"]);

    const S = await lead();
    const held = await drafted(W.owner, S);
    const [{ email }] = ok(await db.from("leads").select("email").eq("id", S));
    const hash = ok(await db.rpc("lead_suppression_hash", { p_tenant_id: A, p_value: email }));
    ok(await db.from("lead_suppressions").insert({ tenant_id: A, kind: "email", hash, what: "said_no" }));
    const said = ok(await as.owner.c.rpc("reach_out_send_said", { p_send_id: held, p_outcome: "sent" }));
    assert.deepEqual(
      [said.state, said.since],
      ["sent", "outreach_suppressed"],
      "the email went: recorded, and said so",
    );
    const s = await send(held);
    assert.equal(s.state, "sent");
    assert.ok(s.message_id, "the email that went is kept");

    // A draft the clock gave up on (kept_waiting) that went all the same: Sent records it; one its owner skipped does not.
    const late = await drafted(W.owner, await lead());
    ok(await db.from("reach_out_sends").update({ state: "skipped", reason: "kept_waiting" }).eq("id", late));
    const went = ok(await as.owner.c.rpc("reach_out_send_said", { p_send_id: late, p_outcome: "sent" }));
    assert.deepEqual([went.said, went.state], [true, "sent"]);
    assert.equal((await send(late)).reason, null, "a skip's reason no longer says what it is");
    const theirs = ok(await as.owner.c.rpc("reach_out_send_said", { p_send_id: id, p_outcome: "sent" }));
    assert.deepEqual([theirs.said, theirs.state], [false, "skipped"], "Skip was its owner's word: said once");
  },
);

test(
  "what they wrote back, as the owner says it: a note on the thread, a reading of claim owner, its effects",
  { skip },
  async () => {
    const member = await as.owner.c.rpc("reach_out_reply_said", {
      p_tenant_id: A,
      p_user_id: as.owner.id,
      p_lead_id: W.sentLead,
      p_reading: { intent: "no" },
      p_plan: { saidNo: true, suppressDomain: "gmail.com" },
      p_note: "x",
    });
    assert.ok(member.error, "a member's own session never hands the reading door a plan");
    const nothing = await db.rpc("reach_out_reply_said", {
      p_tenant_id: A,
      p_user_id: as.owner.id,
      p_lead_id: await lead(),
      p_reading: { intent: "interested" },
      p_plan: {},
      p_note: "You said they wrote back: interested.",
    });
    assert.equal(nothing.error?.code, "22023", "refused while nothing has gone to them");
    const stranger = await db.rpc("reach_out_reply_said", {
      p_tenant_id: A,
      p_user_id: as.stranger.id,
      p_lead_id: W.sentLead,
      p_reading: { intent: "interested" },
      p_plan: {},
      p_note: "x",
    });
    assert.equal(stranger.error?.code, "P0002", "only a member of the workspace");
    // Its nudge, handed to the owner and waiting: what they wrote back stops it.
    const nudge = await drafted(W.owner, W.sentLead, { playbook_id: W.owner.nudge, broadcast_id: W.owner.nudgeRun });
    const plan = {
      stops: true,
      convert: true,
      saidNo: false,
      suppressFrom: null,
      suppressDomain: null,
      resumeAt: null,
      awayUntil: null,
      step: null,
      skipSends: "outreach_wrote_back",
      draft: null,
      tell: false,
    };
    const say = () =>
      db.rpc("reach_out_reply_said", {
        p_tenant_id: A,
        p_user_id: as.owner.id,
        p_lead_id: W.sentLead,
        p_reading: { intent: "interested", summary: null, day: null, refer_to: null, signer: null },
        p_plan: plan,
        p_note: "You said they wrote back: interested.",
      });
    const r = ok(await say());
    assert.equal(r.applied, true);
    const twice = ok(await say());
    assert.deepEqual([twice.applied, twice.already], [false, true], "said once: a second word writes nothing");
    const [note] = ok(await db.from("messages").select("*").eq("id", r.message_id));
    assert.deepEqual([note.type, note.direction, note.channel], ["note", "outbound", "email"]);
    assert.equal(note.meta.source, "owner_said", "the owner's word is no email sent: the month does not count it");
    assert.equal(note.body, "You said they wrote back: interested.");
    const sent = await send(W.sentSend);
    assert.equal(
      note.conversation_id,
      (await db.from("messages").select("conversation_id").eq("id", sent.message_id).single()).data.conversation_id,
    );
    const [reading] = ok(await db.from("reach_out_replies").select("*").eq("message_id", r.message_id));
    assert.deepEqual(
      [reading.claim, reading.intent, reading.said_by, reading.send_id],
      ["owner", "interested", as.owner.id, W.sentSend],
    );
    assert.deepEqual([(await send(nudge)).state, (await send(nudge)).reason], ["skipped", "outreach_wrote_back"]);
    const [l] = ok(await db.from("leads").select("stage").eq("id", W.sentLead));
    assert.equal(l.stage, "converted", "interested is Talking");
    // Written back, as the followers, the send door and Reports ask it: no nudge is planned to them.
    const wrote = ok(await db.rpc("outreach_wrote_back", { p_tenant_id: A, p_contact_ids: [sent.contact_id] }));
    assert.ok(wrote.includes(sent.contact_id), "the owner's word is writing back");
  },
);

test("a draft's lead, as the send door would judge it", { skip }, async () => {
  const fine = ok(await db.rpc("reach_out_draft_facts", { p_tenant_id: A, p_lead_id: await lead() }));
  assert.deepEqual(
    [fine.lead_stage, fine.suppressed, fine.wrote_back, fine.stopped, fine.customer],
    ["ready", false, false, false, false],
  );
  const theirs = await lead();
  const [{ email }] = ok(await db.from("leads").select("email").eq("id", theirs));
  ok(await db.from("contacts").insert({ tenant_id: A, email, display_name: "A Customer" }));
  const customer = ok(await db.rpc("reach_out_draft_facts", { p_tenant_id: A, p_lead_id: theirs }));
  assert.equal(customer.customer, true, "a person in People holds its address");
  const shut = await lead({ stage: "archived", closed_reason: "said_no" });
  const closed = ok(await db.rpc("reach_out_draft_facts", { p_tenant_id: A, p_lead_id: shut }));
  assert.equal(closed.lead_stage, "archived", "its own stage, though nobody was written to yet");
  const waiting = await drafted(W.owner, theirs);
  const page = ok(await db.rpc("reach_out_drafts_waiting", { p_limit: 500, p_tenant_id: A, p_run_id: W.owner.run }));
  const row = page.find((d) => d.id === waiting);
  assert.equal(row?.facts.customer, true, "the drafts waiting carry their leads' facts");
});

test(
  "a draft is open, given up fourteen days after it was handed over, and closed with its run",
  { skip },
  async () => {
    const c = await chain(true, `open${n}`);
    const fresh = await drafted(c, await lead());
    const old = await drafted(c, await lead(), { drafted_at: ago(15 * DAY) });
    const finishable = ok(await db.rpc("reach_out_finishable", { p_limit: 500, p_tenant_id: A }));
    assert.ok(!finishable.includes(c.run), "a run with a draft open is not finished");
    const stale = ok(await db.rpc("reach_out_held_stale", { p_before: ago(14 * DAY), p_limit: 500, p_tenant_id: A }));
    assert.deepEqual(
      stale.filter((s) => s.broadcast_id === c.run).map((s) => s.id),
      [old],
      "fourteen days from when it was handed over",
    );
    ok(await db.from("broadcasts").update({ state: "canceled" }).eq("id", c.run));
    const closed = ok(await db.rpc("reach_out_closed_sends", { p_stuck_before: ago(0), p_limit: 500, p_tenant_id: A }));
    const ids = closed.map((x) => x.send.id);
    assert.ok(ids.includes(fresh) && ids.includes(old), "a canceled run's drafts close with it");
  },
);

test("Stop writing and Leave out take a draft back; the lines count what waits to be sent", { skip }, async () => {
  const c = await chain(true, `back${n}`);
  const [stopped, left, counted] = [await lead(), await lead(), await lead()];
  for (const l of [left, counted])
    ok(
      await db.from("lead_search_members").insert({
        search_id: c.search,
        lead_id: l,
        tenant_id: A,
        class: "qualified",
        counted: true,
        counted_month: new Date().toISOString().slice(0, 7),
        fit: "strong",
        reason: "",
        judgment: { answer: "yes", reasons: [], shares: [] },
      }),
    );
  const a = await drafted(c, stopped);
  const b = await drafted(c, left);
  await drafted(c, counted);
  ok(await as.owner.c.rpc("reach_out_lead_stop", { p_lead_id: stopped }));
  assert.deepEqual([(await send(a)).state, (await send(a)).reason], ["skipped", "owner_stopped"]);
  const out = ok(await as.owner.c.rpc("reach_out_leave_out", { p_root_id: c.root, p_lead_id: left }));
  assert.equal(out.ok, true);
  assert.deepEqual([(await send(b)).state, (await send(b)).reason], ["skipped", "owner_took_back"]);
  const lines = ok(await db.rpc("reach_out_root_lines", { p_tenant_id: A, p_root_id: c.root }));
  const of = new Map(lines.map((x) => [x.lead_id, x.line]));
  assert.equal(of.get(counted).drafted, 1, "one email of theirs waits to be sent");
  const strip = ok(await as.owner.c.rpc("reach_out_search_lines", { p_tenant_id: A, p_search_id: c.search }));
  assert.deepEqual([strip.owner_sends, strip.to_send], [true, 1]);
});

test("a chain saves who sends it, its root's alone", { skip }, async () => {
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "chosen", card: "local_businesses", name: `Saved ${stamp}`, asked: "", plan: {} }),
  );
  const saved = ok(
    await db.rpc("reach_out_save", {
      p_tenant_id: A,
      p_user_id: as.owner.id,
      p_chain: {
        name: "Saved by its owner",
        search_id: search,
        include_unconfirmed: false,
        gap_minutes: 20,
        mailbox_ids: [],
        owner_sends: true,
        signed_by: "Ruben",
        steps: [
          { subject: "A quick one", body: "Hello.", after_days: null },
          { subject: null, body: "Just checking.", after_days: 4 },
        ],
      },
    }),
  );
  const steps = ok(await db.from("playbooks").select("id, owner_sends").in("id", saved.step_ids));
  const by = new Map(steps.map((s) => [s.id, s.owner_sends]));
  assert.deepEqual([by.get(saved.step_ids[0]), by.get(saved.step_ids[1])], [true, false]);
  const onAStep = await db.from("playbooks").update({ owner_sends: true }).eq("id", saved.step_ids[1]);
  assert.match(onAStep.error?.message ?? "", /owner_sends_is_a_root_s/, "only a root says who sends its chain");
});

test(
  "a lead blanked takes its drafts: one waiting is skipped as its lead gone, and every draft of theirs is cleared",
  { skip },
  async () => {
    const L = await lead({ business_name: "Blanked Fixture Gym" });
    const waiting = await drafted(W.owner, L);
    const L2 = await lead({ business_name: "Sent Fixture Gym" });
    const went = await drafted(W.owner, L2);
    ok(await as.owner.c.rpc("reach_out_send_said", { p_send_id: went, p_outcome: "sent" }));
    for (const l of [L, L2]) ok(await db.rpc("lead_blank", { p_lead_id: l }));
    const w = await send(waiting);
    assert.deepEqual([w.state, w.reason, w.draft], ["skipped", "lead_gone", null]);
    const s = await send(went);
    assert.deepEqual([s.state, s.draft], ["sent", null], "sent stays sent; its draft goes");
  },
);

test("Reports names the emails their owner sent from their own inbox apart from any mailbox's", { skip }, async () => {
  const report = ok(await as.owner.c.rpc("reach_out_report", { p_tenant_id: A, p_days: 7 }));
  const yours = report.mailboxes.filter((m) => m.yours);
  assert.equal(yours.length, 1, "one row for their own inbox");
  assert.equal(yours[0].address, null);
  assert.ok(yours[0].sent >= 2, "the emails said sent in the tests before");
  assert.equal(yours[0].delivered, 0, "nobody can know an owner's own email landed");
  assert.ok(report.mailboxes.every((m) => m.yours === true || m.yours === false));
});
