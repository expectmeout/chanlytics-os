/**
 * 00241 on the database (Reach out Part 6): what comes back from a reach-out, read and counted by the real functions.
 *
 *   1. One chain writes to five businesses and plans a sixth: one wrote back interested and then booked, one said no,
 *      one bounced, one its owner stops between its steps, one heard nothing, and the planned one its owner stops. The report over the period, the chain's own report, the search's lines and
 *      a lead's story each count them as H1 says, to a signed-in member.
 *   2. A booking stamps a lead already Talking once, and converts nobody twice.
 *   3. "Stop writing to them" skips the lead's planned email, is said by the send door's facts, and leaves the lead out
 *      of the next step's followers; a second stop does nothing; a lead no chain planned, a viewer and another
 *      workspace are refused.
 *   4. The day's numbers at 6 PM: the workspace is due at 18:00 in its zone and not at 17:00, and once told, not again.
 *   5. Each function re-created whole is its source's body but for the lines it meant to change, and the database
 *      runs it; the new reads are a member's, the day's read the service role's alone.
 *
 * Local stack only: it makes workspaces, people and leads.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { REACH_OUT_REFUSALS, wallClockAt, zoneDayKey } from "@chanlytics/contracts";

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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
/** One SQL read of the local stack, for what PostgREST does not serve (pg_proc). */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}
/** A migration's text, by its number, its lines ended as git keeps them (a Windows checkout ends them in CRLF). */
const migration = (n) => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = path.join(
    dir,
    fs.readdirSync(dir).find((f) => f.startsWith(`${n}_`)),
  );
  return fs.readFileSync(file, "utf8").split("\r\n").join("\n");
};
/** A function's body as a migration writes it: from `as $$` after its header to the next `$$`, as pg_proc keeps it. */
const bodyIn = (src, header) => {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `no ${header}`);
  const open = src.indexOf("as $$", at) + "as $$".length;
  return src.slice(open, src.indexOf("$$", open));
};
const liveBody = (name) =>
  query(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}'`,
  )[0]
    ?.prosrc?.split("\r\n")
    .join("\n");

const DAY = 24 * 3_600_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
const TZ = "America/Chicago";

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
const refusedWith = (res, code, words) => {
  assert.ok(res.error, "refused");
  assert.equal(res.error.code, code, res.error.message);
  if (words) assert.equal(res.error.message, words);
};

async function person(role) {
  const email = `back-${role}-${stamp}@fixture-back.example`;
  const password = `pw-${stamp}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}
const newSearch = (name, asked = "movers in Austin") =>
  one(db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "movers", name, asked, plan: {} }));
const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureBack${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: `owner-${stamp}-${n}@fixture-back.example`,
      email_state: "ok",
      stage: "nurture",
      ...over,
    }),
  );
};
const member = (s, leadId) =>
  one(
    db.from("lead_search_members").insert({
      search_id: s,
      lead_id: leadId,
      tenant_id: A,
      class: "qualified",
      counted: true,
      counted_month: new Date().toISOString().slice(0, 7),
      fit: "strong",
      judgment: { answer: "yes", reasons: [], shares: [] },
    }),
  );
const chainOf = (s) => ({
  name: "Reach out · Movers",
  search_id: s,
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  steps: [
    { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}", after_days: null },
    { subject: null, body: "Just checking in.", after_days: 4 },
  ],
});
let far = 0;
const runOf = async (rootId, stepId, state = "scheduled") => {
  far += 1;
  const { template_id } = ok(await db.from("playbooks").select("template_id").eq("id", stepId).single());
  return one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Movers",
      template_id,
      template_name: "reach_back",
      template_language: "en",
      audience: { kind: "reach_out", root_id: rootId, step_id: stepId },
      state,
      scheduled_for: iso(Date.now()),
      playbook_id: stepId,
      run_for: new Date(Date.UTC(2097, 0, far)).toISOString().slice(0, 10),
    }),
  );
};
const sendIn = async (run, rootId, stepId, over) => {
  const id = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id,
      tenant_id: A,
      broadcast_id: run,
      playbook_id: stepId,
      root_id: rootId,
      send_at: iso(Date.now() + 3_600_000),
      ...over,
    }),
  );
  return id;
};

/** The world of test 1, made once: a chain over a search, five businesses, and what each did. */
let W;
/** Built once, whether it lands or fails: every test that needs it says the same thing. */
const world = () => (W ??= build());
async function build() {
  const s = await newSearch("Movers · Austin");
  const saved = ok(await db.rpc("reach_out_save", { p_tenant_id: A, p_user_id: as.operator.id, p_chain: chainOf(s) }));
  const root = saved.root_id;
  const step2 = saved.step_ids[1];
  const domain = await one(
    db.from("sending_domains").insert({
      tenant_id: A,
      host: `back-${stamp}.example`,
      from_local: "sam",
      from_name: "Sam",
      state: "verified",
      verified_at: iso(Date.now() - 20 * DAY),
      clean_since: iso(Date.now() - 20 * DAY),
    }),
  );
  const run1 = await runOf(root, root);
  const run2 = await runOf(root, step2);
  const names = ["interested", "saidNo", "bounced", "stopped", "quiet", "planned", "leaving"];
  const W0 = { s, root, step2, run1, run2, domain, leads: {}, persons: {}, threads: {} };
  for (const k of names) {
    const personId = await one(
      db
        .from("contacts")
        .insert({ tenant_id: A, display_name: `Back ${k}`, email: `${k.toLowerCase()}-${stamp}@fixture-back.example` }),
    );
    const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: personId }));
    const leadId = await lead({
      contact_id: personId,
      ...(k === "saidNo" ? { stage: "archived", closed_reason: "said_no" } : {}),
      ...(k === "interested" ? { stage: "converted", converted_at: iso(Date.now() - DAY) } : {}),
    });
    await member(s, leadId);
    Object.assign(W0.leads, { [k]: leadId });
    Object.assign(W0.persons, { [k]: personId });
    Object.assign(W0.threads, { [k]: thread });
  }
  const email = (k, status, over = {}) =>
    one(
      db.from("messages").insert({
        tenant_id: A,
        conversation_id: W0.threads[k],
        contact_id: W0.persons[k],
        channel: "email",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: "Saw your shop.",
        status,
        meta: { source: "reach_out" },
        ...over,
      }),
    );
  const sent = async (k, status, angle, error) =>
    sendIn(run1, root, root, {
      lead_id: W0.leads[k],
      contact_id: W0.persons[k],
      domain_id: domain,
      state: "sent",
      sent_at: iso(Date.now() - 2 * DAY),
      angle,
      message_id: await email(k, status, error ? { error } : {}),
    });
  await sent("interested", "delivered", "their rating");
  await sent("saidNo", "read", "their rating");
  await sent("stopped", "delivered", null);
  await sent("quiet", "delivered", "their rating");
  // The bounce the clock read before it read the email sent: its send settled failed, with no sent_at. It left all the
  // same (00179 email_left), dated by its email's own time of leaving.
  await sendIn(run1, root, root, {
    lead_id: W0.leads.bounced,
    contact_id: W0.persons.bounced,
    domain_id: domain,
    state: "failed",
    reason: "bounced",
    angle: "their reviews",
    message_id: await email("bounced", "failed", {
      error: { provider: "bounced", kind: "permanent" },
      meta: { source: "reach_out", status_at: { sent: iso(Date.now() - 2 * DAY) } },
    }),
  });
  // The sixth business's first email, held by the check for its owner's say: Stop writing to them skips it.
  W0.plannedSend = await sendIn(run1, root, root, {
    lead_id: W0.leads.planned,
    contact_id: W0.persons.planned,
    domain_id: domain,
    state: "held",
    reason: "check_unavailable",
  });
  // The seventh's is on its way (queued): the stop says it is leaving, and the send door refuses it by the stop.
  W0.leavingSend = await sendIn(run1, root, root, {
    lead_id: W0.leads.leaving,
    contact_id: W0.persons.leaving,
    domain_id: domain,
    state: "queued",
    message_id: await email("leaving", "queued"),
  });
  // They wrote back, interested, and the reading says so.
  const inbound = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: W0.threads.interested,
      contact_id: W0.persons.interested,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Yes, tell me more.",
      status: "received",
    }),
  );
  ok(
    await db.from("reach_out_replies").insert({
      message_id: inbound,
      tenant_id: A,
      conversation_id: W0.threads.interested,
      contact_id: W0.persons.interested,
      lead_id: W0.leads.interested,
      lead_contact_id: W0.persons.interested,
      claim: "person",
      intent: "interested",
      summary: "Wants to hear more",
      read_at: iso(Date.now() - 2 * DAY),
    }),
  );
  W0.inbound = inbound;
  return W0;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `back-a-${stamp}`, name: "Harbor Moving Co", timezone: TZ }));
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  B = await one(db.from("tenants").insert({ slug: `back-b-${stamp}`, name: "Elsewhere Co" }));
  for (const role of ["owner", "operator", "viewer"]) as[role] = await person(role);
  // An operator of another workspace: a member, and never of A.
  const email = `back-stranger-${stamp}@fixture-back.example`;
  const password = `pw-${stamp}-stranger-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: B, user_id: made.data.user.id, role: "operator" }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  as.stranger = { id: made.data.user.id, c };
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) ok(await db.from("tenants").delete().eq("id", t));
  for (const u of users) await db.auth.admin.deleteUser(u);
});

test("a booking stamps a lead already Talking once, and converts nobody twice", { skip }, async () => {
  const w = await world();
  const { email } = ok(await db.from("leads").select("email").eq("id", w.leads.interested).single());
  const start = iso(Date.now() + 3 * DAY);
  assert.equal(ok(await db.rpc("reach_out_booked", { p_tenant_id: A, p_seen: [{ email, start }] })), 0, "none moved");
  const row = ok(await db.from("leads").select("stage, booked_at").eq("id", w.leads.interested).single());
  assert.deepEqual([row.stage, Date.parse(row.booked_at)], ["converted", Date.parse(start)]);
  // A later appointment never moves it.
  ok(await db.rpc("reach_out_booked", { p_tenant_id: A, p_seen: [{ email, start: iso(Date.now() + 9 * DAY) }] }));
  const again = ok(await db.from("leads").select("booked_at").eq("id", w.leads.interested).single());
  assert.equal(Date.parse(again.booked_at), Date.parse(start));
  const events = ok(
    await db.from("events").select("id").eq("subject_id", w.leads.interested).eq("kind", "lead.converted"),
  );
  assert.equal(events.length, 0, "no second conversion");
});

test(
  "Stop writing to them: skipped, said by the door's facts, left out of the next step; refused where it may not",
  { skip },
  async () => {
    const w = await world();
    const followers = async () =>
      ok(
        await db.rpc("reach_out_followers", {
          p_tenant_id: A,
          p_step_id: w.step2,
          p_parent_id: w.root,
          p_after_days: 0,
          p_limit: 50,
        }),
      ).map((f) => f.lead_id);
    assert.ok((await followers()).includes(w.leads.stopped), "before: the next step would take it");

    refusedWith(await as.viewer.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.stopped }), "P0002");
    refusedWith(await as.stranger.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.stopped }), "P0002");
    const untouched = await lead();
    refusedWith(
      await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: untouched }),
      "22023",
      REACH_OUT_REFUSALS.nothingWritten,
    );
    // Between its steps: nothing to skip, and the stop is the lead's.
    const r = ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.stopped }));
    assert.deepEqual(r, { stopped: true, already: false, skipped: 0, leaving: 0 });
    // Its first email held for its owner's say: skipped.
    const p = ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.planned }));
    assert.deepEqual(p, { stopped: true, already: false, skipped: 1, leaving: 0 });
    // Its first email on its way: left alone here, said as leaving, and refused at the door by the stop.
    const l = ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.leaving }));
    assert.deepEqual(l, { stopped: true, already: false, skipped: 0, leaving: 1 });
    const queued = ok(await db.from("reach_out_sends").select("state").eq("id", w.leavingSend).single());
    assert.equal(queued.state, "queued");
    const planned = ok(await db.from("reach_out_sends").select("state, reason").eq("id", w.plannedSend).single());
    assert.deepEqual(planned, { state: "skipped", reason: "owner_stopped" });
    const facts = ok(
      await db.rpc("outreach_lead_facts", {
        p_tenant_id: A,
        p_contact_id: w.persons.stopped,
        p_to: "whoever@fixture-back.example",
        p_lead_id: w.leads.stopped,
      }),
    );
    assert.equal(facts.stopped, true);
    const quiet = ok(
      await db.rpc("outreach_lead_facts", {
        p_tenant_id: A,
        p_contact_id: w.persons.quiet,
        p_to: "whoever@fixture-back.example",
        p_lead_id: w.leads.quiet,
      }),
    );
    assert.equal(quiet.stopped, false);
    assert.deepEqual(await followers(), [w.leads.quiet], "after: only the business that heard nothing");
    assert.deepEqual(ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.stopped })), {
      stopped: false,
      already: true,
      skipped: 0,
      leaving: 0,
    });
    const lead_ = ok(await db.from("leads").select("stage, reach_out_stopped_at").eq("id", w.leads.stopped).single());
    assert.equal(lead_.stage, "nurture", "stopping is not a no");
    assert.ok(lead_.reach_out_stopped_at);
  },
);

test(
  "the report, the chain's report, the search's lines and a lead's story count what came back",
  { skip },
  async () => {
    const w = await world();
    // The booking and the stop of the tests above may not have run first: make both so.
    const { email } = ok(await db.from("leads").select("email").eq("id", w.leads.interested).single());
    ok(await db.rpc("reach_out_booked", { p_tenant_id: A, p_seen: [{ email, start: iso(Date.now() + 3 * DAY) }] }));
    ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.stopped }));
    ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.planned }));
    ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: w.leads.leaving }));

    const rep = ok(await as.viewer.c.rpc("reach_out_report", { p_tenant_id: A, p_days: 7 }));
    assert.equal(rep.has_reach_out, true);
    assert.deepEqual(rep.totals, {
      written: 5,
      delivered: 4,
      bounced: 1,
      wrote_back: 1,
      interested: 1,
      booked: 1,
      said_no: 1,
      handed: 0,
    });
    assert.equal(rep.series.length, 7);
    assert.equal(
      rep.series.reduce((t, d) => t + d.written, 0),
      5,
    );
    const chain = rep.chains.find((c) => c.root_id === w.root);
    assert.deepEqual(
      chain.steps.map((s) => [s.n, s.written, s.delivered, s.wrote_back, s.interested, s.booked, s.said_no, s.bounced]),
      [
        [0, 5, 4, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
    );
    assert.deepEqual(rep.angles, [
      { angle: "their rating", written: 3, wrote_back: 1 },
      { angle: "their reviews", written: 1, wrote_back: 0 },
    ]);
    assert.equal(rep.no_angle, 1);
    const dom = rep.domains.find((d) => d.host === `back-${stamp}.example`);
    assert.deepEqual([dom.state, dom.sent, dom.delivered, dom.bounced, dom.complained], ["verified", 5, 4, 1, 0]);
    refusedWith(
      await as.viewer.c.rpc("reach_out_report", { p_tenant_id: A, p_days: 14 }),
      "22023",
      REACH_OUT_REFUSALS.period,
    );
    refusedWith(await as.viewer.c.rpc("reach_out_report", { p_tenant_id: B, p_days: 7 }), "P0002");
    refusedWith(await as.viewer.c.rpc("reach_out_search_lines", { p_tenant_id: B, p_search_id: w.s }), "P0002");
    refusedWith(await as.stranger.c.rpc("reach_out_search_lines", { p_tenant_id: A, p_search_id: w.s }), "P0002");

    const cr = ok(await as.viewer.c.rpc("reach_out_chain_report", { p_tenant_id: A, p_root_id: w.root }));
    assert.deepEqual(
      cr.steps.map((s) => [s.n, s.written, s.wrote_back, s.interested, s.booked, s.said_no]),
      [
        [0, 5, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0],
      ],
    );

    const lines = ok(await as.viewer.c.rpc("reach_out_search_lines", { p_tenant_id: A, p_search_id: w.s }));
    assert.deepEqual(lines.chain, { root_id: w.root, name: "Reach out · Movers", state: "running" });
    assert.equal(lines.written_to, 5);
    const byLead = Object.fromEntries(lines.leads.map((l) => [l.lead_id, l]));
    assert.equal(byLead[w.leads.interested].reply.intent, "interested");
    assert.ok(byLead[w.leads.interested].booked_at);
    assert.equal(byLead[w.leads.bounced].bounced, true);
    assert.ok(byLead[w.leads.stopped].stopped_at);
    assert.equal(byLead[w.leads.saidNo].closed_reason, "said_no");
    assert.equal(byLead[w.leads.quiet].sent, 1);
    assert.equal(
      ok(await as.viewer.c.rpc("reach_out_search_lines", { p_tenant_id: A, p_search_id: await newSearch("None") })),
      null,
      "a search with no reach-out",
    );

    const story = ok(
      await as.viewer.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: w.leads.interested }),
    );
    assert.deepEqual(story.chain, { root_id: w.root, name: "Reach out · Movers", state: "running" });
    assert.deepEqual(story.search, { id: w.s, name: "Movers · Austin", asked: "movers in Austin", fit: "strong" });
    assert.equal(story.conversation_id, w.threads.interested);
    assert.deepEqual(
      story.sends.map((s) => [s.n, s.state, s.angle, s.host, s.email_status, s.bounced]),
      [[0, "sent", "their rating", `back-${stamp}.example`, "delivered", false]],
    );
    assert.deepEqual(
      story.readings.map((r) => [r.message_id, r.intent, r.undone, r.can_undo]),
      [[w.inbound, "interested", false, false]],
    );
    assert.equal(story.can_stop, true);
    const stopped = ok(
      await as.viewer.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: w.leads.planned }),
    );
    assert.equal(stopped.can_stop, false);
    assert.ok(stopped.stopped_at);
    assert.deepEqual(
      stopped.sends.map((s) => [s.n, s.state, s.reason]),
      [[0, "skipped", "owner_stopped"]],
    );
    refusedWith(
      await as.viewer.c.rpc("reach_out_lead_timeline", { p_tenant_id: B, p_lead_id: w.leads.quiet }),
      "P0002",
    );
    assert.equal(
      ok(await as.viewer.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: crypto.randomUUID() })),
      null,
    );
  },
);

test("the day's numbers are due at 6 PM in the workspace's zone, and once told, not again", { skip }, async () => {
  const w = await world();
  // Today's 18:30 and 17:30 in Chicago, as instants; what happened today happened at noon there.
  const today = zoneDayKey(Date.now(), TZ);
  const at = (hh) => new Date(wallClockAt(TZ, today, Number(hh), 30));
  // Something today: a reading read now.
  const inbound = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: w.threads.quiet,
      contact_id: w.persons.quiet,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Not for us.",
      status: "received",
    }),
  );
  ok(
    await db.from("reach_out_replies").insert({
      message_id: inbound,
      tenant_id: A,
      conversation_id: w.threads.quiet,
      contact_id: w.persons.quiet,
      lead_id: w.leads.quiet,
      lead_contact_id: w.persons.quiet,
      claim: "person",
      intent: "no",
      read_at: new Date(wallClockAt(TZ, today, 12, 0)).toISOString(),
    }),
  );
  const due = async (when) =>
    ok(await db.rpc("reach_out_day_due", { p_now: when.toISOString(), p_limit: 500 })).filter((r) => r.tenant_id === A);
  assert.deepEqual(await due(at("17")), [], "not at 5 PM");
  const [row] = await due(at("18"));
  assert.equal(row.day, today);
  assert.equal(row.numbers.said_no, 1);
  assert.equal(row.numbers.wrote_back, 1);
  ok(
    await db.from("notifications").insert({
      tenant_id: A,
      kind: "reach_out_day",
      title: "Today's reach-outs",
      body: "…",
      subject_type: "reach_out_day",
      subject_id: today,
    }),
  );
  assert.deepEqual(await due(at("18")), [], "told once");
  refusedWith(await as.owner.c.rpc("reach_out_day_due", { p_now: at("18").toISOString(), p_limit: 5 }), "42501");
});

test("each function re-created whole is its source's body but for the lines it meant to change", { skip }, () => {
  const now = migration("00241");
  const facts = bodyIn(now, "create or replace function public.outreach_lead_facts(");
  const stoppedArm = facts.slice(facts.indexOf(",\n    -- Its owner stopped writing"), facts.lastIndexOf("\n  )"));
  assert.equal(
    facts.replace(stoppedArm, ""),
    bodyIn(migration("00226"), "create or replace function public.outreach_lead_facts("),
  );

  const followers = bodyIn(now, "create or replace function public.reach_out_followers(");
  assert.equal(
    followers.replace(/\n\s+and not coalesce\(\(f\.facts->>'stopped'\)::boolean, false\)/, ""),
    bodyIn(migration("00226"), "create or replace function public.reach_out_followers("),
  );

  const booked = bodyIn(now, "create or replace function public.reach_out_booked(");
  const back = booked
    .replace("min(m.start_at) as start_at, l.stage", "min(m.start_at) as start_at")
    .replace("l.stage in ('ready', 'nurture', 'converted')", "l.stage in ('ready', 'nurture')")
    .replace("group by m.id, l.stage", "group by m.id")
    .replace(
      /\n {4}-- The first appointment seen[\s\S]*?booked_at is null;\n {4}if v_lead\.stage in \('ready', 'nurture'\) and coalesce/,
      "\n    if coalesce",
    );
  assert.equal(back, bodyIn(migration("00227"), "create or replace function public.reach_out_booked("));

  const report = bodyIn(now, "create or replace function public.reach_out_chain_report(");
  const was = report
    .replace(", l.closed_reason, l.booked_at\n", ", l.closed_reason\n")
    .replace(/ as said_no,\n\s+-- Interested[\s\S]*? as booked\n/, " as said_no\n")
    .replace(
      /\n\s+'interested', coalesce\(\(select a\.interested[^\n]*\n\s+'booked', coalesce\(\(select a\.booked[^\n]*/,
      "",
    )
    // Written is an email that left, per step and per run, as Reports counts it.
    .replace(
      "        -- An email that left (00241): sent, or failed by a receipt after it left (email_left), as Reports counts it.\n" +
        "        'written', (select count(*) from public.reach_out_sends s left join public.messages m on m.id = s.message_id\n" +
        "                     where s.playbook_id = c.id\n" +
        "                       and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))),\n",
      "        'written', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'sent'),\n",
    )
    .replace(
      "                                                left join public.messages m on m.id = s.message_id\n" +
        "                                               where s.broadcast_id = b.id\n" +
        "                                                 and (s.state = 'sent' or (s.state = 'failed'\n" +
        "                                                      and public.email_left(m.status, m.error)))),\n",
      "                                               where s.broadcast_id = b.id and s.state = 'sent'),\n",
    );
  assert.equal(was, bodyIn(migration("00228"), "create or replace function public.reach_out_chain_report("));

  for (const name of ["outreach_lead_facts", "reach_out_followers", "reach_out_booked", "reach_out_chain_report"])
    assert.equal(
      liveBody(name),
      bodyIn(now, `create or replace function public.${name}(`),
      `${name}: the database runs 00241's`,
    );
});

test(
  "the new reads are a member's, the stop an acting member's, and the day's read the service role's alone",
  { skip },
  () => {
    const rows = query(`select f as fn,
      has_function_privilege('anon', f, 'execute') as anon,
      has_function_privilege('authenticated', f, 'execute') as member,
      has_function_privilege('service_role', f, 'execute') as service,
      (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) as definer
    from unnest(array[
      'public.reach_out_report(uuid, int)',
      'public.reach_out_search_lines(uuid, uuid)',
      'public.reach_out_lead_timeline(uuid, uuid)',
      'public.reach_out_lead_stop(uuid)',
      'public.reach_out_day_due(timestamptz, int)'
    ]) as f`);
    assert.deepEqual(rows.map((r) => [r.fn.replace(/\(.*/, ""), r.anon, r.member, r.service, r.definer]).sort(), [
      ["public.reach_out_day_due", false, false, true, true],
      ["public.reach_out_lead_stop", false, true, true, true],
      ["public.reach_out_lead_timeline", false, true, true, true],
      ["public.reach_out_report", false, true, true, true],
      ["public.reach_out_search_lines", false, true, true, true],
    ]);
  },
);
